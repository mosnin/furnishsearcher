import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
const crons = cronJobs();
crons.interval(
  "refresh linked calendars",
  { minutes: 15 },
  internal.calendarFeeds.refreshDue,
  {},
);
crons.interval(
  "backfill search fields",
  { minutes: 15 },
  internal.migrations.searchIndexV1,
  {},
);
crons.interval(
  "refresh pending identity checks",
  { minutes: 5 },
  internal.identity.pollPending,
  {},
);
crons.interval(
  "expire location request metadata",
  { hours: 24 },
  internal.geo.cleanupRequests,
  {},
);
crons.interval(
  "refresh outstanding document signatures",
  { minutes: 5 },
  internal.rocketSign.pollDue,
  {},
);
export default crons;
