const euCountries = [
  "Austria",
  "Belgium",
  "Bulgaria",
  "Croatia",
  "Cyprus",
  "Czechia",
  "Czech Republic",
  "Denmark",
  "Estonia",
  "Finland",
  "France",
  "Germany",
  "Greece",
  "Hungary",
  "Ireland",
  "Italy",
  "Latvia",
  "Lithuania",
  "Luxembourg",
  "Malta",
  "Netherlands",
  "The Netherlands",
  "Poland",
  "Portugal",
  "Romania",
  "Slovakia",
  "Slovenia",
  "Spain",
  "Sweden",
];

const usStates = [
  "Alabama",
  "Alaska",
  "Arizona",
  "Arkansas",
  "California",
  "Colorado",
  "Connecticut",
  "Delaware",
  "Florida",
  "Georgia",
  "Hawaii",
  "Idaho",
  "Illinois",
  "Indiana",
  "Iowa",
  "Kansas",
  "Kentucky",
  "Louisiana",
  "Maine",
  "Maryland",
  "Massachusetts",
  "Michigan",
  "Minnesota",
  "Mississippi",
  "Missouri",
  "Montana",
  "Nebraska",
  "Nevada",
  "New Hampshire",
  "New Jersey",
  "New Mexico",
  "New York",
  "North Carolina",
  "North Dakota",
  "Ohio",
  "Oklahoma",
  "Oregon",
  "Pennsylvania",
  "Rhode Island",
  "South Carolina",
  "South Dakota",
  "Tennessee",
  "Texas",
  "Utah",
  "Vermont",
  "Virginia",
  "Washington",
  "West Virginia",
  "Wisconsin",
  "Wyoming",
];

const canadianProvinces = [
  "Alberta",
  "British Columbia",
  "Manitoba",
  "New Brunswick",
  "Newfoundland and Labrador",
  "Northwest Territories",
  "Nova Scotia",
  "Nunavut",
  "Ontario",
  "Prince Edward Island",
  "Quebec",
  "Québec",
  "Saskatchewan",
  "Yukon",
];

const usStateCodes = new Set(
  "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC PR".split(
    " ",
  ),
);
const canadianProvinceCodes = new Set("AB BC MB NB NL NT NS NU ON PE QC SK YT".split(" "));
const euCountryCodes = new Set(
  "AT BE BG HR CY CZ DK EE EL FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE".split(" "),
);
const northAmericanCountryCodes = new Set("CAN USA".split(" "));
const ukCountryCodes = new Set(["GB", "UK"]);

function escapedAlternatives(values: string[]): string {
  return values
    .sort((a, b) => b.length - a.length)
    .map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
}

const targetCountryPattern = new RegExp(
  `\\b(?:Canada|United States(?: of America)?|U\\.?S\\.?A?\\.?|USA|` +
    `European Union|EU|United Kingdom|Great Britain|Britain|U\\.?K\\.?|UK|England|Scotland|Wales|Northern Ireland|` +
    `${escapedAlternatives(euCountries)})\\b`,
  "i",
);
const targetStatePattern = new RegExp(
  `\\b(?:${escapedAlternatives(usStates)}|${escapedAlternatives(canadianProvinces)})\\b`,
  "i",
);

function isAllowedLocation(location: string): boolean {
  if (targetCountryPattern.test(location) || targetStatePattern.test(location)) return true;

  const tokens = location.toUpperCase().split(/[^A-Z]+/);
  return tokens.some(
    (token) =>
      usStateCodes.has(token) ||
      canadianProvinceCodes.has(token) ||
      euCountryCodes.has(token) ||
      northAmericanCountryCodes.has(token) ||
      ukCountryCodes.has(token),
  );
}

function isRemoteLocation(location: string): boolean {
  return /\bremote\b|\btelecommut(?:e|ing)\b|\bwork[\s-]+from[\s-]+(?:home|anywhere)\b|\banywhere\b|\bworldwide\b/i.test(
    location,
  );
}

export function filterAllowedLocations(location: string): string | undefined {
  const allowed = location
    .split(/[;\n]+/)
    .map((part) => part.trim())
    .filter((part) => part && (isRemoteLocation(part) || isAllowedLocation(part)));
  return allowed.length > 0 ? [...new Set(allowed)].join("; ") : undefined;
}
