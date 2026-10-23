import { createContext, useContext } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Capture, Entity, Evidence, Investigation, Relationship, SearchResult, Tab, ToastItem } from '../types/research';

/** Navigation groups are kept typed so extracted views retain contextual typing. */
type WorkspaceNavGroup = { label: string; items: Tab[]; icons: any[] };

/**
 * Shared state/actions for the extracted workspace features.
 * The index signature accommodates the large set of transient UI controls; core
 * collection and list fields stay strongly typed to preserve map/setter inference.
 */
export type WorkspaceContextValue = Record<string, any> & {
  nav: WorkspaceNavGroup[];
  tabLabels: Record<Tab, string>;
  titleFor: (tab: Tab) => string;
  tab: Tab;
  setTab: Dispatch<SetStateAction<Tab>>;
  cases: Investigation[];
  setCases: Dispatch<SetStateAction<Investigation[]>>;
  caseId: string;
  setCaseId: Dispatch<SetStateAction<string>>;
  active?: Investigation;
  evidence: Evidence[];
  setEvidence: Dispatch<SetStateAction<Evidence[]>>;
  entities: Entity[];
  setEntities: Dispatch<SetStateAction<Entity[]>>;
  relationships: Relationship[];
  setRelationships: Dispatch<SetStateAction<Relationship[]>>;
  searchMode: 'web' | 'images' | 'videos' | 'people';
  setSearchMode: Dispatch<SetStateAction<'web' | 'images' | 'videos' | 'people'>>;
  searchResults: SearchResult[];
  setSearchResults: Dispatch<SetStateAction<SearchResult[]>>;
  searchPlan: { query: string; reason: string }[];
  setSearchPlan: Dispatch<SetStateAction<{ query: string; reason: string }[]>>;
  captures: Capture[];
  setCaptures: Dispatch<SetStateAction<Capture[]>>;
  diffData: { added: string[]; removed: string[]; method: string; limitation: string } | null;
  setDiffData: Dispatch<SetStateAction<{ added: string[]; removed: string[]; method: string; limitation: string } | null>>;
  orgResults: any[];
  setOrgResults: Dispatch<SetStateAction<any[]>>;
  providerCatalog: any[];
  providerKeysDraft: Record<string, string>;
  setProviderKeysDraft: Dispatch<SetStateAction<Record<string, string>>>;
  providerKeysConfigured: string[];
  providerKeysAvailable: string[];
  aiKeysDraft: Record<string, string>;
  setAiKeysDraft: Dispatch<SetStateAction<Record<string, string>>>;
  aiKeysConfigured: string[];
  aiKeysEnvironment: string[];
  toasts: ToastItem[];
  setToasts: Dispatch<SetStateAction<ToastItem[]>>;
  timeline: Evidence[];
  selectedEvidence?: Evidence;
  agentRunHistory: any[];
  selectedEntityId: string;
  setSelectedEntityId: Dispatch<SetStateAction<string>>;
};

export const WorkspaceContext = createContext<WorkspaceContextValue>({} as WorkspaceContextValue);

export function useWorkspaceContext(): WorkspaceContextValue {
  return useContext(WorkspaceContext);
}
