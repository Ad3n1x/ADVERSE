const INVISIBLE_FORMATTING = /[\u200B\u200E\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/**
 * Canonicalize human search text without changing the user's saved original query.
 * Preserve ZWJ (U+200D), which is meaningful in emoji and some writing systems.
 */
export function normalizeSearchText(value, maxLength = 1200) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/<[^>]*>/g, ' ')
    .replace(INVISIBLE_FORMATTING, ' ')
    .replace(CONTROL_CHARACTERS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}
