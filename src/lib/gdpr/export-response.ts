import { listOwnedPortfolioIds } from "@/lib/auth/ownership";
import {
  collectUserExport,
  parseExportOptions,
  serializeUserExport,
} from "@/lib/gdpr/user-export";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { takeDurableRateLimit } from "@/lib/rate-limit-durable";
import { getSupabaseDataClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function userExportResponse(
  req: Request,
  defaults: { encrypt: boolean }
): Promise<NextResponse> {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  // A full-book export is the most expensive read in the app. The blanket
  // IP cap in proxy.ts is per warm instance, so add a durable per-user one:
  // plenty for someone downloading their own data, not enough to script a
  // dump loop off a stolen session.
  const limit = await takeDurableRateLimit(`export:${auth.user.id}`, 6, 10 * 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "That's a lot of exports at once. Try again in a few minutes." },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSec ?? 60) },
      }
    );
  }

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 400 }
    );
  }

  const options = parseExportOptions(req, defaults);
  const portfolioIds = await listOwnedPortfolioIds(auth.user.id);
  const payload = await collectUserExport(supabase, auth.user, portfolioIds);
  const file = serializeUserExport(payload, options);

  return new NextResponse(file.body, {
    status: 200,
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `attachment; filename="${file.filename}"`,
      "Cache-Control": "no-store",
      ...file.headers,
    },
  });
}
