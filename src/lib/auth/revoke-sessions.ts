import { supabaseFetch } from "@/lib/supabase/http";
import {
  supabaseServiceRoleKey,
  supabaseUrl,
} from "@/lib/supabase/env";

/**
 * Revoke every refresh token for this Auth user. Access JWTs stay valid
 * until they expire; requireAuthUser() uses getUser(), which fails once
 * the user row is gone.
 */
export async function revokeAllUserSessions(userId: string): Promise<void> {
  const url = supabaseUrl();
  const key = supabaseServiceRoleKey();
  if (!url || !key || !userId) return;
  try {
    await supabaseFetch(
      `${url}/auth/v1/admin/users/${encodeURIComponent(userId)}/logout?scope=global`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          apikey: key,
        },
      }
    );
  } catch {
    /* best-effort: deleteUser still follows */
  }
}
