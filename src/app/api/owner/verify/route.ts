import { requireOwnerAccess, readProvidedSecret, isMasterSecret, readPortfolioIdHint } from "@/lib/owner-pin";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Verify owner PIN or password.
 * Optional JSON `{ portfolioId }` — also accepts that sheet's custom secret.
 */
export async function POST(req: Request) {
  let portfolioId: string | null = readPortfolioIdHint(req);
  try {
    const body = (await req.json().catch(() => ({}))) as {
      portfolioId?: string;
    };
    if (body.portfolioId) portfolioId = String(body.portfolioId);
  } catch {
    /* empty body ok */
  }

  const denied = await requireOwnerAccess(req, portfolioId);
  if (denied) return denied;

  const provided = readProvidedSecret(req);
  return NextResponse.json({
    ok: true,
    scope: isMasterSecret(provided)
      ? "book"
      : portfolioId
        ? "sheet"
        : "book",
    portfolioId: portfolioId || null,
  });
}
