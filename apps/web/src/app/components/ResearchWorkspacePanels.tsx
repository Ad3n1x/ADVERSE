import SearchHeroPanel from './SearchHeroPanel';
import AgentRunSummaryPanel from './AgentRunSummaryPanel';
import SearchResultsPanel from './SearchResultsPanel';

/** Composes the search experience from focused feature panels. */
export default function ResearchWorkspacePanels() {
 return <>
  <SearchHeroPanel />
  <AgentRunSummaryPanel />
  <SearchResultsPanel />
 </>;
}
