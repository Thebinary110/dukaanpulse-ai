/** Small label saying what kind of number sits next to it. */
export type Provenance = 'observed' | 'estimate' | 'assumed' | 'simulated';

const STYLE: Record<Provenance, string> = {
  observed: 'border-accent/40 text-accent',
  estimate: 'border-border-strong text-muted',
  assumed: 'border-warning/40 text-warning',
  simulated: 'border-simulated/40 text-simulated',
};

const LABEL: Record<Provenance, string> = { observed: 'Observed', estimate: 'Estimate', assumed: 'Assumed', simulated: 'Simulated' };

export function Tag({ kind }: { kind: Provenance }) {
  return <span className={`inline-flex rounded-full border px-1.5 py-px text-[10px] font-semibold tracking-wider uppercase ${STYLE[kind]}`}>{LABEL[kind]}</span>;
}
