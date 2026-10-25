import { Bot, Cpu, RotateCcw, Send, Square, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import type { ToolContext } from '../agents/tools/registry';
import type { ActionProposal } from '../agents/types';
import { ActivityTimeline, AgentStrip } from '../components/ask/Activity';
import { AnswerView, type ActionState } from '../components/ask/AnswerView';
import { useAskSession, type EngineChoice, type Turn } from '../components/ask/useAskSession';
import { getDemoData } from '../data/demoData';
import { useWorkspace } from '../state/WorkspaceContext';

const STARTERS = [
  'Why did revenue decline?',
  'Why are morning sales down?',
  'Should I give everyone a discount?',
  'What happened in the last simulated campaign?',
];

const ENGINE_LABEL: Record<EngineChoice, string> = { auto: 'Auto', llm: 'Local model', deterministic: 'Rules only' };

export function Ask() {
  const { dataset, opportunity } = getDemoData();
  const workspace = useWorkspace();
  const navigate = useNavigate();
  const latest = useRef(workspace);
  latest.current = workspace;

  const toolContext = useCallback(
    (): ToolContext => ({
      dataset,
      opportunity,
      settings: latest.current.explorer.settings,
      objective: latest.current.explorer.objective,
      scenario: latest.current.scenario,
      history: latest.current.history,
    }),
    [dataset, opportunity],
  );
  const [params] = useSearchParams();
  // /ask?engine=rules opens straight into rules-only mode (the demo fallback).
  const requested = params.get('engine');
  const session = useAskSession(toolContext, requested === 'rules' ? 'deterministic' : requested === 'model' ? 'llm' : 'auto');
  const [input, setInput] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const selectedTurn: Turn | undefined = session.turns.find((t) => t.id === selected) ?? session.turns.at(-1);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [session.turns.length]);

  const submit = (q: string) => {
    if (!q.trim() || session.running) return;
    setInput('');
    setSelected(null);
    setActionMessage(null);
    void session.ask(q);
  };
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit(input);
  };

  const status = workspace.scenario.status;
  const actionFor = (proposal: ActionProposal): ActionState => {
    const blockedReason =
      proposal.problems.length > 0
        ? 'This proposal does not pass the draft checks yet.'
        : status === 'awaiting_approval' || status === 'approved' || status === 'executing'
          ? 'A campaign is already awaiting approval or running. Finish it in Campaign Studio first.'
          : null;
    return {
      blockedReason,
      onCreate: () => {
        const d = workspace.dispatch;
        if (status === 'measured') d({ type: 'RESET' });
        if (status === 'measured' || status === 'detected') d({ type: 'REVIEW' });
        const r = status === 'drafting' ? d({ type: 'UPDATE_DRAFT', draft: proposal.draft }) : d({ type: 'START_DRAFT', draft: proposal.draft });
        if (!r.ok) {
          setActionMessage(r.error);
          return;
        }
        const id = proposal.draft.interventionId;
        const s = workspace.explorer.settings;
        workspace.updateExplorer({
          selectedId: id,
          settings: { ...s, options: { ...s.options, [id]: { ...s.options[id]!, valuePaise: proposal.draft.offer.valuePaise, minSpendPaise: proposal.draft.offer.minSpendPaise, costPerRedemptionPaise: proposal.draft.offer.costPerRedemptionPaise } } },
        });
        navigate('/campaigns');
      },
    };
  };

  const modelLine =
    session.model === null
      ? 'Checking for the local model…'
      : session.model.available
        ? `Local model available: ${session.model.model} via Ollama on this machine`
        : `Local model unavailable${session.model.reason ? `: ${session.model.reason}` : ''}`;
  const usingModel = session.engine === 'llm' || (session.engine === 'auto' && session.model?.available === true);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wider text-accent uppercase">
            <Bot className="size-3.5" aria-hidden="true" />
            Multi-agent assistant
          </p>
          <h1 className="mt-1 text-[28px] leading-tight font-semibold tracking-tight text-text sm:text-[32px]">Ask DukaanPulse</h1>
          <p className="mt-1.5 text-[15px] leading-relaxed text-muted">
            Specialist agents investigate your question with the same tested calculations as the rest of the app. Every number comes from a tool, and
            a reviewer checks each claim before you see it.
          </p>
        </div>
        <div className="flex flex-col items-start gap-1.5 md:items-end">
          <fieldset className="inline-flex rounded-lg border border-border bg-surface p-0.5">
            <legend className="sr-only">Engine</legend>
            {(Object.keys(ENGINE_LABEL) as EngineChoice[]).map((e) => (
              <label
                key={e}
                className="cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap text-muted transition-colors hover:text-text has-checked:bg-surface-raised has-checked:text-text has-focus-visible:outline-2 has-focus-visible:outline-focus"
              >
                <input type="radio" name="engine" className="sr-only" checked={session.engine === e} onChange={() => session.setEngine(e)} disabled={session.running} />
                {ENGINE_LABEL[e]}
              </label>
            ))}
          </fieldset>
          <p className="flex items-center gap-1.5 text-xs text-muted" data-testid="model-status">
            <Cpu className={`size-3.5 ${session.model?.available ? 'text-success' : 'text-muted'}`} aria-hidden="true" />
            {modelLine}
            {session.model && !session.model.available && (
              <button type="button" onClick={() => void session.refreshModel()} className="ml-1 text-accent hover:text-accent-hover">
                Check again
              </button>
            )}
          </p>
          <p className="text-xs text-muted" data-testid="engine-line">
            Next question uses: <span className="text-text">{usingModel ? 'local model (with rule-based fallback per agent)' : 'rule-based engine (no model)'}</span>
          </p>
        </div>
      </header>

      {session.engine === 'llm' && session.model && !session.model.available && (
        <p className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning-soft px-4 py-3 text-sm text-text" data-testid="model-unavailable">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          The local model is not available, so questions will be answered by the rule-based engine, which uses the same tools and checks.
        </p>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section aria-label="Conversation" className="flex min-w-0 flex-col gap-4">
          {session.turns.length === 0 && (
            <div className="rounded-2xl border border-border bg-surface p-6" data-testid="ask-empty">
              <h2 className="text-base font-semibold text-text">Ask about your shop</h2>
              <p className="mt-1 text-sm text-muted">Questions DukaanPulse can investigate from Sunrise Bakery’s synthetic payments:</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {STARTERS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => submit(q)}
                    className="rounded-full border border-border-strong bg-surface-raised px-3 py-1.5 text-sm text-text transition-colors hover:border-accent/60"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {session.turns.map((t) => (
            <article key={t.id} className="flex flex-col gap-3" data-testid="turn">
              <p className="max-w-[85%] self-end rounded-2xl rounded-br-sm bg-accent-soft px-4 py-2.5 text-sm text-text" data-testid="turn-question">
                {t.question}
              </p>
              <div className={`rounded-2xl border bg-surface p-5 ${t.id === selectedTurn?.id ? 'border-border-strong' : 'border-border'}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <AgentStrip events={t.events} running={t.status === 'running'} />
                  <span className="text-[11px] text-muted" data-testid="turn-engine">
                    {t.engineLabel}
                    {t.result ? ` · ${(t.result.usage.elapsedMs / 1000).toFixed(1)}s · ${t.result.usage.toolCalls} tool calls${t.result.usage.modelCalls ? ` · ${t.result.usage.modelCalls} model calls` : ''}` : ''}
                  </span>
                </div>
                <div className="mt-4">
                  {t.status === 'running' && (
                    <div className="space-y-3" aria-live="polite">
                      <ActivityTimeline events={t.events} />
                      <button type="button" onClick={session.stop} className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-1.5 text-xs font-medium text-text hover:bg-surface-hover">
                        <Square className="size-3" aria-hidden="true" />
                        Stop
                      </button>
                    </div>
                  )}
                  {t.status === 'error' && (
                    <div className="space-y-2" role="alert" data-testid="turn-error">
                      <p className="text-sm text-danger">Something went wrong: {t.error}</p>
                      <button type="button" onClick={() => session.retry(t)} className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-1.5 text-xs font-medium text-text hover:bg-surface-hover">
                        <RotateCcw className="size-3" aria-hidden="true" />
                        Retry
                      </button>
                    </div>
                  )}
                  {t.status === 'done' && t.result && (
                    <>
                      {t.result.status === 'partial' && (
                        <p className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-xs text-text" data-testid="partial-note">
                          The investigation did not finish (stopped, timed out or out of budget). This is what was found so far.
                          <button type="button" onClick={() => session.retry(t)} className="shrink-0 font-medium text-accent hover:text-accent-hover">
                            Retry
                          </button>
                        </p>
                      )}
                      <AnswerView result={t.result} action={t.result.action ? actionFor(t.result.action) : null} onFollowUp={submit} disabled={session.running} />
                      <button
                        type="button"
                        onClick={() => setSelected(t.id)}
                        className="mt-3 text-xs text-muted hover:text-text xl:inline-block"
                        aria-pressed={t.id === selectedTurn?.id}
                      >
                        {t.id === selectedTurn?.id ? 'Showing this investigation' : 'Show this investigation'}
                      </button>
                      <details className="mt-2 xl:hidden">
                        <summary className="cursor-pointer text-xs text-muted hover:text-text">Investigation steps</summary>
                        <div className="mt-3">
                          <ActivityTimeline events={t.events} />
                        </div>
                      </details>
                    </>
                  )}
                </div>
              </div>
            </article>
          ))}
          {actionMessage && (
            <p role="alert" className="rounded-lg border border-danger/50 bg-danger-soft px-3 py-2 text-sm text-text">
              {actionMessage}
            </p>
          )}
          <div ref={endRef} />

          <form onSubmit={onSubmit} className="sticky bottom-4 z-10 flex items-end gap-2 rounded-2xl border border-border-strong bg-surface/95 p-2 shadow-xl shadow-black/30 backdrop-blur">
            <label htmlFor="ask-input" className="sr-only">
              Ask a question
            </label>
            <textarea
              id="ask-input"
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit(input);
                }
              }}
              maxLength={300}
              placeholder="Ask about sales, regular customers, offers or the last simulated campaign…"
              className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-3 py-2.5 text-sm text-text outline-none placeholder:text-muted"
            />
            {session.turns.length > 0 && (
              <button type="button" onClick={session.reset} disabled={session.running} className="h-10 rounded-xl px-3 text-xs font-medium text-muted hover:bg-surface-hover hover:text-text disabled:opacity-40">
                New chat
              </button>
            )}
            <button
              type="submit"
              disabled={session.running || input.trim().length === 0}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface-raised disabled:text-muted"
            >
              <Send className="size-4" aria-hidden="true" />
              Ask
            </button>
          </form>
        </section>

        <aside className="hidden min-w-0 rounded-2xl border border-border bg-surface p-5 xl:block" aria-label="Investigation" data-testid="investigation-panel">
          <h2 className="text-sm font-semibold text-text">Investigation</h2>
          <p className="mt-1 text-xs text-muted">Plans, tool calls and review for {selectedTurn ? 'the selected question' : 'your next question'}. Summaries only; no hidden reasoning is shown.</p>
          <div className="mt-4">{selectedTurn ? <ActivityTimeline events={selectedTurn.events} /> : <p className="text-xs text-muted">Nothing yet.</p>}</div>
        </aside>
      </div>
    </div>
  );
}
