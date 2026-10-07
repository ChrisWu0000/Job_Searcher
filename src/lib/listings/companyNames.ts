const companyOverrides: Record<string, string> = {
  "3m": "3M",
  abb: "ABB",
  aba: "ABA",
  abglobal: "AllianceBernstein",
  amd: "AMD",
  amfam: "American Family Insurance Group",
  bmo: "BMO",
  caci: "CACI",
  cboe: "Cboe",
  cibc: "CIBC",
  cmu: "CMU",
  gdit: "GDIT",
  ibm: "IBM",
  linkedin: "LinkedIn",
  nvidia: "NVIDIA",
  rbc: "RBC",
  rtx: "RTX",
};

const uppercaseWords = new Set(["ai", "api", "it", "llc", "lp", "ltd", "plc", "uk", "us", "usa"]);

export function displayCompanyName(company: string): string {
  const trimmed = company.trim().replace(/\s+/g, " ");
  if (!trimmed) return trimmed;
  const override = companyOverrides[trimmed.toLowerCase().replace(/[ _-]+/g, "")];
  if (override) return override;

  const allLowercase = trimmed === trimmed.toLowerCase();
  const allUppercase = trimmed === trimmed.toUpperCase();
  if (!allLowercase && !allUppercase) return trimmed;

  return trimmed
    .replace(/[_-]+/g, " ")
    .split(" ")
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (uppercaseWords.has(lower)) return lower.toUpperCase();
      if (index > 0 && ["and", "of", "the"].includes(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

function companyNameQuality(company: string): number {
  let quality = 0;
  if (/[a-z]/.test(company) && /[A-Z]/.test(company)) quality += 3;
  if (/\s/.test(company)) quality += 1;
  if (/[._-]/.test(company)) quality -= 1;
  if (company === company.toLowerCase() || company === company.toUpperCase()) quality -= 2;
  return quality;
}

export function preferredCompanyName(first: string, second: string): string {
  return companyNameQuality(second) > companyNameQuality(first) ? second : first;
}
