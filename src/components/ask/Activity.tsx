import { AlertTriangle, Check, CircleDashed, LoaderCircle, ShieldAlert, ShieldCheck, Wrench, X } from 'lucide-react';
import type { AgentId, TraceEvent } from '../../agents/types';
import { AGENT_NAME, TOOL_LABEL } from './labels';

type AgentState = 'idle' | 'running' | 'done' | 'fallback';

const ORDER: AgentId[] = ['orchestrator', 'business_analyst', 'customer_intelligence', 'growth_strategist', 'experiment_scientist', 'action_planner', 'risk_reviewer'];

export function agentStates(events: readonly TraceEvent[], running: boolean): Record<AgentId, AgentState> {
  const s = Object.fromEntries(ORDER.map((a) => [a, 'idle'])) as Record<AgentId, AgentState>;
  for (const e of events) {
    if (e.type === 'plan') s.orchestrator = 'done';
    if (e.type === 'agent_start') s[e.agent] = 'running';
    if (e.type === 'agent_done') s[e.agent] = e.fellBack ? 'fallback' : 'done';
    if (e.type === 'review') s.risk_reviewer = 'done';
  }
  if (running && s.orchestrator === 'idle') s.orchestrator = 'running';
  return s;
}

/** Which agents are involved and what state each is in. */
export function AgentStrip({ events, running }: { events: readonly TraceEvent[]; running: boolean }) {
  const states = agentStates(events, running);
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Agents" data-testid="agent-strip">
      {ORDER.map((a) => {
        const st = states[a];
        return (
          <li
            key={a}
            data-agent={a}
            data-state={st}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${
              st === 'idle' ? 'border-border text-muted/70' : st === 'running' ? 'border-accent/60 bg-accent-soft text-text' : st === 'fallback' ? 'border-warning/50 bg-warning-soft text-text' : 'border-success/40 text-text'
            }`}
          >
            {st === 'running' ? <LoaderCircle className="size-3 animate-spin" aria-hidden="true" /> : st === 'done' ? <Check className="size-3 text-success" aria-hidden="true" /> : st === 'fallback' ? <AlertTriangle className="size-3 text-warning" aria-hidden="true" /> : null}
            {AGENT_NAME[a]}
            <span className="sr-only">: {st === 'idle' ? 'not used' : st === 'fallback' ? 'done with rule-based fallback' : st}</span>
          </li>
        );
      })}
    </ul>
  );
}

const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

/** Summarised activity: the plan, tool calls with their summaries, and review. No private reasoning. */
export function ActivityTimeline({ events }: { events: readonly TraceEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted">
        <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
        Planning the investigation…
      </p>
    );
  }
  return (
    <ol className="space-y-2.5 text-xs" data-testid="activity-timeline">
      {events.map((e, i) => {
        const key = `${e.type}-${i}`;
        const at = <span className="ml-auto shrink-0 text-muted tabular">{secs(e.at)}</span>;
        switch (e.type) {
          case 'plan':
            return (
              <li key={key} className="flex gap-2">
                <CircleDashed className="mt-px size-3.5 shrink-0 text-accent" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="font-medium text-text">Plan</span> <span className="text-muted">({e.engine === 'llm' ? 'model' : 'rules'})</span>
                  <span className="block text-muted">
                    {e.plan.steps.length === 0 ? 'No specialists needed.' : e.plan.steps.map((s) => AGENT_NAME[s.agent]).join(' + ')}
                    {e.plan.steps.length > 1 ? ', in parallel' : ''}. {e.plan.rationale}
                  </span>
                </span>
                {at}
              </li>
            );
          case 'agent_start':
            return (
              <li key={key} className="flex gap-2">
                <LoaderCircle className="mt-px size-3.5 shrink-0 text-accent" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="font-medium text-text">{AGENT_NAME[e.agent]}</span> started{e.round > 1 ? ' (round two)' : ''}
                  <span className="block text-muted">{e.task}</span>
                </span>
                {at}
              </li>
            );
          case 'tool':
            return (
              <li key={key} className="flex gap-2" data-testid="activity-tool">
                {e.outcome.ok ? <Wrench className="mt-px size-3.5 shrink-0 text-muted" aria-hidden="true" /> : <X className="mt-px size-3.5 shrink-0 text-danger" aria-hidden="true" />}
                <span className="min-w-0">
                  <span className="text-text">{e.outcome.ok ? TOOL_LABEL[e.outcome.tool] : e.outcome.tool}</span> <span className="text-muted">· {AGENT_NAME[e.agent]}</span>
                  <span className={`block ${e.outcome.ok ? 'text-muted' : 'text-danger'}`}>{e.outcome.ok ? e.outcome.summary : `Refused: ${e.outcome.error}`}</span>
                </span>
                {at}
              </li>
            );
          case 'agent_done':
            return (
              <li key={key} className="flex gap-2">
                {e.fellBack ? <AlertTriangle className="mt-px size-3.5 shrink-0 text-warning" aria-hidden="true" /> : <Check className="mt-px size-3.5 shrink-0 text-success" aria-hidden="true" />}
                <span className="min-w-0 text-muted">
                  <span className="font-medium text-text">{AGENT_NAME[e.agent]}</span> finished with {e.findings} {e.findings === 1 ? 'finding' : 'findings'}
                  {e.fellBack ? ' (rule-based fallback)' : e.engine === 'llm' ? ' (model)' : ' (rules)'}
                </span>
                {at}
              </li>
            );
          case 'follow_up':
            return (
              <li key={key} className="flex gap-2">
                <CircleDashed className="mt-px size-3.5 shrink-0 text-accent" aria-hidden="true" />
                <span className="min-w-0 text-muted">
                  <span className="font-medium text-text">Orchestrator</span> asked for more evidence: {e.reason}
                </span>
                {at}
              </li>
            );
          case 'review':
            return (
              <li key={key} className="flex gap-2" data-testid="activity-review">
                {e.result.decision === 'pass' ? <ShieldCheck className="mt-px size-3.5 shrink-0 text-success" aria-hidden="true" /> : <ShieldAlert className="mt-px size-3.5 shrink-0 text-warning" aria-hidden="true" />}
                <span className="min-w-0 text-muted">
                  <span className="font-medium text-text">Risk Reviewer</span> {e.result.decision === 'pass' ? 'passed the answer' : `asked for revisions (${e.result.issues.filter((x) => x.severity === 'error').length} issues)`}
                  {e.attempt > 1 ? ' after revision' : ''}
                </span>
                {at}
              </li>
            );
          case 'notice':
            return (
              <li key={key} className="flex gap-2 text-warning">
                <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                <span className="min-w-0">{e.message}</span>
                {at}
              </li>
            );
        }
      })}
    </ol>
  );
}
