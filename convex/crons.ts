import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
const crons = cronJobs();
crons.interval(
  "refresh linked calendars",
  { minutes: 15 },
  internal.calendarFeeds.refreshDue,
  {},
);
export default crons;
