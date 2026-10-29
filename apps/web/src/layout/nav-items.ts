import type { ComponentType, SVGProps } from 'react';

import { CharacterIcon, CityIcon, CommunityIcon, DarkIcon, HomeIcon } from '../ui/icons';

export interface NavItem {
  to: string;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Wyróżniony, wyniesiony przycisk na środku (główna akcja gry). */
  featured?: boolean;
}

/** Dolna nawigacja wg GDD 3.3. */
export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'Dom', Icon: HomeIcon },
  { to: '/miasto', label: 'Miasto', Icon: CityIcon },
  { to: '/mrok', label: 'Mrok', Icon: DarkIcon, featured: true },
  { to: '/postac', label: 'Postać', Icon: CharacterIcon },
  { to: '/wspolnota', label: 'Wspólnota', Icon: CommunityIcon },
];
