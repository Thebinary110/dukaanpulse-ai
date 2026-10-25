import { ChartLine, LayoutDashboard, Megaphone, MessageSquareText, Radar, type LucideIcon } from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  hint: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'Overview', hint: 'Business health at a glance', icon: LayoutDashboard },
  { to: '/ask', label: 'Ask DukaanPulse', hint: 'Questions answered by specialist agents', icon: MessageSquareText },
  { to: '/opportunities', label: 'Opportunities', hint: 'What needs your attention', icon: Radar },
  { to: '/campaigns', label: 'Campaign Studio', hint: 'Plan and approve offers', icon: Megaphone },
  { to: '/results', label: 'Results', hint: 'What worked and what next', icon: ChartLine },
];
