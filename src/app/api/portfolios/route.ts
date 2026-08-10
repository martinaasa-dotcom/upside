import { DEMO_HOLDINGS, DEMO_PORTFOLIOS } from "@/lib/demo-store";
import { saveBookSnapshot } from "@/lib/book-snapshot";
import { requireOwnerPin } from "@/lib/owner-pin";
import { getSupabaseServer } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "sheet"
  );
}

export async function GET() {
  const supabase = getSupabaseServer();

  if (!supabase) {
    return NextResponse.json({
      source: "demo",
      portfolios: DEMO_PORTFOLIOS,
      holdings: DEMO_HOLDINGS,
    });
  }

  const [{ data: portfolios, error: pErr }, { data: holdings, error: hErr }] =
    await Promise.all([
      supabase
        .from(PORTFELL_TABLES.portfolios)
        .select("*")
        .order("sort_order"),
      supabase.from(PORTFELL_TABLES.holdings).select("*").order("sort_order"),
    ]);

  if (pErr || hErr) {
    return NextResponse.json(
      { error: pErr?.message ?? hErr?.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    source: "supabase",
    portfolios: portfolios ?? [],
    holdings: holdings ?? [],
  });
}

export async function POST(req: NextRequest) {
  const denied = requireOwnerPin(req);
  if (denied) return denied;

  const supabase = getSupabaseServer();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured — use local demo store" },
      { status: 400 }
    );
  }

  const body = await req.json();
  const name = String(body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  const { count } = await supabase
    .from(PORTFELL_TABLES.portfolios)
    .select("*", { count: "exact", head: true });

  const { data, error } = await supabase
    .from(PORTFELL_TABLES.portfolios)
    .insert({
      name,
      slug: slugify(name),
      sort_order: (count ?? 0) + 1,
      cash_balance: 0,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ portfolio: data });
}

export async function PATCH(req: NextRequest) {
  const denied = requireOwnerPin(req);
  if (denied) return denied;

  const supabase = getSupabaseServer();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 400 }
    );
  }

  const body = await req.json();
  const id = body.id as string;
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (body.cash_balance !== undefined) {
    patch.cash_balance = Number(body.cash_balance);
  }
  if (body.name !== undefined) patch.name = body.name;

  const { data, error } = await supabase
    .from(PORTFELL_TABLES.portfolios)
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ portfolio: data });
}

export async function DELETE(req: NextRequest) {
  const denied = requireOwnerPin(req);
  if (denied) return denied;

  const supabase = getSupabaseServer();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 400 }
    );
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  try {
    const { data: sheet } = await supabase
      .from(PORTFELL_TABLES.portfolios)
      .select("name")
      .eq("id", id)
      .maybeSingle();

    await saveBookSnapshot(
      supabase,
      "pre_delete",
      sheet?.name
        ? `Before delete · ${sheet.name}`
        : "Before delete"
    );

    const { error } = await supabase
      .from(PORTFELL_TABLES.portfolios)
      .delete()
      .eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to snapshot before delete",
      },
      { status: 500 }
    );
  }
}
