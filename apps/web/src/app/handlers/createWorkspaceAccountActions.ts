import { API, request } from '../../lib/api';
import { HISTORY_KEY, SAVED_KEY } from '../../lib/storageKeys';

/** Account deletion and collection export actions. */
export function createWorkspaceAccountActions(deps: Record<string, any>) {
 const { setError, setAuthState, setShowAuth, setAuthMode, setCases, setCaseId, setEvidence, setEntities, setRelationships, setUserEmail, setTab, notify, caseId, reportFormat } = deps;
 const deleteAccount=async()=>{if(!window.confirm('Permanently delete your ADVERSE account and its saved information? This cannot be undone.'))return;if(window.prompt('Type DELETE to confirm permanent account and data deletion.')!=='DELETE')return;try{await request('/auth/account',{method:'DELETE'});try{localStorage.removeItem(HISTORY_KEY);localStorage.removeItem(SAVED_KEY);for(let i=localStorage.length-1;i>=0;i--){const k=localStorage.key(i);if(k?.startsWith('adverse-graph-layout:'))localStorage.removeItem(k);}}catch{}setAuthState('anonymous');setShowAuth(true);setAuthMode('login');setCases([]);setCaseId('');setEvidence([]);setEntities([]);setRelationships([]);setUserEmail('');setTab('Intelligence Desk');notify('Account and associated server-side records deleted.');}catch(e){setError(e instanceof Error?e.message:'Could not delete account.');}};
  const downloadReport=async()=>{if(!caseId){setError('Choose a collection to export.');return;}window.open(API+'/investigations/'+encodeURIComponent(caseId)+'/export?format='+reportFormat,'_blank','noopener,noreferrer');};
 return { deleteAccount, downloadReport };
}
