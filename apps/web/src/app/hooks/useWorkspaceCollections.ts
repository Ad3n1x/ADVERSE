import { useCallback, useRef, useState } from 'react';
import { request } from '../../lib/api';
import { readLocalSnapshot, saveLocalSnapshot } from '../../lib/offlineCache';
import type { Entity, Evidence, Investigation, Relationship } from '../../types/research';

type CachedOverview = {
  evidence: Evidence[];
  entities: Entity[];
  relationships: Relationship[];
  aiReviewHistory?: any[];
};

/**
 * Owns collection selection, collection data, and request sequencing.
 * Successful reads are saved to device-local IndexedDB so previously opened
 * collections can be inspected when the API is temporarily unreachable.
 */
export function useWorkspaceCollections(setError: (message: string) => void) {
  const [cases, setCases] = useState<Investigation[]>([]);
  const [caseId, setCaseId] = useState('');
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [apiStatus, setApiStatus] = useState('checking');
  const [aiProviderStatus, setAiProviderStatus] = useState('Checking configuration');
  const [loadingCaseId, setLoadingCaseId] = useState('');
  const [caseLoadError, setCaseLoadError] = useState('');
  const [agentRun, setAgentRun] = useState<any>(null);
  const [agentRunHistory, setAgentRunHistory] = useState<any[]>([]);
  const [researchStatus, setResearchStatus] = useState('');
  const [aiReview, setAiReview] = useState<any>(null);
  const caseLoadSequence = useRef(0);

  const active = cases.find((item) => item.id === caseId);

  const loadCases = useCallback(async () => {
    try {
      const response = await request<{ data: Investigation[] }>('/investigations');
      const normalized = (response.data || [])
        .map((item: any) => ({ ...item, id: String(item.id || item._id || '') }))
        .filter((item) => item.id);
      setCases(normalized);
      setCaseId((current) => current || normalized[0]?.id || '');
      setApiStatus('online');
      void saveLocalSnapshot('investigations:index', normalized).catch(() => undefined);
    } catch (error) {
      setApiStatus('offline');
      const cached = await readLocalSnapshot<Investigation[]>('investigations:index').catch(() => null);
      if (cached?.value) {
        setCases(cached.value);
        setCaseId((current) => current || cached.value[0]?.id || '');
        setError('Offline mode: showing saved investigations from this device. Live research and synchronization require internet.');
      } else {
        setError(error instanceof Error ? error.message : 'API unavailable');
      }
    }
  }, [setError]);

  const selectCollection = (id: string) => {
    setCaseLoadError('');
    setLoadingCaseId(id);
    setEvidence([]);
    setEntities([]);
    setRelationships([]);
    setCaseId(id);
  };

  const loadCaseData = useCallback(async (id: string) => {
    const sequence = ++caseLoadSequence.current;
    if (!id) {
      setLoadingCaseId('');
      setCaseLoadError('');
      setEvidence([]);
      setEntities([]);
      setRelationships([]);
      setAiReview(null);
      setAgentRun(null);
      setAgentRunHistory([]);
      setResearchStatus('');
      return;
    }

    setLoadingCaseId(id);
    setCaseLoadError('');
    setEvidence([]);
    setEntities([]);
    setRelationships([]);

    try {
      const response = await request<{ data: CachedOverview }>(
        '/investigations/' + encodeURIComponent(id) + '/overview',
      );
      if (sequence !== caseLoadSequence.current) return;

      const overview = {
        evidence: response.data.evidence || [],
        entities: response.data.entities || [],
        relationships: response.data.relationships || [],
        aiReviewHistory: response.data.aiReviewHistory || [],
      };
      setEvidence(overview.evidence);
      setEntities(overview.entities);
      setRelationships(overview.relationships);
      void saveLocalSnapshot('investigation:' + id, overview).catch(() => undefined);

      const runHistory = await request<{ data: any[] }>(
        '/investigations/' + encodeURIComponent(id) + '/agent-runs',
      ).catch(() => ({ data: [] }));
      if (sequence !== caseLoadSequence.current) return;
      setAgentRunHistory(runHistory.data || []);
      if (runHistory.data?.length) setAgentRun(runHistory.data[0]);

      const runState = await request<{ data: any }>(
        '/investigations/' + encodeURIComponent(id) + '/agent-run-status',
      ).catch(() => ({ data: null }));
      if (sequence !== caseLoadSequence.current) return;

      const state = runState.data;
      if (state?.status === 'running') {
        setResearchStatus('RUNNING · ' + (state.detail || 'Investigation continues in the background.'));
      } else if (state?.status === 'interrupted') {
        setResearchStatus('RUN INTERRUPTED · ' + (state.detail || 'Start a new run to continue.'));
      } else if (state?.status === 'failed') {
        setResearchStatus('RUN FAILED · ' + (state.detail || 'Review the run and try again.'));
      } else {
        setResearchStatus('');
      }

      const latest = (overview.aiReviewHistory || []).slice(-1)[0];
      if (latest?.provider) {
        setAiProviderStatus(String(latest.provider) + ' · successful review');
      }
      setAiReview(latest ? {
        ...latest.result,
        generatedAt: latest.generatedAt,
        model: latest.model,
        provider: latest.provider,
        evidenceCount: latest.evidenceCount,
        limitations: [
          'This is a saved AI-generated review, not an independently verified finding.',
          'Review the original source records; the model did not independently browse or verify linked pages.',
        ],
      } : null);
    } catch (error) {
      if (sequence !== caseLoadSequence.current) return;
      const cached = await readLocalSnapshot<CachedOverview>('investigation:' + id).catch(() => null);
      if (sequence !== caseLoadSequence.current) return;
      if (cached?.value) {
        setEvidence(cached.value.evidence || []);
        setEntities(cached.value.entities || []);
        setRelationships(cached.value.relationships || []);
        const latest = (cached.value.aiReviewHistory || []).slice(-1)[0];
        setAiReview(latest ? {
          ...latest.result,
          generatedAt: latest.generatedAt,
          model: latest.model,
          provider: latest.provider,
          evidenceCount: latest.evidenceCount,
          limitations: [
            'Offline copy saved on this device; it may be out of date.',
            'This is a saved AI-generated review, not an independently verified finding.',
            'Live searches, updates, and server synchronization require internet access.',
          ],
        } : null);
        setCaseLoadError('Offline copy · saved ' + new Date(cached.savedAt).toLocaleString() + '. Changes are not synchronized.');
      } else {
        setEvidence([]);
        setEntities([]);
        setRelationships([]);
        setCaseLoadError(error instanceof Error ? error.message : 'Unable to load this collection.');
      }
    } finally {
      if (sequence === caseLoadSequence.current) setLoadingCaseId('');
    }
  }, []);

  return {
    cases, setCases, caseId, setCaseId, evidence, setEvidence, entities, setEntities,
    relationships, setRelationships, apiStatus, setApiStatus, aiProviderStatus,
    setAiProviderStatus, loadingCaseId, setLoadingCaseId, caseLoadError,
    setCaseLoadError, agentRun, setAgentRun, agentRunHistory, setAgentRunHistory,
    researchStatus, setResearchStatus, aiReview, setAiReview, active, loadCases,
    selectCollection, loadCaseData,
  };
}
