import { Check, FlaskConical, LoaderCircle, SkipForward } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { simulationFrame, simulationFrameCount, type SimulationPhase } from '../../domain/campaign';
import { formatCount } from '../../domain/format';
import type { SimulatedOutcome } from '../../domain/types';

const FRAME_MS = 320;

const STEPS: { phase: SimulationPhase; label: string }[] = [
  { phase: 'queued', label: 'Simulation queued' },
  { phase: 'delivered', label: 'Simulated delivery' },
  { phase: 'visits', label: 'Simulated customer visits' },
  { phase: 'redemptions', label: 'Simulated redemptions' },
  { phase: 'ready', label: 'Ready to inspect results' },
];

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function SimulationPanel({
  outcome,
  windowDays,
  recipients,
  running,
  onComplete,
}: {
  outcome: SimulatedOutcome;
  windowDays: number;
  recipients: number;
  /** True while the scenario is executing; false once measured. */
  running: boolean;
  onComplete: () => void;
}) {
  const last = simulationFrameCount(windowDays) - 1;
  const [frame, setFrame] = useState(() => (running && !prefersReducedMotion() ? 0 : last));
  const completed = useRef(false);

  useEffect(() => {
    if (frame >= last) return;
    const t = window.setTimeout(() => setFrame((f) => Math.min(last, f + 1)), FRAME_MS);
    return () => window.clearTimeout(t);
  }, [frame, last]);

  useEffect(() => {
    if (frame >= last && running && !completed.current) {
      completed.current = true;
      onComplete();
    }
  }, [frame, last, running, onComplete]);

  const view = simulationFrame(outcome, windowDays, frame);
  const current = STEPS.findIndex((s) => s.phase === view.phase);

  const detail: Record<SimulationPhase, string> = {
    queued: `${formatCount(recipients)} offers prepared from the approved configuration`,
    delivered: `${formatCount(recipients)} messages marked delivered. Nothing was actually sent`,
    visits:
      view.phase === 'visits' || current > 2
        ? `Day ${view.day} of ${windowDays}: ${formatCount(view.returnsSoFar)} of ${formatCount(recipients)} came back`
        : `Over ${windowDays} simulated days`,
    redemptions: view.redemptions === null ? 'Counted once the window closes' : `${formatCount(view.redemptions)} used the offer`,
    ready: 'Compared against the held-back group',
  };

  return (
    <section aria-labelledby="simulation-title" className="rounded-2xl border border-simulated/40 bg-surface p-5 sm:p-6" data-testid="simulation-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-simulated uppercase">
            <FlaskConical className="size-3.5" aria-hidden="true" />
            Simulated
          </p>
          <h2 id="simulation-title" className="mt-1 text-base font-semibold text-text">
            Simulated campaign run
          </h2>
        </div>
        {!view.complete && (
          <button
            type="button"
            onClick={() => setFrame(last)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-1.5 text-xs font-medium text-text hover:bg-surface-hover"
          >
            <SkipForward className="size-3.5" aria-hidden="true" />
            Skip to the end
          </button>
        )}
      </div>

      <ol className="mt-5 space-y-3" aria-live="polite" data-testid="simulation-steps">
        {STEPS.map((s, i) => {
          const state = i < current || view.complete ? 'done' : i === current ? 'current' : 'pending';
          return (
            <li key={s.phase} className="flex gap-3" data-state={state}>
              <span
                className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border ${
                  state === 'done' ? 'border-simulated bg-simulated-soft text-simulated' : state === 'current' ? 'border-simulated text-simulated' : 'border-border-strong text-muted'
                }`}
                aria-hidden="true"
              >
                {state === 'done' ? <Check className="size-3.5" /> : state === 'current' ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`text-sm ${state === 'pending' ? 'text-muted' : 'font-medium text-text'}`}>{s.label}</p>
                {state !== 'pending' && <p className="text-xs text-muted tabular">{detail[s.phase]}</p>}
                {s.phase === 'visits' && state !== 'pending' && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-raised" aria-hidden="true">
                    <div className="h-full rounded-full bg-simulated transition-[width] duration-300" style={{ width: `${(view.returnsSoFar / Math.max(1, recipients)) * 100}%` }} />
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
