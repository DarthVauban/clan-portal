"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Boxes,
  Bell,
  Calculator,
  CheckCheck,
  Check,
  Database,
  Hammer,
  HandCoins,
  Home,
  LockKeyhole,
  LogOut,
  Menu,
  Newspaper,
  PencilLine,
  ScrollText,
  ShieldCheck,
  ShieldX,
  Sparkles,
  UserRound,
  UserPlus,
  UsersRound,
  Volume2,
  VolumeX,
  WifiOff,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AuthOnboarding } from "@/components/auth-onboarding";
import { LoadableImage } from "@/components/loadable-image";
import { applyCollectiveServerState, findMembership, getPortalRole, hasAbsolutePortalRights, isPlayerRevoked, portalRoleLabels, useCollectiveStore } from "@/lib/collective-store";
import { applyPortalAuthState, usePortalAuth } from "@/lib/auth-store";
import { DEFAULT_PORTAL_NAME, normalizePortalName } from "@/lib/portal-branding";
import { markAllPortalNotificationsRead, markPortalNotificationsRead, useNotificationStore, type PortalNotification } from "@/lib/notification-store";
import { hasCompletedRegistration, LOCAL_PLAYER_ID, useLocalProfile } from "@/lib/profile-store";
import { useRequestStore } from "@/lib/request-store";

const primaryNavigation = [
  { href: "/", label: "Обзор", icon: Home },
  { href: "/collectives", label: "Коллективы", icon: UsersRound },
  { href: "/items", label: "База предметов", icon: Database },
  { href: "/resources", label: "Ресурсы", icon: Boxes, restricted: true },
];

const requestNavigation = [
  { href: "/requests/membership", label: "Заявки на вступление", icon: UserPlus },
  { href: "/requests/resources", label: "На получение ресурсов", icon: HandCoins, restricted: true },
  { href: "/requests/crafting", label: "На крафт предметов", icon: Hammer, restricted: true },
  { href: "/requests/my-crafting", label: "Мои заявки", icon: ScrollText, restricted: true },
];

const utilityNavigation = [
  { href: "/audit-log", label: "Журнал учета", icon: ScrollText, restricted: true },
  { href: "/craft-calculator", label: "Калькулятор крафта", icon: Calculator, restricted: true },
  { href: "/blocked-users", label: "Заблокированные", icon: ShieldX, absoluteOnly: true },
];

const informationNavigation = [
  { href: "/patch-notes", label: "Патчноуты", icon: Newspaper },
];

function NavLink({ href, label, icon: Icon, onNavigate, locked = false, badgeCount, badgeFresh }: {
  href: string;
  label: string;
  icon: typeof Home;
  onNavigate: () => void;
  locked?: boolean;
  badgeCount?: number;
  badgeFresh?: boolean;
}) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
  const badge = typeof badgeCount === "number" && badgeCount > 0
    ? <em className={`nav-badge${badgeFresh ? " nav-badge--fresh" : ""}`}>{badgeCount > 99 ? "99+" : badgeCount}</em>
    : null;

  return locked ? (
    <span className="nav-link nav-link--locked" title="Доступно только участникам коллективов">
      <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
      <span>{label}</span>
      {badge}
      <LockKeyhole size={12} className="nav-lock" />
    </span>
  ) : (
    <Link className={`nav-link${active ? " nav-link--active" : ""}`} href={href} onClick={onNavigate}>
      <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
      <span>{label}</span>
      {badge}
      {active && <span className="nav-marker" />}
    </Link>
  );
}

function AccessDenied({ revoked = false, pendingApproval = false }: { revoked?: boolean; pendingApproval?: boolean }) {
  return (
    <section className="portal-access-denied">
      <span><ShieldX size={28} /></span>
      <h1>{revoked ? "Доступ к порталу отозван" : pendingApproval ? "Заявка ожидает принятия" : "Раздел недоступен"}</h1>
      <p>
        {revoked
          ? "Профиль игрока был удалён администратором или лидером клана."
          : pendingApproval
            ? "До принятия в коллектив доступны главная страница, заявка на вступление и патчноуты."
            : "Этот раздел доступен только игрокам, состоящим в одном из коллективов, а также администрации клана."}
      </p>
      {!revoked && <Link href={pendingApproval ? "/requests/membership" : "/collectives"}>{pendingApproval ? "Перейти к заявке" : "Перейти к коллективам"}</Link>}
    </section>
  );
}

function formatNotificationDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function NotificationItem({ notification, interactive, onRead }: { notification: PortalNotification; interactive: boolean; onRead: (id: string) => void }) {
  const content = (
    <>
      <strong>{notification.title}</strong>
      {notification.body && <span>{notification.body}</span>}
      <small>{notification.actor?.name ? `${notification.actor.name} · ` : ""}{formatNotificationDate(notification.createdAt)}</small>
    </>
  );

  if (!interactive || !notification.href) {
    return (
      <button type="button" className={`notification-item${notification.readAt ? "" : " notification-item--unread"}`} onClick={() => onRead(notification.id)}>
        {content}
      </button>
    );
  }

  return (
    <Link className={`notification-item${notification.readAt ? "" : " notification-item--unread"}`} href={notification.href} onClick={() => onRead(notification.id)}>
      {content}
    </Link>
  );
}

function NotificationMenu({ collectiveAccess }: { collectiveAccess: boolean }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const previousUnreadIds = useRef<Set<string> | null>(null);
  const { notifications } = useNotificationStore();
  const unreadCount = notifications.filter((notification) => !notification.readAt).length;
  const visibleNotifications = notifications
    .filter((notification) => filter === "all" || !notification.readAt)
    .slice(0, 12);
  const markRead = (id: string) => {
    void markPortalNotificationsRead([id]).catch(() => undefined);
    setOpen(false);
  };

  useEffect(() => {
    const stored = window.localStorage.getItem("clan-portal:notification-sound");
    if (stored !== "off") return;
    const timeout = window.setTimeout(() => setSoundEnabled(false), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [open]);

  useEffect(() => {
    const unreadIds = new Set(notifications.filter((notification) => !notification.readAt).map((notification) => notification.id));
    if (!previousUnreadIds.current) {
      previousUnreadIds.current = unreadIds;
      return;
    }
    const hasNewUnread = [...unreadIds].some((id) => !previousUnreadIds.current?.has(id));
    previousUnreadIds.current = unreadIds;
    if (!hasNewUnread || !soundEnabled) return;
    const audio = new Audio("/sounds/notification.mp3");
    audio.volume = 0.55;
    void audio.play().catch(() => undefined);
  }, [notifications, soundEnabled]);

  const toggleSound = () => {
    setSoundEnabled((current) => {
      const next = !current;
      window.localStorage.setItem("clan-portal:notification-sound", next ? "on" : "off");
      return next;
    });
  };

  return (
    <div className="notification-menu" ref={menuRef}>
      <button className="notification-button" type="button" onClick={() => setOpen((current) => !current)} aria-label="Уведомления">
        <Bell size={17} />
        {unreadCount > 0 && <span>{unreadCount > 99 ? "99+" : unreadCount}</span>}
      </button>
      {open && (
        <section className="notification-dropdown">
          <header>
            <strong>Уведомления</strong>
            <div>
              <button type="button" className="notification-sound" onClick={toggleSound} aria-label={soundEnabled ? "Отключить звук уведомлений" : "Включить звук уведомлений"} title={soundEnabled ? "Отключить звук" : "Включить звук"}>
                {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
              </button>
              <button type="button" onClick={() => void markAllPortalNotificationsRead().catch(() => undefined)} disabled={unreadCount === 0}>
                <CheckCheck size={14} /> Прочитать все
              </button>
            </div>
          </header>
          <div className="notification-filters" role="tablist" aria-label="Фильтр уведомлений">
            <button type="button" className={filter === "all" ? "notification-filter--active" : ""} onClick={() => setFilter("all")}>Все</button>
            <button type="button" className={filter === "unread" ? "notification-filter--active" : ""} onClick={() => setFilter("unread")}>Непрочитанные <span>{unreadCount}</span></button>
          </div>
          <div className="notification-list">
            {visibleNotifications.length > 0 ? visibleNotifications.map((notification) => (
              <NotificationItem notification={notification} interactive={collectiveAccess} onRead={markRead} key={notification.id} />
            )) : <p>{filter === "unread" ? "Все уведомления прочитаны" : "Уведомлений пока нет"}</p>}
          </div>
        </section>
      )}
    </div>
  );
}

type RequestBadgeKey = "membership" | "resources" | "crafting";
type SeenRequestCounts = Record<RequestBadgeKey, number>;

const NAV_SEEN_STORAGE_KEY = "clan-portal:seen-request-nav-counts";
const emptySeenRequestCounts: SeenRequestCounts = { membership: 0, resources: 0, crafting: 0 };
const requestBadgeByHref: Record<string, RequestBadgeKey | undefined> = {
  "/requests/membership": "membership",
  "/requests/resources": "resources",
  "/requests/crafting": "crafting",
};

function normalizeSeenRequestCounts(value: unknown): SeenRequestCounts {
  if (!value || typeof value !== "object") return emptySeenRequestCounts;
  const counts = value as Partial<SeenRequestCounts>;
  return {
    membership: typeof counts.membership === "number" ? Math.max(0, counts.membership) : 0,
    resources: typeof counts.resources === "number" ? Math.max(0, counts.resources) : 0,
    crafting: typeof counts.crafting === "number" ? Math.max(0, counts.crafting) : 0,
  };
}

function readSeenRequestCounts() {
  if (typeof window === "undefined") return emptySeenRequestCounts;
  try {
    return normalizeSeenRequestCounts(JSON.parse(window.localStorage.getItem(NAV_SEEN_STORAGE_KEY) ?? "{}"));
  } catch {
    return emptySeenRequestCounts;
  }
}

function normalizeApplicantCount(value: unknown, assignedPlayerIds: Set<string>) {
  if (!value || typeof value !== "object") return 0;
  const applicants = (value as { applicants?: unknown }).applicants;
  if (!Array.isArray(applicants)) return 0;
  return applicants.filter((applicant) => (
    applicant
    && typeof applicant === "object"
    && typeof (applicant as { id?: unknown }).id === "string"
    && !assignedPlayerIds.has((applicant as { id: string }).id)
  )).length;
}

export function PortalShell({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [editingPortalName, setEditingPortalName] = useState(false);
  const [portalNameDraft, setPortalNameDraft] = useState(DEFAULT_PORTAL_NAME);
  const [pendingRoute, setPendingRoute] = useState<string | null>(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [membershipRequestCount, setMembershipRequestCount] = useState(0);
  const [liveConnection, setLiveConnection] = useState<"connecting" | "online" | "offline">("connecting");
  const [seenRequestCounts, setSeenRequestCounts] = useState<SeenRequestCounts>(() => readSeenRequestCounts());
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const { profile, updateProfile } = useLocalProfile();
  const { auth, loading, logout } = usePortalAuth();
  const { state, updateState } = useCollectiveStore();
  const { state: requestState } = useRequestStore();
  const registrationComplete = auth.stage === "registered" && (hasCompletedRegistration(profile) || Boolean(auth.registeredProfile));
  const localPortalRole = state.portalRoles[LOCAL_PLAYER_ID];
  const portalName = normalizePortalName(state.portalName);
  const membership = findMembership(state, LOCAL_PLAYER_ID);
  const portalRole = auth.isPortalAdmin ? "administrator" : getPortalRole(state, LOCAL_PLAYER_ID);
  const absoluteRights = auth.isPortalAdmin || hasAbsolutePortalRights(state, LOCAL_PLAYER_ID);
  const revoked = isPlayerRevoked(state, LOCAL_PLAYER_ID);
  const collectiveAccess = absoluteRights || Boolean(membership);
  const canRenamePortal = absoluteRights && auth.stage === "registered";
  const pendingAllowedRoute = pathname === "/" || pathname.startsWith("/requests/membership") || pathname.startsWith("/patch-notes");
  const pendingRestrictedRoute = !collectiveAccess && !pendingAllowedRoute;
  const visiblePrimaryNavigation = collectiveAccess ? primaryNavigation : primaryNavigation.filter((item) => item.href === "/");
  const visibleRequestNavigation = collectiveAccess ? requestNavigation : requestNavigation.filter((item) => item.href === "/requests/membership");
  const visibleUtilityNavigation = collectiveAccess ? utilityNavigation.filter((item) => item.href !== "/profile" && (!("absoluteOnly" in item) || !item.absoluteOnly || absoluteRights)) : [];
  const assignedPlayerIds = useMemo(() => new Set(state.collectives.flatMap((collective) => collective.members.map((member) => member.playerId))), [state.collectives]);
  const blockedUsersRestrictedRoute = pathname.startsWith("/blocked-users") && !absoluteRights;
  const profileName = profile.displayName.trim() || auth.discordNickname || "Профиль";
  const waitingLabel = auth.applicationStatus === "accepted" ? "Без коллектива" : "Ожидает принятия";
  const waitingCaption = auth.applicationStatus === "accepted" ? "Ожидает распределения" : "Заявка на вступление";
  const blockedAuth = auth.applicationStatus === "blocked" || authError === "blocked";
  const resourceRequestCount = useMemo(() => requestState.resourceRequests.filter((request) => (
    request.status === "pending" || request.status === "approved" || request.status === "issued"
  )).length, [requestState.resourceRequests]);
  const craftRequestCount = useMemo(() => requestState.craftRequests.filter((request) => (
    !request.executor && (request.status === "pending" || request.status === "approved")
  )).length, [requestState.craftRequests]);
  const requestBadgeCounts: SeenRequestCounts = {
    membership: membershipRequestCount,
    resources: resourceRequestCount,
    crafting: craftRequestCount,
  };
  const loadMembershipRequestCount = useCallback(async () => {
    if (auth.stage === "anonymous") {
      setMembershipRequestCount(0);
      return;
    }
    const response = await fetch("/api/membership/applicants", {
      headers: { Accept: "application/json" },
      cache: "no-store",
    }).catch(() => null);
    if (!response?.ok) {
      setMembershipRequestCount(0);
      return;
    }
    setMembershipRequestCount(normalizeApplicantCount(await response.json().catch(() => null), assignedPlayerIds));
  }, [assignedPlayerIds, auth.stage]);

  useEffect(() => {
    if (!auth.isPortalAdmin || localPortalRole === "administrator") return;
    updateState((current) => ({
      ...current,
      portalRoles: {
        ...current.portalRoles,
        [LOCAL_PLAYER_ID]: "administrator",
      },
    }));
  }, [auth.isPortalAdmin, localPortalRole, updateState]);

  useEffect(() => {
    queueMicrotask(() => {
      setAuthError(new URLSearchParams(window.location.search).get("auth_error"));
    });
  }, [pathname]);

  useEffect(() => {
    if (auth.stage === "anonymous") return;
    const timeout = window.setTimeout(() => void loadMembershipRequestCount(), 0);
    window.addEventListener("focus", loadMembershipRequestCount);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("focus", loadMembershipRequestCount);
    };
  }, [auth.stage, auth.discordId, pathname, loadMembershipRequestCount]);

  useEffect(() => {
    const viewedKey = Object.entries(requestBadgeByHref).find(([href]) => pathname.startsWith(href))?.[1];
    if (!viewedKey) return;
    const viewedCount = viewedKey === "membership" ? membershipRequestCount : viewedKey === "resources" ? resourceRequestCount : craftRequestCount;
    const timeout = window.setTimeout(() => {
      setSeenRequestCounts((current) => {
        const next = { ...current, [viewedKey]: viewedCount };
        window.localStorage.setItem(NAV_SEEN_STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [pathname, membershipRequestCount, resourceRequestCount, craftRequestCount]);

  useEffect(() => {
    if (!profileMenuOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (profileMenuRef.current?.contains(event.target as Node)) return;
      setProfileMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [profileMenuOpen]);

  useEffect(() => {
    const handleNavigationClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      const nextUrl = new URL(anchor.href);
      if (nextUrl.origin !== window.location.origin) return;
      const nextRoute = `${nextUrl.pathname}${nextUrl.search}`;
      const currentRoute = `${window.location.pathname}${window.location.search}`;
      if (nextRoute === currentRoute) return;
      setPendingRoute(nextRoute);
    };

    document.addEventListener("click", handleNavigationClick, true);
    return () => document.removeEventListener("click", handleNavigationClick, true);
  }, []);

  useEffect(() => {
    if (!pendingRoute) return;
    const currentRoute = `${window.location.pathname}${window.location.search}`;
    if (pendingRoute !== currentRoute) return;
    const timeout = window.setTimeout(() => setPendingRoute(null), 220);
    return () => window.clearTimeout(timeout);
  }, [pathname, pendingRoute]);

  useEffect(() => {
    if (!pendingRoute) return;
    const timeout = window.setTimeout(() => setPendingRoute(null), 10000);
    return () => window.clearTimeout(timeout);
  }, [pendingRoute]);

  useEffect(() => {
    if (hasCompletedRegistration(profile) || !auth.registeredProfile) return;
    const characterId = profile.mainCharacterId ?? profile.characters[0]?.id ?? "server-main-character";
    updateProfile((current) => ({
      ...current,
      displayName: auth.registeredProfile?.displayName ?? current.displayName,
      mainCharacterId: characterId,
      joinedAt: current.joinedAt || new Date().toISOString().slice(0, 10),
      characters: [
        {
          id: characterId,
          name: auth.registeredProfile?.characterName ?? "",
          classSlug: auth.registeredProfile?.classSlug ?? null,
          confirmed: true,
        },
        ...current.characters.filter((character) => character.id !== characterId),
      ],
    }));
  }, [auth.registeredProfile, profile, updateProfile]);

  useEffect(() => {
    if (!registrationComplete) return;
    const mainCharacter = profile.characters.find((character) => character.id === profile.mainCharacterId)
      ?? profile.characters.find((character) => character.confirmed);
    if (!mainCharacter?.classSlug || !mainCharacter.name.trim() || !profile.displayName.trim()) return;

    void fetch("/api/auth/register", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        profileName: profile.displayName.trim(),
        characterName: mainCharacter.name.trim(),
        classSlug: mainCharacter.classSlug,
      }),
    }).catch(() => undefined);
  }, [profile.characters, profile.displayName, profile.mainCharacterId, registrationComplete]);

  useEffect(() => {
    if (auth.stage === "anonymous") return;
    if (typeof EventSource === "undefined") {
      return;
    }
    const events = new EventSource("/api/portal/events");
    const handleOpen = () => setLiveConnection("online");
    const handleError = () => setLiveConnection(navigator.onLine ? "connecting" : "offline");
    const handleOffline = () => setLiveConnection("offline");
    const handleOnline = () => setLiveConnection("connecting");
    const applyPortalState = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as { auth?: unknown; collectiveState?: unknown };
        if (payload.auth) applyPortalAuthState(payload.auth);
        if (payload.collectiveState) applyCollectiveServerState(payload.collectiveState);
        void loadMembershipRequestCount();
      } catch {
        // Ignore malformed stream payloads; the EventSource connection will keep listening.
      }
    };
    events.addEventListener("open", handleOpen);
    events.addEventListener("error", handleError);
    events.addEventListener("portal-state", applyPortalState);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      events.removeEventListener("open", handleOpen);
      events.removeEventListener("error", handleError);
      events.removeEventListener("portal-state", applyPortalState);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      events.close();
    };
  }, [auth.stage, loadMembershipRequestCount]);

  const closeMenu = () => setMenuOpen(false);
  const savePortalName = () => {
    if (!canRenamePortal) return;
    const nextName = normalizePortalName(portalNameDraft);
    updateState((current) => ({ ...current, portalName: nextName }));
    setPortalNameDraft(nextName);
    setEditingPortalName(false);
  };
  const handlePortalNameSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    savePortalName();
  };
  const handlePortalNameKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Escape") return;
    setPortalNameDraft(portalName);
    setEditingPortalName(false);
  };
  const handleLogout = async () => {
    await logout().catch(() => undefined);
    closeMenu();
    router.replace("/");
  };

  if (loading) {
    return (
      <main className="auth-gate" data-testid="auth-loading">
        <section className="auth-card auth-card--welcome">
          <div className="eyebrow">{portalName}</div>
          <h1>Проверяем авторизацию</h1>
          <p>Секунду, сверяем Discord-сессию и готовим портал.</p>
        </section>
      </main>
    );
  }

  if (auth.stage === "anonymous") return <AuthOnboarding mode={blockedAuth ? "blocked" : "welcome"} />;
  if (!registrationComplete) return <AuthOnboarding mode="registration" />;

  return (
    <div className="portal-shell">
      <button
        className={`sidebar-backdrop${menuOpen ? " sidebar-backdrop--visible" : ""}`}
        aria-label="Закрыть меню"
        onClick={closeMenu}
      />

      <aside className={`sidebar${menuOpen ? " sidebar--open" : ""}`}>
        <div className="brand">
          <div className="brand-emblem">
            <LoadableImage src="/clan-logo.png" alt="Эмблема клана" width={58} height={58} priority />
          </div>
          <div className="brand-copy">
            {editingPortalName && canRenamePortal ? (
              <form className="brand-name-form" onSubmit={handlePortalNameSubmit}>
                <input
                  type="text"
                  value={portalNameDraft}
                  onChange={(event) => setPortalNameDraft(event.target.value)}
                  onKeyDown={handlePortalNameKeyDown}
                  onBlur={savePortalName}
                  maxLength={48}
                  aria-label="Название портала"
                  autoFocus
                />
                <button type="submit" aria-label="Сохранить название портала"><Check size={14} /></button>
              </form>
            ) : canRenamePortal ? (
              <button
                className="brand-name brand-name--editable"
                type="button"
                onClick={() => {
                  setPortalNameDraft(portalName);
                  setEditingPortalName(true);
                }}
                aria-label="Изменить название портала"
              >
                <span>{portalName}</span>
                <PencilLine size={12} />
              </button>
            ) : (
              <div className="brand-name">{portalName}</div>
            )}
            <div className="brand-caption">Сообщество Corepunk</div>
          </div>
          <button className="sidebar-close" onClick={closeMenu} aria-label="Закрыть меню">
            <X size={20} />
          </button>
        </div>

        <nav className="navigation" aria-label="Основная навигация">
          <div className="nav-group">
            <div className="nav-group-label">Клан</div>
            {visiblePrimaryNavigation.map((item) => <NavLink key={item.href} {...item} locked={Boolean("restricted" in item && item.restricted && !collectiveAccess)} onNavigate={closeMenu} />)}
          </div>

          <div className="nav-group">
            <div className="nav-group-label">Заявки</div>
            {visibleRequestNavigation.map((item) => {
              const badgeKey = requestBadgeByHref[item.href];
              const badgeCount = badgeKey ? requestBadgeCounts[badgeKey] : undefined;
              return (
                <NavLink
                  key={item.href}
                  {...item}
                  badgeCount={badgeCount}
                  badgeFresh={Boolean(badgeKey && badgeCount && badgeCount > seenRequestCounts[badgeKey])}
                  locked={Boolean("restricted" in item && item.restricted && !collectiveAccess)}
                  onNavigate={closeMenu}
                />
              );
            })}
          </div>

          <div className="nav-group">
            <div className="nav-group-label">Информация</div>
            {informationNavigation.map((item) => <NavLink key={item.href} {...item} onNavigate={closeMenu} />)}
          </div>

          {visibleUtilityNavigation.length > 0 && (
            <div className="nav-group nav-group--last">
              <div className="nav-group-label">Инструменты</div>
              {visibleUtilityNavigation.map((item) => <NavLink key={item.href} {...item} locked={Boolean("restricted" in item && item.restricted && !collectiveAccess)} onNavigate={closeMenu} />)}
            </div>
          )}
        </nav>

        {collectiveAccess ? (
          <div className="sidebar-profile-menu" ref={profileMenuRef}>
            <button className="sidebar-status sidebar-status--profile" type="button" onClick={() => setProfileMenuOpen((current) => !current)} aria-label="Открыть меню профиля">
              <div className="status-icon"><ShieldCheck size={18} /></div>
              <div>
                <strong>{profileName}</strong>
                <span>{portalRoleLabels[portalRole]}</span>
              </div>
              <Sparkles size={15} className="status-spark" />
            </button>
            {profileMenuOpen && (
              <div className="sidebar-profile-dropdown">
                <Link href="/profile" onClick={() => { setProfileMenuOpen(false); closeMenu(); }}>
                  <UserRound size={14} /> Профиль
                </Link>
                <button type="button" onClick={handleLogout}>
                  <LogOut size={14} /> Выйти
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="sidebar-status">
            <div className="status-icon"><ShieldCheck size={18} /></div>
            <div>
              <strong>{waitingLabel}</strong>
              <span>{waitingCaption}</span>
            </div>
            <Sparkles size={15} className="status-spark" />
          </div>
        )}
      </aside>

      <div className="content-column">
        <header className="topbar">
          <button className="menu-button" onClick={() => setMenuOpen(true)} aria-label="Открыть меню">
            <Menu size={21} />
          </button>
          <div className="topbar-actions">
            <NotificationMenu collectiveAccess={collectiveAccess} />
          </div>
        </header>

        <main className="main-content">
          {pendingRoute && <div className="route-loader" role="status">Открываем раздел</div>}
          {liveConnection !== "online" && (
            <div className="connection-banner" data-state={liveConnection} role="status">
              <WifiOff size={16} />
              <div>
                <strong>{liveConnection === "offline" ? "Нет соединения с порталом" : "Восстанавливаем обновления в реальном времени"}</strong>
                <span>{liveConnection === "offline" ? "Показаны последние сохранённые данные. Изменения лучше вносить после восстановления связи." : "Данные на экране доступны, соединение будет восстановлено автоматически."}</span>
              </div>
            </div>
          )}
          {revoked ? <AccessDenied revoked /> : blockedUsersRestrictedRoute ? <AccessDenied /> : pendingRestrictedRoute ? <AccessDenied pendingApproval /> : children}
        </main>
      </div>
    </div>
  );
}
