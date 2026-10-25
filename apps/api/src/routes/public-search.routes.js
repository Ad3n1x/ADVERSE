import { analyzeVisualFrame } from '../services/media/visual-analysis.js';
import { improvePublicSearchRanking } from '../services/search/relevance-ranking.js';
import { findIndexedPublicResults, indexPublicSearchResults, suggestIndexedSearches } from '../services/search/public-search-index.js';
import { filterAdvancedSearchResults, parseAdvancedSearch } from '../services/search/advanced-search.js';

export function registerPublicSearchRoutes(app, {
  limitProvider, wrap, sendError, validatePublicUrl, inspectPublicLink,
  assessSourceContext, titleSimilarity, searchAllPublic, rankPublicResults,
  diversifyPublicResults, normalizeResultUrl, searchImages, searchVideos,
  searchPeople, scrapePublicPage, getUserProviderKeys, optionalAuth,
}) {
  app.post('/api/v1/public-search/check-link', limitProvider, wrap(async (req, res) => {
    const input = String(req.body?.url || '').trim().slice(0, 2048);
    if (!input) return sendError(res, 400, 'URL_REQUIRED', 'Paste a public website URL to check.');
    let parsed;
    try {
      parsed = validatePublicUrl(input);
    } catch {
      return sendError(res, 400, 'INVALID_PUBLIC_URL', 'Enter a valid public HTTP or HTTPS URL. Private and restricted network addresses cannot be checked.');
    }
    const checkedAt = new Date().toISOString();
    try {
      const page = await scrapePublicPage(parsed.href);
      const redirected = Boolean(page?.finalUrl && page.finalUrl !== parsed.href);
      return res.json({
        data: {
          url: parsed.href,
          finalUrl: page?.finalUrl || parsed.href,
          redirects: Array.isArray(page?.redirects) ? page.redirects : [],
          httpStatus: page?.httpStatus || null,
          title: page?.title || '',
          excerpt: page?.excerpt || page?.description || '',
          status: 'reachable',
          checkedAt,
          note: redirected
            ? 'A readable public page responded after redirects. This confirms access at check time, not the legitimacy or truth of the destination.'
            : 'A readable public page responded at check time. This does not verify the page owner or the truth of its claims.'
        },
        meta: { notice: 'Only public HTTP(S) pages are checked. Private/restricted network destinations and unsafe redirect targets are rejected.' }
      });
    } catch {
      return res.json({
        data: {
          url: parsed.href,
          finalUrl: null,
          redirects: [],
          httpStatus: null,
          title: '',
          excerpt: '',
          status: 'not_confirmed',
          checkedAt,
          note: 'ADVERSE could not confirm readable page access. The site may block automated requests, redirect unsafely, require a login, or be temporarily unavailable. Open it directly before relying on it.'
        },
        meta: { notice: 'A failed automated check is not proof that a website is dead or fraudulent.' }
      });
    }
  }));

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

  app.get('/api/v1/public-search/suggestions', limitProvider, wrap(async (req, res) => {
    const q = String(req.query.q || '').trim().slice(0, 120);
    if (q.length < 2) return res.json({ data: [], meta: { query: q, indexEnabled: globalThis.__ADVERSE_MONGO_READY__ === true } });
    const data = await suggestIndexedSearches(q, 6).catch(error => {
      console.warn('ADVERSE search suggestions unavailable:', String(error?.message || 'suggestions failed').slice(0, 180));
      return [];
    });
    res.json({ data, meta: { query: q, indexEnabled: globalThis.__ADVERSE_MONGO_READY__ === true } });
  }));

  app.get('/api/v1/public-search', optionalAuth, limitProvider, wrap(async (req, res) => {
    const rawQuery = String(req.query.q || '').trim().slice(0, 200);
    const advanced = parseAdvancedSearch(rawQuery);
    const q = advanced.query;
    if (q.length < 2) return sendError(res, 400, 'QUERY_REQUIRED', 'Enter at least two search characters outside the supported operators (site:, after:, before:, type:).');
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

    // Merge duplicate URLs before ranking so indexed metadata and live provider
    // agreement survive deduplication. Keep live titles/previews first when available.
    const mergedByUrl = new Map();
    for (const item of [...(Array.isArray(live.results) ? live.results : []), ...indexed]) {
      try {
        const parsed = validatePublicUrl(item.url);
        const canonical = normalizeResultUrl(parsed.href);
        const previous = mergedByUrl.get(canonical);
        if (!previous) {
          mergedByUrl.set(canonical, { ...item, url: canonical });
          continue;
        }
        mergedByUrl.set(canonical, {
          ...item,
          ...previous,
          url: canonical,
          providers: [...new Set([...(previous.providers || []), ...(item.providers || []), previous.provider, item.provider].filter(Boolean))],
          matchedQueries: [...new Set([...(previous.matchedQueries || []), ...(item.matchedQueries || [])])],
          queryReasons: [...new Set([...(previous.queryReasons || []), ...(item.queryReasons || [])])],
          indexSignals: previous.indexSignals || item.indexSignals,
          publishedAt: previous.publishedAt || item.publishedAt,
          _searchScore: Math.max(Number(previous._searchScore || 0), Number(item._searchScore || 0)),
        });
      } catch {}
    }
    const filtered = filterAdvancedSearchResults([...mergedByUrl.values()], advanced.filters);
    const ranked = improvePublicSearchRanking(
      diversifyPublicResults(filtered, q, { limit: 36, maxPerDomain: 3 }),
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
        return { ...item, _indexedPage: { title: page?.title || '', excerpt: page?.excerpt || '' }, linkCheck: {
          status: 'reachable',
          checkedAt,
          httpStatus: page?.httpStatus || null,
          finalUrl: page?.finalUrl || item.url,
          redirects: Array.isArray(page?.redirects) ? page.redirects : [],
          note: page?.finalUrl && page.finalUrl !== item.url
            ? 'The original URL redirected to a readable public page. The final destination was checked; this does not verify every claim on it.'
            : 'The public page responded with readable text during this check. This does not verify every claim on the page.'
        } };
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
    // Put confirmed reachable destinations first, while preserving relevance order within each status group.
    const linkPriority = { reachable: 0, not_checked: 1, not_confirmed: 2 };
    rawResults.sort((a, b) => (linkPriority[a.linkCheck?.status] ?? 1) - (linkPriority[b.linkCheck?.status] ?? 1));
    const results = rawResults.slice(0, 24).map(item => {
      const host = new URL(item.url).hostname.toLowerCase().replace(/^www\./, '');
      const corroborating = [...new Map(rawResults
        .filter(other => other.url !== item.url
          && new URL(other.url).hostname.toLowerCase().replace(/^www\./, '') !== host
          && titleSimilarity(item.title, other.title) >= 0.55)
        .map(other => [new URL(other.url).hostname.toLowerCase().replace(/^www\./, ''), other])).values()];
      const corroboratingDomains = corroborating.slice(0, 4).map(other => new URL(other.url).hostname.toLowerCase().replace(/^www\./, ''));
      const relevanceSignals = [];
      if (item.matchedQueries?.length) relevanceSignals.push('matched a search query variant');
      if ((item.providers || []).length > 1) relevanceSignals.push('found by multiple search providers');
      if (item.indexSignals?.indexed) relevanceSignals.push('retrieved from ADVERSE public index');
      if (item.indexSignals?.lastSeenAt) relevanceSignals.push('previously seen on ' + item.indexSignals.lastSeenAt);
      return {
        ...item,
        whyThisResult: {
          signals: relevanceSignals.length ? relevanceSignals : ['ranked by query relevance and available source metadata'],
          matchedQuery: item.matchedQueries?.[0] || q,
          disclaimer: 'These explain retrieval and ordering only; they are not proof of factual accuracy.',
        },
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
      originalQuery: rawQuery,
      advancedFilters: advanced.filters,
      invalidOperators: advanced.invalidOperators,
      retrievedAt: new Date().toISOString(),
      queryPlan: live.queryPlan || [],
      providers: [...new Set(results.flatMap(item => [item.provider, ...(item.providers || [])].filter(Boolean)))],
      successfulSearches: live.meta?.successfulSearches || 0,
      failedSearches: live.meta?.failedSearches || 0,
      coverage: live.meta?.coverage || 'Search across a limited set of public sources; not exhaustive whole-web search.',
      linkChecks: checked.length,
      indexedResultCount: indexed.length,
      indexEnabled: globalThis.__ADVERSE_MONGO_READY__ === true,
      providerError: live.error || '',
      notice: 'Relevance ordering blends live public search with a persistent index of previously discovered public pages, query matches, provider agreement, and preview usefulness. Result explanations describe retrieval signals only. Link reachability, hostname categories, title similarity, and index presence do not prove that a page or its claims are true, safe, current, or endorsed by ADVERSE.',
    } });
  }));
}
