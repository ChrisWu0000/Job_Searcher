import { describe, expect, it } from "vitest";
import {
  isMessageType,
  messageSchemas,
  messageTypes,
  safeParseRequest,
  safeParseResponse,
  toMessageError,
} from "@/lib/messaging/protocol";

describe("dashboard background message protocol", () => {
  it("declares a validated open-dashboard request and response", () => {
    expect(messageTypes).toEqual(["bg:openDashboard"]);
    expect(safeParseRequest("bg:openDashboard", { type: "bg:openDashboard" }).success).toBe(true);
    expect(safeParseResponse("bg:openDashboard", { tabId: 7 }).success).toBe(true);
    expect(safeParseResponse("bg:openDashboard", { tabId: "7" }).success).toBe(false);
    expect(
      messageSchemas["bg:openDashboard"].request.safeParse({ type: "ww:submit" }).success,
    ).toBe(false);
  });

  it("recognizes only declared message types", () => {
    expect(isMessageType("bg:openDashboard")).toBe(true);
    expect(isMessageType("ww:submit")).toBe(false);
    expect(isMessageType(42)).toBe(false);
  });

  it("turns handler failures into explicit message errors", () => {
    expect(toMessageError("bg:openDashboard", new Error("tab API unavailable"))).toMatchObject({
      step: "bg:openDashboard",
      message: "tab API unavailable",
    });
  });
});
