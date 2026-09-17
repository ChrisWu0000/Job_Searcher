import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface JsonBlockProps {
  text: string;
  className?: string;
  label?: string;
}

export function JsonBlock({ text, className, label }: JsonBlockProps) {
  const [copied, setCopied] = useState(false);

  return (
    <div className={cn("relative rounded-md border bg-muted/40", className)}>
      <div className="absolute top-2 right-2 z-10">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            void navigator.clipboard
              .writeText(text)
              .then(() => {
                setCopied(true);
                setTimeout(() => {
                  setCopied(false);
                }, 1200);
              })
              .catch(() => undefined);
          }}
        >
          {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      {label ? (
        <p className="border-b px-3 py-1.5 font-medium text-muted-foreground text-xs">{label}</p>
      ) : null}
      <pre className="max-h-[60vh] overflow-auto p-3 font-mono text-xs leading-relaxed">{text}</pre>
    </div>
  );
}

export default JsonBlock;
