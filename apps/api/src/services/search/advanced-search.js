const MAX_QUERY = 200;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value) {
  if (!DATE_ONLY.test(value)) return false;
  const date = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Parse a small, explicit set of search operators without interpreting arbitrary user text as code. */
export function parseAdvancedSearch(input) {
  const raw = String(input || '').trim().slice(0, MAX_QUERY);
  const filters = { site: null, after: null, before: null, type: null };
  const terms = [];
  const invalid = [];
  for (const token of raw.match(/(?:\"[^\"]*\"|'[^']*'|\S+)/g) || []) {
    const match = token.match(/^(site|after|before|type):(.+)$/i);
    if (!match) { terms.push(token); continue; }
    const key = match[1].toLowerCase();
    const value = match[2].replace(/^[\"']|[\"']$/g, '').trim();
    if (key === 'site') {
      const host = value.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
      if (host.includes('.') && host.length <= 253 && /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(host)) filters.site = host;
      else invalid.push('site:' + value);
    } else if (key === 'after' || key === 'before') {
      if (validDate(value)) filters[key] = value;
      else invalid.push(key + ':' + value);
    } else if (key === 'type') {
      const type = value.toLowerCase().replace(/^\./, '');
      if (['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'csv', 'txt'].includes(type)) filters.type = type;
      else invalid.push('type:' + value);
    }
  }
  if (filters.after && filters.before && filters.after > filters.before) {
    invalid.push('after:' + filters.after + ' must be on or before before:' + filters.before);
    filters.after = null; filters.before = null;
  }
  return { query: terms.join(' ').trim().slice(0, MAX_QUERY), filters, invalidOperators: invalid };
}

function hostMatches(hostname, site) {
  const host = String(hostname || '').toLowerCase().replace(/^www\./, '');
  return host === site || host.endsWith('.' + site);
}

/** Apply validated search operators to candidate results; missing dates do not satisfy date filters. */
export function filterAdvancedSearchResults(items, filters) {
  return (Array.isArray(items) ? items : []).filter(item => {
    let url;
    try { url = new URL(item.url); } catch { return false; }
    if (filters?.site && !hostMatches(url.hostname, filters.site)) return false;
    if (filters?.type && !url.pathname.toLowerCase().endsWith('.' + filters.type)) return false;
    if (filters?.after || filters?.before) {
      const published = item.publishedAt ? new Date(item.publishedAt) : null;
      if (!published || !Number.isFinite(published.getTime())) return false;
      const day = published.toISOString().slice(0, 10);
      if (filters.after && day <= filters.after) return false;
      if (filters.before && day >= filters.before) return false;
    }
    return true;
  });
}
