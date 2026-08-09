import { promises as fs } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SNAPSHOT_PATH = path.join(process.cwd(), "data", "locked-demo.json");

/** Persist a locked demo snapshot to disk (dev) so seed bumps don't invent Aasad again. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.portfolios || !body?.holdings) {
      return NextResponse.json(
        { error: "Expected { portfolios, holdings }" },
        { status: 400 }
      );
    }
    await fs.mkdir(path.dirname(SNAPSHOT_PATH), { recursive: true });
    await fs.writeFile(
      SNAPSHOT_PATH,
      JSON.stringify(
        {
          savedAt: new Date().toISOString(),
          portfolios: body.portfolios,
          holdings: body.holdings,
        },
        null,
        2
      ),
      "utf8"
    );
    return NextResponse.json({ ok: true, path: "data/locked-demo.json" });
  } catch (err) {
    console.error("Failed to lock demo snapshot", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Lock failed" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const raw = await fs.readFile(SNAPSHOT_PATH, "utf8");
    return NextResponse.json(JSON.parse(raw));
  } catch {
    return NextResponse.json({ portfolios: null, holdings: null });
  }
}
