import { ComingNext } from '../components/ComingNext';
import { PageHeader } from '../components/PageHeader';

export function Results() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Results"
        description="What a simulated campaign achieved compared with customers who received nothing."
      />
      <ComingNext
        title="Simulated outcomes, measured honestly"
        points={[
          'Return rate for customers who got the offer versus the holdout group',
          'Incremental revenue, offer cost and net profit',
          'A likely range, not just a single number',
          'A recommended next step based on the result',
        ]}
      />
    </div>
  );
}
