import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_SESSION_COOKIE,
  readSessionCookieValue,
  sessionToPublicAuth,
} from "@/lib/auth-session";
import { getExistingPortalRegistration } from "@/lib/portal-player-repository";

export async function GET(request: NextRequest) {
  const session = readSessionCookieValue(request.cookies.get(AUTH_SESSION_COOKIE)?.value);
  const auth = sessionToPublicAuth(session);
  if (session) {
    const registration = await getExistingPortalRegistration(session.discordUser.id);
    if (registration) {
      auth.stage = "registered";
      auth.registeredAt = registration.registeredAt;
      auth.registeredProfile = registration.registeredProfile;
    }
  }
  return NextResponse.json(auth, {
    headers: { "Cache-Control": "no-store" },
  });
}
