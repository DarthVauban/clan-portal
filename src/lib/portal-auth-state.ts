import "server-only";

import {
  sessionToPublicAuth,
  type PortalSession,
  type PublicPortalAuthState,
} from "@/lib/auth-session";
import { getExistingPortalRegistration } from "@/lib/portal-player-repository";

export type PortalAuthResolution = {
  auth: PublicPortalAuthState;
  clearSession: boolean;
};

function anonymousAuth(applicationStatus?: "blocked"): PublicPortalAuthState {
  return {
    ...sessionToPublicAuth(null),
    applicationStatus: applicationStatus ?? null,
  };
}

export async function resolvePortalAuthState(session: PortalSession | null): Promise<PortalAuthResolution> {
  const auth = sessionToPublicAuth(session);
  if (!session) return { auth, clearSession: false };

  let registration: Awaited<ReturnType<typeof getExistingPortalRegistration>>;
  try {
    registration = await getExistingPortalRegistration(session.discordUser.id);
  } catch {
    return { auth, clearSession: false };
  }

  if (registration) {
    if (registration.applicationStatus === "blocked") {
      return { auth: anonymousAuth("blocked"), clearSession: true };
    }
    if (registration.applicationStatus === "revoked" && session.registeredAt) {
      return { auth: anonymousAuth(), clearSession: true };
    }
    if (registration.applicationStatus === "revoked") {
      return {
        auth: {
          ...auth,
          stage: "discord-authorized",
          registeredAt: null,
          registeredProfile: null,
          applicationStatus: null,
        },
        clearSession: false,
      };
    }

    return {
      auth: {
        ...auth,
        stage: "registered",
        registeredAt: registration.registeredAt,
        registeredProfile: registration.registeredProfile,
        applicationStatus: registration.applicationStatus,
      },
      clearSession: false,
    };
  }

  if (auth.stage === "registered") {
    return { auth: anonymousAuth(), clearSession: true };
  }

  return { auth, clearSession: false };
}
