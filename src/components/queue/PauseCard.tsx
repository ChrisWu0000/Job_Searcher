import { CheckIcon, SendIcon, SkipForwardIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/components/shared/download";
import { documentKindLabel } from "@/components/shared/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import type { ApplyControls, ApplyProgress } from "@/engines/contracts";
import { findSavedAnswerForQuestion } from "@/lib/db/repo";
import type { Question } from "@/types/application";

interface QuestionPrompt {
  id: string;
  text: string;
}

function serializeQuestionPrompts(questions: Question[]): string {
  return JSON.stringify(
    questions.map(
      (question) => ({ id: question.id, text: question.text }) satisfies QuestionPrompt,
    ),
  );
}

function QuestionField({
  question,
  value,
  suggestion,
  onChange,
}: {
  question: Question;
  value: string;
  suggestion: string | undefined;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Label className="text-sm" htmlFor={`question-${question.id}`}>
          {question.text}
        </Label>
        <Badge variant="outline">{question.kind}</Badge>
        {question.required ? <Badge variant="outline">required</Badge> : null}
      </div>
      {question.options && question.options.length > 0 ? (
        <p className="text-muted-foreground text-xs">Options: {question.options.join(" · ")}</p>
      ) : null}
      {question.kind === "textarea" ? (
        <Textarea
          id={`question-${question.id}`}
          rows={4}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
      ) : (
        <Input
          id={`question-${question.id}`}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
      )}
      {suggestion ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            onChange(suggestion);
          }}
        >
          <CheckIcon className="size-4" />
          Use saved answer
        </Button>
      ) : null}
    </div>
  );
}

export interface PauseCardProps {
  progress: ApplyProgress;
  controls: ApplyControls;
}

export function PauseCard({ progress, controls }: PauseCardProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [suggestions, setSuggestions] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const questions = progress.questions;
  const questionPayload = serializeQuestionPrompts(questions);

  useEffect(() => {
    let cancelled = false;
    const prompts = JSON.parse(questionPayload) as QuestionPrompt[];
    void Promise.all(
      prompts.map(async (prompt) => {
        const saved = await findSavedAnswerForQuestion(prompt.text);
        return [prompt.id, saved?.answer] as const;
      }),
    )
      .then((entries) => {
        if (cancelled) return;
        const next: Record<string, string> = {};
        for (const [id, answer] of entries) {
          if (answer !== undefined) next[id] = answer;
        }
        setSuggestions(next);
        setAnswers((current) => ({ ...next, ...current }));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [questionPayload]);

  if (progress.waitingFor === undefined) return null;

  const run = (action: () => Promise<void>) => {
    setBusy(true);
    void action()
      .catch((cause: unknown) => {
        toast.error(errorMessage(cause));
      })
      .finally(() => {
        setBusy(false);
      });
  };

  if (progress.waitingFor === "questions") {
    return (
      <section className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
        <header className="space-y-1">
          <h2 className="font-medium text-sm">Prescreen questions need your answers</h2>
          <p className="text-muted-foreground text-xs">
            WW++ never answers these for you. Type each answer here and into the WaterlooWorks tab
            itself, then continue.
          </p>
        </header>

        {questions.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No questions were read from the page. Continue to move on.
          </p>
        ) : (
          questions.map((question) => (
            <QuestionField
              key={question.id}
              question={question}
              value={answers[question.id] ?? ""}
              suggestion={suggestions[question.id]}
              onChange={(value) => {
                setAnswers((current) => ({ ...current, [question.id]: value }));
              }}
            />
          ))
        )}

        <div className="flex items-center gap-2">
          <Button
            disabled={busy}
            onClick={() => {
              run(() => controls.submitAnswers(answers));
            }}
          >
            Continue
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              run(() => controls.skipCurrent());
            }}
          >
            <SkipForwardIcon className="size-4" />
            Skip this job
          </Button>
        </div>
      </section>
    );
  }

  const applyState = progress.applyState;
  const selectedPackage = applyState?.packages.find(
    (candidate) => candidate.id === applyState.selectedPackageId,
  );

  return (
    <section className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
      <header className="space-y-1">
        <h2 className="font-medium text-sm">Review before submitting</h2>
        <p className="text-muted-foreground text-xs">
          Check the package and documents WaterlooWorks will send, then confirm.
        </p>
      </header>

      <div className="space-y-2 text-sm">
        <p>
          <span className="text-muted-foreground">Package: </span>
          {selectedPackage ? selectedPackage.name : (applyState?.selectedPackageId ?? "none")}
        </p>
        <Separator />
        <ul className="space-y-1">
          {(applyState?.documents ?? []).map((slot) => {
            const selected = slot.options.find((option) => option.id === slot.selectedId);
            return (
              <li key={slot.kind} className="flex items-center gap-2">
                <span className="w-40 shrink-0 text-muted-foreground">
                  {documentKindLabel(slot.kind)}
                </span>
                <span>{selected ? selected.name : "not selected"}</span>
                <span className="font-mono text-muted-foreground text-xs">{slot.kind}</span>
                {slot.required ? <Badge variant="outline">required</Badge> : null}
              </li>
            );
          })}
          {(applyState?.documents ?? []).length === 0 ? (
            <li className="text-muted-foreground">No document slots on this application.</li>
          ) : null}
        </ul>
      </div>

      <div className="flex items-center gap-2">
        <Button
          disabled={busy}
          onClick={() => {
            run(() => controls.confirmSubmit());
          }}
        >
          <SendIcon className="size-4" />
          Submit application
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => {
            run(() => controls.skipCurrent());
          }}
        >
          <SkipForwardIcon className="size-4" />
          Skip this job
        </Button>
      </div>
    </section>
  );
}

export default PauseCard;
