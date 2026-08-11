"use client";

import { AuthProvider } from "@/components/AuthProvider";
import { CommunityView } from "@/components/CommunityView";
import { use } from "react";

export default function CommunityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <AuthProvider>
      <CommunityView communityId={id} />
    </AuthProvider>
  );
}
