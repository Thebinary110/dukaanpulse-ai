import { ComingNext } from '../components/ComingNext';
import { PageHeader } from '../components/PageHeader';

export function Opportunities() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Opportunities"
        description="Patterns in your payments that are worth acting on, with the evidence behind each one."
      />
      <ComingNext
        title="Explained, evidence-backed opportunities"
        points={[
          'Which customers are affected and why they were flagged',
          'How confident the finding is, and how many flags chance alone would produce',
          'Side-by-side options, including doing nothing',
          'Every assumption shown and editable',
        ]}
      />
    </div>
  );
}
