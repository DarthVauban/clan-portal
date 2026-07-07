import { NextRequest, NextResponse } from "next/server";
import { AUTH_SESSION_COOKIE, readSessionCookieValue } from "@/lib/auth-session";
import { listBlockedPortalUsers, unblockPortalPlayer } from "@/lib/portal-player-repository";

function readSession(request: NextRequest) {
  return readSessionCookieValue(request.cookies.get(AUTH_SESSION_COOKIE)?.value);
}

export async function GET(request: NextRequest) {
  const session = readSession(request);
  if (!session) {
    return NextResponse.json({ users: [] }, {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const users = await listBlockedPortalUsers(session);
  if (!users) {
    return NextResponse.json({ users: [] }, {
      status: 403,
      headers: { "Cache-Control": "no-store" },
    });
  }

  return NextResponse.json({ users }, {
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

  const payload = await request.json().catch(() => null) as { action?: unknown; playerId?: unknown } | null;
  const ok = payload?.action === "unblock" ? await unblockPortalPlayer(session, payload.playerId) : false;
  return NextResponse.json({ ok }, {
    status: ok ? 200 : 403,
    headers: { "Cache-Control": "no-store" },
  });
}
