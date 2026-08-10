import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const DEFAULT_CANONICAL_HOST = "upside-upthink-solutions.vercel.app";

function canonicalHost(): string {
  return (
    process.env.UPSIDE_CANONICAL_HOST?.trim() || DEFAULT_CANONICAL_HOST
  );
}

/** Send leftover portfolio / old Upside hosts to the canonical production alias. */
export function proxy(request: NextRequest) {
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
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\..*).*)"],
};
