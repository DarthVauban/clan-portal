"use client";

import dynamic from "next/dynamic";

const sectionLoading = () => <div className="section-loader" role="status"><span>Загружаем раздел</span></div>;

export const LazyCollectivesManager = dynamic(
  () => import("@/components/collectives-manager").then((module) => module.CollectivesManager),
  { loading: sectionLoading },
);

export const LazyUserProfile = dynamic(
  () => import("@/components/user-profile").then((module) => module.UserProfile),
  { loading: sectionLoading },
);

export const LazyMembershipRequestsManager = dynamic(
  () => import("@/components/membership-requests-manager").then((module) => module.MembershipRequestsManager),
  { loading: sectionLoading },
);

export const LazyBlockedUsersManager = dynamic(
  () => import("@/components/blocked-users-manager").then((module) => module.BlockedUsersManager),
  { loading: sectionLoading },
);

export const LazyKnowledgeCatalog = dynamic(
  () => import("@/components/knowledge-catalog").then((module) => module.KnowledgeCatalog),
  { loading: sectionLoading },
);

export const LazyResourcesManager = dynamic(
  () => import("@/components/resources-manager").then((module) => module.ResourcesManager),
  { loading: sectionLoading },
);

export const LazyCraftCalculator = dynamic(
  () => import("@/components/craft-calculator").then((module) => module.CraftCalculator),
  { loading: sectionLoading },
);

export const LazyCorepunkItemDetail = dynamic(
  () => import("@/components/corepunk-item-detail").then((module) => module.CorepunkItemDetail),
  { loading: sectionLoading },
);

export const LazyResourceRequestsManager = dynamic(
  () => import("@/components/resource-requests-manager").then((module) => module.ResourceRequestsManager),
  { loading: sectionLoading },
);

export const LazyCraftRequestsManager = dynamic(
  () => import("@/components/craft-requests-manager").then((module) => module.CraftRequestsManager),
  { loading: sectionLoading },
);

export const LazyMyCraftRequestsManager = dynamic(
  () => import("@/components/my-craft-requests-manager").then((module) => module.MyCraftRequestsManager),
  { loading: sectionLoading },
);

export const LazyAuditLogManager = dynamic(
  () => import("@/components/audit-log-manager").then((module) => module.AuditLogManager),
  { loading: sectionLoading },
);
