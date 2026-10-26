import geospatial from "@convex-dev/geospatial/test";
import legacy from "geospatial-legacy/test";
import type { TestConvex } from "convex-test";
import schema from "../../convex/schema";
export async function register(t: TestConvex<typeof schema>) {
  geospatial.register(t, "geospatialV2");
  legacy.register(t, "geospatial");
  // An empty fresh test database starts fully indexed. Migration of existing
  // records is exercised separately, rather than fabricating populated readiness.
  await t.run(async (ctx) => {
    if (await ctx.db.query("listings").first())
      throw Error("Register before creating fixtures");
    await ctx.db.insert("dataMigrations", {
      name: "geospatialV2",
      cursor: null,
      complete: true,
    });
  });
}
export default { register };
