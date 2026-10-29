import type { ComponentType, SVGProps } from 'react';

import { t } from '../i18n';
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
  { to: '/', label: t('nav.home'), Icon: HomeIcon },
  { to: '/miasto', label: t('nav.city'), Icon: CityIcon },
  { to: '/mrok', label: t('nav.dark'), Icon: DarkIcon, featured: true },
  { to: '/postac', label: t('nav.character'), Icon: CharacterIcon },
  { to: '/wspolnota', label: t('nav.community'), Icon: CommunityIcon },
];
