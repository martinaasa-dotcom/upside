/**
 * A size class on a heading has to actually do something.
 *
 * `h1`–`h4` carry element rules in `globals.css` for family, size,
 * line-height, weight, tracking and wrap. Those rules used to sit outside
 * any cascade layer, and an un-layered declaration beats a layered one
 * whatever its specificity — while Tailwind emits `text-sm`, `font-medium`
 * and `tracking-tight` from `@layer utilities`. So every one of those
 * classes was silently discarded on a heading: measured on the running app,
 * `<h3 class="text-sm font-medium tracking-tight">` computed to 16px / 600 /
 * -0.02em, none of which it asked for. The visible symptom was a community's
 * name arriving in the phone top bar at the size of a page title.
 *
 * The block moved into `@layer base` on 2026-08-22, and the 53 call sites
 * whose classes that brought to life had them stripped in the same commit,
 * so nothing re-rendered. This guards the half that is easy to undo by
 * accident: a heading that names a size which disagrees with the scale is
 * now a real, visible change, and it should be made on purpose rather than
 * arrive inside a diff about something else.
 *
 * Asserted against the source rather than a render, because what matters is
 * the class that gets written, and it is written in a lot of places.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** The scale in `globals.css`. Keep these two in step. */
const SCALE: Record<string, { size: string; tracking: string }> = {
  h1: { size: "text-2xl", tracking: "tracking-[-0.035em]" },
  h2: { size: "text-lg", tracking: "tracking-[-0.028em]" },
  h3: { size: "text-base", tracking: "tracking-[-0.02em]" },
  h4: { size: "text-sm", tracking: "tracking-[-0.02em]" },
};

/** Weight, family and wrap are one value each across the whole scale. */
const SHARED_OK = new Set(["font-semibold", "font-heading", "text-balance"]);

/** Classes that name a property the element rules also set. */
const TYPOGRAPHY =
  /^(text-(?:xs|sm|base|lg|xl|2xl|3xl|4xl|5xl)|font-(?:thin|extralight|light|normal|medium|semibold|bold|extrabold|black|sans|mono|heading|logo)|tracking-[\w[\].\-%]+|leading-[\w[\].\-%]+|text-(?:balance|pretty|nowrap|wrap))$/;

/**
 * `PanelHeader`'s `hero` branch, the one heading in the app that asks for a
 * step it is not. It is an `<h2>` that wants the h1 size for the single
 * panel that opens a page, it says so in its own comment, and it spent the
 * whole un-layered era rendering identically to a plain `<h2>` — the prop
 * did nothing at all. Two call sites.
 */
const ALLOWED = [{ file: "src/components/ui/Panel.tsx", tag: "h2" }];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith(".tsx") ? [path] : [];
  });
}

type Offender = { file: string; tag: string; offending: string[] };

function offenders(): Offender[] {
  const found: Offender[] = [];
  for (const file of sourceFiles("src")) {
    const src = readFileSync(file, "utf8");
    for (const match of src.matchAll(
      /<(h[1-4])\b[^>]*?className="([^"]*)"/gs
    )) {
      const tag = match[1]!;
      const offending = match[2]!
        .split(/\s+/)
        .filter(
          (cls) =>
            TYPOGRAPHY.test(cls) &&
            !SHARED_OK.has(cls) &&
            cls !== SCALE[tag]!.size &&
            cls !== SCALE[tag]!.tracking
        );
      if (offending.length === 0) continue;
      if (ALLOWED.some((a) => a.file === file && a.tag === tag)) continue;
      found.push({ file, tag, offending });
    }
  }
  return found;
}

describe("heading scale", () => {
  it("no heading overrides the type scale by accident", () => {
    const bad = offenders();
    expect(
      bad,
      "A size, weight, leading or tracking class on an <h1>-<h4> now applies " +
        "(the element rules moved into @layer base). Either drop the class " +
        "and take the scale, or put it on a child element the way SheetPicker " +
        "and MobileTopBar do. If the override is deliberate, add it to " +
        "ALLOWED here with a note.\n" +
        bad.map((b) => `  ${b.file} <${b.tag}> ${b.offending.join(" ")}`).join("\n")
    ).toEqual([]);
  });

  it("the element rules are inside a cascade layer", () => {
    // Without this the test above stops meaning anything: un-layered element
    // rules beat utilities whatever their specificity, so a heading could
    // carry a perfectly correct size class and still not get it.
    const css = readFileSync("src/app/globals.css", "utf8");
    const scale = css.indexOf("h1,\n  h2,\n  h3,\n  h4 {");
    expect(scale, "globals.css still declares the heading scale").toBeGreaterThan(-1);

    // Walk back from the scale counting braces. If it is inside a layer, the
    // first unbalanced `{` behind it opens that layer.
    let depth = 0;
    let opener = -1;
    for (let i = scale - 1; i >= 0; i -= 1) {
      if (css[i] === "}") depth += 1;
      else if (css[i] === "{") {
        if (depth === 0) {
          opener = i;
          break;
        }
        depth -= 1;
      }
    }
    expect(opener, "the heading scale is nested inside a block").toBeGreaterThan(-1);
    expect(
      css.slice(css.lastIndexOf("\n", opener) + 1, opener + 1).trim(),
      "the heading element rules live in @layer base"
    ).toBe("@layer base {");

    const block = css.slice(opener, css.indexOf("\n}", scale));
    for (const tag of Object.keys(SCALE)) {
      expect(block, `${tag} is styled inside that layer`).toContain(`  ${tag} {`);
    }
  });
});
