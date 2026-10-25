import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router';
import { PageHeader } from '../components/PageHeader';

export function NotFound() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Page not found" description="This page doesn't exist. Head back to your overview." />
      <Link
        to="/"
        className="inline-flex w-fit items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover"
      >
        Go to Overview <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </div>
  );
}
