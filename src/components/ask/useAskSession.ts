import { useCallback, useEffect, useRef, useState } from 'react';
import { emptyContext } from '../../agents/context';
import { fetchModelStatus, OllamaClient, type ModelStatus } from '../../agents/llm';
import { runQuestion } from '../../agents/orchestrator';
import type { ToolContext } from '../../agents/tools/registry';
import type { ConversationContext, RunResult, TraceEvent } from '../../agents/types';

export type EngineChoice = 'auto' | 'llm' | 'deterministic';

export interface Turn {
  id: number;
  question: string;
  status: 'running' | 'done' | 'error';
  events: TraceEvent[];
  result: RunResult | null;
  error: string | null;
  engineLabel: string;
}

export function useAskSession(toolContext: () => ToolContext, initialEngine: EngineChoice = 'auto') {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [engine, setEngine] = useState<EngineChoice>(initialEngine);
  const [model, setModel] = useState<ModelStatus | null>(null);
  const context = useRef<ConversationContext>(emptyContext());
  const controller = useRef<AbortController | null>(null);
  const seq = useRef(0);

  const refreshModel = useCallback(async () => {
    setModel(null);
    setModel(await fetchModelStatus(AbortSignal.timeout(5000)));
  }, []);

  useEffect(() => {
    void refreshModel();
    return () => controller.current?.abort();
  }, [refreshModel]);

  const running = turns.some((t) => t.status === 'running');

  const ask = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || controller.current) return;
      const useModel = engine === 'llm' || (engine === 'auto' && model?.available === true);
      const client = useModel && model?.model ? new OllamaClient(model.model) : null;
      const engineLabel = client ? `Local model · ${client.model}` : engine === 'llm' ? 'Rule-based engine (model unavailable)' : 'Rule-based engine';
      const id = ++seq.current;
      setTurns((ts) => [...ts, { id, question: q, status: 'running', events: [], result: null, error: null, engineLabel }]);
      const ctrl = new AbortController();
      controller.current = ctrl;
      try {
        const result = await runQuestion(q, context.current, toolContext(), {
          client,
          signal: ctrl.signal,
          onEvent: (e) => setTurns((ts) => ts.map((t) => (t.id === id ? { ...t, events: [...t.events, e] } : t))),
        });
        context.current = result.context;
        setTurns((ts) => ts.map((t) => (t.id === id ? { ...t, status: 'done', result } : t)));
      } catch (e) {
        setTurns((ts) => ts.map((t) => (t.id === id ? { ...t, status: 'error', error: e instanceof Error ? e.message : 'Something went wrong.' } : t)));
      } finally {
        controller.current = null;
      }
    },
    [engine, model, toolContext],
  );

  const stop = useCallback(() => controller.current?.abort(), []);

  const retry = useCallback(
    (turn: Turn) => {
      setTurns((ts) => ts.filter((t) => t.id !== turn.id));
      void ask(turn.question);
    },
    [ask],
  );

  const reset = useCallback(() => {
    controller.current?.abort();
    context.current = emptyContext();
    setTurns([]);
  }, []);

  return { turns, ask, stop, retry, reset, running, engine, setEngine, model, refreshModel };
}
