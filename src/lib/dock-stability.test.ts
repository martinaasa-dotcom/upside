/**
 * The dock is one centred, content-sized well: its width is the number of
 * cells times a fixed cell width. That makes the cell count the thing that
 * must not move, and the failure it causes is unmistakable — walk from the
 * book to Circle and the whole bar resizes and re-centres under the cursor,
 * every label sliding sideways mid-click.
 *
 * That is exactly what `hideAdd={!onBook}` did: the add cell vanished the
 * moment you left the book, so a nine-cell row became eight. The rule it
 * broke is the one worth holding: **whether a cell exists may depend on
 * your data, never on which page you are looking at.**
 *
 * Asserted against the source rather than a render, because the bug was in
 * the wiring, not in the dock. `BookModeDock` was right both times; it was
 * handed a different cell set on different routes.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const DASHBOARD = readFileSync("src/components/Dashboard.tsx", "utf8");

/** The `<PortfolioTabs ... />` call, which is where the props are wired. */
function dockProps(): string {
  const start = DASHBOARD.indexOf("<PortfolioTabs");
  expect(start, "Dashboard renders the dock").toBeGreaterThan(-1);
  const end = DASHBOARD.indexOf("/>", start);
  expect(end, "the dock call is self-closing").toBeGreaterThan(start);
  return DASHBOARD.slice(start, end);
}

/** Props that change how many cells the row draws. */
const WIDTH_PROPS = ["portfolios", "hiddenModeIds", "hideAdd", "guest"];

describe("bottom dock width", () => {
  it("takes no width-determining prop from the route", () => {
    const props = dockProps();
    for (const name of WIDTH_PROPS) {
      const match = props.match(new RegExp(`${name}=\\{([^}]*)\\}`));
      if (!match) continue;
      expect(match[1], `${name} is wired to a route check`).not.toMatch(
        /onBook|pathname|isMetaTab|isOverview|isCompound|isLab|isPulse|isAlerts/
      );
    }
  });

  it("still wires the add cell to something, so it is reachable", () => {
    const props = dockProps();
    expect(props).toMatch(/hideAdd=\{/);
    expect(props).toMatch(/onAdd=\{/);
  });

  it("leaves route-dependent props alone — only width is the invariant", () => {
    // `activeId` and the context-menu handlers may vary by page: neither
    // adds or removes a cell. Guarding them too would be a false rule.
    const props = dockProps();
    expect(props).toMatch(/activeId=\{onBook \? activeId : null\}/);
  });
});
