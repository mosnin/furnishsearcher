import React, { useState } from "react";
import { renderToString } from "react-dom/server";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { expect, it, vi } from "vitest";
// Only the optional analytics hook is excluded; real Convex subscriptions run.
vi.mock("../components/use-market-search", () => ({
  useMarketSearch: () => {},
}));
import { useRentalSearch } from "../components/use-rental-search";
import type { SearchFilters } from "../lib/search";

it.each([
  ["ordinary", {}, false],
  [
    "spatial",
    { mapBounds: { north: 31, south: 30, east: -97, west: -98 } },
    false,
  ],
  ["skipped", {}, true],
] as const)(
  "keeps %s subscriptions stable across a render update",
  (_label, filters, skip) => {
    const client = new ConvexReactClient("https://synthetic.convex.cloud");
    function Probe() {
      const [updated, setUpdated] = useState(false);
      // Fresh but equivalent filter objects must also retain the subscription.
      const result = useRentalSearch({ ...filters } as SearchFilters, skip);
      if (!updated) setUpdated(true);
      return React.createElement("p", null, result.status);
    }
    expect(
      renderToString(
        React.createElement(
          ConvexProvider,
          { client },
          React.createElement(Probe),
        ),
      ),
    ).toContain("LoadingFirstPage");
    void client.close();
  },
);
