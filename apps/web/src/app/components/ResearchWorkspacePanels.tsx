import { useWorkspaceContext } from '../WorkspaceContext';
import SearchHeroPanel from './SearchHeroPanel';
import AgentRunSummaryPanel from './AgentRunSummaryPanel';
import SearchResultsPanel from './SearchResultsPanel';
import Graph from '../../features/graph/Graph';
import { API } from '../../lib/api';
import { getRecordId as key } from '../../lib/ids';
import { Activity, ArrowUpRight, Bell, Check, Database, ExternalLink, Fingerprint, Globe2, Layers3, Plus, Search, ShieldCheck, Waypoints, Network, RefreshCw, Radar, Trash2 } from 'lucide-react';

/** Search, source discovery, and autonomous research panels. */
export default function ResearchWorkspacePanels() {
 const { tab, setToolPopupSelector, question, query, setQuery, searchMode, setSearchMode, searchResults, searchPlan, searchMeta, searching, researching, visualFile, setVisualFile, visualPreview, setVisualPreview, visualBusy, setError, cases, caseId, evidence, entities, relationships, agentRun, agentRunHistory, active, providerCatalog, visualInputRef, deleteAllWorkspaceData, runVisualSearch, runFullIntelligence, saveResult, watchSearchResult, timeline } = useWorkspaceContext();
 return <>
<SearchHeroPanel /><AgentRunSummaryPanel /><SearchResultsPanel />
 </>;
}
