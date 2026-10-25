import { Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';

/** Designed placeholder for a section that is not built yet. */
export function ComingNext({ title, points, children }: { title: string; points: string[]; children?: ReactNode }) {
  return (
    <section className="rounded-2xl border border-dashed border-border-strong bg-surface/50 p-6 sm:p-8">
      <div className="flex items-start gap-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
          <Sparkles className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wider text-accent uppercase">Coming in the next build</p>
          <h2 className="mt-1 text-lg font-semibold text-text">{title}</h2>
          <ul className="mt-3 grid gap-2 text-sm text-muted sm:grid-cols-2">
            {points.map((p) => (
              <li key={p} className="flex gap-2">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-border-strong" aria-hidden="true" />
                {p}
              </li>
            ))}
          </ul>
        </div>
      </div>
      {children && <div className="mt-6">{children}</div>}
    </section>
  );
}
