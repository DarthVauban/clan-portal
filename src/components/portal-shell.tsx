"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Boxes,
  Bell,
  Calculator,
  CheckCheck,
  Check,
  ChevronDown,
  Database,
  Hammer,
  HandCoins,
  Home,
  LockKeyhole,
  LogOut,
  Menu,
  PencilLine,
  ScrollText,
  ShieldCheck,
  ShieldX,
  Sparkles,
  UserPlus,
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { LoadableImage } from "@/components/loadable-image";
import { applyCollectiveServerState, findMembership, getPortalRole, hasAbsolutePortalRights, isPlayerRevoked, portalRoleLabels, useCollectiveStore } from "@/lib/collective-store";
import { applyPortalAuthState, usePortalAuth } from "@/lib/auth-store";
import { DEFAULT_PORTAL_NAME, normalizePortalName } from "@/lib/portal-branding";
import { markAllPortalNotificationsRead, markPortalNotificationsRead, useNotificationStore, type PortalNotification } from "@/lib/notification-store";
import { hasCompletedRegistration, LOCAL_PLAYER_ID, useLocalProfile } from "@/lib/profile-store";

const AuthOnboarding = dynamic(
  () => import("@/components/auth-onboarding").then((module) => module.AuthOnboarding),
  { loading: () => null },
);

const primaryNavigation = [
  { href: "/", label: "Обзор", icon: Home },
  { href: "/collectives", label: "Коллективы", icon: UsersRound },
  { href: "/items", label: "База предметов", icon: Database },
  { href: "/resources", label: "Ресурсы", icon: Boxes, restricted: true },
];

const requestNavigation = [
  { href: "/requests/membership", label: "Заявки на вступление", icon: UserPlus },
  { href: "/requests/resources", label: "На получение ресурсов", icon: HandCoins, restricted: true },
  { href: "/requests/crafting", label: "На крафт предметов", icon: ScrollText, restricted: true },
  { href: "/requests/my-crafting", label: "Мои заявки", icon: Hammer, restricted: true },
];

const utilityNavigation = [
  { href: "/audit-log", label: "Журнал учета", icon: ScrollText, restricted: true },
  { href: "/craft-calculator", label: "Калькулятор крафта", icon: Calculator, restricted: true },
  { href: "/blocked-users", label: "Заблокированные", icon: ShieldX, absoluteOnly: true },
];

function NavLink({ href, label, icon: Icon, onNavigate, locked = false }: {
  href: string;
  label: string;
  icon: typeof Home;
  onNavigate: () => void;
  locked?: boolean;
}) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);

  return locked ? (
    <span className="nav-link nav-link--locked" title="Доступно только участникам коллективов">
      <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
      <span>{label}</span>
      <LockKeyhole size={12} className="nav-lock" />
    </span>
  ) : (
    <Link className={`nav-link${active ? " nav-link--active" : ""}`} href={href} onClick={onNavigate}>
      <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
      <span>{label}</span>
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
            ? "До принятия в коллектив доступны только главная страница и раздел заявки на вступление."
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
      <small>{formatNotificationDate(notification.createdAt)}</small>
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
  const { notifications } = useNotificationStore();
  const unreadCount = notifications.filter((notification) => !notification.readAt).length;
  const visibleNotifications = notifications.slice(0, 7);
  const markRead = (id: string) => {
    void markPortalNotificationsRead([id]).catch(() => undefined);
    setOpen(false);
  };

  return (
    <div className="notification-menu">
      <button className="notification-button" type="button" onClick={() => setOpen((current) => !current)} aria-label="Уведомления">
        <Bell size={17} />
        {unreadCount > 0 && <span>{unreadCount > 99 ? "99+" : unreadCount}</span>}
      </button>
      {open && (
        <section className="notification-dropdown">
          <header>
            <strong>Уведомления</strong>
            <button type="button" onClick={() => void markAllPortalNotificationsRead().catch(() => undefined)} disabled={unreadCount === 0}>
              <CheckCheck size={14} /> Прочитать все
            </button>
          </header>
          <div>
            {visibleNotifications.length > 0 ? visibleNotifications.map((notification) => (
              <NotificationItem notification={notification} interactive={collectiveAccess} onRead={markRead} key={notification.id} />
            )) : <p>Новых уведомлений нет</p>}
          </div>
        </section>
      )}
    </div>
  );
}

export function PortalShell({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [editingPortalName, setEditingPortalName] = useState(false);
  const [portalNameDraft, setPortalNameDraft] = useState(DEFAULT_PORTAL_NAME);
  const [pendingRoute, setPendingRoute] = useState<string | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const { profile, updateProfile } = useLocalProfile();
  const { auth, loading, logout } = usePortalAuth();
  const { state, updateState } = useCollectiveStore();
  const registrationComplete = auth.stage === "registered" && (hasCompletedRegistration(profile) || Boolean(auth.registeredProfile));
  const localPortalRole = state.portalRoles[LOCAL_PLAYER_ID];
  const portalName = normalizePortalName(state.portalName);
  const membership = findMembership(state, LOCAL_PLAYER_ID);
  const portalRole = auth.isPortalAdmin ? "administrator" : getPortalRole(state, LOCAL_PLAYER_ID);
  const absoluteRights = auth.isPortalAdmin || hasAbsolutePortalRights(state, LOCAL_PLAYER_ID);
  const revoked = isPlayerRevoked(state, LOCAL_PLAYER_ID);
  const collectiveAccess = absoluteRights || Boolean(membership);
  const canRenamePortal = absoluteRights && auth.stage === "registered";
  const pendingAllowedRoute = pathname === "/" || pathname.startsWith("/requests/membership");
  const pendingRestrictedRoute = !collectiveAccess && !pendingAllowedRoute;
  const visiblePrimaryNavigation = collectiveAccess ? primaryNavigation : primaryNavigation.filter((item) => item.href === "/");
  const visibleRequestNavigation = collectiveAccess ? requestNavigation : requestNavigation.filter((item) => item.href === "/requests/membership");
  const visibleUtilityNavigation = collectiveAccess ? utilityNavigation.filter((item) => item.href !== "/profile" && (!("absoluteOnly" in item) || !item.absoluteOnly || absoluteRights)) : [];
  const blockedUsersRestrictedRoute = pathname.startsWith("/blocked-users") && !absoluteRights;
  const initials = profile.displayName.trim().slice(0, 2).toLocaleUpperCase("ru") || "CP";
  const profileName = profile.displayName.trim() || auth.discordNickname || "Профиль";
  const waitingLabel = auth.applicationStatus === "accepted" ? "Без коллектива" : "Ожидает принятия";
  const waitingCaption = auth.applicationStatus === "accepted" ? "Ожидает распределения" : "Заявка на вступление";
  const blockedAuth = auth.applicationStatus === "blocked" || authError === "blocked";

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
    if (typeof EventSource === "undefined") return;
    const events = new EventSource("/api/portal/events");
    const applyPortalState = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as { auth?: unknown; collectiveState?: unknown };
        if (payload.auth) applyPortalAuthState(payload.auth);
        if (payload.collectiveState) applyCollectiveServerState(payload.collectiveState);
      } catch {
        // Ignore malformed stream payloads; the EventSource connection will keep listening.
      }
    };
    events.addEventListener("portal-state", applyPortalState);
    return () => {
      events.removeEventListener("portal-state", applyPortalState);
      events.close();
    };
  }, [auth.stage]);

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
            {visibleRequestNavigation.map((item) => <NavLink key={item.href} {...item} locked={Boolean("restricted" in item && item.restricted && !collectiveAccess)} onNavigate={closeMenu} />)}
          </div>

          {visibleUtilityNavigation.length > 0 && (
            <div className="nav-group nav-group--last">
              <div className="nav-group-label">Инструменты</div>
              {visibleUtilityNavigation.map((item) => <NavLink key={item.href} {...item} locked={Boolean("restricted" in item && item.restricted && !collectiveAccess)} onNavigate={closeMenu} />)}
            </div>
          )}
        </nav>

        {collectiveAccess ? (
          <Link className="sidebar-status sidebar-status--profile" href="/profile" onClick={closeMenu} aria-label="Открыть профиль">
            <div className="status-icon"><ShieldCheck size={18} /></div>
            <div>
              <strong>{profileName}</strong>
              <span>{portalRoleLabels[portalRole]}</span>
            </div>
            <Sparkles size={15} className="status-spark" />
          </Link>
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
          <div className="topbar-breadcrumb">
            <span className="online-dot" />
            Единое пространство клана
          </div>
          <div className="topbar-actions">
            <NotificationMenu collectiveAccess={collectiveAccess} />
            <button className="logout-button" type="button" onClick={handleLogout} aria-label="Выйти из портала">
              <LogOut size={16} />
              <span>Выйти</span>
            </button>
            <button className="collective-switcher" type="button" aria-label="Выбранный коллектив">
              <span className="collective-symbol">{membership?.collective.tag?.slice(0, 1) || "—"}</span>
              <span className="collective-name">{membership?.collective.name ?? waitingLabel}</span>
              <ChevronDown size={16} />
            </button>
            {collectiveAccess ? (
              <Link className="profile-chip" href="/profile" aria-label="Открыть профиль">
                <span>{initials}</span>
              </Link>
            ) : (
              <span className="profile-chip profile-chip--disabled" aria-label="Профиль будет доступен после принятия">
                <span>{initials}</span>
              </span>
            )}
          </div>
        </header>

        <main className="main-content">
          {pendingRoute && <div className="route-loader" role="status">Открываем раздел</div>}
          {revoked ? <AccessDenied revoked /> : blockedUsersRestrictedRoute ? <AccessDenied /> : pendingRestrictedRoute ? <AccessDenied pendingApproval /> : children}
        </main>
      </div>
    </div>
  );
}
