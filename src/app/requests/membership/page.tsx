import { LazyMembershipRequestsManager } from "@/components/lazy-client-components";

export default function MembershipRequestsPage() {
  return (
    <div className="page-stack">
      <section className="page-hero">
        <div>
          <div className="eyebrow">Заявки · Участники</div>
          <h1>Заявки на вступление</h1>
          <p>Единая очередь новых игроков и участников, которые ещё не распределены по коллективам.</p>
        </div>
      </section>
      <LazyMembershipRequestsManager />
    </div>
  );
}
