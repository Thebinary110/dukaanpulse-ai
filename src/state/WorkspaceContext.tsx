import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getDemoData } from '../data/demoData';
import { defaultDecisionSettings } from '../domain/decision';
import { DEFAULT_ASSUMPTIONS } from '../domain/interventions';
import { restoreWorkspace, STORAGE_KEY, type ExplorerState, type Workspace } from './persistence';
import { initialScenario, transition, type ScenarioEvent, type ScenarioState, type TransitionResult } from './scenario';

interface WorkspaceValue {
  scenario: ScenarioState;
  explorer: ExplorerState;
  /** Applies an event through the state machine and reports whether it was accepted. */
  dispatch: (event: ScenarioEvent) => TransitionResult;
  updateExplorer: (patch: Partial<ExplorerState>) => void;
  resetExplorer: () => void;
  /** Moves a newly detected opportunity into review; does nothing in any other state. */
  beginReview: () => void;
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

export function currentOpportunityId(): string {
  const { opportunity } = getDemoData();
  return opportunity.status === 'found' ? opportunity.opportunity.id : 'no-opportunity';
}

function freshExplorer(): ExplorerState {
  return { settings: defaultDecisionSettings(DEFAULT_ASSUMPTIONS), objective: 'profit', selectedId: null };
}

function load(): Workspace {
  const opportunityId = currentOpportunityId();
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage can be unavailable (private mode, blocked); start fresh.
  }
  return (
    restoreWorkspace(raw, opportunityId, freshExplorer().settings) ?? { scenario: initialScenario(opportunityId), explorer: freshExplorer() }
  );
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspace, setWorkspace] = useState<Workspace>(load);
  const ref = useRef(workspace);
  ref.current = workspace;

  useEffect(() => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
    } catch {
      // Non-essential: the session still works in memory.
    }
  }, [workspace]);

  const dispatch = useCallback((event: ScenarioEvent): TransitionResult => {
    const result = transition(ref.current.scenario, event);
    const next: Workspace = result.ok
      ? { ...ref.current, scenario: result.state }
      : { ...ref.current, scenario: { ...ref.current.scenario, lastError: result.error } };
    ref.current = next;
    setWorkspace(next);
    return result;
  }, []);

  const updateExplorer = useCallback((patch: Partial<ExplorerState>) => {
    const next = { ...ref.current, explorer: { ...ref.current.explorer, ...patch } };
    ref.current = next;
    setWorkspace(next);
  }, []);

  const resetExplorer = useCallback(() => updateExplorer(freshExplorer()), [updateExplorer]);

  const beginReview = useCallback(() => {
    if (ref.current.scenario.status === 'detected') dispatch({ type: 'REVIEW' });
  }, [dispatch]);

  const value = useMemo(
    () => ({ scenario: workspace.scenario, explorer: workspace.explorer, dispatch, updateExplorer, resetExplorer, beginReview }),
    [workspace, dispatch, updateExplorer, resetExplorer, beginReview],
  );
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceValue {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('useWorkspace must be used inside WorkspaceProvider');
  return value;
}
