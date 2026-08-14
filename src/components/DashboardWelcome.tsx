"use client";

import { AppHeader } from "@/components/AppHeader";
import { RenameSheetModal } from "@/components/RenameSheetModal";
import { UpsideLogo } from "@/components/UpsideLogo";
import { PRODUCT_BLURB, PRODUCT_SENTENCE } from "@/lib/product";

type Props = {
  loadError: string | null;
  createSheetOpen: boolean;
  onRetry: () => void;
  onAskMargus: () => void;
  onOpenCreate: () => void;
  onCloseCreate: () => void;
  onCreate: (name: string) => void;
};

export function DashboardWelcome({
  loadError,
  createSheetOpen,
  onRetry,
  onAskMargus,
  onOpenCreate,
  onCloseCreate,
  onCreate,
}: Props) {
  return (
    <div className="flex min-h-screen flex-col bg-[radial-gradient(ellipse_at_top,_#1f1a12_0%,_#121214_52%)] text-zinc-100">
      <AppHeader />
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
        <UpsideLogo variant="icon" />
        <div>
          <h1 className="text-lg font-semibold">Welcome to Upside</h1>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            {loadError ? loadError : PRODUCT_SENTENCE}
          </p>
          {!loadError && (
            <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">
              {PRODUCT_BLURB} Create a sheet, or open an invite if someone
              shared one with you.
            </p>
          )}
        </div>
        {!loadError && (
          <div className="grid w-full gap-2 text-left sm:grid-cols-2">
            {[
              {
                title: "See the book",
                detail: "Everything you own, what you paid, and how today went.",
              },
              {
                title: "Ask Margus",
                detail:
                  "An AI copilot that reads your sheet and can make edits for you.",
              },
              {
                title: "Watch the Fund",
                detail:
                  "Margus trades a paper-money book in public. One decision a day.",
              },
              {
                title: "Invite a friend",
                detail:
                  "Optional. Share a sheet or start a circle when you want company.",
              },
            ].map((f) => (
              <div
                key={f.title}
                className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-3"
              >
                <p className="text-xs font-semibold text-white">{f.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                  {f.detail}
                </p>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500"
          >
            Retry
          </button>
          {!loadError && (
            <button
              type="button"
              onClick={onAskMargus}
              className="rounded-lg border border-brand/40 bg-brand/10 px-4 py-2 text-sm font-medium text-brand-bright hover:bg-brand/20"
            >
              Ask Margus
            </button>
          )}
          <button
            type="button"
            onClick={onOpenCreate}
            className="rounded-lg bg-brand-bright px-4 py-2 text-sm font-semibold text-[#1a1510] hover:bg-[#F0E4C8]"
          >
            Create your first sheet
          </button>
        </div>
      </main>

      <RenameSheetModal
        open={createSheetOpen}
        initialName=""
        title="Create a sheet"
        label="Sheet name"
        placeholder="e.g. My portfolio"
        confirmLabel="Create"
        onClose={onCloseCreate}
        onSave={(name) => {
          onCloseCreate();
          onCreate(name);
        }}
      />
    </div>
  );
}
