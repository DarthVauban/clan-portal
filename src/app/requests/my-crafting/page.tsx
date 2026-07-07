import { LazyMyCraftRequestsManager } from "@/components/lazy-client-components";

export default function MyCraftRequestsPage() {
  return (
    <div className="page-stack">
      <section className="page-hero">
        <div>
          <div className="eyebrow">Заявки · Мой крафт</div>
          <h1>Мои крафт-заявки</h1>
          <p>Личный список заявок, где вы выступаете заказчиком или исполнителем крафта.</p>
        </div>
      </section>
      <LazyMyCraftRequestsManager />
    </div>
  );
}
