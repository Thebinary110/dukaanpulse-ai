import type { ReactNode } from 'react';

/** Section card with a small uppercase label that says what kind of information it holds. */
export function Card({
  id,
  label,
  labelTone = 'muted',
  title,
  aside,
  children,
  testId,
}: {
  id: string;
  label: string;
  labelTone?: 'muted' | 'accent' | 'warning' | 'simulated';
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  testId?: string;
}) {
  const tone = { muted: 'text-muted', accent: 'text-accent', warning: 'text-warning', simulated: 'text-simulated' }[labelTone];
  return (
    <section aria-labelledby={id} className="rounded-2xl border border-border bg-surface p-5 sm:p-6" data-testid={testId}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={`text-[11px] font-semibold tracking-wider uppercase ${tone}`}>{label}</p>
          <h2 id={id} className="mt-1 text-base font-semibold text-text">
            {title}
          </h2>
        </div>
        {aside}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}
