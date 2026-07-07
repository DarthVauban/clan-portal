import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_SESSION_COOKIE,
  AUTH_STATE_COOKIE,
  type DiscordSessionUser,
  type PortalSession,
  authCookieOptions,
  createSessionCookieValue,
  getDiscordRedirectUri,
  getPublicAppUrl,
  getSessionSecret,
  oauthStateCookieOptions,
} from "@/lib/auth-session";
import { getExistingPortalRegistration } from "@/lib/portal-player-repository";

type DiscordTokenResponse = {
  access_token?: string;
  token_type?: string;
  error?: string;
};

type DiscordUserResponse = {
  id?: string;
  username?: string;
  global_name?: string | null;
  avatar?: string | null;
  discriminator?: string | null;
};

function redirectWithError(request: NextRequest, error: string) {
  const url = new URL("/", getPublicAppUrl(request));
  url.searchParams.set("auth_error", error);
  return NextResponse.redirect(url);
}

function readDiscordConfig(request: NextRequest) {
  const clientId = process.env.DISCORD_CLIENT_ID?.trim();
  const clientSecret = process.env.DISCORD_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("Discord OAuth env is incomplete.");
  }
  return { clientId, clientSecret, redirectUri: getDiscordRedirectUri(request) };
}

async function exchangeCodeForToken(code: string, config: ReturnType<typeof readDiscordConfig>) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
  });
  const basicAuth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  const response = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as DiscordTokenResponse;
  return payload.access_token ? payload.access_token : null;
}

async function fetchDiscordUser(accessToken: string) {
  const response = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as DiscordUserResponse;
  if (!payload.id || !payload.username) return null;
  return {
    id: payload.id,
    username: payload.username,
    globalName: payload.global_name ?? null,
    avatar: payload.avatar ?? null,
    discriminator: payload.discriminator ?? null,
  } satisfies DiscordSessionUser;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const returnedState = request.nextUrl.searchParams.get("state");
  const storedState = request.cookies.get(AUTH_STATE_COOKIE)?.value;
  if (!code) return redirectWithError(request, "missing_code");
  if (!returnedState || !storedState || returnedState !== storedState) {
    return redirectWithError(request, "state");
  }

  let config: ReturnType<typeof readDiscordConfig>;
  try {
    getSessionSecret();
    config = readDiscordConfig(request);
  } catch {
    return redirectWithError(request, "config");
  }

  try {
    const accessToken = await exchangeCodeForToken(code, config);
    if (!accessToken) return redirectWithError(request, "discord");

    const discordUser = await fetchDiscordUser(accessToken);
    if (!discordUser) return redirectWithError(request, "discord_user");
    const existingRegistration = await getExistingPortalRegistration(discordUser.id);
    if (existingRegistration?.applicationStatus === "blocked") {
      const response = redirectWithError(request, "blocked");
      response.cookies.set(AUTH_SESSION_COOKIE, "", authCookieOptions(0));
      response.cookies.set(AUTH_STATE_COOKIE, "", oauthStateCookieOptions(0));
      return response;
    }

    const session: PortalSession = {
      discordUser,
      authorizedAt: new Date().toISOString(),
      registeredAt: existingRegistration?.applicationStatus === "revoked" ? null : existingRegistration?.registeredAt ?? null,
    };
    const response = NextResponse.redirect(new URL("/", getPublicAppUrl(request)));
    response.cookies.set(AUTH_SESSION_COOKIE, createSessionCookieValue(session), authCookieOptions());
    response.cookies.set(AUTH_STATE_COOKIE, "", oauthStateCookieOptions(0));
    return response;
  } catch {
    return redirectWithError(request, "discord");
  }
}
