import { useState } from 'react';
import { Download, FileJson, FileText } from 'lucide-react';
import type { ExperienceClaim, ExperienceSource } from './experience-types';

export default function ExperienceDossierActions({
  workspaceId, intent, sources, claims,
}: {
  workspaceId: string; intent: string; sources: ExperienceSource[]; claims: ExperienceClaim[];
}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  function digestHex(buffer: ArrayBuffer) {
    return Array.from(new Uint8Array(buffer)).map(value => value.toString(16).padStart(2, '0')).join('');
  }
  function saveFile(content: string, type: string, extension: string) {
    const file = new Blob([content], { type });
    const url = URL.createObjectURL(file);
    const anchor = document.createElement('a');
    const slug = intent.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'research';
    anchor.href = url;
    anchor.download = 'adverse-' + slug + '-dossier.' + extension;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }
  async function exportDossier(format: 'json' | 'markdown') {
    if (busy) return;
    setBusy(true);
    setNotice('');
    try {
      if (!window.crypto?.subtle) throw new Error('This browser does not provide Web Crypto for an integrity digest.');
      const payload = {
        schemaVersion: 'adverse-research-dossier-v1',
        exportedAt: new Date().toISOString(),
        workspace: { workspaceId, intent },
        sourceCount: sources.length,
        claimCount: claims.length,
        sources: sources.map(source => ({
          title: source.title || '', url: source.url, publisher: source.publisher || '',
          provider: source.provider || '', providers: source.providers || [],
          publishedAt: source.publishedAt || null, retrievedAt: source.retrievedAt || null,
          savedAt: source.savedAt || null, linkCheck: source.linkCheck || null,
          reviewStatus: source.reviewStatus || 'unreviewed', analystNote: source.analystNote || '',
          excerpt: source.excerpt || '',
        })),
        claims,
        limitations: [
          'Search results are leads and are not automatically verified facts.',
          'Analyst review labels and claim assessments are human judgements, not truth scores.',
          'Provider coverage is bounded by configured providers and their availability.',
          'A reachable source URL does not establish authenticity, safety, accuracy, or endorsement.',
          'The integrity digest detects later changes to this exported payload; it is not a digital signature or trusted timestamp.',
        ],
      };
      const payloadText = JSON.stringify(payload, null, 2);
      const digest = digestHex(await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(payloadText)));
      const manifest = {
        algorithm: 'SHA-256',
        digest,
        scope: 'UTF-8 JSON payload before the integrity manifest was attached',
      };
      if (format === 'json') {
        saveFile(JSON.stringify({ ...payload, integrity: manifest }, null, 2), 'application/json;charset=utf-8', 'json');
      } else {
        const lines = [
          '# ADVERSE research dossier', '',
          '**Intent:** ' + intent,
          '**Exported:** ' + payload.exportedAt,
          '**Workspace:** ' + workspaceId,
          '**Sources:** ' + sources.length,
          '**Claims:** ' + claims.length, '',
          '## Claims',
          ...(claims.length ? claims.map((claim, index) =>
            (index + 1) + '. **' + claim.text + '** — ' + claim.assessment.toUpperCase() +
            (claim.rationale ? '\n   - Rationale: ' + claim.rationale : '') +
            (claim.evidenceLinks.length ? '\n   - Evidence: ' + claim.evidenceLinks.map(link => link.role + ' — ' + link.url).join('; ') : '\n   - Evidence: none linked')
          ) : ['No claims were recorded.']),
          '', '## Sources',
          ...(sources.length ? sources.map((source, index) =>
            (index + 1) + '. [' + (source.title || source.url).replaceAll(']', '\\]') + '](' + source.url + ')' +
            '\n   - Publisher: ' + (source.publisher || 'Not supplied') +
            '\n   - Review: ' + (source.reviewStatus || 'unreviewed') +
            '\n   - Published: ' + (source.publishedAt || 'Not supplied') +
            '\n   - Retrieved: ' + (source.retrievedAt || 'Not supplied') +
            (source.analystNote ? '\n   - Analyst note: ' + source.analystNote : '') +
            (source.excerpt ? '\n   - Excerpt: ' + source.excerpt.slice(0, 500).replaceAll('\n', ' ') : '')
          ) : ['No sources were saved.']),
          '', '## Limitations',
          ...payload.limitations.map(item => '- ' + item),
          '', '## Integrity manifest',
          '- Algorithm: ' + manifest.algorithm,
          '- SHA-256: ' + manifest.digest,
          '- Scope: ' + manifest.scope, '',
        ];
        saveFile(lines.join('\n'), 'text/markdown;charset=utf-8', 'md');
      }
      setNotice('Dossier exported with a SHA-256 payload digest.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The dossier could not be exported.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="experience-dossier-actions" aria-label="Research dossier exports">
      <div><span className="experience-section-label"><Download size={13} /> RESEARCH DOSSIER</span><strong>Take your work with its provenance</strong><p>Exports include sources, analyst review, linked claims, limitations, and an integrity digest.</p></div>
      <div className="experience-dossier-buttons">
        <button type="button" disabled={busy || !sources.length} onClick={() => void exportDossier('json')}><FileJson size={14} /> Export JSON</button>
        <button type="button" disabled={busy || !sources.length} onClick={() => void exportDossier('markdown')}><FileText size={14} /> Export Markdown</button>
      </div>
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
