import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "abandoned case scan",
  { hourUTC: 3, minuteUTC: 0 },
  internal.abandonedCases.scanAndCloseAbandoned,
);

export default crons;
