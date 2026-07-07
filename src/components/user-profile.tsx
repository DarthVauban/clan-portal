"use client";

import { LoadableImage } from "@/components/loadable-image";
import {
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  LockKeyhole,
  MessageCircle,
  Pencil,
  Plus,
  ShieldCheck,
  Star,
  Trash2,
  UsersRound,
} from "lucide-react";
import { useState } from "react";
import { corepunkClasses, corepunkClassesBySlug } from "@/lib/corepunk-classes";
import { collectiveRoleLabels, findMembership, formatCollectiveDate, getPortalRole, portalRoleLabels, useCollectiveStore } from "@/lib/collective-store";
import { usePortalAuth } from "@/lib/auth-store";
import { LOCAL_PLAYER_ID, type PlayerCharacter, useLocalProfile } from "@/lib/profile-store";
import styles from "@/app/profile/profile.module.css";

function makeCharacter(): PlayerCharacter {
  return {
    id: `character-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: "",
    classSlug: null,
    confirmed: false,
  };
}

function formatJoinedAt(value: string) {
  if (!value) return "Будет установлена автоматически";
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}.${month}.${year}` : value;
}

export function UserProfile() {
  const { profile, updateProfile } = useLocalProfile();
  const { auth } = usePortalAuth();
  const { state: collectiveState } = useCollectiveStore();
  const [openClassSelector, setOpenClassSelector] = useState<string | null>(null);
  const [editingCharacterId, setEditingCharacterId] = useState<string | null>(null);
  const [editingProfileName, setEditingProfileName] = useState(false);
  const initials = profile.displayName.trim().slice(0, 2).toLocaleUpperCase("ru") || "CP";
  const membership = findMembership(collectiveState, LOCAL_PLAYER_ID);
  const portalRole = getPortalRole(collectiveState, LOCAL_PLAYER_ID);

  const addCharacter = () => {
    const character = makeCharacter();
    updateProfile((current) => ({ ...current, characters: [...current.characters, character] }));
    setEditingCharacterId(character.id);
    setOpenClassSelector(character.id);
  };

  const updateCharacter = (id: string, updates: Partial<PlayerCharacter>) => {
    updateProfile((current) => ({
      ...current,
      characters: current.characters.map((character) => character.id === id ? { ...character, ...updates } : character),
    }));
  };

  const removeCharacter = (id: string) => {
    updateProfile((current) => ({
      ...current,
      mainCharacterId: current.mainCharacterId === id ? null : current.mainCharacterId,
      characters: current.characters.filter((character) => character.id !== id),
    }));
    setOpenClassSelector((current) => current === id ? null : current);
    setEditingCharacterId((current) => current === id ? null : current);
  };

  const approveCharacter = (character: PlayerCharacter) => {
    if (!character.name.trim() || !character.classSlug) return;
    updateProfile((current) => ({
      ...current,
      mainCharacterId: current.mainCharacterId ?? character.id,
      characters: current.characters.map((item) => item.id === character.id
        ? { ...item, name: item.name.trim(), confirmed: true }
        : item),
    }));
    setEditingCharacterId(null);
    setOpenClassSelector(null);
  };

  const setMainCharacter = (id: string) => {
    updateProfile((current) => ({ ...current, mainCharacterId: id }));
  };

  return (
    <div className={styles.profileLayout}>
      <section className={styles.identityCard}>
        <div className={styles.avatar}>{initials}</div>
        <div className={styles.identityCopy}>
          <span>Профиль участника</span>
          {editingProfileName ? (
            <div className={styles.profileNameEditor}>
              <input
                type="text"
                value={profile.displayName}
                maxLength={40}
                placeholder="Введите имя профиля"
                onChange={(event) => updateProfile((current) => ({ ...current, displayName: event.target.value }))}
                data-testid="profile-display-name"
              />
              <button type="button" onClick={() => setEditingProfileName(false)} disabled={!profile.displayName.trim()} data-testid="approve-profile-name">
                <Check size={15} /> Подтвердить
              </button>
            </div>
          ) : (
            <h2>{profile.displayName.trim() || "Новый участник"}</h2>
          )}
          <p>Данные автоматически сохраняются в этом браузере.</p>
        </div>
        <div className={styles.identityActions}>
          <div className={styles.localStatus}><ShieldCheck size={15} /> {portalRoleLabels[portalRole]}</div>
          {!editingProfileName && (
            <button type="button" className={styles.editProfileName} onClick={() => setEditingProfileName(true)} data-testid="edit-profile-name">
              <Pencil size={13} /> {profile.displayName.trim() ? "Изменить имя" : "Указать имя"}
            </button>
          )}
        </div>
      </section>

      <section className={styles.accountGrid}>
        <label className={`${styles.infoField} ${styles.disabledField}`}>
          <span><MessageCircle size={15} /> Ник в Discord</span>
          <input type="text" value={auth.discordNickname ?? "Не подключён"} disabled data-testid="discord-nickname" />
          <small>Имя берётся из Discord-авторизации и обновляется автоматически при входе.</small>
        </label>

        <div className={`${styles.infoField} ${styles.collectivePlaceholder}`} data-testid="collective-placeholder">
          <span><UsersRound size={15} /> Коллектив</span>
          <strong>{membership?.collective.name ?? "Коллектив не назначен"}</strong>
          <small>{membership ? `Роль: ${collectiveRoleLabels[membership.member.role]}` : "Добавьте игрока в один из коллективов через модуль управления."}</small>
        </div>

        <label className={`${styles.infoField} ${styles.disabledField}`}>
          <span><CalendarDays size={15} /> Дата вступления в коллектив</span>
          <input
            type="text"
            value={membership ? formatCollectiveDate(membership.member.joinedAt) : formatJoinedAt("")}
            disabled
            data-testid="collective-joined-at"
          />
          <small>{membership ? "Дата установлена автоматически при добавлении в коллектив." : "Дата назначается системой в момент подтверждения игрока в одном из коллективов."}</small>
        </label>
      </section>

      <section className={styles.charactersSection}>
        <header className={styles.charactersHeader}>
          <div>
            <span>Игровые данные</span>
            <h2>Персонажи</h2>
            <p>Добавьте всех персонажей и укажите класс каждого из них.</p>
          </div>
          <button type="button" className={styles.addCharacter} onClick={addCharacter} data-testid="add-character">
            <Plus size={16} /> Добавить персонажа
          </button>
        </header>

        {profile.characters.length === 0 ? (
          <div className={styles.emptyCharacters}>
            <span><UsersRound size={25} /></span>
            <strong>Персонажи ещё не добавлены</strong>
            <p>Создайте первую карточку персонажа — ограничений по количеству нет.</p>
            <button type="button" onClick={addCharacter}><Plus size={15} /> Добавить первого персонажа</button>
          </div>
        ) : (
          <div className={styles.characterList}>
            {profile.characters.map((character, index) => {
              const selectedClass = character.classSlug ? corepunkClassesBySlug.get(character.classSlug) : undefined;
              const selectorOpen = openClassSelector === character.id;
              const isEditing = editingCharacterId === character.id || !character.confirmed;
              const canApprove = Boolean(character.name.trim() && selectedClass);
              return (
                <article className={`${styles.characterCard} ${!isEditing ? styles.characterCardCollapsed : ""}`} key={character.id} data-testid={`character-${character.id}`}>
                  <div className={styles.characterNumber}>{String(index + 1).padStart(2, "0")}</div>
                  {isEditing ? (
                    <>
                      <label className={styles.characterName}>
                        <span>Имя персонажа</span>
                        <input
                          type="text"
                          value={character.name}
                          maxLength={40}
                          placeholder="Введите игровой ник"
                          onChange={(event) => updateCharacter(character.id, { name: event.target.value })}
                          data-testid={`character-name-${character.id}`}
                        />
                      </label>

                      <div className={styles.classField}>
                        <span>Класс</span>
                        <button
                          type="button"
                          className={`${styles.classSelect} ${selectorOpen ? styles.classSelectOpen : ""}`}
                          onClick={() => setOpenClassSelector(selectorOpen ? null : character.id)}
                          aria-expanded={selectorOpen}
                          data-testid={`character-class-${character.id}`}
                        >
                          {selectedClass ? (
                            <>
                              <span className={styles.selectedClassIcon}><LoadableImage src={selectedClass.image} alt="" width={42} height={42} /></span>
                              <span><strong>{selectedClass.name}</strong><small>{selectedClass.family}</small></span>
                            </>
                          ) : (
                            <>
                              <span className={styles.unselectedClassIcon}>?</span>
                              <span><strong>Выберите класс</strong><small>7 классов доступно</small></span>
                            </>
                          )}
                          <ChevronDown size={16} />
                        </button>
                      </div>

                      <button type="button" className={styles.removeCharacter} onClick={() => removeCharacter(character.id)} aria-label={`Удалить персонажа ${character.name || index + 1}`}>
                        <Trash2 size={16} />
                      </button>

                      {selectorOpen && (
                        <div className={styles.classSelector} data-testid="class-selector">
                          <div className={styles.selectorHeading}>
                            <div><span>Выбор класса</span><strong>Все классы Corepunk</strong></div>
                            <small><Check size={12} /> Доступно сейчас: 7</small>
                          </div>
                          <div className={styles.classGrid}>
                            {corepunkClasses.map((heroClass) => (
                              <button
                                type="button"
                                className={`${styles.classOption} ${character.classSlug === heroClass.slug ? styles.classOptionActive : ""} ${!heroClass.available ? styles.classOptionLocked : ""}`}
                                onClick={() => {
                                  if (!heroClass.available) return;
                                  updateCharacter(character.id, { classSlug: heroClass.slug });
                                  setOpenClassSelector(null);
                                }}
                                disabled={!heroClass.available}
                                data-testid={`class-option-${heroClass.slug}`}
                                key={heroClass.slug}
                              >
                                <span className={styles.classOptionIcon}><LoadableImage src={heroClass.image} alt="" width={50} height={50} /></span>
                                <span><strong>{heroClass.name}</strong><small>{heroClass.family}</small></span>
                                {heroClass.available ? character.classSlug === heroClass.slug && <Check size={14} /> : <em><LockKeyhole size={10} /> Скоро</em>}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className={styles.characterEditorFooter}>
                        <small>{canApprove ? "Персонаж готов к подтверждению." : "Укажите имя и выберите доступный класс."}</small>
                        <button type="button" onClick={() => approveCharacter(character)} disabled={!canApprove} data-testid={`approve-character-${character.id}`}>
                          <Check size={15} /> Подтвердить персонажа
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className={styles.characterSummary}>
                        <span className={styles.characterSummaryIcon}>
                          {selectedClass && <LoadableImage src={selectedClass.image} alt="" width={54} height={54} />}
                        </span>
                        <div>
                          <span>Персонаж {profile.mainCharacterId === character.id && <em><Star size={9} /> Основной</em>}</span>
                          <strong>{character.name}</strong>
                          <small>{selectedClass?.name} · {selectedClass?.family}</small>
                        </div>
                      </div>
                      <div className={styles.characterViewActions}>
                        {profile.mainCharacterId !== character.id && (
                          <button
                            type="button"
                            className={styles.makeMainCharacter}
                            onClick={() => setMainCharacter(character.id)}
                            data-testid={`main-character-${character.id}`}
                          >
                            <Star size={14} /> Сделать основным
                          </button>
                        )}
                        <button
                          type="button"
                          className={styles.editCharacter}
                          onClick={() => {
                            setEditingCharacterId(character.id);
                            setOpenClassSelector(null);
                          }}
                          data-testid={`edit-character-${character.id}`}
                        >
                          <Pencil size={14} /> Редактировать
                        </button>
                        <button type="button" className={styles.removeCharacter} onClick={() => removeCharacter(character.id)} aria-label={`Удалить персонажа ${character.name}`}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <footer className={styles.profileFooter}>
        <span><Clock3 size={14} /> Изменения сохраняются автоматически</span>
        <small>После подключения аккаунта данные будут перенесены в профиль пользователя.</small>
      </footer>
    </div>
  );
}
