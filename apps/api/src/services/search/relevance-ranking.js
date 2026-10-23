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

    return { ...item, _searchScore: score, _searchOrder: Number.isFinite(item?._searchOrder) ? item._searchOrder : index };
  }).sort((a, b) => b._searchScore - a._searchScore || a._searchOrder - b._searchOrder);
}
