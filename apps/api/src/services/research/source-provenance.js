export async function enrichSourceProvenance({
  investigationId,
  savedSources,
  Entity,
  Relationship,
  id,
  listFor,
  saveRecord,
  logger,
}) {
  let graphEntitiesAdded = 0;
  let graphRelationshipsAdded = 0;

  try {
    const [knownEntities, knownRelationships] = await Promise.all([
      listFor(Entity, 'entities', investigationId),
      listFor(Relationship, 'relationships', investigationId),
    ]);
    const entityByUrl = new Map(
      knownEntities
        .filter(entity => entity.canonicalUrl)
        .map(entity => [String(entity.canonicalUrl).toLowerCase(), entity])
    );
    const entityByNameType = new Map(
      knownEntities.map(entity => [
        String(entity.name || '').trim().toLowerCase() + '|' + entity.type,
        entity,
      ])
    );
    const relationshipKeys = new Set(
      knownRelationships.map(item =>
        [String(item.fromEntityId), String(item.toEntityId), item.type].join('|')
      )
    );

    for (const source of savedSources) {
      const evidenceId = String(source.id || source._id || '');
      if (!evidenceId || !source.url) continue;

      let parsed;
      try {
        parsed = new URL(source.url);
      } catch {
        continue;
      }

      const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
      const publisherName = String(source.publisher || host).trim().slice(0, 200) || host;
      const documentName = String(source.title || source.url).trim().slice(0, 200) || source.url;
      let publisher =
        entityByUrl.get(('https://' + host).toLowerCase()) ||
        entityByNameType.get(publisherName.toLowerCase() + '|domain') ||
        entityByNameType.get(publisherName.toLowerCase() + '|organization');

      if (!publisher) {
        try {
          publisher = await saveRecord(Entity, 'entities', {
            id: id(),
            investigationId,
            name: publisherName,
            type: 'domain',
            description: 'Publisher/domain identified from a saved public source URL. This identifies the source host, not its trustworthiness.',
            canonicalUrl: 'https://' + host,
            evidenceIds: [evidenceId],
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          entityByUrl.set(('https://' + host).toLowerCase(), publisher);
          entityByNameType.set(publisherName.toLowerCase() + '|domain', publisher);
          graphEntitiesAdded++;
        } catch (error) {
          logger.warn?.('ADVERSE research publisher graph save failed', String(error?.message || error));
          continue;
        }
      }

      let document =
        entityByUrl.get(source.url.toLowerCase()) ||
        entityByNameType.get(documentName.toLowerCase() + '|document');

      if (!document) {
        try {
          document = await saveRecord(Entity, 'entities', {
            id: id(),
            investigationId,
            name: documentName,
            type: 'document',
            description: 'Public page discovered and saved by this research run. Review the original source before relying on its contents.',
            canonicalUrl: source.url,
            evidenceIds: [evidenceId],
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          entityByUrl.set(source.url.toLowerCase(), document);
          entityByNameType.set(documentName.toLowerCase() + '|document', document);
          graphEntitiesAdded++;
        } catch (error) {
          logger.warn?.('ADVERSE research document graph save failed', String(error?.message || error));
          continue;
        }
      }

      const from = String(publisher.id || publisher._id || '');
      const to = String(document.id || document._id || '');
      const relationshipKey = [from, to, 'publishes'].join('|');
      if (!from || !to || from === to || relationshipKeys.has(relationshipKey)) continue;

      try {
        await saveRecord(Relationship, 'relationships', {
          id: id(),
          investigationId,
          fromEntityId: from,
          toEntityId: to,
          type: 'publishes',
          evidenceIds: [evidenceId],
          confidence: 'low',
          rationale: 'Publisher/domain and page URL were observed in the same saved source record. This records source provenance only; it does not validate the page or its claims.',
          verificationStatus: 'unverified',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        relationshipKeys.add(relationshipKey);
        graphRelationshipsAdded++;
      } catch (error) {
        logger.warn?.('ADVERSE research provenance link save failed', String(error?.message || error));
      }
    }
  } catch (error) {
    logger.warn?.('ADVERSE research graph enrichment incomplete', String(error?.message || error));
  }

  return { graphEntitiesAdded, graphRelationshipsAdded };
}
