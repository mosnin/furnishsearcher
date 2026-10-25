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
crons.interval(
  "clean retired profile photo receipts",
  { hours: 24 },
  internal.profileImages.cleanupReceipts,
  {},
);

crons.interval(
  "backfill participant inboxes",
  { minutes: 1 },
  internal.inbox.backfill,
  {},
);
crons.interval(
  "retry pending inbox folder work",
  { minutes: 5 },
  internal.inbox.retryPending,
  {},
);

crons.interval(
  "backfill participant name search",
  { minutes: 1 },
  internal.messageSearch.backfillNames,
  {},
);
crons.interval(
  "retry participant name updates",
  { minutes: 5 },
  internal.messageSearch.retryNames,
  {},
);
crons.interval(
  "recover inbound email work",
  { minutes: 5 },
  internal.inboundEmails.recover,
  {},
);
crons.interval(
  "remove expired email reply bindings",
  { hours: 24 },
  internal.inboundEmails.cleanupBindings,
  {},
);
crons.interval(
  "refresh eligible market inventory",
  { hours: 24 },
  internal.marketSupply.refresh,
  {},
);
crons.interval(
  "recover market inventory collection",
  { minutes: 15 },
  internal.marketSupply.recover,
  {},
);
crons.interval(
  "clean old market inventory snapshots",
  { hours: 24 },
  internal.marketSupply.cleanup,
  {},
);
crons.interval(
  "expire market activity references",
  { hours: 24 },
  internal.marketInsights.cleanup,
  {},
);
crons.interval(
  "expire AI search rate metadata",
  { hours: 24 },
  internal.guidedSearch.cleanup,
  {},
);
crons.interval(
  "expire listing performance activity",
  { hours: 24 },
  internal.listingPerformance.cleanup,
  {},
);
export default crons;
