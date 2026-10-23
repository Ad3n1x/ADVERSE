const normalize = value => String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

function mentionsEntity(text, entity) {
  const name = normalize(entity?.name);
  if (!name || name.length < 4) return false;
  const haystack = ' ' + normalize(text) + ' ';
  return haystack.includes(' ' + name + ' ');
}

function appendUnique(values, ...valuesToAdd) {
  const list = Array.isArray(values) ? values.map(String) : [];
  for (const value of valuesToAdd) {
    const target = String(value);
    if (!list.includes(target)) list.push(target);
  }
  return list;
}

/**
 * Automatically associates newly collected evidence with named entities and
 * existing relationships in the same investigation. Co-mention is only a
 * discovery signal: it never upgrades verification or confidence.
 */
export async function linkEvidenceAutomatically({
  investigationId,
  savedSources = [],
  Evidence,
  Entity,
  Relationship,
  isDb,
  memory,
  id,
  saveRecord,
  listFor,
  logger = console,
}) {
  const result = { evidenceEntityLinksAdded: 0, relationshipEvidenceLinksAdded: 0, relationshipRecordsAdded: 0 };
  if (!savedSources.length) return result;

  try {
    const [entities, relationships] = await Promise.all([
      listFor(Entity, 'entities', investigationId),
      listFor(Relationship, 'relationships', investigationId),
    ]);

    for (const source of savedSources) {
      const evidenceId = String(source.id || source._id || '');
      if (!evidenceId) continue;
      const sourceText = [source.title, source.excerpt, source.publisher, source.url].filter(Boolean).join(' ');
      const matchedEntities = entities.filter(entity => mentionsEntity(sourceText, entity));
      const matchedIds = matchedEntities.map(entity => String(entity.id || entity._id)).filter(Boolean);

      for (const entity of matchedEntities) {
        const entityId = String(entity.id || entity._id);
        if (appendUnique(entity.evidenceIds, evidenceId).length === (entity.evidenceIds || []).length) continue;
        if (isDb()) {
          await Entity.updateOne({ _id: entity._id || entityId, investigationId }, { $addToSet: { evidenceIds: evidenceId } });
        } else {
          const stored = memory?.entities?.get(entityId);
          if (stored) stored.evidenceIds = appendUnique(stored.evidenceIds, evidenceId);
        }
        entity.evidenceIds = appendUnique(entity.evidenceIds, evidenceId);
        result.evidenceEntityLinksAdded++;
      }

      if (matchedIds.length) {
        if (isDb()) {
          await Evidence.updateOne({ _id: source._id || evidenceId, investigationId }, { $addToSet: { entities: { $each: matchedIds } } });
        } else {
          source.entities = appendUnique(source.entities, ...matchedIds);
          const stored = memory?.evidence?.get(evidenceId);
          if (stored && stored !== source) stored.entities = appendUnique(stored.entities, ...matchedIds);
        }
      }

      const matchedSet = new Set(matchedIds);
      // Record a transparent co-mention lead when a source names two known
      // substantive entities. This is not a claim that the entities are truly
      // related; it preserves the discovery for review without upgrading trust.
      const substantiveEntities = matchedEntities.filter(entity =>
        !['domain', 'document', 'source'].includes(String(entity.type || '').toLowerCase())
      );
      const relationKey = (from, to, type) => [String(from), String(to), String(type)].join('|');
      const knownKeys = new Set(relationships.map(item => relationKey(item.fromEntityId, item.toEntityId, item.type)));
      const knownPairKeys = new Set(relationships.map(item => [String(item.fromEntityId), String(item.toEntityId)].sort().join('|')));
      for (let left = 0; left < substantiveEntities.length; left++) {
        for (let right = left + 1; right < substantiveEntities.length; right++) {
          const fromEntity = substantiveEntities[left];
          const toEntity = substantiveEntities[right];
          const fromId = String(fromEntity.id || fromEntity._id || '');
          const toId = String(toEntity.id || toEntity._id || '');
          if (!fromId || !toId || fromId === toId || knownPairKeys.has([fromId, toId].sort().join('|'))) continue;
          if (typeof saveRecord !== 'function' || typeof id !== 'function') continue;
          const candidate = {
            id: id(),
            investigationId,
            fromEntityId: fromId,
            toEntityId: toId,
            type: 'co-mentioned in source',
            evidenceIds: [evidenceId],
            confidence: 'low',
            rationale: 'Both entities are named in the same saved source. This is an automatically recorded discovery lead only; co-mention does not establish a direct relationship or prove a claim.',
            verificationStatus: 'unverified',
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          try {
            const stored = await saveRecord(Relationship, 'relationships', candidate);
            relationships.push(stored || candidate);
            knownKeys.add(relationKey(fromId, toId, candidate.type));
            knownPairKeys.add([fromId, toId].sort().join('|'));
            result.relationshipRecordsAdded++;
          } catch (error) {
            logger.warn?.('ADVERSE co-mention relationship save failed', String(error?.message || error));
          }
        }
      }

      for (const relationship of relationships) {
        const fromId = String(relationship.fromEntityId);
        const toId = String(relationship.toEntityId);
        if (!matchedSet.has(fromId) || !matchedSet.has(toId)) continue;
        const oldIds = Array.isArray(relationship.evidenceIds) ? relationship.evidenceIds.map(String) : [];
        if (oldIds.includes(evidenceId)) continue;

        if (isDb()) {
          await Relationship.updateOne(
            { _id: relationship._id || relationship.id, investigationId },
            { $addToSet: { evidenceIds: evidenceId } },
          );
        } else {
          const stored = memory?.relationships?.get(String(relationship.id || relationship._id));
          if (stored) stored.evidenceIds = appendUnique(stored.evidenceIds, evidenceId);
        }
        relationship.evidenceIds = appendUnique(oldIds, evidenceId);
        result.relationshipEvidenceLinksAdded++;
      }
    }
  } catch (error) {
    logger.warn?.('ADVERSE automatic evidence linking incomplete', String(error?.message || error));
  }

  return result;
}
