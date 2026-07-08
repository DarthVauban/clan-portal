import "server-only";

type NotificationEventListener = () => void;

const notificationEventGlobal = globalThis as typeof globalThis & {
  __clanPortalNotificationListeners?: Set<NotificationEventListener>;
};

function getListeners() {
  notificationEventGlobal.__clanPortalNotificationListeners ??= new Set<NotificationEventListener>();
  return notificationEventGlobal.__clanPortalNotificationListeners;
}

export function subscribePortalNotificationEvents(listener: NotificationEventListener) {
  const listeners = getListeners();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitPortalNotificationChange() {
  for (const listener of [...getListeners()]) {
    try {
      listener();
    } catch {
      getListeners().delete(listener);
    }
  }
}
