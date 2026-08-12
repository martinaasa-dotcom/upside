"use client";

import { CommunityView } from "@/components/CommunityView";
import { use } from "react";

export default function CommunityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <CommunityView communityId={id} />;
}
