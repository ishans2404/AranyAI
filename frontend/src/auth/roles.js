/**
 * Role / permission model.
 *
 * This is intentionally a thin, client-side permission map — there is no
 * backend auth yet (see backend/database.py RangerAssignment docstring:
 * "lightweight POC role model, NOT authentication"). The shape here is
 * deliberately the seam where real auth slots in later: swap
 * AuthContext's login() to call a real /api/auth endpoint and everything
 * downstream (ProtectedRoute, AreaGuard, role-aware nav) keeps working
 * unchanged.
 */

export const ROLES = {
  ADMIN:  'admin',
  RANGER: 'ranger',
};

export const PERMISSIONS = {
  VIEW_ALL_AREAS:     'view_all_areas',
  MANAGE_AREAS:       'manage_areas',
  TRIGGER_DETECTION:  'trigger_detection',
  VERIFY_ALERTS:      'verify_alerts',
  ASSIGN_ALERTS:      'assign_alerts',
  MANAGE_RANGERS:     'manage_rangers',
  VIEW_REPORTS:       'view_reports',
};

const ADMIN_PERMISSIONS = Object.values(PERMISSIONS);

const RANGER_PERMISSIONS = [
  PERMISSIONS.TRIGGER_DETECTION,
  PERMISSIONS.VERIFY_ALERTS,
  PERMISSIONS.VIEW_REPORTS,
];

const ROLE_PERMISSIONS = {
  [ROLES.ADMIN]:  ADMIN_PERMISSIONS,
  [ROLES.RANGER]: RANGER_PERMISSIONS,
};

export function hasPermission(role, permission) {
  if (!role || !permission) return false;
  return (ROLE_PERMISSIONS[role] || []).includes(permission);
}

export function roleLabel(role) {
  return role === ROLES.ADMIN ? 'Administrator' : role === ROLES.RANGER ? 'Ranger' : role;
}
