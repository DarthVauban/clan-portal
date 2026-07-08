import "server-only";

type RequestEventListener = () => void;

const requestEventGlobal = globalThis as typeof globalThis & {
  __clanPortalRequestListeners?: Set<RequestEventListener>;
};

function getListeners() {
  requestEventGlobal.__clanPortalRequestListeners ??= new Set<RequestEventListener>();
  return requestEventGlobal.__clanPortalRequestListeners;
}

export function subscribePortalRequestEvents(listener: RequestEventListener) {
  const listeners = getListeners();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitPortalRequestChange() {
  for (const listener of [...getListeners()]) {
    try {
      listener();
    } catch {
      listenersCleanup(listener);
    }
  }
}

function listenersCleanup(listener: RequestEventListener) {
  getListeners().delete(listener);
}
