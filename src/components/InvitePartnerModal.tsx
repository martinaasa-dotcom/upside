"use client";

import { useAuth } from "@/components/AuthProvider";
import { plainError } from "@/lib/plain-error";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { track } from "@vercel/analytics";
import { Check, Copy, UserMinus, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type OwnerRow = {
  user_id: string;
  profile: {
    email: string | null;
    display_name: string | null;
  } | null;
};

type Props = {
  open: boolean;
  portfolioId: string;
  portfolioName: string;
  onClose: () => void;
};

export function InvitePartnerModal({
  open,
  portfolioId,
  portfolioName,
  onClose,
}: Props) {
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [owners, setOwners] = useState<OwnerRow[]>([]);
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  const [removeTarget, setRemoveTarget] = useState<OwnerRow | null>(null);

  const loadOwners = useCallback(async () => {
    const res = await fetch(`/api/portfolios/${portfolioId}/owners`);
    const data = (await res.json().catch(() => ({}))) as { owners?: OwnerRow[] };
    setOwners(data.owners ?? []);
  }, [portfolioId]);

  useEffect(() => {
    if (!open) return;
    setEmail("");
    setLink(null);
    setCode(null);
    setMsg(null);
    setErr(null);
    void loadOwners();
  }, [open, loadOwners]);

  if (!open) return null;

  async function createInvite() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const trimmed = email.trim();
      if (trimmed) {
        const add = await fetch(`/api/portfolios/${portfolioId}/owners`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: trimmed }),
        });
        const addData = (await add.json().catch(() => ({}))) as {
          error?: string;
        };
        if (add.ok) {
          track("portfolio_invite_created", { direct_add: true });
          setMsg(`Added ${trimmed} as co-owner.`);
          setEmail("");
          await loadOwners();
          return;
        }
        if (add.status !== 404) {
          throw new Error(plainError(addData.error, "Couldn't add that person."));
        }
      }
      const res = await fetch(`/api/portfolios/${portfolioId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed || undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        url?: string;
        code?: string;
        token?: string;
      };
      if (!res.ok) throw new Error(plainError(data.error, "Couldn't create an invite."));
      track("portfolio_invite_created");
      setLink(data.url ?? null);
      setCode(data.code ?? data.token ?? null);
      setMsg(
        trimmed
          ? `Invite ready for ${trimmed}. Share the link or code.`
          : "Invite ready. Share the link or code with your partner."
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't create an invite.");
    } finally {
      setBusy(false);
    }
  }

  async function copy(text: string, kind: "link" | "code") {
    await navigator.clipboard.writeText(text);
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/60"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative max-h-[90dvh] w-full overflow-y-auto rounded-t-2xl border border-zinc-700 bg-zinc-950 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:max-w-md sm:rounded-2xl sm:pb-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-white">
              Invite a partner
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-zinc-400">
              They get live edit access to {portfolioName}, not a read-only
              peek.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <label className="mt-4 block space-y-1">
          <span className="text-xs uppercase tracking-wide text-zinc-400">
            Partner email (optional)
          </span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="partner@work.com"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm"
          />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void createInvite()}
          className="mt-3 btn-primary disabled:opacity-60"
        >
          {busy ? "Working …" : "Create invite"}
        </button>
        {err && <p className="mt-2 text-sm text-loss">{err}</p>}
        {msg && <p className="mt-2 text-sm text-gain">{msg}</p>}
        {(link || code) && (
          <div className="mt-3 space-y-2 rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
            {code && (
              <div className="flex items-center justify-between gap-2">
                <p className="font-mono text-sm text-brand-bright">{code}</p>
                <button
                  type="button"
                  onClick={() => void copy(code, "code")}
                  className="inline-flex items-center gap-1 rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300"
                >
                  {copied === "code" ? (
                    <Check className="h-3.5 w-3.5 text-gain" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  Copy code
                </button>
              </div>
            )}
            {link && (
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 flex-1 truncate text-xs text-zinc-400">
                  {link}
                </p>
                <button
                  type="button"
                  onClick={() => void copy(link, "link")}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300"
                >
                  {copied === "link" ? (
                    <Check className="h-3.5 w-3.5 text-gain" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  Copy link
                </button>
              </div>
            )}
          </div>
        )}

        {owners.length > 0 && (
          <ul className="mt-4 divide-y divide-zinc-800 overflow-hidden rounded-xl border border-zinc-800">
            {owners.map((o) => (
              <li
                key={o.user_id}
                className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm"
              >
                <span className="min-w-0 truncate text-zinc-200">
                  {o.profile?.display_name || o.profile?.email || o.user_id.slice(0, 8)}
                  {o.user_id === user?.id ? (
                    <span className="ml-2 text-xs text-zinc-400">(you)</span>
                  ) : null}
                </span>
                {owners.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setRemoveTarget(o)}
                    className="rounded-md p-1.5 text-zinc-400 hover:text-rose-300"
                    aria-label="Remove"
                  >
                    <UserMinus className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <ConfirmModal
        open={Boolean(removeTarget)}
        title="Remove this person?"
        body={
          removeTarget?.user_id === user?.id
            ? `You'll lose edit access to ${portfolioName}.`
            : `Remove them from ${portfolioName}?`
        }
        confirmLabel="Remove"
        destructive
        onClose={() => setRemoveTarget(null)}
        onConfirm={async () => {
          if (!removeTarget) return false;
          const res = await fetch(
            `/api/portfolios/${portfolioId}/owners?userId=${encodeURIComponent(removeTarget.user_id)}`,
            { method: "DELETE" }
          );
          if (!res.ok) return false;
          setRemoveTarget(null);
          await loadOwners();
          return true;
        }}
      />
    </div>
  );
}
