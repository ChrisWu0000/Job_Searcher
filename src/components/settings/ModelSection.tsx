import { PlugZapIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/components/shared/download";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ConnectionTestResult, ModelPricing } from "@/lib/ai/contracts";
import { fetchModelPricing, testConnection } from "@/lib/ai/openrouter";
import { getApiKey } from "@/lib/storage/apiKey";
import { cn } from "@/lib/utils";
import type { ReasoningEffort } from "@/types/preferences";

const efforts: ReasoningEffort[] = ["low", "medium", "high"];

export interface ModelSectionProps {
  model: string;
  reasoningEffort: ReasoningEffort;
  onModelChange: (model: string) => void;
  onReasoningEffortChange: (effort: ReasoningEffort) => void;
}

export function ModelSection({
  model,
  reasoningEffort,
  onModelChange,
  onReasoningEffortChange,
}: ModelSectionProps) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<ConnectionTestResult | undefined>(undefined);
  const [pricing, setPricing] = useState<ModelPricing | undefined>(undefined);

  const runTest = async () => {
    setTesting(true);
    try {
      const apiKey = await getApiKey();
      if (!apiKey) {
        toast.error("Save an OpenRouter API key first");
        return;
      }
      const connection = await testConnection({ apiKey, model });
      setResult(connection);
      const modelPricing = await fetchModelPricing(apiKey, model);
      setPricing(modelPricing);
    } catch (cause) {
      toast.error(errorMessage(cause));
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="model-id">Model</Label>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            id="model-id"
            className="max-w-md font-mono"
            value={model}
            placeholder="z-ai/glm-5.3-flash"
            onChange={(event) => {
              onModelChange(event.target.value);
            }}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={testing}
            onClick={() => {
              void runTest();
            }}
          >
            <PlugZapIcon className="size-4" />
            {testing ? "Testing…" : "Test connection"}
          </Button>
        </div>
        {result ? (
          <p
            className={cn(
              "text-xs",
              result.ok ? "text-emerald-600 dark:text-emerald-400" : "text-destructive",
            )}
          >
            {result.ok ? "Connected" : "Failed"} · {result.message}
            {result.latencyMs === undefined ? "" : ` · ${result.latencyMs} ms`}
          </p>
        ) : null}
        {pricing ? (
          <p className="text-muted-foreground text-xs">
            ${pricing.promptUsdPerMillion.toFixed(3)} in / $
            {pricing.completionUsdPerMillion.toFixed(3)} out per million tokens
            {pricing.contextLength === undefined
              ? ""
              : ` · ${pricing.contextLength.toLocaleString()} token context`}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label>Reasoning effort</Label>
        <Select
          value={reasoningEffort}
          onValueChange={(next) => {
            onReasoningEffortChange(next as ReasoningEffort);
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {efforts.map((effort) => (
              <SelectItem key={effort} value={effort}>
                {effort}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

export default ModelSection;
