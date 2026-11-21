import { buildIntentQueryVariants } from '../search/intent-understanding.js';

const clean = value => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220);

/**
 * Keep the user's original sentence intact, then add a small number of
 * measurable sub-questions. AI-suggested queries are already grounded by the
 * semantic planner; deterministic variants provide a safe fallback.
 */
export function buildResearchQueryPlan(query, semantic = {}) {
  const original = clean(query);
  if (!original) return [];
  const aiSuggestions = (Array.isArray(semantic.suggestedQueries) ? semantic.suggestedQueries : [])
    .map(item => clean(typeof item === 'string' ? item : item?.query))
    .filter(value => value.length >= 4);
  const ruleVariants = buildIntentQueryVariants(original, semantic, 5)
    .map(item => clean(item?.query))
    .filter(value => value.length >= 4);
  const seen = new Set();
  return [original, ...aiSuggestions, ...ruleVariants]
    .filter(value => {
      const key = value.toLocaleLowerCase();
      if (!value || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);
}
