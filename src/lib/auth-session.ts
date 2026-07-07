import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

export const AUTH_SESSION_COOKIE = "clan_portal_session";
export const AUTH_STATE_COOKIE = "clan_portal_oauth_state";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;
export const OAUTH_STATE_MAX_AGE_SECONDS = 60 * 10;

export type PortalAuthStage = "anonymous" | "discord-authorized" | "registered";

export type DiscordSessionUser = {
  id: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
  discriminator: string | null;
};

export type PortalSession = {
  discordUser: DiscordSessionUser;
  authorizedAt: string;
  registeredAt: string | null;
};

export type PublicPortalAuthState = {
  stage: PortalAuthStage;
  discordId: string | null;
  discordNickname: string | null;
  avatarUrl: string | null;
  isPortalAdmin: boolean;
  authorizedAt: string | null;
  registeredAt: string | null;
};

export const PUBLIC_ANONYMOUS_AUTH: PublicPortalAuthState = {
  stage: "anonymous",
  discordId: null,
  discordNickname: null,
  avatarUrl: null,
  isPortalAdmin: false,
  authorizedAt: null,
  registeredAt: null,
};

export function getSessionSecret() {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must contain at least 32 characters.");
  }
  return secret;
}

function signPayload(payload: string) {
  return createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function isDiscordSessionUser(value: unknown): value is DiscordSessionUser {
  if (!value || typeof value !== "object") return false;
  const user = value as Partial<DiscordSessionUser>;
  return (
    typeof user.id === "string" &&
    typeof user.username === "string" &&
    (typeof user.globalName === "string" || user.globalName === null) &&
    (typeof user.avatar === "string" || user.avatar === null) &&
    (typeof user.discriminator === "string" || user.discriminator === null)
  );
}

function isPortalSession(value: unknown): value is PortalSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<PortalSession>;
  return (
    isDiscordSessionUser(session.discordUser) &&
    typeof session.authorizedAt === "string" &&
    (typeof session.registeredAt === "string" || session.registeredAt === null)
  );
}

export function createSessionCookieValue(session: PortalSession) {
  const payload = Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  return `${payload}.${signPayload(payload)}`;
}

export function readSessionCookieValue(value: string | undefined | null) {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  if (!payload || !signature || !safeEqual(signature, signPayload(payload))) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return isPortalSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function getDiscordDisplayName(user: DiscordSessionUser) {
  if (user.globalName) return user.globalName;
  if (user.discriminator && user.discriminator !== "0") return `${user.username}#${user.discriminator}`;
  return user.username;
}

export function getDiscordAvatarUrl(user: DiscordSessionUser) {
  if (!user.avatar) return null;
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`;
}

export function isPortalAdminDiscordId(discordId: string) {
  const adminIds = process.env.ADMIN_DISCORD_IDS?.split(/[,\s]+/) ?? [];
  return adminIds.some((adminId) => adminId.trim() === discordId);
}

export function sessionToPublicAuth(session: PortalSession | null): PublicPortalAuthState {
  if (!session) return PUBLIC_ANONYMOUS_AUTH;
  return {
    stage: session.registeredAt ? "registered" : "discord-authorized",
    discordId: session.discordUser.id,
    discordNickname: getDiscordDisplayName(session.discordUser),
    avatarUrl: getDiscordAvatarUrl(session.discordUser),
    isPortalAdmin: isPortalAdminDiscordId(session.discordUser.id),
    authorizedAt: session.authorizedAt,
    registeredAt: session.registeredAt,
  };
}

export function authCookieOptions(maxAge = SESSION_MAX_AGE_SECONDS) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

export function oauthStateCookieOptions(maxAge = OAUTH_STATE_MAX_AGE_SECONDS) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

export function getPublicAppUrl(request: Request) {
  const configuredAppUrl = process.env.APP_URL?.trim();
  if (configuredAppUrl && !configuredAppUrl.includes("0.0.0.0")) {
    return configuredAppUrl.replace(/\/$/, "");
  }

  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (host && !host.startsWith("0.0.0.0")) {
    const protocol = request.headers.get("x-forwarded-proto") || "http";
    return `${protocol}://${host}`;
  }

  const clanPort = process.env.CLAN_PORT?.trim() || "4000";
  return `http://localhost:${clanPort}`;
}

export function getDiscordRedirectUri(request: Request) {
  return process.env.DISCORD_REDIRECT_URI?.trim() || `${getPublicAppUrl(request)}/api/auth/discord/callback`;
}
