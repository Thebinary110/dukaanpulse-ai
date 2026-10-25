import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';
import type { ChangeDirection } from '../../domain/overview';

const STYLE: Record<ChangeDirection, { className: string; Icon: typeof ArrowUpRight; word: string }> = {
  up: { className: 'text-success', Icon: ArrowUpRight, word: 'Up' },
  down: { className: 'text-danger', Icon: ArrowDownRight, word: 'Down' },
  flat: { className: 'text-muted', Icon: ArrowRight, word: 'No meaningful change' },
  unknown: { className: 'text-muted', Icon: ArrowRight, word: 'No comparison' },
};

/** Direction is carried by icon and words as well as colour. Higher is treated as better. */
export function Delta({ direction, primary, secondary }: { direction: ChangeDirection; primary: string; secondary?: string }) {
  const { className, Icon, word } = STYLE[direction];
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 text-sm">
      <span className={`inline-flex items-center gap-0.5 font-medium tabular ${className}`}>
        <Icon className="size-4" aria-hidden="true" />
        <span className="sr-only">{word}: </span>
        {primary}
      </span>
      {secondary && <span className="text-muted tabular">{secondary}</span>}
    </span>
  );
}
