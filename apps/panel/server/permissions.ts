export const STAFF_ROLES = ['administrator', 'moderator', 'content_designer'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const ROLE_LABELS: Record<StaffRole, string> = {
  administrator: 'Administrator',
  moderator: 'Moderator',
  content_designer: 'Projektant treści',
};

export const PERMISSIONS = {
  playersRead: ['administrator', 'moderator'],
  playersBan: ['administrator', 'moderator'],
  playersLedger: ['administrator'],
  auditRead: ['administrator', 'moderator'],
  announcementsWrite: ['administrator', 'moderator'],
  contentWrite: ['administrator', 'content_designer'],
  contentPublish: ['administrator', 'content_designer'],
} as const satisfies Record<string, readonly StaffRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: StaffRole, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly StaffRole[]).includes(role);
}
