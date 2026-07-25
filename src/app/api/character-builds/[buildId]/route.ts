import { NextRequest, NextResponse } from "next/server";
import { AUTH_SESSION_COOKIE, readSessionCookieValue } from "@/lib/auth-session";
import {
  deleteCharacterBuild,
  updateCharacterBuild,
} from "@/lib/character-builder-repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function readSession(request: NextRequest) {
  return readSessionCookieValue(request.cookies.get(AUTH_SESSION_COOKIE)?.value);
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ buildId: string }> },
) {
  const session = readSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Некоректні дані білда." }, { status: 400 });
  }
  const { buildId } = await context.params;
  const build = await updateCharacterBuild(
    session,
    buildId,
    payload && typeof payload === "object" ? (payload as { build?: unknown }).build : null,
  );
  if (!build) return NextResponse.json({ error: "Білд не знайдено." }, { status: 404 });
  return NextResponse.json({ build });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ buildId: string }> },
) {
  const session = readSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { buildId } = await context.params;
  const deleted = await deleteCharacterBuild(session, buildId);
  if (!deleted) return NextResponse.json({ error: "Білд не знайдено." }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
