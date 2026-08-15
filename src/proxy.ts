import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  isLegacyHost,
  isLocalHost,
  isVercelPreviewHost,
  redirectTarget,
} from "@/lib/site-url";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

/**
 * Legacy host redirects + Supabase session refresh.
 *
 * Document navigations to a known legacy host 301 to the canonical host,
 * path and query intact. `/api/*` stays on the incoming host so cron jobs
 * and signed webhooks do not drop a body on a redirect.
 */
export async function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const target = redirectTarget();
  const path = request.nextUrl.pathname;
  const isApi = path.startsWith("/api/");

  if (
    target &&
    !isLocalHost(host) &&
    host.split(":")[0].toLowerCase() !== target &&
    !isApi &&
    (isLegacyHost(host) || !isVercelPreviewHost(host))
  ) {
    const url = request.nextUrl.clone();
    url.host = target;
    url.protocol = "https";
    url.port = "";
    return NextResponse.redirect(url, 301);
  }

  let response = NextResponse.next({ request });

  const url = supabaseUrl();
  const key = supabaseAnonKey();
  if (url && key) {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    });
    await supabase.auth.getUser();
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\..*).*)"],
};
