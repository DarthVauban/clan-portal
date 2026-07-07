import { LazyCollectivesManager } from "@/components/lazy-client-components";

export default function CollectivesPage() {
  return (
    <div className="page-stack">
      <section className="page-hero">
        <div>
          <div className="eyebrow">Клан · Структура</div>
          <h1>Коллективы и участники</h1>
          <p>Управляйте игровыми составами, ролями и переводами участников внутри единого клана.</p>
        </div>
      </section>
      <LazyCollectivesManager />
    </div>
  );
}
