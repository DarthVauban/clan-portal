import { NextRequest, NextResponse } from "next/server";
import { AUTH_SESSION_COOKIE, readSessionCookieValue } from "@/lib/auth-session";
import { leaveOwnCollective } from "@/lib/portal-collective-repository";

function readSession(request: NextRequest) {
  return readSessionCookieValue(request.cookies.get(AUTH_SESSION_COOKIE)?.value);
}

export async function POST(request: NextRequest) {
  const session = readSession(request);
  if (!session) {
    return NextResponse.json({ state: null }, {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const state = await leaveOwnCollective(session);
  if (!state) {
    return NextResponse.json({ state: null, error: "leader_with_members" }, {
      status: 409,
      headers: { "Cache-Control": "no-store" },
    });
  }

  return NextResponse.json({ state }, {
    headers: { "Cache-Control": "no-store" },
  });
}
