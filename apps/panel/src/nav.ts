import { can, ROLE_LABELS, type Permission, type StaffRole } from '../server/permissions.js';

export interface NavItem {
  to: string;
  label: string;
  permission: Permission;
}

export const NAV: readonly NavItem[] = [
  { to: '/gracze', label: 'Gracze', permission: 'playersRead' },
  { to: '/audyt', label: 'Audyt', permission: 'auditRead' },
  { to: '/ogloszenia', label: 'Ogłoszenia', permission: 'announcementsWrite' },
  { to: '/tresc', label: 'Treść', permission: 'contentWrite' },
  { to: '/eventy', label: 'Eventy', permission: 'contentWrite' },
  { to: '/publikacje', label: 'Publikacje', permission: 'contentPublish' },
];

export function navFor(role: StaffRole): NavItem[] {
  return NAV.filter((item) => can(role, item.permission));
}

export function homeFor(role: StaffRole): string {
  return navFor(role)[0]?.to ?? '/tresc';
}

export { ROLE_LABELS };
