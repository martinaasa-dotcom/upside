import { userExportResponse } from "@/lib/gdpr/export-response";
import { observeRoute } from "@/lib/observe-route";

export const dynamic = "force-dynamic";

/**
 * Account-page download. Same payload as /api/user/export, plaintext JSON
 * so the existing "Export my data" button stays a file they can open.
 */
async function handleGET(req: Request) {
  return userExportResponse(req, { encrypt: false });
}

export const GET = observeRoute(handleGET, "/api/account/export");
