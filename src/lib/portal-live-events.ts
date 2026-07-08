import "server-only";

type PortalStateListener = () => void;

const portalStateEventGlobal = globalThis as typeof globalThis & {
  __clanPortalStateListeners?: Set<PortalStateListener>;
};

function getListeners() {
  portalStateEventGlobal.__clanPortalStateListeners ??= new Set<PortalStateListener>();
  return portalStateEventGlobal.__clanPortalStateListeners;
}

export function subscribePortalStateEvents(listener: PortalStateListener) {
  const listeners = getListeners();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitPortalStateChange() {
  for (const listener of [...getListeners()]) {
    try {
      listener();
    } catch {
      getListeners().delete(listener);
    }
  }
}
