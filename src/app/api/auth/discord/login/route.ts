import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { AUTH_STATE_COOKIE, getDiscordRedirectUri, getPublicAppUrl, getSessionSecret, oauthStateCookieOptions } from "@/lib/auth-session";

function redirectWithError(request: NextRequest, error: string) {
  const url = new URL("/", getPublicAppUrl(request));
  url.searchParams.set("auth_error", error);
  return NextResponse.redirect(url);
}

function readDiscordConfig(request: NextRequest) {
  const clientId = process.env.DISCORD_CLIENT_ID?.trim();
  if (!clientId) {
    throw new Error("Discord OAuth env is incomplete.");
  }
  return { clientId, redirectUri: getDiscordRedirectUri(request) };
}

export async function GET(request: NextRequest) {
  try {
    getSessionSecret();
    const { clientId, redirectUri } = readDiscordConfig(request);
    const state = randomBytes(24).toString("base64url");
    const authorizationUrl = new URL("https://discord.com/oauth2/authorize");
    authorizationUrl.searchParams.set("client_id", clientId);
    authorizationUrl.searchParams.set("redirect_uri", redirectUri);
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("scope", "identify");
    authorizationUrl.searchParams.set("state", state);
    authorizationUrl.searchParams.set("prompt", "consent");

    const response = NextResponse.redirect(authorizationUrl);
    response.cookies.set(AUTH_STATE_COOKIE, state, oauthStateCookieOptions());
    return response;
  } catch {
    return redirectWithError(request, "config");
  }
}
