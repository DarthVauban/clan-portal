import { NextRequest, NextResponse } from "next/server";
import { AUTH_SESSION_COOKIE, readSessionCookieValue } from "@/lib/auth-session";
import { listPortalRequestState, savePortalRequestState } from "@/lib/portal-request-repository";

function readSession(request: NextRequest) {
  return readSessionCookieValue(request.cookies.get(AUTH_SESSION_COOKIE)?.value);
}

export async function GET(request: NextRequest) {
  const session = readSession(request);
  if (!session) {
    return NextResponse.json({ state: null }, {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const state = await listPortalRequestState(session);
  if (!state) {
    return NextResponse.json({ state: null }, {
      status: 403,
      headers: { "Cache-Control": "no-store" },
    });
  }

  return NextResponse.json({ state }, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function PUT(request: NextRequest) {
  const session = readSession(request);
  if (!session) {
    return NextResponse.json({ state: null }, {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const payload = await request.json().catch(() => null);
  const state = await savePortalRequestState(session, payload?.state);
  if (!state) {
    return NextResponse.json({ state: null }, {
      status: 403,
      headers: { "Cache-Control": "no-store" },
    });
  }

  return NextResponse.json({ state }, {
    headers: { "Cache-Control": "no-store" },
  });
}
