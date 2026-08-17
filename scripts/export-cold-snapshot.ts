/**
 * Capture the live book, encrypt it, upload to S3/R2, and verify WAL backups.
 * Run: npx tsx scripts/export-cold-snapshot.ts
 */
import { createClient } from "@supabase/supabase-js";
import { runDisasterRecoveryJob } from "../src/lib/dr/export-book";
import {
  supabaseServiceRoleKey,
  supabaseUrl,
} from "../src/lib/supabase/env";

async function main() {
  const url = supabaseUrl();
  const key = supabaseServiceRoleKey();
  if (!url || !key) {
    console.error(
      "Need NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY."
    );
    process.exit(1);
  }
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const result = await runDisasterRecoveryJob({ supabase });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
