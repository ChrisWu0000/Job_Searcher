import type { Job } from "@/types/job";

export const jobCategories = [
  "software-engineering",
  "data-science",
  "cyber-security",
  "hardware-engineering",
  "fintech",
  "summer",
] as const;

export type JobCategory = (typeof jobCategories)[number];

export const jobCategoryLabels: Record<JobCategory, string> = {
  "software-engineering": "Software engineering",
  "data-science": "Data science",
  "cyber-security": "Cyber security",
  "hardware-engineering": "Hardware engineering",
  fintech: "Fintech",
  summer: "Summer",
};

const categoryPatterns: Record<JobCategory, RegExp> = {
  "software-engineering":
    /\b(?:software|swe|sde|full[ -]?stack|back[ -]?end|front[ -]?end|web|mobile|ios|android|devops|site reliability|sre|platform|infrastructure|cloud|applications?)\b.{0,35}\b(?:engineer(?:ing)?|develop(?:er|ment)|programmer|intern|co[ -]?op)\b|\b(?:software|swe|sde|devops|full[ -]?stack|back[ -]?end|front[ -]?end)\s+(?:intern|co[ -]?op)\b/i,
  "data-science":
    /\b(?:data science|data scientist|data analyst|data engineer|analytics|business intelligence|statistician|machine learning|ml engineer|quantitative analyst|applied scientist|data & ml\/ai|ai\/ml\/data)\b/i,
  "cyber-security":
    /\b(?:cyber[ -]?security|cyber|information security|infosec|app(?:lication)? ?sec|security|soc analyst|penetration test(?:er|ing)|pentest(?:er)?|red team|blue team|ethical hacker|threat (?:intelligence|detection|research)|incident response|vulnerability|malware|cryptograph(?:y|ic)|identity (?:and|&) access|iam|devsecops|grc|zero trust|appsec)\b/i,
  "hardware-engineering":
    /\b(?:hardware engineer|embedded (?:software|systems?)?|firmware|electrical engineer(?:ing)?|electronics engineer|fpga|asic|pcb|cad (?:designer|engineer|technician)|vlsi|semiconductor|board[ -]?level design|mechanical engineer)\b/i,
  fintech:
    /\b(?:fintech|financial technology|payments?|payment processing|digital banking|banking|bank|financial services|trading|trader|quant(?:itative)?|investment technology|capital markets|wealth|lending|credit|insurtech|insurance technology|crypto(?:currency)?|blockchain|defi|brokerage|fraud|risk engineer|treasury|ledger)\b/i,
  summer: /\bsummer\b/i,
};

const fintechCompanies =
  /\b(?:stripe|plaid|block|affirm|ramp|coinbase|robinhood|chime|brex|wise|revolut|klarna|adyen|paypal|wealthsimple|nuvei|sofi|monzo|mastercard|visa|capital one|jane street|citadel|two sigma|hudson river|jump trading|optiver|imc|drw|susquehanna|squarespace|toast|marqeta|bill\.com|mercury|carta|gusto|rippling|intuit|fiserv|fis|td|rbc|bmo|scotiabank|cibc|goldman sachs|morgan stanley|jpmorgan|bloomberg|stripe|square|cash app|upstart|dave|payoneer|checkout\.com|ripple|kraken|gemini|binance|circle|fidelity|schwab|vanguard|blackrock|point72|virtu|akuna|tower research)\b/i;

export function classifyJobCategories(job: Job): JobCategory[] {
  const title = job.title.replace(/\bCAD\s*\$?\s*\d[\d.,]*|\d[\d.,]*\s*CAD\b/gi, "");
  const titleMatches = jobCategories.filter((category) => categoryPatterns[category].test(title));
  const fullText = [
    job.company,
    ...(job.tags ?? []),
    job.summary,
    job.responsibilities,
    job.qualifications,
    job.rawText,
  ]
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join("\n");
  const allMatches = jobCategories.filter((category) => categoryPatterns[category].test(fullText));
  if (fintechCompanies.test(job.company)) allMatches.push("fintech");
  const tags = (job.tags ?? []).join(" ");
  if (/\b(?:software|swe|sde)\b/i.test(tags)) allMatches.push("software-engineering");
  if (/\b(?:data|ai\/ml|machine learning|analytics)\b/i.test(tags)) {
    allMatches.push("data-science");
  }
  if (/\b(?:cyber|cybersecurity|information security)\b/i.test(tags)) {
    allMatches.push("cyber-security");
  }
  if (/\b(?:hardware|electrical|electronics)\b/i.test(tags)) {
    allMatches.push("hardware-engineering");
  }
  return [...new Set([...titleMatches, ...allMatches])];
}
