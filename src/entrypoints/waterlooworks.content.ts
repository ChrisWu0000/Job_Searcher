import { type MessageHandler, onMessage, sendToDashboard } from "@/lib/messaging/client";
import type { ContentMessageType, RequestFor, ResponseFor } from "@/lib/messaging/protocol";
import { waterlooWorksMatchPattern } from "@/lib/messaging/tabs";
import {
  captureSanitizedHtml,
  createWaterlooWorksAdapter,
  describeCurrentPage,
} from "@/lib/waterlooworks/adapter";
import { watchNavigation } from "@/lib/waterlooworks/observer";
import { describePageKind } from "@/lib/waterlooworks/pageKind";
import { mountPill } from "@/lib/waterlooworks/pill";

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function reportError(step: string, cause: unknown): void {
  sendToDashboard({
    type: "ww:error",
    step,
    message: messageOf(cause),
    html: captureSanitizedHtml(),
  }).catch(() => undefined);
}

function guarded<TType extends ContentMessageType>(
  type: TType,
  run: (request: RequestFor<TType>) => Promise<ResponseFor<TType>>,
): MessageHandler<TType> {
  return async (request) => {
    try {
      return await run(request);
    } catch (cause) {
      reportError(type, cause);
      throw cause;
    }
  };
}

export default defineContentScript({
  matches: [waterlooWorksMatchPattern],
  runAt: "document_idle",
  async main(context) {
    const adapter = createWaterlooWorksAdapter();

    onMessage({
      "ww:getPageKind": guarded("ww:getPageKind", () => adapter.getPageKind()),
      "ww:navigateToResults": guarded("ww:navigateToResults", () => adapter.navigateToResults()),
      "ww:applyQuickFilters": guarded("ww:applyQuickFilters", () => adapter.applyQuickFilters()),
      "ww:scrapeResultsPage": guarded("ww:scrapeResultsPage", () => adapter.scrapeResultsPage()),
      "ww:nextResultsPage": guarded("ww:nextResultsPage", () => adapter.nextResultsPage()),
      "ww:openJob": guarded("ww:openJob", (request) => adapter.openJob(request.jobId)),
      "ww:getCurrentJobId": guarded("ww:getCurrentJobId", () => adapter.getCurrentJobId()),
      "ww:scrapeCurrentJob": guarded("ww:scrapeCurrentJob", () => adapter.scrapeCurrentJob()),
      "ww:startApplication": guarded("ww:startApplication", (request) =>
        adapter.startApplication(request.jobId),
      ),
      "ww:getApplyState": guarded("ww:getApplyState", () => adapter.getApplyState()),
      "ww:selectPackage": guarded("ww:selectPackage", (request) =>
        adapter.selectPackage(request.packageId),
      ),
      "ww:selectDocument": guarded("ww:selectDocument", (request) =>
        adapter.selectDocument(request.kind, request.documentId),
      ),
      "ww:getPrescreenQuestions": guarded("ww:getPrescreenQuestions", () =>
        adapter.getPrescreenQuestions(),
      ),
      "ww:submit": guarded("ww:submit", () => adapter.submit()),
      "ww:highlight": guarded("ww:highlight", (request) =>
        adapter.highlight(request.selectorKey, request.label, request.durationMs),
      ),
      "ww:fetchResults": guarded("ww:fetchResults", (request) =>
        adapter.fetchResults(request.page, request.itemsPerPage),
      ),
      "ww:fetchPosting": guarded("ww:fetchPosting", (request) =>
        adapter.fetchPosting(request.jobId),
      ),
      "ww:captureHtml": guarded("ww:captureHtml", () => adapter.captureHtml()),
    });

    let lastSignature = "";
    const announcePage = (): void => {
      const page = describeCurrentPage();
      const signature = `${page.kind}:${page.jobId ?? ""}`;
      if (signature === lastSignature) return;
      lastSignature = signature;
      console.info(`WW++ ${describePageKind(page)}`);
      sendToDashboard({
        type: "ww:pageChanged",
        kind: page.kind,
        jobId: page.jobId,
        url: location.href,
      }).catch(() => undefined);
    };

    const stopWatching = watchNavigation(announcePage);
    context.onInvalidated(stopWatching);
    announcePage();

    await mountPill(context).catch((cause: unknown) => {
      console.warn("WW++ could not mount the pill", cause);
    });
  },
});
