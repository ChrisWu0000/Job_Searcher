const termOrder = ["Winter 2027", "Summer 2027", "Later terms"];
const categoryOrder = [
  "Software engineering",
  "Data science",
  "Cyber security",
  "Hardware engineering",
  "Fintech",
];
const searchInput = document.querySelector("#search");
const termFilter = document.querySelector("#term-filter");
const categoryFilter = document.querySelector("#category-filter");
const status = document.querySelector("#status");
const tableBody = document.querySelector("#listings");
let listings = [];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index++;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
    } else if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\r" || character === "\n") {
      row.push(field);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      field = "";
      if (character === "\r" && text[index + 1] === "\n") index++;
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error("The listings CSV contains an unclosed quoted field.");
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function readListings(csv) {
  const [rawHeaders, ...records] = parseCsv(csv);
  if (!rawHeaders) throw new Error("The listings CSV is empty.");
  const headers = rawHeaders.map((header, index) =>
    index === 0 ? header.replace(/^\uFEFF/, "") : header,
  );
  const indices = new Map(headers.map((header, index) => [header, index]));
  const requiredHeaders = [
    "Term",
    "Category",
    "Company",
    "Role",
    "Location",
    "Pay",
    "Posted",
    "Link",
  ];
  const missing = requiredHeaders.filter((header) => !indices.has(header));
  if (missing.length > 0)
    throw new Error(`The listings CSV is missing columns: ${missing.join(", ")}.`);

  const byUrl = new Map();
  for (const record of records) {
    if (record.length !== headers.length)
      throw new Error("The listings CSV contains a malformed row.");
    const value = (name) => record[indices.get(name)];
    const url = new URL(value("Link"));
    if (url.protocol !== "https:") throw new Error("A listing has a non-HTTPS Apply URL.");
    const listing = byUrl.get(url.href) ?? {
      url: url.href,
      company: value("Company"),
      role: value("Role"),
      location: value("Location"),
      pay: value("Pay"),
      posted: value("Posted"),
      terms: new Set(),
      categories: new Set(),
    };
    listing.terms.add(value("Term"));
    listing.categories.add(value("Category"));
    byUrl.set(url.href, listing);
  }

  return [...byUrl.values()].sort(
    (left, right) =>
      right.posted.localeCompare(left.posted) ||
      left.company.localeCompare(right.company) ||
      left.role.localeCompare(right.role),
  );
}

function cell(row, value) {
  const element = document.createElement("td");
  element.textContent = value;
  row.append(element);
}

function renderRows() {
  tableBody.replaceChildren();
  for (const listing of listings) {
    const row = document.createElement("tr");
    row.dataset.terms = [...listing.terms].join("|");
    row.dataset.categories = [...listing.categories].join("|");
    row.dataset.search = [
      listing.company,
      listing.role,
      listing.location,
      listing.pay,
      ...listing.terms,
      ...listing.categories,
    ]
      .join(" ")
      .toLowerCase();
    cell(row, termOrder.filter((term) => listing.terms.has(term)).join(", "));
    cell(row, categoryOrder.filter((category) => listing.categories.has(category)).join(", "));
    cell(row, listing.company);
    cell(row, listing.role);
    cell(row, listing.location);
    cell(row, listing.pay);
    cell(row, listing.posted);

    const applyCell = document.createElement("td");
    const applyLink = document.createElement("a");
    applyLink.href = listing.url;
    applyLink.target = "_blank";
    applyLink.rel = "noopener noreferrer";
    applyLink.textContent = "Apply";
    applyCell.append(applyLink);
    row.append(applyCell);
    tableBody.append(row);
  }
  filterRows();
}

function filterRows() {
  const query = searchInput.value.trim().toLowerCase();
  let visible = 0;
  for (const row of tableBody.rows) {
    const matches =
      row.dataset.search.includes(query) &&
      (!termFilter.value || row.dataset.terms.split("|").includes(termFilter.value)) &&
      (!categoryFilter.value || row.dataset.categories.split("|").includes(categoryFilter.value));
    row.hidden = !matches;
    if (matches) visible++;
  }
  status.textContent = `${visible.toLocaleString()} of ${listings.length.toLocaleString()} listings`;
}

async function loadListings() {
  try {
    const response = await fetch("./listings.csv", { cache: "no-store" });
    if (!response.ok) throw new Error(`Unable to load listings.csv (HTTP ${response.status}).`);
    listings = readListings(await response.text());
    renderRows();
  } catch (error) {
    status.textContent = `Unable to load listings: ${error instanceof Error ? error.message : String(error)}`;
  }
}

searchInput.addEventListener("input", filterRows);
termFilter.addEventListener("change", filterRows);
categoryFilter.addEventListener("change", filterRows);
loadListings();
