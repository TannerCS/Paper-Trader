import { describe, expect, it } from "vitest";
import { navigationGroups, primaryNavigationItems } from "../navigation";

describe("navigation", () => {
  it("provides a data-heavy application surface", () => {
    const groupedItemCount = navigationGroups.reduce((count, group) => count + group.items.length, 0);

    expect(primaryNavigationItems).toHaveLength(4);
    expect(groupedItemCount + primaryNavigationItems.length).toBeGreaterThanOrEqual(15);
  });

  it("keeps settings and provider status in the system group", () => {
    const systemGroup = navigationGroups.find((group) => group.label === "System");

    expect(systemGroup?.items.map((item) => item.path)).toEqual(
      expect.arrayContaining(["/settings", "/provider-status", "/data-manager"]),
    );
  });
});
