import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/db";
import { countScoresForVersion, jobsClosingWithin } from "@/lib/db/repo";
import { cn } from "@/lib/utils";
import { useProfile } from "./useProfile";

export const closingSoonHours = 24;

function CountChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | undefined;
  tone?: string;
}) {
  return (
    <span className={cn("flex items-baseline gap-1.5 rounded-md bg-muted px-2.5 py-1", tone)}>
      <span className="font-medium text-sm tabular-nums">{value ?? "—"}</span>
      <span className="text-xs opacity-80">{label}</span>
    </span>
  );
}

export function DatabaseCounts() {
  const profile = useProfile();
  const profileVersion = profile?.version;

  const jobCount = useLiveQuery(() => db.jobs.count(), []);
  const scoredCount = useLiveQuery(
    () => (profileVersion === undefined ? 0 : countScoresForVersion(profileVersion)),
    [profileVersion],
  );
  const queuedCount = useLiveQuery(
    () => db.applications.where("status").equals("queued").count(),
    [],
  );
  const closingSoonCount = useLiveQuery(
    async () => (await jobsClosingWithin(closingSoonHours)).length,
    [],
  );

  return (
    <div className="flex items-center gap-2">
      <CountChip label="jobs" value={jobCount} />
      <CountChip label="scored" value={scoredCount} />
      <CountChip label="queued" value={queuedCount} />
      {closingSoonCount !== undefined && closingSoonCount > 0 ? (
        <CountChip
          label="closing soon"
          value={closingSoonCount}
          tone="bg-amber-500/15 text-amber-700 dark:text-amber-300"
        />
      ) : null}
    </div>
  );
}

export default DatabaseCounts;
