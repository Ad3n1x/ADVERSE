/**
 * HTTP handlers for public lookup utilities and collection exports.
 * Middleware, validation order, response envelopes and route registration live in utility.routes.js.
 */
export function createUtilityController({
  sendError, searchOrganizations, waybackCaptures, validatePublicUrl, compareArchivedText,
  publicDns, exists, Evidence, Entity, Relationship, investigationGet, listFor,
  isDb, Investigation, createReportPdf, csvCell, memory,
}) {
  async function searchOrganizationsHandler(req, res) {
    const query = String(req.query.q || '').slice(0, 200);
    try {
      const data = await searchOrganizations(query);
      return res.json({ data, meta: { provider: 'OpenCorporates API', query, retrievedAt: new Date().toISOString(), coverage: 'Provider coverage and licensing restrictions apply.' } });
    } catch (error) {
      return sendError(res, process.env.OPENCORPORATES_API_TOKEN ? 502 : 503, 'ORGANIZATION_PROVIDER_UNAVAILABLE', 'Organization records are unavailable.', { reason: error.message });
    }
  }

  async function archivesHandler(req, res) {
    const url = String(req.query.url || '');
    try {
      return res.json({ data: await waybackCaptures(url) });
    } catch (error) {
      return sendError(res, 502, 'ARCHIVE_UNAVAILABLE', 'Historical captures could not be retrieved.', { reason: error.message });
    }
  }

  async function compareArchivesHandler(req, res) {
    const url = String(req.query.url || '');
    const from = String(req.query.from || '');
    const to = String(req.query.to || '');
    try {
      const target = validatePublicUrl(url);
      if (!/^\d{14}$/.test(from) || !/^\d{14}$/.test(to)) {
        return sendError(res, 400, 'INVALID_CAPTURE_TIME', 'Capture timestamps must be 14 digits (YYYYMMDDhhmmss).');
      }
      const getSnapshot = async (timestamp) => {
        const snapshot = new URL('https://web.archive.org/web/' + timestamp + 'id_/' + target.href);
        const response = await fetch(snapshot, {
          redirect: 'manual',
          signal: AbortSignal.timeout(12000),
          headers: { 'user-agent': 'ADVERSE-Research/0.1' },
        });
        if (response.status >= 300 && response.status < 400) {
          throw new Error('Archive returned a redirect. Open the capture directly in the archive; this comparison does not follow redirects.');
        }
        if (!response.ok) throw new Error('Archive snapshot returned HTTP ' + response.status);
        const type = response.headers.get('content-type') || '';
        if (!type.includes('text/html') && !type.includes('text/plain')) throw new Error('Snapshot is not a text document.');
        const reader = response.body.getReader();
        let bytes = 0;
        const chunks = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > 1000000) {
            await reader.cancel();
            throw new Error('Snapshot exceeds the 1 MB comparison limit.');
          }
          chunks.push(value);
        }
        return new TextDecoder().decode(Buffer.concat(chunks));
      };
      const [before, after] = await Promise.all([getSnapshot(from), getSnapshot(to)]);
      return res.json({
        data: await compareArchivedText(before, after),
        meta: { url: target.href, from, to, provider: 'Internet Archive Wayback Machine', retrievedAt: new Date().toISOString() },
      });
    } catch (error) {
      return sendError(res, 502, 'ARCHIVE_COMPARE_FAILED', 'Could not compare the requested archived captures.', { reason: error.message });
    }
  }

  async function domainsHandler(req, res) {
    const url = String(req.query.url || '');
    try {
      return res.json({ data: await publicDns(url) });
    } catch (error) {
      return sendError(res, 400, 'DOMAIN_LOOKUP_FAILED', 'Public DNS lookup failed.', { reason: error.message });
    }
  }

  async function timelineHandler(req, res) {
    if (!await exists(req.params.id, req.user.id)) return sendError(res, 404, 'NOT_FOUND', 'Investigation not found.');
    const evidence = await listFor(Evidence, 'evidence', req.params.id);
    const events = evidence.map((item) => ({
      id: item.id || String(item._id), title: item.title, url: item.url, eventTime: null,
      publicationTime: item.publishedAt || null, retrievalTime: item.retrievedAt || item.createdAt,
      captureTime: item.captureTimestamp || null, verificationStatus: item.verificationStatus,
    })).sort((a, b) => new Date(a.publicationTime || a.captureTime || a.retrievalTime || 0) - new Date(b.publicationTime || b.captureTime || b.retrievalTime || 0));
    return res.json({ data: events, meta: { note: 'Event, publication, retrieval and archive-capture times are distinct; no event date is inferred.' } });
  }

  async function historyGraphHandler(req, res) {
    const investigationId = req.params.id;
    if (!await exists(investigationId, req.user.id)) return sendError(res, 404, 'NOT_FOUND', 'Investigation not found.');
    const raw = String(req.query.asOf || '');
    const asOf = raw ? new Date(raw) : new Date();
    if (!Number.isFinite(asOf.getTime())) return sendError(res, 400, 'INVALID_DATE', 'Provide a valid asOf date.');

    const [allEvidence, allEntities, allRelationships] = await Promise.all([
      listFor(Evidence, 'evidence', investigationId),
      listFor(Entity, 'entities', investigationId),
      listFor(Relationship, 'relationships', investigationId),
    ]);
    const knownAt = (item) => {
      const timestamp = item.retrievedAt || item.createdAt;
      return timestamp && new Date(timestamp) <= asOf;
    };
    const evidence = allEvidence.filter(knownAt);
    const evidenceIds = new Set(evidence.map((item) => String(item.id || item._id)));
    const entities = allEntities.filter((item) => {
      const created = item.createdAt ? new Date(item.createdAt) : null;
      if (created && created > asOf) return false;
      return !(item.evidenceIds || []).length || (item.evidenceIds || []).some((id) => evidenceIds.has(String(id)));
    });
    const entityIds = new Set(entities.map((item) => String(item.id || item._id)));
    const relationships = allRelationships.filter((item) =>
      entityIds.has(String(item.fromEntityId)) &&
      entityIds.has(String(item.toEntityId)) &&
      (item.evidenceIds || []).some((id) => evidenceIds.has(String(id))),
    );
    return res.json({
      data: { asOf: asOf.toISOString(), evidence, entities, relationships },
      meta: {
        mode: 'known-by-date reconstruction',
        note: 'This view shows records retrievable by the selected date, not proof that a relationship or event objectively existed at that time. Evidence retrieval dates are used; unknown dates are excluded.',
      },
    });
  }

  async function exportInvestigationHandler(req, res) {
    const investigationId = req.params.id;
    const investigation = await investigationGet(investigationId, req.user.id);
    if (!investigation) return sendError(res, 404, 'NOT_FOUND', 'Investigation not found.');
    const [evidence, entities, relationships] = await Promise.all([
      listFor(Evidence, 'evidence', investigationId),
      listFor(Entity, 'entities', investigationId),
      listFor(Relationship, 'relationships', investigationId),
    ]);
    const report = {
      product: 'ADVERSE', generatedAt: new Date().toISOString(), investigation,
      summary: { evidenceCount: evidence.length, entityCount: entities.length, relationshipCount: relationships.length },
      findings: [], evidence, entities, relationships,
      limitations: [
        'This export includes stored records only. It does not imply independent verification.',
        'Source dates and retrieval dates are preserved separately.',
      ],
    };
    const format = String(req.query.format || 'json');
    if (format === 'pdf') {
      const pdf = createReportPdf(report);
      res.type('application/pdf').attachment('adverse-investigation-report.pdf');
      return res.send(pdf);
    }
    if (format === 'csv') {
      res.type('text/csv').attachment('adverse-evidence.csv');
      const rows = [
        ['title', 'url', 'sourceType', 'publisher', 'publishedAt', 'retrievedAt', 'verificationStatus', 'excerpt'],
        ...evidence.map((item) => [item.title, item.url, item.sourceType, item.publisher, item.publishedAt || '', item.retrievedAt || '', item.verificationStatus, item.excerpt]),
      ];
      return res.send(rows.map((row) => row.map(csvCell).join(',')).join('\r\n'));
    }
    return res.type('application/json').attachment('adverse-investigation.json').send(JSON.stringify(report, null, 2));
  }

  return { searchOrganizationsHandler, archivesHandler, compareArchivesHandler, domainsHandler, timelineHandler, historyGraphHandler, exportInvestigationHandler };
}
