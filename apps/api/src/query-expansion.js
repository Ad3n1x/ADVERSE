const STOP = new Set(['the','and','for','with','from','into','that','this','what','when','where','which','who','how','are','was','were','you','your','all','every','find','search','about','show','give','get','any','world','worldwide','web','online']);

const unique = values => [...new Set(values.map(v => String(v || '').replace(/\\s+/g, ' ').trim()).filter(Boolean))];

/** Expand a search into bounded, complementary queries while preserving the exact original. */
export function expandSearchQuery(input, maxVariants = 8) {
  const original = String(input || '').trim().replace(/\\s+/g, ' ').slice(0, 200);
  if (!original) return [];
  const words = original.match(/[\\p{L}\\p{N}][\\p{L}\\p{N}._'-]*/gu) || [];
  const meaningful = unique(words.filter(w => w.length >= 2 && !STOP.has(w.toLowerCase())));
  const variants = [original];
  if (meaningful.length > 1) variants.push(meaningful.join(' '));
  for (const word of meaningful) {
    if (variants.length >= Math.max(2, maxVariants - 2)) break;
    variants.push(word);
  }
  const lower = original.toLowerCase();
  const base = meaningful.filter(w => !/^(old|older|previous|earlier|version|versions)$/i.test(w)).join(' ');
  if (base && /\\b(old version|older version|previous version|earlier version)\\b/.test(lower)) {
    variants.push(base + ' previous release');
    variants.push(base + ' version history');
  }
  if (base && /\\b(movie|film|series|show)\\b/.test(lower)) variants.push(base + ' reviews');
  if (base && /\\b(company|organization|business)\\b/.test(lower)) variants.push(base + ' official website');
  return unique(variants).slice(0, Math.max(1, Math.min(12, maxVariants)));
}
