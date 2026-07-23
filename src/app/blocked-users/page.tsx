import { BlockedUsersManager } from "@/components/blocked-users-manager";

export default function BlockedUsersPage() {
  return (
    <div className="page-stack">
      <section className="page-hero">
        <div>
          <div className="eyebrow">Доступ · Безопасность</div>
          <h1>Заблокированные пользователи</h1>
          <p>Управляйте Discord ID, которым запрещён вход в портал после удаления с блокировкой.</p>
        </div>
      </section>
      <BlockedUsersManager />
    </div>
  );
}
