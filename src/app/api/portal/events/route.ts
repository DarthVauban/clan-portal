import { NextRequest } from "next/server";
import { AUTH_SESSION_COOKIE, readSessionCookieValue, type PortalSession } from "@/lib/auth-session";
import { resolvePortalAuthState } from "@/lib/portal-auth-state";
import { listPortalCollectiveState } from "@/lib/portal-collective-repository";
import { subscribePortalStateEvents } from "@/lib/portal-live-events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function readSession(request: NextRequest) {
  return readSessionCookieValue(request.cookies.get(AUTH_SESSION_COOKIE)?.value);
}

async function buildPortalStatePayload(session: PortalSession) {
  const { auth } = await resolvePortalAuthState(session);
  const collectiveState = auth.stage === "anonymous"
    ? null
    : await listPortalCollectiveState(session).catch(() => null);
  return { auth, collectiveState };
}

export async function GET(request: NextRequest) {
  const session = readSession(request);
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
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
      const sendPortalState = () => {
        void buildPortalStatePayload(session)
          .then((payload) => send("portal-state", payload))
          .catch(() => send("portal-state-error", { at: Date.now() }));
      };

      sendPortalState();
      unsubscribe = subscribePortalStateEvents(sendPortalState);
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
