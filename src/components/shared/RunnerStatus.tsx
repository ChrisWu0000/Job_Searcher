import { PauseIcon, PlayIcon, SquareIcon } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import type { EngineState, LogEvent } from "@/engines/Engine";
import { cn } from "@/lib/utils";
import type { ObservableEngine } from "./useEngine";

const stateLabels: Record<EngineState, string> = {
  idle: "Idle",
  running: "Running",
  paused: "Paused",
  stopped: "Stopped",
  failed: "Failed",
};

const stateClasses: Record<EngineState, string> = {
  idle: "bg-muted text-muted-foreground",
  running: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  paused: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  stopped: "bg-muted text-muted-foreground",
  failed: "bg-destructive/15 text-destructive",
};

const logLevelClasses: Record<LogEvent["level"], string> = {
  debug: "text-muted-foreground",
  info: "text-foreground",
  warn: "text-amber-600 dark:text-amber-400",
  error: "text-destructive",
};

export interface RunnerStatusProps<TProgress> {
  title: string;
  description?: string;
  engine: ObservableEngine<TProgress> | undefined;
  state: EngineState;
  logs: LogEvent[];
  lastError?: Error;
  completed?: number;
  total?: number;
  onStart: () => void;
  startLabel?: string;
  startDisabled?: boolean;
  children?: ReactNode;
}

export function RunnerStatus<TProgress>({
  title,
  description,
  engine,
  state,
  logs,
  lastError,
  completed,
  total,
  onStart,
  startLabel = "Start",
  startDisabled = false,
  children,
}: RunnerStatusProps<TProgress>) {
  const active = state === "running" || state === "paused";
  const percent =
    total !== undefined && total > 0 && completed !== undefined
      ? Math.min(100, Math.round((completed / total) * 100))
      : undefined;
  const recentLogs = logs.slice(-40);
  const pauseReason =
    state === "paused"
      ? [...logs].reverse().find((log) => log.level === "warn")?.message
      : undefined;
  const logList = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const list = logList.current;
    if (list && logs.length > 0) list.scrollTop = list.scrollHeight;
  }, [logs]);

  return (
    <section className="rounded-lg border bg-card text-card-foreground">
      <header className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="font-medium text-sm">{title}</span>
          {description ? (
            <span className="text-muted-foreground text-xs">{description}</span>
          ) : null}
        </div>
        <Badge className={cn("border-transparent", stateClasses[state])}>
          {stateLabels[state]}
        </Badge>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={onStart} disabled={startDisabled || active}>
            <PlayIcon className="size-4" />
            {startLabel}
          </Button>
          {state === "paused" ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                engine?.resume();
              }}
            >
              <PlayIcon className="size-4" />
              Resume
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={state !== "running"}
              onClick={() => {
                engine?.pause();
              }}
            >
              <PauseIcon className="size-4" />
              Pause
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={!active}
            onClick={() => {
              engine?.stop();
            }}
          >
            <SquareIcon className="size-4" />
            Stop
          </Button>
        </div>
      </header>

      <div className="space-y-3 px-4 py-3">
        {percent !== undefined ? (
          <div className="space-y-1">
            <Progress value={percent} />
            <p className="text-muted-foreground text-xs">
              {completed} of {total} ({percent}%)
            </p>
          </div>
        ) : null}

        {children}

        {pauseReason ? (
          <p className="rounded-md bg-amber-500/10 px-3 py-2 text-amber-700 text-xs dark:text-amber-300">
            Paused: {pauseReason}
          </p>
        ) : null}

        {lastError ? (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-destructive text-xs">
            {lastError.message}
          </p>
        ) : null}

        {recentLogs.length > 0 ? (
          <>
            <Separator />
            <ul ref={logList} className="max-h-64 space-y-0.5 overflow-y-auto font-mono text-xs">
              {recentLogs.map((log) => (
                <li
                  key={`${log.at}-${log.message}`}
                  className={cn("whitespace-pre-wrap break-words", logLevelClasses[log.level])}
                >
                  <span className="text-muted-foreground">{log.at.slice(11, 19)} </span>
                  {log.message}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </section>
  );
}

export default RunnerStatus;
