import { defineApp } from "convex/server";
import geospatial from "@convex-dev/geospatial/convex.config.js";
import legacyGeospatial from "geospatial-legacy/convex.config.js";
const app = defineApp();
app.use(legacyGeospatial, { name: "geospatial" });
app.use(geospatial, { name: "geospatialV2" });
export default app;
