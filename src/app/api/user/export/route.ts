import { userExportResponse } from "@/lib/gdpr/export-response";
import { observeRoute } from "@/lib/observe-route";

export const dynamic = "force-dynamic";

/**
 * GDPR data portability. Auth-gated. Default is an AES-256-GCM JSON
 * envelope (unwrap key in the file and in X-Upside-Export-Key). Pass
 * encrypt=0 for plaintext JSON, format=csv for a sectioned CSV dump.
 */
async function handleGET(req: Request) {
  return userExportResponse(req, { encrypt: true });
}

export const GET = observeRoute(handleGET, "/api/user/export");
