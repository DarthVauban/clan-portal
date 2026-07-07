"use client";

import dynamic from "next/dynamic";

const emptyLoading = () => null;

export const LazyCollectivesManager = dynamic(
  () => import("@/components/collectives-manager").then((module) => module.CollectivesManager),
  { loading: emptyLoading },
);

export const LazyUserProfile = dynamic(
  () => import("@/components/user-profile").then((module) => module.UserProfile),
  { loading: emptyLoading },
);

export const LazyMembershipRequestsManager = dynamic(
  () => import("@/components/membership-requests-manager").then((module) => module.MembershipRequestsManager),
  { loading: emptyLoading },
);

export const LazyBlockedUsersManager = dynamic(
  () => import("@/components/blocked-users-manager").then((module) => module.BlockedUsersManager),
  { loading: emptyLoading },
);

export const LazyKnowledgeCatalog = dynamic(
  () => import("@/components/knowledge-catalog").then((module) => module.KnowledgeCatalog),
  { loading: emptyLoading },
);

export const LazyResourcesManager = dynamic(
  () => import("@/components/resources-manager").then((module) => module.ResourcesManager),
  { loading: emptyLoading },
);

export const LazyCraftCalculator = dynamic(
  () => import("@/components/craft-calculator").then((module) => module.CraftCalculator),
  { loading: emptyLoading },
);

export const LazyCorepunkItemDetail = dynamic(
  () => import("@/components/corepunk-item-detail").then((module) => module.CorepunkItemDetail),
  { loading: emptyLoading },
);
