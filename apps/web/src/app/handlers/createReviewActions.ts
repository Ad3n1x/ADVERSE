import type { Dispatch, SetStateAction } from 'react';
import { request } from '../../lib/api';

interface ReviewActionDependencies {
  caseId: string;
  notify: (message: string) => void;
  setAiProviderStatus: Dispatch<SetStateAction<string>>;
  setAiReview: Dispatch<SetStateAction<any>>;
  setAiReviewLoading: Dispatch<SetStateAction<boolean>>;
  setClaimMap: Dispatch<SetStateAction<any>>;
  setClaimMapLoading: Dispatch<SetStateAction<boolean>>;
  setCrossReview: Dispatch<SetStateAction<any>>;
  setCrossReviewLoading: Dispatch<SetStateAction<boolean>>;
  setError: (message: string) => void;
  setResearchGaps: Dispatch<SetStateAction<any>>;
  setResearchGapsLoading: Dispatch<SetStateAction<boolean>>;
}

export function createReviewActions(deps: ReviewActionDependencies) {
  const {
    caseId, notify, setAiProviderStatus, setAiReview, setAiReviewLoading,
    setClaimMap, setClaimMapLoading, setCrossReview, setCrossReviewLoading,
    setError, setResearchGaps, setResearchGapsLoading,
  } = deps;

  const runAiReview = async () => {if(!caseId){setError('Choose a collection before requesting AI review.');return;}setAiReviewLoading(true);setError('');try{const d=await request<{data:any}>('/investigations/'+encodeURIComponent(caseId)+'/ai-review',{method:'POST',body:JSON.stringify({})});setAiReview(d.data);setAiProviderStatus(String(d.data.provider||'AI service')+' · successful review');notify('AI review generated successfully. Verify each finding against the original sources.');}catch(e){setError(e instanceof Error?e.message:'AI review failed. Configure an AI service on the server if this feature is unavailable.');}finally{setAiReviewLoading(false);}};
  const runCrossReview = async () => {if(!caseId){setError('Choose a collection before reviewing sources.');return;}setCrossReviewLoading(true);setError('');try{const d=await request<{data:any}>('/investigations/'+encodeURIComponent(caseId)+'/cross-source-review');setCrossReview(d.data);notify('Source history and text similarity check completed. It does not decide whether claims are true.');}catch(e){setError(e instanceof Error?e.message:'Compare sources failed.');}finally{setCrossReviewLoading(false);}};
  const runClaimMap = async () => {if(!caseId){setError('Choose a collection before analyzing claims.');return;}setClaimMapLoading(true);setError('');try{const d=await request<{data:any}>('/investigations/'+encodeURIComponent(caseId)+'/claim-map');setClaimMap(d.data);notify('Information comparison is ready. Check the original links before drawing conclusions.');}catch(e){setError(e instanceof Error?e.message:'Compare information failed.');}finally{setClaimMapLoading(false);}};
  const runResearchGaps = async () => {if(!caseId){setError('Choose a collection before analyzing research gaps.');return;}setResearchGapsLoading(true);setError('');try{const d=await request<{data:any}>('/investigations/'+encodeURIComponent(caseId)+'/research-gaps');setResearchGaps(d.data);notify('Research gaps reviewed. Suggestions are estimates, not a final answer.');}catch(e){setError(e instanceof Error?e.message:'Research-gap analysis failed.');}finally{setResearchGapsLoading(false);}};

  return { runAiReview, runCrossReview, runClaimMap, runResearchGaps };
}
