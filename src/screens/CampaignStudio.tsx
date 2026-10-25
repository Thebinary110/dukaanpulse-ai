import { ComingNext } from '../components/ComingNext';
import { PageHeader } from '../components/PageHeader';

export function CampaignStudio() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Campaign Studio"
        description="Shape an offer, see what it costs, and approve it. Nothing runs without your approval."
      />
      <ComingNext
        title="Plan an offer you control"
        points={[
          'Who receives the offer, and a holdout group to measure it fairly',
          'Editable offer amount and minimum spend',
          'Message preview, clearly marked as never sent',
          'Cost, expected margin and break-even before you approve',
        ]}
      />
    </div>
  );
}
