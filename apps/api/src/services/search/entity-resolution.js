import { normalizeSearchText } from './normalize-search-text.js';

const INSTITUTIONS = [
  { name: 'Afe Babalola University', aliases: ['Afe Babalola University', 'ABUAD'] },
  { name: 'University of Lagos', aliases: ['University of Lagos', 'UNILAG'] },
  { name: 'University of Benin', aliases: ['University of Benin', 'UNIBEN'] },
  { name: 'University of Ilorin', aliases: ['University of Ilorin', 'UNILORIN'] },
  { name: 'Obafemi Awolowo University', aliases: ['Obafemi Awolowo University', 'OAU'] },
  { name: 'Federal University of Technology Akure', aliases: ['Federal University of Technology Akure', 'FUTA'] },
  { name: 'Federal University of Technology Minna', aliases: ['Federal University of Technology Minna', 'FUTMINNA'] },
  { name: 'University of Nigeria', aliases: ['University of Nigeria', 'UNN'] },
  { name: 'Nnamdi Azikiwe University', aliases: ['Nnamdi Azikiwe University', 'UNIZIK'] },
  { name: 'Lagos State University', aliases: ['Lagos State University', 'LASU'] },
  { name: 'Federal University of Agriculture Abeokuta', aliases: ['Federal University of Agriculture Abeokuta', 'FUNAAB'] },
  { name: 'Ahmadu Bello University', aliases: ['Ahmadu Bello University', 'ABU'] },
  { name: 'Covenant University', aliases: ['Covenant University'] },
  { name: 'Babcock University', aliases: ['Babcock University'] }
];

const PROGRAMMES = [
  { name: 'Mechatronics Engineering', aliases: ['Mechatronics Engineering', 'Mechatronics'] },
  { name: 'Computer Science', aliases: ['Computer Science', 'Comp Sci'] },
  { name: 'Software Engineering', aliases: ['Software Engineering'] },
  { name: 'Mechanical Engineering', aliases: ['Mechanical Engineering'] },
  { name: 'Electrical and Electronics Engineering', aliases: ['Electrical and Electronics Engineering', 'Electrical Engineering'] },
  { name: 'Civil Engineering', aliases: ['Civil Engineering'] },
  { name: 'Medicine and Surgery', aliases: ['Medicine and Surgery'] },
  { name: 'Accounting', aliases: ['Accounting'] }
];

function hasAlias(input, alias) {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('(^|[^\\p{L}\\p{N}])' + escaped + '(?=$|[^\\p{L}\\p{N}])', 'iu').test(input);
}

function matchEntry(input, entries) {
  for (const entry of entries) {
    const alias = [...entry.aliases].sort((a, b) => b.length - a.length).find(value => hasAlias(input, value));
    if (alias) return { ...entry, matchedText: alias };
  }
  return null;
}

/**
 * Resolve common public institution and programme aliases without an AI provider.
 * A matched alias is kept alongside the canonical entity name for traceability.
 */
export function resolveIntentEntities(query) {
  const normalized = normalizeSearchText(query, 500);
  const institution = matchEntry(normalized, INSTITUTIONS);
  const programme = matchEntry(normalized, PROGRAMMES);
  const nigeria = Boolean(institution) || /\\b(?:nigeria|nigerian)\\b/i.test(normalized);
  const entities = [];

  if (institution) entities.push({
    text: institution.name,
    matchedText: institution.matchedText,
    kind: 'institution',
    role: 'primary-subject',
    country: 'Nigeria'
  });
  if (programme) entities.push({
    text: programme.name,
    matchedText: programme.matchedText,
    kind: 'programme',
    role: 'requested-programme'
  });
  if (nigeria) entities.push({
    text: 'Nigeria',
    matchedText: 'Nigeria',
    kind: 'location',
    role: 'country',
    country: 'Nigeria'
  });

  return {
    entities,
    preferences: {
      ...(nigeria ? { country: 'Nigeria', currency: 'NGN' } : {})
    }
  };
}
