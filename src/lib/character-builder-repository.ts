import "server-only";

import { randomBytes, randomUUID } from "node:crypto";
import type { PortalSession } from "@/lib/auth-session";
import {
  normalizeCharacterBuildState,
  type CharacterBuildState,
  type SavedCharacterBuild,
} from "@/lib/character-builder";
import { getDatabasePool } from "@/lib/database";

type CharacterBuildRow = {
  build_id: string;
  share_slug: string;
  title: string;
  hero_class: string;
  character_level: number;
  build_data: unknown;
  owner_name: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

function toIsoString(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapBuildRow(row: CharacterBuildRow): SavedCharacterBuild | null {
  const buildData = normalizeCharacterBuildState(row.build_data);
  if (!buildData) return null;
  return {
    buildId: row.build_id,
    shareSlug: row.share_slug,
    title: row.title,
    heroClass: row.hero_class,
    level: Number(row.character_level),
    buildData,
    ownerName: row.owner_name,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

async function getOwnerPlayerId(session: PortalSession) {
  const pool = getDatabasePool();
  const result = await pool.query(
    `
      SELECT player_id
      FROM portal_players
      WHERE discord_id = $1
        AND application_status NOT IN ('revoked', 'blocked')
      LIMIT 1
    `,
    [session.discordUser.id],
  );
  return typeof result.rows[0]?.player_id === "string" ? result.rows[0].player_id : null;
}

const buildSelect = `
  SELECT
    b.build_id,
    b.share_slug,
    b.title,
    b.hero_class,
    b.character_level,
    b.build_data,
    p.display_name AS owner_name,
    b.created_at,
    b.updated_at
  FROM portal_character_builds b
  JOIN portal_players p ON p.player_id = b.owner_player_id
`;

export async function listCharacterBuilds(session: PortalSession) {
  const ownerPlayerId = await getOwnerPlayerId(session);
  if (!ownerPlayerId) return null;
  const pool = getDatabasePool();
  const result = await pool.query(
    `${buildSelect}
      WHERE b.owner_player_id = $1
      ORDER BY b.updated_at DESC
      LIMIT 30
    `,
    [ownerPlayerId],
  );
  return (result.rows as CharacterBuildRow[])
    .map(mapBuildRow)
    .filter((build): build is SavedCharacterBuild => Boolean(build));
}

export async function createCharacterBuild(session: PortalSession, rawBuild: unknown) {
  const ownerPlayerId = await getOwnerPlayerId(session);
  const buildData = normalizeCharacterBuildState(rawBuild);
  if (!ownerPlayerId || !buildData) return null;
  const pool = getDatabasePool();
  const countResult = await pool.query(
    "SELECT COUNT(*)::integer AS total FROM portal_character_builds WHERE owner_player_id = $1",
    [ownerPlayerId],
  );
  if (Number(countResult.rows[0]?.total ?? 0) >= 30) {
    throw new Error("BUILD_LIMIT_REACHED");
  }

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const buildId = randomUUID();
    const shareSlug = randomBytes(9).toString("base64url");
    try {
      const result = await pool.query(
        `
          INSERT INTO portal_character_builds (
            build_id,
            owner_player_id,
            share_slug,
            title,
            hero_class,
            character_level,
            build_data,
            is_public
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, TRUE)
          RETURNING build_id
        `,
        [
          buildId,
          ownerPlayerId,
          shareSlug,
          buildData.title,
          buildData.heroClass,
          buildData.level,
          JSON.stringify(buildData),
        ],
      );
      if (!result.rowCount) return null;
      return getOwnedCharacterBuild(session, buildId);
    } catch (error) {
      if ((error as { code?: string }).code !== "23505" || attempt === 3) throw error;
    }
  }
  return null;
}

export async function getOwnedCharacterBuild(session: PortalSession, buildId: unknown) {
  if (typeof buildId !== "string") return null;
  const ownerPlayerId = await getOwnerPlayerId(session);
  if (!ownerPlayerId) return null;
  const pool = getDatabasePool();
  const result = await pool.query(
    `${buildSelect}
      WHERE b.owner_player_id = $1
        AND b.build_id = $2
      LIMIT 1
    `,
    [ownerPlayerId, buildId],
  );
  return result.rows[0] ? mapBuildRow(result.rows[0] as CharacterBuildRow) : null;
}

export async function updateCharacterBuild(
  session: PortalSession,
  buildId: unknown,
  rawBuild: unknown,
) {
  if (typeof buildId !== "string") return null;
  const ownerPlayerId = await getOwnerPlayerId(session);
  const buildData = normalizeCharacterBuildState(rawBuild);
  if (!ownerPlayerId || !buildData) return null;
  const pool = getDatabasePool();
  const result = await pool.query(
    `
      UPDATE portal_character_builds
      SET title = $3,
          hero_class = $4,
          character_level = $5,
          build_data = $6::jsonb,
          updated_at = NOW()
      WHERE owner_player_id = $1
        AND build_id = $2
      RETURNING build_id
    `,
    [
      ownerPlayerId,
      buildId,
      buildData.title,
      buildData.heroClass,
      buildData.level,
      JSON.stringify(buildData),
    ],
  );
  return result.rowCount ? getOwnedCharacterBuild(session, buildId) : null;
}

export async function deleteCharacterBuild(session: PortalSession, buildId: unknown) {
  if (typeof buildId !== "string") return false;
  const ownerPlayerId = await getOwnerPlayerId(session);
  if (!ownerPlayerId) return false;
  const pool = getDatabasePool();
  const result = await pool.query(
    `
      DELETE FROM portal_character_builds
      WHERE owner_player_id = $1
        AND build_id = $2
      RETURNING build_id
    `,
    [ownerPlayerId, buildId],
  );
  return Boolean(result.rowCount);
}

export async function getPublicCharacterBuild(shareSlug: unknown) {
  if (typeof shareSlug !== "string" || !/^[A-Za-z0-9_-]{8,32}$/.test(shareSlug)) return null;
  const pool = getDatabasePool();
  const result = await pool.query(
    `${buildSelect}
      WHERE b.share_slug = $1
        AND b.is_public = TRUE
        AND p.application_status NOT IN ('revoked', 'blocked')
      LIMIT 1
    `,
    [shareSlug],
  );
  return result.rows[0] ? mapBuildRow(result.rows[0] as CharacterBuildRow) : null;
}

export type { CharacterBuildState };
