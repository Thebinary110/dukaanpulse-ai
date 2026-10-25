import { createBrowserRouter } from 'react-router';
import { AppShell, type RouteHandle } from './components/AppShell';
import { CampaignStudio } from './screens/CampaignStudio';
import { NotFound } from './screens/NotFound';
import { Opportunities } from './screens/Opportunities';
import { Overview } from './screens/Overview';
import { Results } from './screens/Results';

const home = { label: 'Sunrise Bakery', to: '/' };
const handle = (title: string): RouteHandle => ({ title, crumbs: [home, { label: title }] });

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <Overview />, handle: handle('Overview') },
      { path: 'opportunities', element: <Opportunities />, handle: handle('Opportunities') },
      { path: 'campaigns', element: <CampaignStudio />, handle: handle('Campaign Studio') },
      { path: 'results', element: <Results />, handle: handle('Results') },
      { path: '*', element: <NotFound />, handle: handle('Page not found') },
    ],
  },
]);
