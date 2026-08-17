import { listOwnedPortfolioIds } from "@/lib/auth/ownership";
import {
  collectUserExport,
  parseExportOptions,
  serializeUserExport,
} from "@/lib/gdpr/user-export";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseDataClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function userExportResponse(
  req: Request,
  defaults: { encrypt: boolean }
): Promise<NextResponse> {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

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
