const hostOf = (url) => { try { return new URL(url).hostname.toLowerCase().replace(/^www\./,''); } catch { return 'unknown'; } };

/**
 * Produce transparent investigation research gaps from saved evidence and claim triage.
 * This ranks follow-up work; it does not infer guilt, truth, or source credibility.
 */
export function analyzeResearchGaps({ evidence = [], entities = [], relationships = [], claimMap = null } = {}) {
  const rows = Array.isArray(evidence) ? evidence : [];
  const gaps = [];
  const add = (id, priority, title, rationale, action) => gaps.push({ id, priority, title, rationale, recommendedAction: action });
  const domains = new Set(rows.map((e) => hostOf(e.url)).filter((h) => h !== 'unknown'));
  const undated = rows.filter((e) => !e.publishedAt);
  const unverified = rows.filter((e) => !['supported'].includes(e.verificationStatus));
  const excerptsMissing = rows.filter((e) => !String(e.excerpt || '').trim());
  const sourceCounts = new Map();
  for (const e of rows) {
    const host = hostOf(e.url);
    sourceCounts.set(host, (sourceCounts.get(host) || 0) + 1);
  }
  const dominant = [...sourceCounts].sort((a,b) => b[1] - a[1])[0];
  if (rows.length === 0) add('no-evidence','critical','No evidence collected','The investigation has no saved source records yet.','Run public-source research, then inspect and save relevant primary sources.');
  if (rows.length > 0 && domains.size < 2) add('single-domain','high','No visible publisher diversity',`Saved evidence covers ${domains.size} known publisher domain(s). This may reflect a narrow search, not necessarily poor research.`,'Search for primary documents and reporting from independently operated publishers.');
  if (dominant && rows.length >= 3 && dominant[1] / rows.length >= 0.6) add('publisher-concentration','high','Publisher concentration',`${dominant[0]} accounts for ${dominant[1]} of ${rows.length} saved records. Multiple URLs from one publisher are not independent corroboration.`,'Find independently produced records and trace whether reports rely on the same press release or wire story.');
  if (undated.length) add('missing-publication-dates','medium','Publication dates missing',`${undated.length} of ${rows.length} sources have no recorded publication date, making chronology harder to establish.`,'Open each original source and record its publication date; keep publication, event, capture, and retrieval times distinct.');
  if (unverified.length) add('unverified-evidence','high','Evidence still needs review',`${unverified.length} of ${rows.length} records are not marked supported. Retrieval alone is not verification.`,'Review the original page, author/publisher, context, and corroborating material before updating verification status.');
  if (excerptsMissing.length) add('thin-source-records','medium','Thin source records',`${excerptsMissing.length} records have no saved excerpt, limiting searchable context and claim analysis.`,'Capture a short relevant excerpt with enough surrounding context to avoid quote-mining.');
  if (entities.length && relationships.length === 0) add('unconnected-entities','medium','Entities are not connected',`${entities.length} entities exist but no evidence-backed relationships are recorded.`,'Create relationships only where a source explicitly supports them; attach the supporting evidence IDs and rationale.');
  if (rows.length && entities.length === 0) add('entity-resolution','medium','Entity resolution not started','No entities have been added to connect people, organizations, domains, documents, and events across sources.','Identify recurring names and organizations, check for aliases and name collisions, then create canonical entities linked to evidence.');
  if (claimMap && Array.isArray(claimMap.claims)) {
    const conflictCount = claimMap.claims.reduce((sum, c) => sum + (c.possibleConflicts || []).length, 0);
    const single = claimMap.claims.filter((c) => c.sourceCount < 2).length;
    if (conflictCount) add('claim-conflicts','high','Potential claim discrepancies require review',`${conflictCount} lexical/numeric/negation flag(s) were raised. They may be contextual differences rather than true contradictions.`,'Compare the original passages, units, timeframe, definitions, and citation lineage side by side.');
    if (single) add('single-source-claims','medium','Claims with only one recorded source',`${single} claim group(s) currently have only one recorded source.`,'Seek an independent primary record or clearly document why independent corroboration is unavailable.');
  }
  if (rows.length >= 2 && rows.every((e) => !e.captureTimestamp)) add('no-archive-history','low','No archive capture timestamps saved','The evidence set has no explicit archive capture timestamps, so historical page changes may not be reconstructable.','Use the Time machine to inspect available archive captures for key URLs.');
  const rank = { critical: 0, high: 1, medium: 2, low: 3 };
  gaps.sort((a,b) => rank[a.priority] - rank[b.priority]);
  return {
    generatedAt: new Date().toISOString(),
    evidenceCount: rows.length,
    publisherDomainCount: domains.size,
    entityCount: entities.length,
    relationshipCount: relationships.length,
    gapCount: gaps.length,
    gaps,
    method: 'Rule-based coverage diagnostics over stored metadata and optional claim triage; recommendations are heuristics, not a measure of case truth or investigator performance.',
    limitations: [
      'A missing field may mean the platform has not recorded it, not that the source lacks it.',
      'Publisher domains are not equivalent to independent sources; shared ownership, syndication, and citation lineage need manual review.',
      'No automated score determines whether an investigation is complete or whether a claim is true.'
    ]
  };
}
