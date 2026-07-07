"use client";

import { Clock3, Hammer, PackageCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { LoadableImage } from "@/components/loadable-image";
import { usePortalAuth } from "@/lib/auth-store";
import { LOCAL_PLAYER_ID } from "@/lib/profile-store";
import {
  useRequestStore,
  type ClanCraftApprovalStatus,
  type CraftFundingType,
  type CraftRequest,
  type RequestStatus,
} from "@/lib/request-store";
import styles from "@/app/requests/requests.module.css";

const numberFormatter = new Intl.NumberFormat("ru-RU");
const statusLabels: Record<RequestStatus, string> = {
  pending: "На рассмотрении",
  approved: "Одобрено",
  "in-progress": "В работе",
  issued: "Выдано",
  completed: "Завершено",
  rejected: "Отклонено",
  cancelled: "Отменено",
};
const craftFundingLabels: Record<CraftFundingType, string> = {
  personal: "Обычная заявка",
  clan: "За счёт ресурсов клана",
};
const clanApprovalLabels: Record<ClanCraftApprovalStatus, string> = {
  "not-required": "Подтверждение не требуется",
  pending: "Ожидает подтверждения ресурсов",
  approved: "Ресурсы клана подтверждены",
  rejected: "Ресурсы клана отклонены",
};

function formatAmount(value: number) {
  return numberFormatter.format(value);
}

function formatRequestDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function CraftRequestCard({ request }: { request: CraftRequest }) {
  return (
    <article className={styles.requestCard} data-status={request.status} data-funding={request.funding}>
      <div className={styles.requestIcon}>{request.itemImage ? <LoadableImage src={request.itemImage} alt="" width={52} height={52} /> : <Hammer size={22} />}</div>
      <div className={styles.requestBody}>
        <div className={styles.requestTitle}>
          <strong>{request.itemName}</strong>
          <span>{statusLabels[request.status]}</span>
        </div>
        <p>x{formatAmount(request.quantity)} · {request.recipeName}</p>
        <div className={styles.requestMetaGrid}>
          <span>Заказчик: <strong>{request.requester.name}</strong></span>
          <span>Исполнитель: <strong>{request.executor?.name ?? "Не назначен"}</strong></span>
        </div>
        <div className={styles.requestBadges}>
          <span>{craftFundingLabels[request.funding]}</span>
          {request.funding === "clan" && <span>{clanApprovalLabels[request.clanApprovalStatus]}</span>}
        </div>
        {request.note && <em>{request.note}</em>}
        <small>Создано {formatRequestDate(request.createdAt)} · материалов {request.requirements.length}</small>
      </div>
    </article>
  );
}

export function MyCraftRequestsManager() {
  const { auth } = usePortalAuth();
  const { state } = useRequestStore();
  const [activeTab, setActiveTab] = useState<"customer" | "executor">("customer");
  const currentActorId = auth.discordId ? `player-${auth.discordId}` : LOCAL_PLAYER_ID;
  const currentActorIds = useMemo(() => new Set([currentActorId, LOCAL_PLAYER_ID]), [currentActorId]);
  const customerRequests = state.craftRequests.filter((request) => currentActorIds.has(request.requester.id));
  const executorRequests = state.craftRequests.filter((request) => request.executor && currentActorIds.has(request.executor.id));
  const visibleRequests = activeTab === "customer" ? customerRequests : executorRequests;

  return (
    <div className={styles.requestWorkspace}>
      <section className={styles.summaryBar}>
        <div><small>Я заказчик</small><strong>{customerRequests.length}</strong></div>
        <div><small>Я исполнитель</small><strong>{executorRequests.length}</strong></div>
        <div><small>Активных</small><strong>{visibleRequests.filter((request) => ["pending", "approved", "in-progress"].includes(request.status)).length}</strong></div>
      </section>

      <section className={styles.requestList}>
        <header>
          <span>Личный список</span>
          <h2>Мои крафт-заявки</h2>
          <div className={styles.inlineTabs}>
            <button type="button" className={activeTab === "customer" ? styles.inlineTabActive : ""} onClick={() => setActiveTab("customer")}>Как заказчик</button>
            <button type="button" className={activeTab === "executor" ? styles.inlineTabActive : ""} onClick={() => setActiveTab("executor")}>Как исполнитель</button>
          </div>
        </header>

        {visibleRequests.length > 0 ? visibleRequests.map((request) => <CraftRequestCard request={request} key={request.id} />) : (
          <div className={styles.emptyQueue}>
            {activeTab === "customer" ? <Clock3 size={24} /> : <PackageCheck size={24} />}
            <strong>{activeTab === "customer" ? "Ваших заявок пока нет" : "Принятых заявок пока нет"}</strong>
            <p>{activeTab === "customer" ? "Созданные вами заявки на крафт появятся здесь." : "Заявки появятся здесь после того, как вы возьмёте их в работу."}</p>
          </div>
        )}
      </section>
    </div>
  );
}
