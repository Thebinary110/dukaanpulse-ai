import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getDemoData } from '../data/demoData';
import { defaultDecisionSettings } from '../domain/decision';
import { DEFAULT_ASSUMPTIONS } from '../domain/interventions';
import { averageBasketOf, basketByCustomer } from '../domain/campaign';
import { buildLearningRecord, type LearningRecord } from '../domain/results';
import { appendRecord, HISTORY_KEY, restoreHistory } from './history';
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
  /** Clears this demo's saved state (and only it) and starts again from a fresh opportunity. */
  restartDemo: () => void;
  /** Set when saved state existed but could not be used. */
  storageNotice: string | null;
  /** Completed simulated runs in this browser session, newest first. Survives restarting the demo. */
  history: LearningRecord[];
  clearHistory: () => void;
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

export function currentOpportunityId(): string {
  const { opportunity } = getDemoData();
  return opportunity.status === 'found' ? opportunity.opportunity.id : 'no-opportunity';
}

/** Freezes a measured scenario into a learning record; null when it is not a complete, approved run. */
function recordFor(scenario: ScenarioState, completedAt: string): LearningRecord | null {
  const { opportunity } = getDemoData();
  if (scenario.status !== 'measured' || !scenario.draft || !scenario.outcome || !scenario.approval || opportunity.status !== 'found') return null;
  const baskets = basketByCustomer(opportunity.opportunity.cohort);
  return buildLearningRecord({
    draft: scenario.draft,
    outcome: scenario.outcome,
    approval: scenario.approval,
    completedAt,
    averageBasketPaise: averageBasketOf(baskets, scenario.draft.treatmentIds),
    basketByCustomer: baskets,
  });
}

function loadHistory(): LearningRecord[] {
  try {
    return restoreHistory(window.sessionStorage.getItem(HISTORY_KEY));
  } catch {
    return [];
  }
}

function freshExplorer(): ExplorerState {
  return { settings: defaultDecisionSettings(DEFAULT_ASSUMPTIONS), objective: 'profit', selectedId: null };
}

function fresh(): Workspace {
  return { scenario: initialScenario(currentOpportunityId()), explorer: freshExplorer() };
}

const INVALID_NOTICE = 'Saved demo progress could not be restored, so the demo started fresh.';

function load(): { workspace: Workspace; notice: string | null } {
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage can be unavailable (private mode, blocked); start fresh.
  }
  const restored = restoreWorkspace(raw, currentOpportunityId(), freshExplorer().settings);
  if (restored) return { workspace: restored, notice: null };
  return { workspace: fresh(), notice: raw ? INVALID_NOTICE : null };
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(load);
  const [workspace, setWorkspace] = useState<Workspace>(initial.workspace);
  const [storageNotice, setStorageNotice] = useState<string | null>(initial.notice);
  const ref = useRef(workspace);
  ref.current = workspace;
  const [history, setHistory] = useState<LearningRecord[]>(() => {
    const saved = loadHistory();
    // A run completed before history existed (or whose record was lost) is recorded once on load.
    const pending = recordFor(initial.workspace.scenario, initial.workspace.scenario.executionStartedAt ?? new Date().toISOString());
    return pending ? appendRecord(saved, pending) : saved;
  });

  useEffect(() => {
    try {
      if (history.length === 0) window.sessionStorage.removeItem(HISTORY_KEY);
      else window.sessionStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch {
      // Non-essential.
    }
  }, [history]);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
    } catch {
      // Non-essential: the session still works in memory.
    }
  }, [workspace]);

  const dispatch = useCallback((event: ScenarioEvent): TransitionResult => {
    const result = transition(ref.current.scenario, event);
    if (result.ok && event.type === 'COMPLETE') {
      const record = recordFor(result.state, new Date().toISOString());
      if (record) setHistory((h) => appendRecord(h, record));
    }
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

  const restartDemo = useCallback(() => {
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore: the in-memory reset below is what matters.
    }
    const next = fresh();
    ref.current = next;
    setWorkspace(next);
    setStorageNotice(null);
  }, []);

  const clearHistory = useCallback(() => {
    try {
      window.sessionStorage.removeItem(HISTORY_KEY);
    } catch {
      // Ignore.
    }
    setHistory([]);
  }, []);

  const value = useMemo(
    () => ({
      scenario: workspace.scenario,
      explorer: workspace.explorer,
      dispatch,
      updateExplorer,
      resetExplorer,
      beginReview,
      restartDemo,
      storageNotice,
      history,
      clearHistory,
    }),
    [workspace, dispatch, updateExplorer, resetExplorer, beginReview, restartDemo, storageNotice, history, clearHistory],
  );
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceValue {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('useWorkspace must be used inside WorkspaceProvider');
  return value;
}
