import { NextRequest, NextResponse } from "next/server";
import { AUTH_SESSION_COOKIE, readSessionCookieValue } from "@/lib/auth-session";
import {
  acceptPendingMembershipApplicant,
  listPendingMembershipApplicants,
} from "@/lib/portal-player-repository";

function readSession(request: NextRequest) {
  return readSessionCookieValue(request.cookies.get(AUTH_SESSION_COOKIE)?.value);
}

export async function GET(request: NextRequest) {
  const session = readSession(request);
  if (!session) {
    return NextResponse.json({ applicants: [] }, {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const applicants = await listPendingMembershipApplicants(session);
  return NextResponse.json({ applicants }, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: NextRequest) {
  const session = readSession(request);
  if (!session) {
    return NextResponse.json({ ok: false }, {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const payload = await request.json().catch(() => null);
  const accepted = await acceptPendingMembershipApplicant(session, payload?.playerId);
  return NextResponse.json({ ok: accepted }, {
    status: accepted ? 200 : 403,
    headers: { "Cache-Control": "no-store" },
  });
}
