import { createBrowserRouter } from 'react-router';
import { AppShell, type RouteHandle } from './components/AppShell';
import { opportunityShortLabel } from './data/demoData';
import { CampaignStudio } from './screens/CampaignStudio';
import { NotFound } from './screens/NotFound';
import { Opportunities } from './screens/Opportunities';
import { Overview } from './screens/Overview';
import { Results } from './screens/Results';

const home = { label: 'Workspace', to: '/' };
const handle = (title: string): RouteHandle => ({ title, crumbs: [home, { label: title }] });

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <Overview />, handle: handle('Overview') },
      {
        path: 'opportunities',
        element: <Opportunities />,
        handle: {
          title: `${opportunityShortLabel()} · Opportunities`,
          crumbs: [home, { label: 'Opportunities', to: '/opportunities' }, { label: opportunityShortLabel() }],
        } satisfies RouteHandle,
      },
      { path: 'campaigns', element: <CampaignStudio />, handle: handle('Campaign Studio') },
      { path: 'results', element: <Results />, handle: handle('Results') },
      { path: '*', element: <NotFound />, handle: handle('Page not found') },
    ],
  },
]);
