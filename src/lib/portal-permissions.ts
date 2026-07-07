export const collectiveRoleValues = ["leader", "officer", "recruiter", "treasurer", "raid-leader", "member"] as const;
export type CollectiveRole = (typeof collectiveRoleValues)[number];

export const portalRoleValues = ["administrator", "clan-leader", "member"] as const;
export type PortalRole = (typeof portalRoleValues)[number];

export type PortalPermission =
  | "VIEW_COLLECTIVES"
  | "CREATE_COLLECTIVE"
  | "EDIT_COLLECTIVE"
  | "DELETE_COLLECTIVE"
  | "VIEW_ITEM_DATABASE"
  | "VIEW_RESOURCES"
  | "MANAGE_RESOURCES"
  | "VIEW_JOIN_REQUESTS"
  | "ACCEPT_JOIN_REQUEST"
  | "VIEW_RESOURCE_REQUESTS"
  | "CREATE_RESOURCE_REQUEST"
  | "MANAGE_RESOURCE_REQUESTS"
  | "VIEW_CRAFT_REQUESTS"
  | "CREATE_CRAFT_REQUEST"
  | "MANAGE_CRAFT_REQUESTS"
  | "USE_CRAFT_CALCULATOR_BASIC"
  | "USE_CRAFT_CALCULATOR_EXTENDED"
  | "VIEW_BLOCKED_USERS"
  | "BLOCK_USER"
  | "UNBLOCK_USER"
  | "REMOVE_USER_FROM_COLLECTIVE"
  | "TRANSFER_USER_BETWEEN_COLLECTIVES"
  | "CHANGE_COLLECTIVE_ROLE"
  | "CHANGE_PORTAL_ROLE"
  | "RENAME_PORTAL";

export type PortalPermissionContext = {
  portalRole: PortalRole;
  collectiveRole?: CollectiveRole | null;
  accepted?: boolean;
};

export const collectiveRoles: Array<{ value: CollectiveRole; label: string }> = [
  { value: "leader", label: "Руководитель состава" },
  { value: "officer", label: "Офицер" },
  { value: "recruiter", label: "Рекрутер" },
  { value: "treasurer", label: "Казначей" },
  { value: "raid-leader", label: "Рейд лидер" },
  { value: "member", label: "Участник" },
];

export const collectiveRoleLabels = Object.fromEntries(collectiveRoles.map((role) => [role.value, role.label])) as Record<CollectiveRole, string>;

export const portalRoleLabels: Record<PortalRole, string> = {
  administrator: "Администратор",
  "clan-leader": "Глава клана",
  member: "Игрок",
};

export const portalRoles: Array<{ value: PortalRole; label: string }> = portalRoleValues.map((role) => ({
  value: role,
  label: portalRoleLabels[role],
}));

export const applicantManagerRoles = ["leader", "officer", "recruiter"] as const satisfies readonly CollectiveRole[];
export const memberManagerRoles = ["leader", "officer"] as const satisfies readonly CollectiveRole[];
export const resourceManagerRoles = ["leader", "officer", "treasurer"] as const satisfies readonly CollectiveRole[];
export const craftManagerRoles = ["leader", "officer", "treasurer", "raid-leader"] as const satisfies readonly CollectiveRole[];
export const extendedCalculatorRoles = ["leader", "officer", "treasurer", "raid-leader"] as const satisfies readonly CollectiveRole[];

const acceptedMemberPermissions = new Set<PortalPermission>([
  "VIEW_COLLECTIVES",
  "VIEW_ITEM_DATABASE",
  "VIEW_RESOURCES",
  "VIEW_RESOURCE_REQUESTS",
  "CREATE_RESOURCE_REQUEST",
  "VIEW_CRAFT_REQUESTS",
  "CREATE_CRAFT_REQUEST",
  "USE_CRAFT_CALCULATOR_BASIC",
]);

const adminOnlyPermissions = new Set<PortalPermission>([
  "CREATE_COLLECTIVE",
  "EDIT_COLLECTIVE",
  "DELETE_COLLECTIVE",
  "VIEW_BLOCKED_USERS",
  "UNBLOCK_USER",
  "TRANSFER_USER_BETWEEN_COLLECTIVES",
  "CHANGE_PORTAL_ROLE",
  "RENAME_PORTAL",
]);

const ownCollectivePermissions: Partial<Record<PortalPermission, readonly CollectiveRole[]>> = {
  VIEW_JOIN_REQUESTS: applicantManagerRoles,
  ACCEPT_JOIN_REQUEST: applicantManagerRoles,
  REMOVE_USER_FROM_COLLECTIVE: memberManagerRoles,
  BLOCK_USER: memberManagerRoles,
  CHANGE_COLLECTIVE_ROLE: memberManagerRoles,
  MANAGE_RESOURCES: resourceManagerRoles,
  MANAGE_RESOURCE_REQUESTS: resourceManagerRoles,
  MANAGE_CRAFT_REQUESTS: craftManagerRoles,
  USE_CRAFT_CALCULATOR_EXTENDED: extendedCalculatorRoles,
};

export function isGlobalPortalRole(role: PortalRole) {
  return role === "administrator";
}

export function roleIsIn(role: CollectiveRole | null | undefined, roles: readonly CollectiveRole[]) {
  return Boolean(role && roles.includes(role));
}

export function hasPortalPermission(context: PortalPermissionContext, permission: PortalPermission) {
  if (isGlobalPortalRole(context.portalRole)) return true;
  if (adminOnlyPermissions.has(permission)) return false;
  if (acceptedMemberPermissions.has(permission)) return context.accepted === true || Boolean(context.collectiveRole);
  const collectiveRolesForPermission = ownCollectivePermissions[permission];
  return roleIsIn(context.collectiveRole, collectiveRolesForPermission ?? []);
}
