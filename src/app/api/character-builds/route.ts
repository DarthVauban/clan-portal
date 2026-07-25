import { NextRequest, NextResponse } from "next/server";
import { AUTH_SESSION_COOKIE, readSessionCookieValue } from "@/lib/auth-session";
import {
  createCharacterBuild,
  listCharacterBuilds,
} from "@/lib/character-builder-repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function readSession(request: NextRequest) {
  return readSessionCookieValue(request.cookies.get(AUTH_SESSION_COOKIE)?.value);
}

export async function GET(request: NextRequest) {
  const session = readSession(request);
  if (!session) return NextResponse.json({ error: "Требуется авторизация." }, { status: 401 });
  const builds = await listCharacterBuilds(session);
  if (!builds) return NextResponse.json({ error: "Доступ запрещён." }, { status: 403 });
  return NextResponse.json({ builds });
}

export async function POST(request: NextRequest) {
  const session = readSession(request);
  if (!session) return NextResponse.json({ error: "Требуется авторизация." }, { status: 401 });
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректные данные билда." }, { status: 400 });
  }
  try {
    const build = await createCharacterBuild(
      session,
      payload && typeof payload === "object" ? (payload as { build?: unknown }).build : null,
    );
    if (!build) return NextResponse.json({ error: "Не удалось сохранить билд." }, { status: 400 });
    return NextResponse.json({ build }, { status: 201 });
  } catch (error) {
    if ((error as Error).message === "BUILD_LIMIT_REACHED") {
      return NextResponse.json({ error: "Достигнут лимит в 30 сохранённых билдов." }, { status: 409 });
    }
    throw error;
  }
}
