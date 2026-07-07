import { NextRequest, NextResponse } from "next/server";
import { AUTH_SESSION_COOKIE, readSessionCookieValue } from "@/lib/auth-session";
import { listPortalCollectiveState } from "@/lib/portal-collective-repository";
import { blockPortalPlayer, deletePortalPlayer } from "@/lib/portal-player-repository";

function readSession(request: NextRequest) {
  return readSessionCookieValue(request.cookies.get(AUTH_SESSION_COOKIE)?.value);
}

export async function POST(request: NextRequest) {
  const session = readSession(request);
  if (!session) {
    return NextResponse.json({ state: null, ok: false }, {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const payload = await request.json().catch(() => null) as { action?: unknown; playerId?: unknown } | null;
  const action = payload?.action;
  const ok = action === "block"
    ? await blockPortalPlayer(session, payload?.playerId)
    : action === "delete"
      ? await deletePortalPlayer(session, payload?.playerId)
      : false;

  if (!ok) {
    return NextResponse.json({ state: null, ok: false }, {
      status: 403,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const state = await listPortalCollectiveState(session);
  return NextResponse.json({ state, ok: true }, {
    headers: { "Cache-Control": "no-store" },
  });
}
