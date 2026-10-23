const normalize = value => String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

function mentionsEntity(text, entity) {
  const name = normalize(entity?.name);
  if (!name || name.length < 4) return false;
  const haystack = ' ' + normalize(text) + ' ';
  return haystack.includes(' ' + name + ' ');
}

function appendUnique(values, value) {
  const list = Array.isArray(values) ? values.map(String) : [];
  const target = String(value);
  return list.includes(target) ? list : [...list, target];
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
  listFor,
  logger = console,
}) {
  const result = { evidenceEntityLinksAdded: 0, relationshipEvidenceLinksAdded: 0 };
  if (!savedSources.length) return result;

  try {
    const [entities, relationships] = await Promise.all([
      listFor(Entity, 'entities', investigationId),
      listFor(Relationship, 'relationships', investigationId),
    ]);
    const entityById = new Map(entities.map(entity => [String(entity.id || entity._id), entity]));

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
          const stored = memory?.evidence?.get(evidenceId);
          if (stored) stored.entities = appendUnique(stored.entities, ...matchedIds);
        }
      }

      const matchedSet = new Set(matchedIds);
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
