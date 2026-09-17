import { prettyJsonText } from "@/components/shared/format";
import JsonBlock from "@/components/shared/JsonBlock";

export interface PromptViewerProps {
  prompt: string;
  rawResponse: string;
}

export function PromptViewer({ prompt, rawResponse }: PromptViewerProps) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <JsonBlock label="Prompt" text={prettyJsonText(prompt)} />
      <JsonBlock label="Raw response" text={prettyJsonText(rawResponse)} />
    </div>
  );
}

export default PromptViewer;
