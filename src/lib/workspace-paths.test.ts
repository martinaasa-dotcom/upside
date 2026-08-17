import { describe, expect, it } from "vitest";
import { BOOK_ROOM_PATHS, PRIVATE_NOINDEX_PATHS } from "@/lib/seo-routes";
import { workspaceRoomId } from "@/lib/workspace-paths";

describe("workspaceRoomId", () => {
  it("maps book aliases onto the keep-alive book pane", () => {
    for (const path of BOOK_ROOM_PATHS) {
      expect(workspaceRoomId(path)).toBe("book");
      if (path !== "/") expect(workspaceRoomId(`${path}/`)).toBe("book");
    }
  });

  it("does not cache join flows", () => {
    expect(workspaceRoomId("/communities/join")).toBeNull();
    expect(workspaceRoomId("/communities/join?token=abc")).toBeNull();
    expect(workspaceRoomId("/account/join")).toBeNull();
  });

  it("keeps circle, fund, and account rooms distinct", () => {
    expect(workspaceRoomId("/communities")).toBe("communities");
    expect(workspaceRoomId("/communities/abc")).toBe("community:abc");
    expect(workspaceRoomId("/upside-portfolio")).toBe("fund");
    expect(workspaceRoomId("/account")).toBe("account");
    expect(workspaceRoomId("/admin")).toBe("admin");
  });
});

describe("private noindex paths", () => {
  it("covers the authenticated rooms crawlers must skip", () => {
    expect(PRIVATE_NOINDEX_PATHS).toEqual(
      expect.arrayContaining(["/dashboard", "/lab", "/forecast", "/margus"])
    );
  });
});
