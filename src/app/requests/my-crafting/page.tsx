import { MyCraftRequestsManager } from "@/components/my-craft-requests-manager";

export default function MyCraftRequestsPage() {
  return (
    <div className="page-stack">
      <section className="page-hero">
        <div>
          <div className="eyebrow">Заявки · Личный список</div>
          <h1>Мои заявки</h1>
          <p>Личный список заявок на ресурсы, валюту и крафт, где требуется ваше действие или хранится история.</p>
        </div>
      </section>
      <MyCraftRequestsManager />
    </div>
  );
}
