"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Boxes,
  Calculator,
  ChevronDown,
  CircleUserRound,
  Database,
  DoorOpen,
  HandCoins,
  Home,
  LockKeyhole,
  LogOut,
  Menu,
  ScrollText,
  ShieldCheck,
  ShieldX,
  Sparkles,
  UserPlus,
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { AuthOnboarding } from "@/components/auth-onboarding";
import { findMembership, getPortalRole, hasAbsolutePortalRights, isPlayerRevoked, portalRoleLabels, refreshCollectiveStore, useCollectiveStore } from "@/lib/collective-store";
import { usePortalAuth } from "@/lib/auth-store";
import { hasCompletedRegistration, LOCAL_PLAYER_ID, useLocalProfile } from "@/lib/profile-store";

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
];

const utilityNavigation = [
  { href: "/craft-calculator", label: "Калькулятор крафта", icon: Calculator, restricted: true },
  { href: "/blocked-users", label: "Заблокированные", icon: ShieldX, absoluteOnly: true },
  { href: "/profile", label: "Мой профиль", icon: CircleUserRound },
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

export function PortalShell({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [leavingCollective, setLeavingCollective] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { profile, updateProfile } = useLocalProfile();
  const { auth, loading, logout } = usePortalAuth();
  const { state, updateState } = useCollectiveStore();
  const registrationComplete = auth.stage === "registered" && (hasCompletedRegistration(profile) || Boolean(auth.registeredProfile));
  const localPortalRole = state.portalRoles[LOCAL_PLAYER_ID];

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

  if (loading) {
    return (
      <main className="auth-gate" data-testid="auth-loading">
        <section className="auth-card auth-card--welcome">
          <div className="eyebrow">Clan Portal</div>
          <h1>Проверяем авторизацию</h1>
          <p>Секунду, сверяем Discord-сессию и готовим портал.</p>
        </section>
      </main>
    );
  }

  if (auth.stage === "anonymous") return <AuthOnboarding mode="welcome" />;
  if (!registrationComplete) return <AuthOnboarding mode="registration" />;

  const membership = findMembership(state, LOCAL_PLAYER_ID);
  const portalRole = auth.isPortalAdmin ? "administrator" : getPortalRole(state, LOCAL_PLAYER_ID);
  const absoluteRights = auth.isPortalAdmin || hasAbsolutePortalRights(state, LOCAL_PLAYER_ID);
  const revoked = isPlayerRevoked(state, LOCAL_PLAYER_ID);
  const collectiveAccess = absoluteRights || Boolean(membership);
  const canLeaveCollective = Boolean(membership && (membership.member.role !== "leader" || membership.collective.members.length <= 1));
  const pendingAllowedRoute = pathname === "/" || pathname.startsWith("/requests/membership");
  const pendingRestrictedRoute = !collectiveAccess && !pendingAllowedRoute;
  const visiblePrimaryNavigation = collectiveAccess ? primaryNavigation : primaryNavigation.filter((item) => item.href === "/");
  const visibleRequestNavigation = collectiveAccess ? requestNavigation : requestNavigation.filter((item) => item.href === "/requests/membership");
  const visibleUtilityNavigation = collectiveAccess ? utilityNavigation.filter((item) => !("absoluteOnly" in item) || !item.absoluteOnly || absoluteRights) : [];
  const blockedUsersRestrictedRoute = pathname.startsWith("/blocked-users") && !absoluteRights;
  const initials = profile.displayName.trim().slice(0, 2).toLocaleUpperCase("ru") || "CP";
  const waitingLabel = auth.applicationStatus === "accepted" ? "Без коллектива" : "Ожидает принятия";
  const waitingCaption = auth.applicationStatus === "accepted" ? "Ожидает распределения" : "Заявка на вступление";

  const closeMenu = () => setMenuOpen(false);
  const handleLeaveCollective = async () => {
    if (!canLeaveCollective || leavingCollective) return;
    setLeavingCollective(true);
    const response = await fetch("/api/collectives/leave", {
      method: "POST",
      headers: { Accept: "application/json" },
    }).catch(() => null);
    if (response?.ok) {
      await refreshCollectiveStore().catch(() => undefined);
      closeMenu();
      router.replace("/requests/membership");
    }
    setLeavingCollective(false);
  };
  const handleLogout = async () => {
    await logout().catch(() => undefined);
    closeMenu();
    router.replace("/");
  };

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
            <Image src="/clan-logo.png" alt="Эмблема клана" width={56} height={64} priority />
          </div>
          <div>
            <div className="brand-name">Clan Portal</div>
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

        <div className="sidebar-status">
          <div className="status-icon"><ShieldCheck size={18} /></div>
          <div>
            <strong>{collectiveAccess ? portalRoleLabels[portalRole] : waitingLabel}</strong>
            <span>{collectiveAccess ? "Версия 0.1" : waitingCaption}</span>
          </div>
          <Sparkles size={15} className="status-spark" />
        </div>
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
            {canLeaveCollective && (
              <button className="leave-collective-button" type="button" onClick={handleLeaveCollective} disabled={leavingCollective} aria-label="Покинуть коллектив">
                <DoorOpen size={16} />
                <span>Покинуть</span>
              </button>
            )}
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

        <main className="main-content">{revoked ? <AccessDenied revoked /> : blockedUsersRestrictedRoute ? <AccessDenied /> : pendingRestrictedRoute ? <AccessDenied pendingApproval /> : children}</main>
      </div>
    </div>
  );
}
