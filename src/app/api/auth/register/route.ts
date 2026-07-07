import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_SESSION_COOKIE,
  authCookieOptions,
  createSessionCookieValue,
  readSessionCookieValue,
  sessionToPublicAuth,
} from "@/lib/auth-session";
import { upsertPortalRegistration } from "@/lib/portal-player-repository";

export async function POST(request: NextRequest) {
  const session = readSessionCookieValue(request.cookies.get(AUTH_SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json(sessionToPublicAuth(null), {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const payload = await request.json().catch(() => null);
  const playerId = await upsertPortalRegistration(session, payload);
  if (!playerId) {
    return NextResponse.json({ error: "Invalid registration payload." }, {
      status: 400,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const updatedSession = {
    ...session,
    registeredAt: session.registeredAt ?? new Date().toISOString(),
  };
  const response = NextResponse.json(sessionToPublicAuth(updatedSession), {
    headers: { "Cache-Control": "no-store" },
  });
  response.cookies.set(AUTH_SESSION_COOKIE, createSessionCookieValue(updatedSession), authCookieOptions());
  return response;
}
