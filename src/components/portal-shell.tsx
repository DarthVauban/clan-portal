"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Boxes,
  Calculator,
  ChevronDown,
  CircleUserRound,
  Database,
  HandCoins,
  Home,
  LockKeyhole,
  Menu,
  ScrollText,
  ShieldCheck,
  ShieldX,
  Sparkles,
  UserPlus,
  UsersRound,
  X,
} from "lucide-react";
import { useState } from "react";
import { findMembership, getPortalRole, hasAbsolutePortalRights, isPlayerRevoked, portalRoleLabels, useCollectiveStore } from "@/lib/collective-store";
import { LOCAL_PLAYER_ID, useLocalProfile } from "@/lib/profile-store";

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

function AccessDenied({ revoked = false }: { revoked?: boolean }) {
  return (
    <section className="portal-access-denied">
      <span><ShieldX size={28} /></span>
      <h1>{revoked ? "Доступ к порталу отозван" : "Раздел недоступен"}</h1>
      <p>{revoked ? "Профиль игрока был удалён администратором или лидером клана." : "Этот раздел доступен только игрокам, состоящим в одном из коллективов, а также администрации клана."}</p>
      {!revoked && <Link href="/collectives">Перейти к коллективам</Link>}
    </section>
  );
}

export function PortalShell({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const { profile } = useLocalProfile();
  const { state } = useCollectiveStore();
  const membership = findMembership(state, LOCAL_PLAYER_ID);
  const portalRole = getPortalRole(state, LOCAL_PLAYER_ID);
  const absoluteRights = hasAbsolutePortalRights(state, LOCAL_PLAYER_ID);
  const revoked = isPlayerRevoked(state, LOCAL_PLAYER_ID);
  const collectiveAccess = absoluteRights || Boolean(membership);
  const restrictedRoute = ["/resources", "/requests/resources", "/requests/crafting", "/craft-calculator"]
    .some((href) => pathname.startsWith(href));
  const initials = profile.displayName.trim().slice(0, 2).toLocaleUpperCase("ru") || "CP";

  const closeMenu = () => setMenuOpen(false);

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
            {primaryNavigation.map((item) => <NavLink key={item.href} {...item} locked={Boolean("restricted" in item && item.restricted && !collectiveAccess)} onNavigate={closeMenu} />)}
          </div>

          <div className="nav-group">
            <div className="nav-group-label">Заявки</div>
            {requestNavigation.map((item) => <NavLink key={item.href} {...item} locked={Boolean("restricted" in item && item.restricted && !collectiveAccess)} onNavigate={closeMenu} />)}
          </div>

          <div className="nav-group nav-group--last">
            <div className="nav-group-label">Инструменты</div>
            {utilityNavigation.map((item) => <NavLink key={item.href} {...item} locked={Boolean("restricted" in item && item.restricted && !collectiveAccess)} onNavigate={closeMenu} />)}
          </div>
        </nav>

        <div className="sidebar-status">
          <div className="status-icon"><ShieldCheck size={18} /></div>
          <div>
            <strong>{portalRoleLabels[portalRole]}</strong>
            <span>Версия 0.1</span>
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
            <button className="collective-switcher" type="button" aria-label="Выбранный коллектив">
              <span className="collective-symbol">{membership?.collective.tag?.slice(0, 1) || "—"}</span>
              <span className="collective-name">{membership?.collective.name ?? "Без коллектива"}</span>
              <ChevronDown size={16} />
            </button>
            <Link className="profile-chip" href="/profile" aria-label="Открыть профиль">
              <span>{initials}</span>
            </Link>
          </div>
        </header>

        <main className="main-content">{revoked ? <AccessDenied revoked /> : restrictedRoute && !collectiveAccess ? <AccessDenied /> : children}</main>
      </div>
    </div>
  );
}
