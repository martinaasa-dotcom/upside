import { NextResponse } from "next/server";
import type { z } from "zod";

/**
 * Parse a JSON request body with a Zod schema. Empty body is `{}`.
 * Garbage JSON and schema failures are both 400, never an unhandled throw.
 */
export async function parseJsonBody<S extends z.ZodType>(
  req: Request,
  schema: S
): Promise<
  { ok: true; data: z.infer<S> } | { ok: false; response: NextResponse }
> {
  let value: unknown = {};
  const text = await req.text();
  if (text.trim()) {
    try {
      value = JSON.parse(text) as unknown;
    } catch {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Couldn't read that request." },
          { status: 400 }
        ),
      };
    }
  }
  const result = schema.safeParse(value);
  if (!result.success) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Couldn't read that request." },
        { status: 400 }
      ),
    };
  }
  return { ok: true, data: result.data };
}
