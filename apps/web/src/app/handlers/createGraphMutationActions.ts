import type { Entity, Evidence, Relationship } from '../../types/research';
import { request } from '../../lib/api';
import { getRecordId as key } from '../../lib/ids';

type Dependencies = {
  caseId: string;
  evidence: Evidence[];
  entities: Entity[];
  relationships: Relationship[];
  loadCaseData: (id: string) => Promise<unknown>;
  notify: (message: string) => void;
  setError: (message: string) => void;
  setSelectedEntityId: (id: string) => void;
};

export function createGraphMutationActions({
  caseId,
  evidence,
  entities,
  relationships,
  loadCaseData,
  notify,
  setError,
  setSelectedEntityId,
}: Dependencies) {
  const deleteEvidence = async (item: Evidence) => {
    if (!window.confirm('Delete this saved link? Any connections that rely on it will also be updated.')) return;

    try {
      await request('/evidence/' + encodeURIComponent(key(item)), { method: 'DELETE' });
      await loadCaseData(caseId);
      notify('Evidence record deleted.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not delete evidence.');
    }
  };

  const deleteAllEvidence = async () => {
    if (!caseId || !evidence.length) return;

    const confirmed = window.confirm(
      'Permanently delete all ' + evidence.length +
      ' saved links in this collection? Linked evidence references will be removed. ' +
      'Collections and graph entities will remain. This cannot be undone.',
    );
    if (!confirmed) return;

    try {
      for (const item of evidence) {
        await request('/evidence/' + encodeURIComponent(key(item)), { method: 'DELETE' });
      }
      await loadCaseData(caseId);
      notify('All saved links in this collection were deleted.');
    } catch (error) {
      try {
        await loadCaseData(caseId);
      } catch {
        // Keep the original mutation error; the refresh is best-effort.
      }
      setError(
        error instanceof Error
          ? error.message
          : 'Could not delete all evidence. Some records may have been removed; the collection has been refreshed.',
      );
    }
  };

  const deleteEntity = async (item: Entity) => {
    if (!window.confirm('Delete “' + item.name + '” and all relationships connected to it?')) return;

    try {
      await request(
        '/investigations/' + encodeURIComponent(caseId) + '/entities/' + encodeURIComponent(key(item)),
        { method: 'DELETE' },
      );
      setSelectedEntityId('');
      await loadCaseData(caseId);
      notify('Entity and connected relationships deleted.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not delete entity.');
    }
  };

  const deleteRelationship = async (item: Relationship) => {
    if (!window.confirm('Delete this connection?')) return;

    try {
      await request(
        '/investigations/' + encodeURIComponent(caseId) + '/relationships/' + encodeURIComponent(key(item)),
        { method: 'DELETE' },
      );
      await loadCaseData(caseId);
      notify('Relationship deleted.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not delete relationship.');
    }
  };

  const clearGraphAndLinks = async () => {
    if (!caseId || (!entities.length && !relationships.length)) return;

    const confirmed = window.confirm(
      'Permanently remove all ' + entities.length + ' graph entities and ' + relationships.length +
      ' relationships in this collection? Saved evidence and the collection itself will remain. ' +
      'This cannot be undone.',
    );
    if (!confirmed) return;

    try {
      for (const item of relationships) {
        await request(
          '/investigations/' + encodeURIComponent(caseId) + '/relationships/' + encodeURIComponent(key(item)),
          { method: 'DELETE' },
        );
      }
      for (const item of entities) {
        await request(
          '/investigations/' + encodeURIComponent(caseId) + '/entities/' + encodeURIComponent(key(item)),
          { method: 'DELETE' },
        );
      }

      setSelectedEntityId('');
      await loadCaseData(caseId);
      notify('All graph entities and relationships in this collection were deleted. Saved evidence remains.');
    } catch (error) {
      try {
        await loadCaseData(caseId);
      } catch {
        // Best-effort refresh after a partially completed bulk deletion.
      }
      setError(
        error instanceof Error
          ? error.message
          : 'Could not clear the graph completely. The collection has been refreshed; check remaining records.',
      );
    }
  };

  return {
    deleteEvidence,
    deleteAllEvidence,
    deleteEntity,
    deleteRelationship,
    clearGraphAndLinks,
  };
}
