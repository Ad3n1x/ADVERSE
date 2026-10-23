import { createContext, useContext } from 'react';

/** Shared, per-render workspace state/actions for extracted workspace feature views. */
export type WorkspaceContextValue = Record<string, any>;
export const WorkspaceContext = createContext<WorkspaceContextValue>({});
export function useWorkspaceContext(): WorkspaceContextValue {
 return useContext(WorkspaceContext);
}
