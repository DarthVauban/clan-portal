import { NextRequest } from "next/server";
import { AUTH_SESSION_COOKIE, readSessionCookieValue } from "@/lib/auth-session";
import { hasPortalNotificationAccess } from "@/lib/portal-notification-repository";
import { subscribePortalNotificationEvents } from "@/lib/portal-notification-events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function readSession(request: NextRequest) {
  return readSessionCookieValue(request.cookies.get(AUTH_SESSION_COOKIE)?.value);
}

export async function GET(request: NextRequest) {
  const session = readSession(request);
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!(await hasPortalNotificationAccess(session))) {
    return new Response("Forbidden", { status: 403 });
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let closed = false;

  const encodeEvent = (event: string, data: object) => encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: object) => {
        if (closed) return;
        try {
          controller.enqueue(encodeEvent(event, data));
        } catch {
          closed = true;
          unsubscribe?.();
        }
      };

      send("ready", { connected: true });
      unsubscribe = subscribePortalNotificationEvents(() => send("notifications-changed", { at: Date.now() }));
      request.signal.addEventListener("abort", () => {
        closed = true;
        unsubscribe?.();
        try {
          controller.close();
        } catch {
          // The browser may already have closed the stream.
        }
      });
    },
    cancel() {
      closed = true;
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
      "X-Accel-Buffering": "no",
    },
  });
}
