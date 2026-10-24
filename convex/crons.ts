import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
const crons = cronJobs();
crons.interval(
  "refresh linked calendars",
  { minutes: 15 },
  internal.calendarFeeds.refreshDue,
  {},
);
crons.interval("backfill search fields", { minutes: 15 }, internal.migrations.searchIndexV1, {});
crons.interval("refresh pending identity checks",{minutes:5},internal.identity.pollPending,{});
export default crons;
