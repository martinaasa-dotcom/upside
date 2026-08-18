import { getSupabaseServer } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";

/** Fire-and-forget. Admin funnel counts people who actually used the model. */
export function stampAdvisorUse(userId: string) {
  if (!userId) return;
  const admin = getSupabaseServer();
  if (!admin) return;
  void admin
    .from(PORTFELL_TABLES.profiles)
    .update({ last_advisor_at: new Date().toISOString() })
    .eq("id", userId)
    .then(({ error }) => {
      if (error) console.error("stampAdvisorUse", error.message);
    });
}
