export const DEFAULT_PORTAL_NAME = "Squirt Sqad";

export function normalizePortalName(value: unknown) {
  if (typeof value !== "string") return DEFAULT_PORTAL_NAME;
  const normalized = value.trim().replace(/\s+/g, " ").slice(0, 48);
  return normalized || DEFAULT_PORTAL_NAME;
}
