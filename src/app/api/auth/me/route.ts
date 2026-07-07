import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_SESSION_COOKIE,
  authCookieOptions,
  readSessionCookieValue,
  sessionToPublicAuth,
} from "@/lib/auth-session";
import { getExistingPortalRegistration } from "@/lib/portal-player-repository";

export async function GET(request: NextRequest) {
  const session = readSessionCookieValue(request.cookies.get(AUTH_SESSION_COOKIE)?.value);
  const auth = sessionToPublicAuth(session);
  const anonymousResponse = () => {
    const response = NextResponse.json(sessionToPublicAuth(null), {
      headers: { "Cache-Control": "no-store" },
    });
    response.cookies.set(AUTH_SESSION_COOKIE, "", authCookieOptions(0));
    return response;
  };
  if (session) {
    let registration: Awaited<ReturnType<typeof getExistingPortalRegistration>>;
    try {
      registration = await getExistingPortalRegistration(session.discordUser.id);
    } catch {
      return NextResponse.json(auth, {
        headers: { "Cache-Control": "no-store" },
      });
    }
    if (registration) {
      if (registration.applicationStatus === "blocked") return anonymousResponse();
      if (registration.applicationStatus === "revoked" && session.registeredAt) return anonymousResponse();
      if (registration.applicationStatus === "revoked") {
        auth.stage = "discord-authorized";
        auth.registeredAt = null;
        auth.registeredProfile = null;
        auth.applicationStatus = null;
        return NextResponse.json(auth, {
          headers: { "Cache-Control": "no-store" },
        });
      }
      auth.stage = "registered";
      auth.registeredAt = registration.registeredAt;
      auth.registeredProfile = registration.registeredProfile;
      auth.applicationStatus = registration.applicationStatus;
    } else if (auth.stage === "registered") {
      return anonymousResponse();
    }
  }
  return NextResponse.json(auth, {
    headers: { "Cache-Control": "no-store" },
  });
}
