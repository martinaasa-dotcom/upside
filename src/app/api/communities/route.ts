import { requireAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseDataClient } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json({ communities: [] });
  }

  const { data: memberships, error } = await supabase
    .from(PORTFELL_TABLES.communityMembers)
    .select("community_id, role, joined_at")
    .eq("user_id", auth.user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ids = ((memberships ?? []) as { community_id: string }[]).map(
    (m) => m.community_id
  );
  if (!ids.length) {
    return NextResponse.json({ communities: [] });
  }

  const { data: communities, error: cErr } = await supabase
    .from(PORTFELL_TABLES.communities)
    .select("id, name, visibility, created_by, created_at, updated_at")
    .in("id", ids)
    .order("name");

  if (cErr) {
    return NextResponse.json({ error: cErr.message }, { status: 500 });
  }

  const roleById = new Map(
    ((memberships ?? []) as { community_id: string; role: string }[]).map(
      (m) => [m.community_id, m.role]
    )
  );

  return NextResponse.json({
    communities: (communities ?? []).map((c) => ({
      ...(c as object),
      role: roleById.get((c as { id: string }).id) ?? "member",
    })),
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const name = String((body as { name?: string }).name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  const visibility =
    (body as { visibility?: string }).visibility === "public"
      ? "public"
      : "private";

  const { data: community, error } = await supabase
    .from(PORTFELL_TABLES.communities)
    .insert({
      name,
      visibility,
      created_by: auth.user.id,
    })
    .select("id, name, visibility, created_by, created_at, updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { error: mErr } = await supabase
    .from(PORTFELL_TABLES.communityMembers)
    .insert({
      community_id: (community as { id: string }).id,
      user_id: auth.user.id,
      role: "admin",
    });

  if (mErr) {
    return NextResponse.json({ error: mErr.message }, { status: 500 });
  }

  return NextResponse.json({
    community: { ...(community as object), role: "admin" },
  });
}
