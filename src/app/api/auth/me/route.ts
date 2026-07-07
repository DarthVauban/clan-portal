import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_SESSION_COOKIE,
  readSessionCookieValue,
  sessionToPublicAuth,
} from "@/lib/auth-session";

export async function GET(request: NextRequest) {
  const session = readSessionCookieValue(request.cookies.get(AUTH_SESSION_COOKIE)?.value);
  return NextResponse.json(sessionToPublicAuth(session), {
    headers: { "Cache-Control": "no-store" },
  });
}
