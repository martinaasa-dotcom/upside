"use client";

import { UpsideLogo } from "@/components/UpsideLogo";

export function DashboardLoading({ message }: { message: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-app px-6">
      <UpsideLogo
        variant="icon"
        className="animate-pulse motion-reduce:animate-none"
      />
      <p className="mt-6 text-sm text-muted-foreground" role="status">
        {message}
      </p>
    </div>
  );
}
