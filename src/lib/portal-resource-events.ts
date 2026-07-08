import "server-only";

type ResourceEventListener = () => void;

const resourceEventGlobal = globalThis as typeof globalThis & {
  __clanPortalResourceListeners?: Set<ResourceEventListener>;
};

function getListeners() {
  resourceEventGlobal.__clanPortalResourceListeners ??= new Set<ResourceEventListener>();
  return resourceEventGlobal.__clanPortalResourceListeners;
}

export function subscribePortalResourceEvents(listener: ResourceEventListener) {
  const listeners = getListeners();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitPortalResourceChange() {
  for (const listener of [...getListeners()]) {
    try {
      listener();
    } catch {
      getListeners().delete(listener);
    }
  }
}
