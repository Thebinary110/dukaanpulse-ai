import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';

export interface Crumb {
  label: string;
  to?: string;
}

export function Breadcrumbs({ items }: { items: readonly Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex items-center gap-1.5 text-sm text-muted">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} className={`items-center gap-1.5 ${last ? 'flex' : 'hidden sm:flex'}`}>
              {item.to && !last ? (
                <Link to={item.to} className="rounded transition-colors hover:text-text">
                  {item.label}
                </Link>
              ) : (
                <span className={last ? 'font-medium text-text' : undefined} aria-current={last ? 'page' : undefined}>
                  {item.label}
                </span>
              )}
              {!last && <ChevronRight className="size-3.5 opacity-60" aria-hidden="true" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
