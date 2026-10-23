interface CaseResearchDependencies {
  discoverCase: (id: string) => Promise<any>;
  loadCaseData: (id: string) => Promise<void>;
  notify: (message: string) => void;
  refreshIntelligenceSuite: (id: string) => Promise<any>;
  setAgentRun: (value: any) => void;
  setError: (message: string) => void;
  setResearching: (value: boolean) => void;
  setResearchStatus: (value: string) => void;
}

export function createCaseResearchAction(deps: CaseResearchDependencies) {
  const {
    discoverCase, loadCaseData, notify, refreshIntelligenceSuite,
    setAgentRun, setError, setResearching, setResearchStatus,
  } = deps;

  return async (id: string, quiet = false): Promise<any> => {if(!id){setError('Select a case before researching it.');return;}setResearching(true);setResearchStatus('Researching your question and following useful links…');setError('');try{const d=await discoverCase(id);setAgentRun(d.data);await loadCaseData(id);const suite=await refreshIntelligenceSuite(id);setResearchStatus('');if(!quiet)notify('Research and source review complete: '+d.data.rounds+' research passes, '+d.data.queries.length+' queries, '+d.data.savedCount+' new sources, '+d.data.scrapedCount+' pages retrieved, '+d.data.leads.length+' follow-up leads. Claims, source overlap and research gaps '+(suite.claims&&suite.crossSource&&suite.gaps?'refreshed':'partially refreshed')+(suite.aiReview?'; AI review generated.':'.')+' Findings remain subject to source verification.');return d.data;}catch(e){const message=e instanceof Error?e.message:'Autonomous investigation failed.';if(/cancelled by the user/i.test(message)){setResearchStatus('RUN CANCELLED · Saved source records were preserved.');if(!quiet)notify('Investigation cancelled. Saved source records were preserved.');}else{setResearchStatus('');if(!quiet)setError(message);}return null;}finally{setResearching(false);}};
}
