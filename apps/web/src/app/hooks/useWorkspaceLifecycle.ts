import { useEffect, useMemo } from 'react';
import { request } from '../../lib/api';
import { getRecordId as key } from '../../lib/ids';
import type { Evidence, Tab } from '../../types/research';
import { Radar, Settings2 } from 'lucide-react';

/** Session, collection, provider, and transient-panel lifecycle effects. */
export function useWorkspaceLifecycle(deps: Record<string, any>) {
 const { setResetToken, setAuthMode, setShowAuth, setAuthMessage, setApiStatus, setUserEmail, setAccountRole, setAuthState, setAiProviderStatus, loadCases, caseId, loadCaseData, researching, setResearchStatus, setAgentRun, authState, tab, loadProviderCredentials, loadAiCredentials, toolPopupSelector, setToolPopupSelector, evidence, relEvidence } = deps;
  useEffect(()=>{const params=new URLSearchParams(window.location.search);const token=params.get('reset');if(token){setResetToken(token);setAuthMode('reset');setShowAuth(true);setAuthMessage('');}},[]);
  useEffect(()=>{request<any>('/health').then(()=>setApiStatus('online')).catch(()=>setApiStatus('offline'));request<{data:{email:string;role?:string}}>('/auth/me').then(d=>{setUserEmail(d.data.email);setAccountRole(d.data.role||'user');setAuthState('authenticated');request<{data:{configured:boolean;providers:string[]}}>('/ai/status').then(s=>setAiProviderStatus(s.data.configured?(s.data.providers.join(' + ')+' configured · end-to-end unverified'):'Not configured')).catch(()=>setAiProviderStatus('Unable to check configuration'));loadCases();}).catch(()=>setAuthState('anonymous'));},[loadCases]);
  useEffect(()=>{loadCaseData(caseId);},[caseId,loadCaseData]);
  useEffect(()=>{if(!researching||!caseId)return;let alive=true;const refresh=async()=>{try{const d=await request<{data:{status?:string;stage?:string;detail?:string;trace?:any[]}}>('/investigations/'+encodeURIComponent(caseId)+'/agent-run-status');if(!alive||d.data.status!=='running')return;setResearchStatus((d.data.stage?d.data.stage.toUpperCase()+' · ':'')+(d.data.detail||'Autonomous research is running…'));if(d.data.trace?.length)setAgentRun((old:any)=>old?({...old,trace:d.data.trace}):old);}catch{}};void refresh();const timer=window.setInterval(()=>void refresh(),1200);return()=>{alive=false;window.clearInterval(timer);};},[researching,caseId]);
  useEffect(()=>{if(authState!=='authenticated')return;const refreshRole=()=>{void request<{data:{role?:string}}>('/auth/me').then(d=>setAccountRole(d.data.role||'user')).catch(()=>setAccountRole('user'));};const timer=window.setInterval(refreshRole,15000);return()=>window.clearInterval(timer);},[authState]);
  useEffect(()=>{if(tab==='Settings'&&authState==='authenticated'){void loadProviderCredentials();void loadAiCredentials();}},[tab,authState]);
  useEffect(()=>{if(!toolPopupSelector)return;const node=document.querySelector(toolPopupSelector);const target=(node?.closest('.panel')||node) as HTMLElement|null;if(!target)return;target.classList.add('tool-popup-active');const onKeyDown=(event:KeyboardEvent)=>{if(event.key==='Escape')setToolPopupSelector('');};window.addEventListener('keydown',onKeyDown);return()=>{target.classList.remove('tool-popup-active');window.removeEventListener('keydown',onKeyDown);};},[toolPopupSelector]);
  const nav:{label:string;items:Tab[];icons:any[]}[]=[{label:'INTELLIDESK',items:['Intelligence Desk'],icons:[Radar]},{label:'PREFERENCES',items:['Settings'],icons:[Settings2]}];
  const tabLabels:Record<Tab,string>={'Intelligence Desk':'IntelliDesk',Settings:'Settings'};
  const titleFor=(t:Tab)=>tabLabels[t];
  const timeline=useMemo(()=>[...evidence].sort((a,b)=>new Date(a.publishedAt||a.captureTimestamp||a.retrievedAt||0).getTime()-new Date(b.publishedAt||b.captureTimestamp||b.retrievedAt||0).getTime()),[evidence]);
  const selectedEvidence=evidence.find((e: Evidence)=>key(e)===relEvidence);
 return { nav, tabLabels, titleFor, timeline, selectedEvidence };
}
