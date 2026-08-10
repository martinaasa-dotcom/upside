import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const CANONICAL_HOST = "upside-upthink-solutions.vercel.app";

/** Send leftover portfolio / old Upside hosts to the canonical production alias. */
export function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const legacy =
    host.startsWith("portfolio-") ||
    host === "portfolio.vercel.app" ||
    host === "upside-upthink1.vercel.app" ||
    host === "upside-git-main-upthink1.vercel.app";
  if (legacy) {
    const url = request.nextUrl.clone();
    url.host = CANONICAL_HOST;
    url.protocol = "https";
    url.port = "";
    return NextResponse.redirect(url, 308);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\..*).*)"],
};
