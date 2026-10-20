import { analyzeEvidenceClaims } from './claim-analysis.js';
import { analyzeResearchGaps } from './research-gaps.js';

// Deterministic no-key evidence triage; not a generative language model or truth detector.
export function analyzeEvidenceFree(evidence = [], entities = [], relationships = []) {
  const rows = Array.isArray(evidence) ? evidence.slice(0, 100) : [];
  const claimMap = analyzeEvidenceClaims(rows);
  const research = analyzeResearchGaps({ evidence: rows, entities, relationships, claimMap });
  const corroboratedClaims = claimMap.claims.filter(c => c.sourceCount > 1).slice(0, 20).map(c => ({ claim: c.claim, evidenceIds: c.sourceIds, reasoning: 'Similar wording or topic appears in multiple saved records. This is repetition, not proof of independent corroboration; inspect source passages and citation lineage.', confidence: 'low' }));
  const possibleDisagreements = [];
  for (const claim of claimMap.claims) for (const conflict of claim.possibleConflicts || []) {
    possibleDisagreements.push({ topic: claim.claim, evidenceIds: [...new Set([conflict.sourceA, conflict.sourceB].filter(Boolean))], comparison: conflict.detail + ' This is an automated review flag, not a confirmed contradiction.', confidence: 'low' });
    if (possibleDisagreements.length >= 20) break;
  }
  const unverified = rows.filter(e => (e.verificationStatus || 'unverified') !== 'supported');
  const sourceCautions = unverified.length ? [{ evidenceIds: unverified.slice(0, 30).map(e => String(e.id || e._id || '')).filter(Boolean), caution: unverified.length + ' of ' + rows.length + ' records are not marked supported. Retrieval does not establish accuracy; verify the original source and context.' }] : [];
  for (const cluster of claimMap.provenanceClusters || []) {
    if (cluster.count >= 3) sourceCautions.push({ evidenceIds: cluster.evidenceIds.slice(0, 30), caution: cluster.count + ' records share publisher domain ' + cluster.host + '. Treat these as one publisher cluster until independence is established.' });
    if (sourceCautions.length >= 10) break;
  }
  const gaps = research.gaps.slice(0, 20).map(g => ({ question: g.title, whyItMatters: g.rationale + ' Next step: ' + g.recommendedAction }));
  const summary = rows.length ? 'Free evidence analyst reviewed ' + rows.length + ' saved records and found ' + claimMap.groupCount + ' extractive claim groups, ' + corroboratedClaims.length + ' repeated-claim candidates, ' + possibleDisagreements.length + ' possible discrepancy flags, and ' + research.gapCount + ' research gaps. These are rule-based triage signals, not verified findings.' : 'No evidence records are saved yet. Add public sources to begin evidence triage.';
  return { summary, corroboratedClaims, possibleDisagreements: possibleDisagreements.slice(0, 20), gaps, sourceCautions, generatedAt: new Date().toISOString(), provider: 'ADVERSE Free Evidence Analyst', model: 'deterministic-evidence-triage-v1', mode: 'free-rule-based', evidenceCount: rows.length, limitations: ['This no-key mode is deterministic analysis, not a generative AI model.', ...claimMap.limitations, ...research.limitations, 'Repeated claims are not necessarily corroborated, and possible discrepancies are not necessarily contradictions.', 'Only stored titles and excerpts are analyzed; original pages have not been independently fact-checked.'].filter((v, i, a) => a.indexOf(v) === i).slice(0, 12) };
}
