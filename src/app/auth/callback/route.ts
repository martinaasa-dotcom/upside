import { NextResponse } from "next/server";
import { ensureProfileAndClaims } from "@/lib/auth/ensure-profile";
import { isLocalHost, safeInternalPath, siteUrl } from "@/lib/site-url";
import { createSupabaseServerAuth } from "@/lib/supabase/server-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeInternalPath(url.searchParams.get("next"));
  const origin = isLocalHost(url.hostname) ? url.origin : siteUrl();

  if (code) {
    const supabase = await createSupabaseServerAuth();
    if (supabase) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        console.error("auth callback exchange failed", error.message);
      } else if (data.user) {
        try {
          // Run claim on the same client that just received the session JWT.
          const { data: rpcData, error: rpcError } = await supabase.rpc(
            "portfell_claim_seed_for_me"
          );
          if (rpcError) {
            console.error(
              "auth callback rpc claim failed",
              rpcError.message
            );
            await ensureProfileAndClaims(data.user);
          } else {
            console.info(
              "auth callback claimed",
              data.user.email,
              (rpcData as { claimed?: string[] } | null)?.claimed
            );
          }
        } catch (err) {
          console.error(
            "auth callback claim failed",
            err instanceof Error ? err.message : err
          );
          try {
            await ensureProfileAndClaims(data.user);
          } catch (err2) {
            console.error(
              "auth callback claim fallback failed",
              err2 instanceof Error ? err2.message : err2
            );
          }
        }
      }
    }
  }

  return NextResponse.redirect(new URL(next, origin));
}
