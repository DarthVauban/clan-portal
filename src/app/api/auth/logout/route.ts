import { NextResponse } from "next/server";
import { AUTH_SESSION_COOKIE, authCookieOptions, sessionToPublicAuth } from "@/lib/auth-session";

export async function POST() {
  const response = NextResponse.json(sessionToPublicAuth(null), {
    headers: { "Cache-Control": "no-store" },
  });
  response.cookies.set(AUTH_SESSION_COOKIE, "", authCookieOptions(0));
  return response;
}
