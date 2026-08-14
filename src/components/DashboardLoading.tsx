"use client";

import { UpsideLogo } from "@/components/UpsideLogo";

export function DashboardLoading({ message }: { message: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-app px-6">
      <UpsideLogo variant="stack" />
      <p className="sr-only" role="status">
        {message}
      </p>
    </div>
  );
}
