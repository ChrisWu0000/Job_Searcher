import { CopyIcon, DownloadIcon, ExternalLinkIcon, RotateCcwIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { downloadText, errorMessage } from "@/components/shared/download";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { setTailoredResumeLatex } from "@/lib/db/repo";
import { latexOf, resumeFileName } from "@/lib/resume/latex";
import type { TailoredResume } from "@/types/resume";
import { openInOverleaf } from "./overleaf";

const autosaveDebounceMs = 500;

export interface LatexEditorProps {
  resume: TailoredResume;
}

export function LatexEditor({ resume }: LatexEditorProps) {
  const stored = latexOf(resume);
  const [text, setText] = useState(stored);

  useEffect(() => {
    setText(latexOf(resume));
  }, [resume]);

  useEffect(() => {
    if (text === stored) return;
    const handle = setTimeout(() => {
      void setTailoredResumeLatex(resume.id, text).catch((cause: unknown) => {
        toast.error(errorMessage(cause));
      });
    }, autosaveDebounceMs);
    return () => {
      clearTimeout(handle);
    };
  }, [text, stored, resume.id]);

  const edited = text !== resume.latex;

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-medium text-sm">LaTeX</h3>
        {edited ? <Badge variant="secondary">Edited</Badge> : null}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!edited}
            onClick={() => {
              setText(resume.latex);
              void setTailoredResumeLatex(resume.id, resume.latex).catch((cause: unknown) => {
                toast.error(errorMessage(cause));
              });
            }}
          >
            <RotateCcwIcon className="size-4" />
            Reset to generated
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void navigator.clipboard
                .writeText(text)
                .then(() => {
                  toast.success("LaTeX copied");
                })
                .catch((cause: unknown) => {
                  toast.error(errorMessage(cause));
                });
            }}
          >
            <CopyIcon className="size-4" />
            Copy
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              downloadText(resumeFileName(resume), text, "text/x-tex");
            }}
          >
            <DownloadIcon className="size-4" />
            Download .tex
          </Button>
          <Button
            size="sm"
            onClick={() => {
              openInOverleaf(text);
            }}
          >
            <ExternalLinkIcon className="size-4" />
            Open in Overleaf
          </Button>
        </div>
      </div>
      <Textarea
        className="min-h-96 font-mono text-xs"
        value={text}
        spellCheck={false}
        onChange={(event) => {
          setText(event.target.value);
        }}
      />
      <p className="text-muted-foreground text-xs">Edits save automatically.</p>
    </section>
  );
}

export default LatexEditor;
