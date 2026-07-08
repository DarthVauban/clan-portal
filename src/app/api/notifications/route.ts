import { NextRequest, NextResponse } from "next/server";
import { AUTH_SESSION_COOKIE, readSessionCookieValue } from "@/lib/auth-session";
import { createPortalNotifications, listPortalNotifications, markPortalNotificationsRead } from "@/lib/portal-notification-repository";

function readSession(request: NextRequest) {
  return readSessionCookieValue(request.cookies.get(AUTH_SESSION_COOKIE)?.value);
}

export async function GET(request: NextRequest) {
  const session = readSession(request);
  if (!session) {
    return NextResponse.json({ notifications: null }, {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const notifications = await listPortalNotifications(session);
  if (!notifications) {
    return NextResponse.json({ notifications: null }, {
      status: 403,
      headers: { "Cache-Control": "no-store" },
    });
  }

  return NextResponse.json({ notifications }, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: NextRequest) {
  const session = readSession(request);
  if (!session) {
    return NextResponse.json({ notifications: null }, {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const payload = await request.json().catch(() => null);
  const notifications = await createPortalNotifications(session, payload?.notifications);
  if (!notifications) {
    return NextResponse.json({ notifications: null }, {
      status: 403,
      headers: { "Cache-Control": "no-store" },
    });
  }

  return NextResponse.json({ notifications }, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function PATCH(request: NextRequest) {
  const session = readSession(request);
  if (!session) {
    return NextResponse.json({ notifications: null }, {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const payload = await request.json().catch(() => null);
  const notifications = await markPortalNotificationsRead(session, payload?.ids, payload?.markAll === true);
  if (!notifications) {
    return NextResponse.json({ notifications: null }, {
      status: 403,
      headers: { "Cache-Control": "no-store" },
    });
  }

  return NextResponse.json({ notifications }, {
    headers: { "Cache-Control": "no-store" },
  });
}
