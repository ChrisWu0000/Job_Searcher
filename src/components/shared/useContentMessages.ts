import { useEffect } from "react";
import { appendEvent, saveCapturedHtml } from "@/lib/db/repo";
import { onMessage } from "@/lib/messaging/client";
import { nowIso } from "@/lib/time";
import { useUiStore } from "@/stores/ui";

export function useContentMessages(): void {
  const setWaterlooWorksPage = useUiStore((store) => store.setWaterlooWorksPage);

  useEffect(
    () =>
      onMessage({
        "ww:pageChanged": async (request) => {
          setWaterlooWorksPage({
            kind: request.kind,
            at: nowIso(),
            ...(request.jobId === undefined ? {} : { jobId: request.jobId }),
            ...(request.url === undefined ? {} : { url: request.url }),
          });
          return { acknowledged: true };
        },
        "ww:error": async (request) => {
          const page = useUiStore.getState().waterlooWorksPage;
          const at = nowIso();
          const captureId =
            request.html === undefined
              ? undefined
              : await saveCapturedHtml({
                  at,
                  kind: page?.kind ?? "other",
                  source: "error",
                  step: request.step,
                  html: request.html,
                  ...(page?.url === undefined ? {} : { url: page.url }),
                  ...(page?.jobId === undefined ? {} : { jobId: page.jobId }),
                });
          await appendEvent({
            at,
            level: "error",
            engine: "system",
            message: `${request.step}: ${request.message}`,
            data: {
              step: request.step,
              ...(captureId === undefined ? {} : { captureId }),
              ...(page?.url === undefined ? {} : { url: page.url }),
            },
          });
          return { acknowledged: true };
        },
      }),
    [setWaterlooWorksPage],
  );
}

export default useContentMessages;
