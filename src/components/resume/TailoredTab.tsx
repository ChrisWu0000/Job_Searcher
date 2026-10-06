import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import RunnerStatus from "@/components/shared/RunnerStatus";
import { useEngine, useRegisteredEngine } from "@/components/shared/useEngine";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ResumeProgress } from "@/engines/contracts";
import { emptyBankMessage } from "@/engines/ResumeEngine";
import { formatUsd } from "@/lib/ai/cost";
import { db } from "@/lib/db/db";
import { listExperiences, listTailoredResumes } from "@/lib/db/repo";
import { useUiStore } from "@/stores/ui";
import type { TailoringSource } from "@/types/resume";
import TailoredResumeList from "./TailoredResumeList";
import TailoredResumeView from "./TailoredResumeView";
import { startTailoring, tailoringSourceLabels, tailoringSources } from "./tailorActions";

export function TailoredTab() {
  const selectedTailoredResumeId = useUiStore((store) => store.selectedTailoredResumeId);
  const openTailoredResume = useUiStore((store) => store.openTailoredResume);
  const [source, setSource] = useState<TailoringSource>("local");

  const engine = useRegisteredEngine<ResumeProgress>("resume");
  const { state, progress, logs, lastError } = useEngine(engine);

  const jobs = useLiveQuery(() => db.jobs.toArray(), []);
  const resumes = useLiveQuery(() => listTailoredResumes(), []);
  const entries = useLiveQuery(() => listExperiences(), []);

  const pendingIds = (jobs ?? []).filter((job) => job.status === "interested").map((job) => job.id);
  const bankEmpty = entries !== undefined && entries.length === 0;

  return (
    <div className="space-y-4">
      <RunnerStatus
        title="Tailoring"
        description="Every tailored resume is built from the experience bank only."
        engine={engine}
        state={state}
        logs={logs}
        lastError={lastError}
        completed={progress?.done}
        total={progress?.total}
        startLabel={`Tailor interested jobs (${pendingIds.length})`}
        startDisabled={pendingIds.length === 0 || bankEmpty}
        onStart={() => {
          startTailoring(pendingIds, source);
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="tailor-source" className="text-xs">
            Source
          </Label>
          <Select
            value={source}
            onValueChange={(next) => {
              setSource(next as TailoringSource);
            }}
          >
            <SelectTrigger id="tailor-source" size="sm" className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {tailoringSources.map((option) => (
                <SelectItem key={option} value={option}>
                  {tailoringSourceLabels[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {bankEmpty ? (
          <p className="text-amber-600 text-xs dark:text-amber-400">{emptyBankMessage}</p>
        ) : null}

        {progress ? (
          <p className="text-muted-foreground text-xs">
            {progress.failed} failed · {formatUsd(progress.costUsd)} spent
          </p>
        ) : null}

        {!engine ? (
          <p className="text-muted-foreground text-xs">
            Tailor from a job's drawer or the Jobs bulk bar.
          </p>
        ) : null}
      </RunnerStatus>

      <div className="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <TailoredResumeList
          resumes={resumes ?? []}
          selectedId={selectedTailoredResumeId}
          onSelect={openTailoredResume}
        />
        <TailoredResumeView resumeId={selectedTailoredResumeId} />
      </div>
    </div>
  );
}

export default TailoredTab;
