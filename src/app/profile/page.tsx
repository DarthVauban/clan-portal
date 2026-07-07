import { LazyUserProfile } from "@/components/lazy-client-components";

export default function ProfilePage() {
  return (
    <div className="page-stack">
      <section className="page-hero">
        <div>
          <div className="eyebrow">Аккаунт · Настройки</div>
          <h1>Профиль пользователя</h1>
          <p>Ваши персонажи, игровые классы и принадлежность к коллективу в одном месте.</p>
        </div>
      </section>
      <LazyUserProfile />
    </div>
  );
}
