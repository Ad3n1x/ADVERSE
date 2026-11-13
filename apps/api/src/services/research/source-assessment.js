/** Advisory URL and source-context heuristics: warnings only, never a verdict. */

const hasDomainSuffix = (hostname, suffix) =>
  hostname === suffix || hostname.endsWith('.' + suffix);

const INSTITUTIONAL_SUFFIXES = [
  'gov', 'gov.uk', 'gov.ng', 'gov.au', 'gov.za', 'gov.in',
  'edu', 'edu.ng', 'edu.au', 'ac.uk', 'ac.ng', 'mil', 'int',
];
const SCHOLARLY_SUFFIXES = [
  'doi.org', 'crossref.org', 'openalex.org', 'arxiv.org',
  'pubmed.ncbi.nlm.nih.gov', 'nature.com', 'science.org',
  'who.int', 'un.org', 'unesco.org',
];
const REFERENCE_SUFFIXES = ['wikipedia.org', 'wikidata.org', 'britannica.com'];

function sourceCategory(host) {
  if (SCHOLARLY_SUFFIXES.some(suffix => hasDomainSuffix(host, suffix))) {
    return {
      category: 'scholarly-or-international',
      label: 'Scholarly / international source',
      reason: 'The hostname matches a recognized scholarly index, publisher, DOI, or international-organization domain.',
    };
  }
  if (INSTITUTIONAL_SUFFIXES.some(suffix => hasDomainSuffix(host, suffix))) {
    return {
      category: 'institutional-domain',
      label: 'Institutional domain',
      reason: 'The hostname ends in a recognized government, education, military, or institutional suffix.',
    };
  }
  if (REFERENCE_SUFFIXES.some(suffix => hasDomainSuffix(host, suffix))) {
    return {
      category: 'reference-work',
      label: 'Reference work',
      reason: 'The hostname matches a general reference-work domain.',
    };
  }
  return {
    category: 'publisher-or-website',
    label: 'Website / publisher',
    reason: 'No recognized institutional, scholarly, or reference-domain suffix was identified.',
  };
}

function unknownSource(reason) {
  return {
    host: '',
    category: 'unknown',
    label: 'Unknown source',
    reason,
    classificationBasis: 'unavailable',
    signals: [],
    limitations: [
      'The hostname category is a technical hint, not a credibility or factual-accuracy rating.',
      'Review the original page, author, publisher, date, methods, and supporting material.',
    ],
  };
}

/**
 * Classifies only the visible hostname convention. It deliberately does not
 * assign a trust score: domain suffixes and transport security cannot establish
 * publisher identity, editorial quality, independence, or factual accuracy.
 */
export function assessSourceContext(input, item = {}) {
  let parsed;
  try {
    parsed = new URL(input);
  } catch {
    return unknownSource('The source URL could not be parsed.');
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const classification = sourceCategory(host);
  const signals = [];

  if (parsed.protocol === 'https:') signals.push('HTTPS transport is enabled');
  else signals.push('Uses unencrypted HTTP');

  if (item.provider) signals.push('Discovered via ' + String(item.provider).slice(0, 80));
  if (item.publisher) {
    signals.push('Provider-supplied publisher label: ' + String(item.publisher).slice(0, 100) + '; verify it on the original page');
  }
  if (item.publishedAt && Number.isFinite(Date.parse(item.publishedAt))) {
    signals.push('A publication date was supplied by the search provider; confirm it at the source');
  } else {
    signals.push('No usable publication date was supplied by the search provider');
  }

  return {
    host,
    ...classification,
    classificationBasis: 'hostname-suffix-heuristic',
    signals,
    limitations: [
      'A hostname category does not prove who controls the website or whether its content is reliable.',
      'HTTPS protects the connection; it does not certify the publisher or the truth of a claim.',
      'Provider-supplied publisher names and publication dates may be incomplete or incorrect.',
      'Open the original page and independently review its author, evidence, context, and publication history.',
    ],
  };
}

function normalizedTitleTokens(title) {
  return new Set(String(title || '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/).filter(token => token.length > 2));
}

export function titleSimilarity(a, b) {
  const left = normalizedTitleTokens(a);
  const right = normalizedTitleTokens(b);
  if (!left.size || !right.size) return 0;
  let common = 0;
  for (const token of left) if (right.has(token)) common++;
  return common / (left.size + right.size - common);
}

export function inspectPublicLink(input) {
  let parsed;
  try {
    parsed = new URL(input);
  } catch {
    return { transport: 'unknown', hostname: '', signals: ['URL could not be parsed'] };
  }

  const hostname = parsed.hostname.toLowerCase();
  const signals = [];
  if (parsed.protocol !== 'https:') signals.push('Uses HTTP rather than encrypted HTTPS');
  if (hostname.split('.').some(label => label.startsWith('xn--'))) {
    signals.push('Contains an internationalized/punycode domain label; check the spelling carefully');
  }

  const ipv4Parts = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  const validIpv4 = Boolean(ipv4Parts && ipv4Parts.slice(1).every(part => Number(part) >= 0 && Number(part) <= 255));
  const ipv6Literal = hostname.startsWith('[') && hostname.endsWith(']') || hostname.includes(':');
  if (validIpv4 || ipv6Literal) signals.push('Uses an IP address instead of a familiar domain name');

  if (parsed.username || parsed.password) {
    signals.push('URL contains embedded credentials; do not share or open it without understanding the destination');
  }

  const shorteners = new Set(['bit.ly', 't.co', 'tinyurl.com', 'ow.ly', 'is.gd', 'rb.gy', 'buff.ly', 'cutt.ly', 'shorturl.at']);
  if ([...shorteners].some(domain => hasDomainSuffix(hostname, domain))) {
    signals.push('Uses a link-shortening service, so the final destination is not obvious from this URL');
  }
  if (parsed.port && !['80', '443'].includes(parsed.port)) {
    signals.push('Uses a non-standard web port');
  }

  return {
    transport: parsed.protocol === 'https:' ? 'HTTPS' : parsed.protocol === 'http:' ? 'HTTP' : 'unknown',
    hostname,
    signals,
  };
}
