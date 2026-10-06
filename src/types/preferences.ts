import type { z } from "zod";
import type {
  constraintKindSchema,
  constraintSchema,
  profileSchema,
  reasoningEffortSchema,
  unknownPayPolicySchema,
} from "./schemas";

export type ConstraintKind = z.infer<typeof constraintKindSchema>;
export type Constraint = z.infer<typeof constraintSchema>;
export type ReasoningEffort = z.infer<typeof reasoningEffortSchema>;
export type UnknownPayPolicy = z.infer<typeof unknownPayPolicySchema>;
export type Profile = z.infer<typeof profileSchema>;

export const defaultModelId = "z-ai/glm-5.3-flash";

export const defaultProfile: Profile = {
  id: "me",
  resumeText: "",
  reach:
    "Internships in software engineering, data science, cyber security, hardware engineering, or fintech. In Canada, prioritize strong pay, a recognized employer such as a bank, or broadly transferable technical experience. Pay must be explicitly stated and meet the hourly minimum, regardless of company reputation.",
  constraints: [
    {
      id: "ca-pay",
      kind: "hard",
      weight: 5,
      text: "Canadian jobs are rejected unless hourly pay is at least the CAD floor",
    },
    {
      id: "us-pay",
      kind: "hard",
      weight: 5,
      text: "US jobs are rejected if hourly pay is below the USD floor",
    },
    {
      id: "software",
      kind: "hard",
      weight: 5,
      text: "Role must be in software engineering, data science, cyber security, hardware engineering, or fintech",
    },
    {
      id: "pay-disclosure",
      kind: "hard",
      weight: 5,
      text: "Pay must state a numeric minimum, a time basis, and an identifiable currency. Reject missing pay, vague or competitive pay, university norms, and upper-bound-only offers. Do not infer salary from company reputation, university averages, benefits, or unrelated numbers.",
    },
    {
      id: "no-nonswe",
      kind: "hard",
      weight: 5,
      text: "No research assistant, grad-student, HR, business, marketing, QA-only, or IT support roles",
    },
    { id: "pay", kind: "soft", weight: 5, text: "Higher pay is better" },
    {
      id: "ca-value",
      kind: "hard",
      weight: 5,
      text: "A role in Canada must offer at least one of: strong pay meeting the CAD floor (or the USD floor when paid in USD), a recognized employer, or broadly transferable experience in a target field. This does not waive the pay minimum or target-field requirements.",
    },
    {
      id: "interest",
      kind: "soft",
      weight: 4,
      text: "Interesting, technically substantive work over routine CRUD or maintenance",
    },
    {
      id: "company",
      kind: "soft",
      weight: 3,
      text: "Prefer well-known or well-funded companies",
    },
  ],
  payFloors: { CAD: 60, USD: 50 },
  unknownPay: "reject",
  model: defaultModelId,
  reasoningEffort: "medium",
  version: "",
};
