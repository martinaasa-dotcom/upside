"use client";

import { UpsideLogo } from "@/components/UpsideLogo";

export function DashboardLoading({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#121214] px-6">
      <UpsideLogo variant="icon" className="animate-pulse" />
      <p className="mt-6 text-sm text-zinc-400">{message}</p>
    </div>
  );
}
