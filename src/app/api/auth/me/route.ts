import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_SESSION_COOKIE,
  authCookieOptions,
  readSessionCookieValue,
} from "@/lib/auth-session";
import { resolvePortalAuthState } from "@/lib/portal-auth-state";

export async function GET(request: NextRequest) {
  const session = readSessionCookieValue(request.cookies.get(AUTH_SESSION_COOKIE)?.value);
  const { auth, clearSession } = await resolvePortalAuthState(session);
  const response = NextResponse.json(auth, {
    headers: { "Cache-Control": "no-store" },
  });
  if (clearSession) {
    response.cookies.set(AUTH_SESSION_COOKIE, "", authCookieOptions(0));
  }
  return response;
}
