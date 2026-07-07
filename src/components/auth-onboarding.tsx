"use client";

import { LoadableImage } from "@/components/loadable-image";
import { useRouter } from "next/navigation";
import { Check, LockKeyhole, MessageCircle, ShieldCheck, ShieldX, Sparkles, UserRound } from "lucide-react";
import { useMemo, useState } from "react";
import { corepunkClasses } from "@/lib/corepunk-classes";
import { findMembership, useCollectiveStore } from "@/lib/collective-store";
import { usePortalAuth } from "@/lib/auth-store";
import { normalizePortalName } from "@/lib/portal-branding";
import { LOCAL_PLAYER_ID, type PlayerCharacter, useLocalProfile } from "@/lib/profile-store";

function makeCharacterId() {
  return `character-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function AuthOnboarding({ mode }: { mode: "welcome" | "registration" | "blocked" }) {
  const router = useRouter();
  const { auth, completeRegistration, loginWithDiscord } = usePortalAuth();
  const { profile, updateProfile } = useLocalProfile();
  const { state, updateState } = useCollectiveStore();
  const portalName = normalizePortalName(state.portalName);
  const currentMainCharacter = useMemo(
    () => profile.characters.find((character) => character.id === profile.mainCharacterId) ?? profile.characters[0],
    [profile.characters, profile.mainCharacterId],
  );
  const [profileName, setProfileName] = useState(profile.displayName || auth.discordNickname || "");
  const [characterName, setCharacterName] = useState(currentMainCharacter?.name ?? "");
  const [classSlug, setClassSlug] = useState(currentMainCharacter?.classSlug ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const canSubmit = Boolean(profileName.trim() && characterName.trim() && classSlug) && !submitting;

  const connectDiscord = () => {
    loginWithDiscord();
  };

  const finishRegistration = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setFormError(null);
    const characterId = currentMainCharacter?.id ?? makeCharacterId();
    const character: PlayerCharacter = {
      id: characterId,
      name: characterName.trim(),
      classSlug,
      confirmed: true,
    };

    updateProfile((current) => ({
      ...current,
      displayName: profileName.trim(),
      mainCharacterId: characterId,
      characters: [
        character,
        ...current.characters.filter((item) => item.id !== characterId),
      ],
    }));
    updateState((current) => {
      const membership = findMembership(current, LOCAL_PLAYER_ID);
      return {
        ...current,
        portalRoles: {
          ...current.portalRoles,
          [LOCAL_PLAYER_ID]: auth.isPortalAdmin ? "administrator" : membership ? current.portalRoles[LOCAL_PLAYER_ID] ?? "member" : "member",
        },
      };
    });
    try {
      await completeRegistration({
        profileName: profileName.trim(),
        characterName: characterName.trim(),
        classSlug,
      });
      router.replace("/requests/membership");
    } catch {
      setFormError("Сессия Discord не найдена. Авторизуйтесь через Discord еще раз.");
      setSubmitting(false);
    }
  };

  if (mode === "blocked") {
    return (
      <main className="auth-gate" data-testid="auth-blocked">
        <section className="auth-card auth-card--welcome auth-card--blocked">
          <div className="auth-brand">
            <span><LoadableImage src="/clan-logo.png" alt="" width={118} height={118} priority /></span>
            <div>
              <div className="eyebrow">{portalName}</div>
              <h1>Доступ к порталу заблокирован</h1>
              <p>Ваш Discord-профиль заблокирован администрацией клана. Повторная авторизация и регистрация недоступны, пока блокировка не будет снята.</p>
            </div>
          </div>

          <div className="auth-blocked-note">
            <ShieldX size={18} />
            <span>Если блокировка была выдана по ошибке, обратитесь к администрации клана вне портала.</span>
          </div>
        </section>
      </main>
    );
  }

  if (mode === "welcome") {
    return (
      <main className="auth-gate" data-testid="auth-welcome">
        <section className="auth-card auth-card--welcome">
          <div className="auth-brand">
            <span><LoadableImage src="/clan-logo.png" alt="" width={118} height={118} priority /></span>
            <div>
              <div className="eyebrow">{portalName}</div>
              <h1>Добро пожаловать в портал клана</h1>
              <p>Войдите через Discord, чтобы создать профиль участника и отправить заявку на вступление в коллектив.</p>
            </div>
          </div>

          <div className="auth-feature-list">
            <div><ShieldCheck size={16} /><span>Профиль привязывается к Discord</span></div>
            <div><UserRound size={16} /><span>После входа нужно указать основного персонажа</span></div>
            <div><LockKeyhole size={16} /><span>Инструменты откроются после принятия в коллектив</span></div>
          </div>

          <button type="button" className="discord-auth-button" onClick={connectDiscord} data-testid="discord-auth-button">
            <MessageCircle size={18} />
            Авторизоваться через Discord
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-gate" data-testid="registration-form">
      <form className="auth-card registration-card" onSubmit={finishRegistration}>
        <header className="registration-heading">
          <span><Sparkles size={18} /></span>
          <div>
            <div className="eyebrow">Регистрация участника</div>
            <h1>Заполните базовый профиль</h1>
            <p>Эти данные попадут в список заявок на вступление. Доступ к инструментам портала появится после принятия в коллектив.</p>
          </div>
        </header>

        <div className="registration-fields">
          <label>
            <span>Ник профиля</span>
            <input
              type="text"
              value={profileName}
              maxLength={40}
              onChange={(event) => setProfileName(event.target.value)}
              placeholder="Например: Dante"
              data-testid="registration-profile-name"
            />
          </label>
          <label>
            <span>Ник основного персонажа</span>
            <input
              type="text"
              value={characterName}
              maxLength={40}
              onChange={(event) => setCharacterName(event.target.value)}
              placeholder="Игровой ник"
              data-testid="registration-character-name"
            />
          </label>
        </div>

        <section className="registration-class-section">
          <div>
            <span>Класс персонажа</span>
            <strong>Выберите доступный класс Corepunk</strong>
          </div>
          <div className="registration-class-grid">
            {corepunkClasses.map((heroClass) => (
              <button
                type="button"
                className={`registration-class-option${classSlug === heroClass.slug ? " registration-class-option--active" : ""}`}
                onClick={() => {
                  if (heroClass.available) setClassSlug(heroClass.slug);
                }}
                disabled={!heroClass.available}
                aria-pressed={classSlug === heroClass.slug}
                data-testid={`registration-class-${heroClass.slug}`}
                key={heroClass.slug}
              >
                <span><LoadableImage src={heroClass.image} alt="" width={46} height={46} /></span>
                <div><strong>{heroClass.name}</strong><small>{heroClass.family}</small></div>
                {heroClass.available ? classSlug === heroClass.slug && <Check size={14} /> : <em>Скоро</em>}
              </button>
            ))}
          </div>
        </section>

        {formError && <p className="registration-error" role="alert">{formError}</p>}

        <footer className="registration-footer">
          <div><MessageCircle size={14} /> Discord: {auth.discordNickname ?? "подключён"}</div>
          <button type="submit" disabled={!canSubmit} data-testid="finish-registration">
            {submitting ? "Отправляем..." : "Отправить заявку"} <Check size={15} />
          </button>
        </footer>
      </form>
    </main>
  );
}
