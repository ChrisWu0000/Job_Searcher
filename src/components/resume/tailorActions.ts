import { toast } from "sonner";
import { errorMessage } from "@/components/shared/download";
import { ResumeEngine } from "@/engines/ResumeEngine";
import { engineRegistry } from "@/engines/registry";
import { useUiStore } from "@/stores/ui";
import type { TailoringSource } from "@/types/resume";

export const tailoringSourceLabels: Record<TailoringSource, string> = {
  local: "Local match (free, instant)",
  model: "With model (rewrites bullets)",
};

export const tailoringSources: TailoringSource[] = ["local", "model"];

export function startTailoring(jobIds: string[], source: TailoringSource): ResumeEngine {
  const engine = new ResumeEngine({ jobIds, source });
  engineRegistry.set("resume", engine);
  void engine
    .start()
    .then(() => {
      const last = engine.progress?.lastResume;
      if (jobIds.length === 1 && last) useUiStore.getState().openTailoredResume(last.id);
    })
    .catch((cause: unknown) => {
      toast.error(errorMessage(cause));
    });
  return engine;
}
