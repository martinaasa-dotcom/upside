import { requireOwnerPin } from "@/lib/owner-pin";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Verify owner PIN (used before local-demo sheet deletes). */
export async function POST(req: Request) {
  const denied = requireOwnerPin(req);
  if (denied) return denied;
  return NextResponse.json({ ok: true });
}
