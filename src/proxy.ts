import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const DEFAULT_CANONICAL_HOST = "upside-upthink-solutions.vercel.app";

function canonicalHost(): string {
  return (
    process.env.UPSIDE_CANONICAL_HOST?.trim() || DEFAULT_CANONICAL_HOST
  );
}

/** Legacy host redirects + Supabase session refresh. */
export async function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const target = canonicalHost();
  const legacy =
    host.startsWith("portfolio-") ||
    host === "portfolio.vercel.app" ||
    host === "upside-upthink1.vercel.app" ||
    host === "upside-git-main-upthink1.vercel.app";
  if (legacy && host !== target) {
    const url = request.nextUrl.clone();
    url.host = target;
    url.protocol = "https";
    url.port = "";
    return NextResponse.redirect(url, 308);
  }

  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
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
