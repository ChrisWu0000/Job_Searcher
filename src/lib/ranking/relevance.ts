import type { Job } from "@/types/job";
import type { Profile } from "@/types/preferences";
import { classifyJobCategories } from "./categories";

const hardwareTitle =
  /\b(embedded|firmware|hardware|mechatronics|mechanical|electrical|electronics|fpga|asic|pcb|cad|autocad|solidworks|civil|manufacturing)\b/i;
const nonSoftwareTitle =
  /\b(human resources|hr|recruiter|recruiting|marketing|sales|accounting|accountant|finance|business analyst|business development|product manager|project manager|research assistant|lab technician|it support|technical support|help\s?desk|quality assurance|qa|manual test(?:er|ing)?)\b/i;
const softwareTitle =
  /\b(software|swe|sde|full[ -]?stack|back[ -]?end|front[ -]?end|web|mobile|ios|android|devops|site reliability|sre|platform|infrastructure|cloud|machine learning|ml|ai|data)\s*(?:(?:software|systems?|applications?)\s+)?(?:engineer(?:ing)?|develop(?:er|ment)|programmer)\b|\b(?:software|swe|sde|devops|full[ -]?stack|back[ -]?end|front[ -]?end)\s+(?:intern|co[ -]?op)\b|\b(?:applications? developer|programmer analyst)\b/i;
const softwareWork =
  /\b(?:build|building|develop|developing|implement|implementing|design|designing|maintain|maintaining|write|writing|ship|shipping)\b[^.!?\n]{0,120}\b(?:software|web applications?|mobile applications?|apis?|microservices|backend|frontend|distributed systems|data pipelines|cloud services|machine learning (?:models|systems)|(?:go|python|java|rust|typescript) services)\b/i;
const hardwareWork =
  /\b(?:build|building|develop|developing|design|designing|implement|implementing|write|writing)\b[^.!?\n]{0,80}\b(?:firmware|embedded (?:software|systems)|circuit boards?|pcb|fpga|asic|cad (?:models|drawings)|solidworks)\b/i;

export function relevanceViolation(
  job: Job,
  profile: Profile,
): { id: string; reason: string } | undefined {
  const categories = classifyJobCategories(job);
  const hard = new Set(
    profile.constraints.filter((item) => item.kind === "hard").map((item) => item.id),
  );
  const duties = job.responsibilities || job.summary || job.rawText;
  const title = job.title.replace(/\bCAD\s*\$?\s*\d[\d.,]*|\d[\d.,]*\s*CAD\b/gi, "");
  if (
    hard.has("no-hw") &&
    categories.includes("hardware-engineering") &&
    (hardwareTitle.test(title) || hardwareWork.test(duties))
  ) {
    return {
      id: "no-hw",
      reason:
        "Role involves embedded, firmware, hardware, CAD, or other non-software engineering work.",
    };
  }
  if (hard.has("no-nonswe") && nonSoftwareTitle.test(job.title) && !softwareTitle.test(job.title)) {
    return {
      id: "no-nonswe",
      reason:
        "Role is outside software engineering (business, support, manual QA, or another non-SWE discipline).",
    };
  }
  const work = [duties, job.summary, job.rawText].filter(Boolean).join("\n");
  if (
    hard.has("software") &&
    categories.length === 0 &&
    !softwareTitle.test(job.title) &&
    !softwareWork.test(work)
  ) {
    return {
      id: "software",
      reason:
        "No supported technical or fintech job category was found in the title or posting. Review it if its title or duties are ambiguous.",
    };
  }
  return undefined;
}
