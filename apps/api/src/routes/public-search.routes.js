import { analyzeVisualFrame } from '../services/media/visual-analysis.js';
import { improvePublicSearchRanking } from '../services/search/relevance-ranking.js';
import { findIndexedPublicResults, indexPublicSearchResults } from '../services/search/public-search-index.js';

export function registerPublicSearchRoutes(app, {
  limitProvider, wrap, sendError, validatePublicUrl, inspectPublicLink,
  assessSourceContext, titleSimilarity, searchAllPublic, rankPublicResults,
  diversifyPublicResults, normalizeResultUrl, searchImages, searchVideos,
  searchPeople, scrapePublicPage, getUserProviderKeys, optionalAuth,
}) {
  app.post('/api/v1/public-search/visual-match', limitProvider, wrap(async (req, res) => {
    const body = req.body || {};
    let analysis;
    try {
      analysis = await analyzeVisualFrame({
        imageDataUrl: body.imageDataUrl,
        mediaType: body.mediaType || 'image',
        userQuestion: String(body.userQuestion || '').slice(0, 500),
      });
    } catch (error) {
      return sendError(res, error.status || 502, error.code || 'VISION_PROVIDER_FAILED', error.message || 'Visual analysis failed.');
    }

    const groups = await Promise.all(analysis.queries.map(async query => {
      const [images, videos] = await Promise.all([
        searchImages(query, 8).catch(() => []),
        searchVideos(query, 6).catch(() => []),
      ]);
      return { query, items: [...images, ...videos] };
    }));
    const found = new Map();
    for (const group of groups) {
      for (const item of group.items) {
        if (item.url && !found.has(item.url)) {
          found.set(item.url, { ...item, matchedQuery: group.query, matchType: 'visual-description' });
        }
      }
    }
    const data = [...found.values()].slice(0, 40);
    res.json({ data, meta: {
      description: analysis.description,
      extractedText: analysis.extractedText,
      visualDetails: analysis.visualDetails,
      queries: analysis.queries,
      resultCount: data.length,
      matchMethod: 'vision-ocr-description-search',
      notice: 'ADVERSE read visible text and analyzed sampled frames, then searched public indexes. Matches are related candidates, not proof of identity or exact copies.',
    } });
  }));

  app.get('/api/v1/public-search/media', limitProvider, wrap(async (req, res) => {
    const q = String(req.query.q || '').trim().slice(0, 200);
    const type = String(req.query.type || 'all').trim().toLowerCase();
    if (q.length < 2) return sendError(res, 400, 'QUERY_REQUIRED', 'Enter at least two characters to search.');
    if (!['images', 'videos', 'people', 'all'].includes(type)) return sendError(res, 400, 'INVALID_MEDIA_TYPE', 'Choose images, videos, people, or all.');
    const tasks = [];
    if (type === 'images' || type === 'all') tasks.push(['images', searchImages]);
    if (type === 'videos' || type === 'all') tasks.push(['videos', searchVideos]);
    if (type === 'people' || type === 'all') tasks.push(['people', searchPeople]);
    const settled = await Promise.all(tasks.map(async ([name, fn]) => {
      try { return { name, results: await fn(q), error: null }; }
      catch (error) { return { name, results: [], error: 'Provider unavailable: ' + String(error?.message || 'request failed') }; }
    }));
    const results = settled.flatMap(item => item.results).slice(0, 40);
    res.json({ data: results, meta: {
      query: q, type, providers: tasks.map(item => item[0]),
      failedProviders: settled.filter(item => item.error).map(item => ({ provider: item.name, error: item.error })),
      resultCount: results.length,
      notice: 'Results come from public third-party indexes. Image rights, identity matches, accuracy, and content safety are not guaranteed; open the original source and check its terms.',
    } });
  }));

  app.get('/api/v1/public-search', optionalAuth, limitProvider, wrap(async (req, res) => {
    const q = String(req.query.q || '').trim().slice(0, 200);
    if (q.length < 2) return sendError(res, 400, 'QUERY_REQUIRED', 'Enter at least two characters to search.');
    const providerKeys = req.user ? await getUserProviderKeys(req.user.id) : {};
    const [live, indexed] = await Promise.all([
      searchAllPublic(q, providerKeys).catch(error => ({
        results: [], queryPlan: [], meta: {}, error: String(error?.message || 'Public providers unavailable'),
      })),
      findIndexedPublicResults(q, 10).catch(error => {
        console.warn('ADVERSE indexed search unavailable:', String(error?.message || 'index lookup failed').slice(0, 180));
        return [];
      }),
    ]);

    // Blend fresh federated results with previously indexed public pages. Index hits
    // improve continuity but never replace live providers or imply source verification.
    const mergedResults = [...(Array.isArray(live.results) ? live.results : []), ...indexed];
    const ranked = improvePublicSearchRanking(
      diversifyPublicResults(mergedResults, q, { limit: 36, maxPerDomain: 3 }),
      q,
    );
    const candidates = ranked.map(({ _searchScore, _searchOrder, ...item }) => item);
    const unique = [];
    const seen = new Set();
    for (const item of candidates) {
      try {
        const parsed = validatePublicUrl(item.url);
        const canonical = normalizeResultUrl(parsed.href);
        if (seen.has(canonical)) continue;
        seen.add(canonical);
        unique.push({ ...item, url: canonical, linkSignals: inspectPublicLink(canonical) });
      } catch {}
    }

    const checked = await Promise.all(unique.slice(0, 8).map(async item => {
      const checkedAt = new Date().toISOString();
      try {
        const page = await scrapePublicPage(item.url);
        return { ...item, _indexedPage: { title: page?.title || '', excerpt: page?.excerpt || '' }, linkCheck: { status: 'reachable', checkedAt, note: 'The public page responded with readable text during this check. This does not verify every claim on the page.' } };
      } catch {
        return { ...item, linkCheck: { status: 'not_confirmed', checkedAt, note: 'ADVERSE could not confirm readable page access. The link may redirect, block automated access, or be temporarily unavailable; inspect it directly before relying on it.' } };
      }
    }));
    const checkedUrls = new Set(checked.map(item => item.url));
    await indexPublicSearchResults(unique, q, checked.map(item => ({ url: item.url, page: item._indexedPage })));
    const rawResults = [
      ...checked.map(({ _indexedPage, ...item }) => item),
      ...unique.filter(item => !checkedUrls.has(item.url)).map(item => ({
        ...item, linkCheck: { status: 'not_checked', checkedAt: null, note: 'This result was not link-checked in this search.' },
      })),
    ];
    const results = rawResults.slice(0, 24).map(item => {
      const host = new URL(item.url).hostname.toLowerCase().replace(/^www\./, '');
      const corroborating = [...new Map(rawResults
        .filter(other => other.url !== item.url
          && new URL(other.url).hostname.toLowerCase().replace(/^www\./, '') !== host
          && titleSimilarity(item.title, other.title) >= 0.55)
        .map(other => [new URL(other.url).hostname.toLowerCase().replace(/^www\./, ''), other])).values()];
      const corroboratingDomains = corroborating.slice(0, 4).map(other => new URL(other.url).hostname.toLowerCase().replace(/^www\./, ''));
      return {
        ...item,
        sourceContext: assessSourceContext(item.url, item),
        corroboration: {
          independentMatches: corroborating.length,
          domains: corroboratingDomains,
          method: 'Similar result titles from distinct hostnames in this search result set; not independent fact verification.',
        },
      };
    });

    res.json({ data: results, meta: {
      query: q,
      retrievedAt: new Date().toISOString(),
      queryPlan: live.queryPlan || [],
      providers: [...new Set(results.flatMap(item => [item.provider, ...(item.providers || [])].filter(Boolean)))],
      successfulSearches: live.meta?.successfulSearches || 0,
      failedSearches: live.meta?.failedSearches || 0,
      coverage: live.meta?.coverage || 'Search across a limited set of public sources; not exhaustive whole-web search.',
      linkChecks: checked.length,
      providerError: live.error || '',
      notice: 'Relevance ordering uses query matches, provider agreement, and preview usefulness. Link reachability, hostname categories, and title similarity are advisory signals; they do not prove that a page or its claims are true, safe, current, or endorsed by ADVERSE.',
    } });
  }));
}
