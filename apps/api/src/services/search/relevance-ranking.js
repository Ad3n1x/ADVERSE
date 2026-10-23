/**
 * Lightweight post-rank signals for the public search surface.
 *
 * These signals improve relevance ordering using only metadata returned by
 * search providers. They are not source-trust, factual-accuracy, or safety scores.
 */
const normalize = value => String(value || '')
  .normalize('NFKC')
  .toLocaleLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim();

export function improvePublicSearchRanking(items, query) {
  const normalizedQuery = normalize(query);
  const terms = [...new Set(normalizedQuery.split(/\s+/).filter(term => term.length > 1))];

  return (Array.isArray(items) ? items : []).map((item, index) => {
    const title = normalize(item?.title);
    const excerpt = normalize(item?.excerpt);
    const providers = [...new Set([
      ...(Array.isArray(item?.providers) ? item.providers : []),
      ...(item?.provider ? [item.provider] : []),
    ].map(value => String(value).trim()).filter(Boolean))];
    const matchedQueries = [...new Set((Array.isArray(item?.matchedQueries) ? item.matchedQueries : []).map(normalize).filter(Boolean))];
    const queryReasons = Array.isArray(item?.queryReasons) ? item.queryReasons : [];
    let score = Number.isFinite(item?._searchScore) ? item._searchScore : 0;

    // Multi-provider agreement is a small relevance hint, never a truth score.
    score += Math.min(8, Math.max(0, providers.length - 1) * 3);

    // Results repeatedly found across query variants are more likely to match intent.
    score += Math.min(5, Math.max(0, matchedQueries.length - 1) * 1.5);
    if (queryReasons.includes('exact phrase')) score += 2;

    // Prefer titles that cover more of the actual query, without rewarding keyword stuffing.
    if (terms.length) {
      const titleHits = terms.filter(term => (' ' + title + ' ').includes(' ' + term + ' ')).length;
      score += Math.round((titleHits / terms.length) * 4);
    }

    // A usable preview helps a person decide whether a result is worth opening.
    const excerptWords = excerpt.split(/\s+/).filter(Boolean).length;
    if (excerptWords >= 18) score += 2;
    else if (excerptWords >= 8) score += 1;
    else if (!excerptWords) score -= 2;

    // Freshness matters most when the query explicitly asks for recent information.
    const freshnessIntent = /\b(latest|today|current|recent|newest|breaking|news|updates?|this week|202[5-9])\b/i.test(String(query || ''));
    if (freshnessIntent) {
      const timestamp = item?.publishedAt || item?.indexSignals?.lastFetchedAt || item?.retrievedAt || item?.indexSignals?.lastSeenAt;
      const ageDays = timestamp ? (Date.now() - new Date(timestamp).getTime()) / 86400000 : Infinity;
      if (Number.isFinite(ageDays) && ageDays >= 0) {
        if (ageDays <= 1) score += 5;
        else if (ageDays <= 7) score += 3;
        else if (ageDays <= 30) score += 1;
        else if (ageDays > 365) score -= 2;
      }
    }

    // Exact phrase coverage is a useful signal, but never enough to overpower
    // the upstream provider rank or to reward repeated keyword stuffing.
    const phrase = normalizedQuery;
    if (phrase.length >= 4 && title.includes(phrase)) score += 3;

    return { ...item, _searchScore: score, _searchOrder: Number.isFinite(item?._searchOrder) ? item._searchOrder : index };
  }).sort((a, b) => b._searchScore - a._searchScore || a._searchOrder - b._searchOrder);
}
