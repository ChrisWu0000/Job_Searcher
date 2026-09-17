export interface SelectorEntry {
  primary: string;
  fallbacks: string[];
  description: string;
}

export const selectorRegistry = {
  jobSearchKeyword: {
    primary: "input#keywordSearch",
    fallbacks: ["input.input--keyword-search", "input[placeholder*='job ID']"],
    description: "The job search keyword input, which also accepts a posting ID",
  },
  jobSearchSubmit: {
    primary: "button[aria-label='Submit Keyword']",
    fallbacks: ["button.keyword__run--keyword--search"],
    description: "Submit the keyword or posting-ID search",
  },
  jobSearchClear: {
    primary: "button[aria-label='Clear Filters']",
    fallbacks: [],
    description: "Clear active job search filters before looking up a specific saved posting",
  },
  resultsTable: {
    primary: "table.data-viewer-table",
    fallbacks: [
      "#postingsTable",
      "table[id*='postingsTable']",
      "table.table__posting",
      "#searchResults table",
      "table.dataTable",
      "table.table--postings",
      "form table.table",
    ],
    description: "The job search results table on the postings list page",
  },
  resultsHeaderRow: {
    primary: "table.data-viewer-table thead tr",
    fallbacks: [
      "#postingsTable thead tr",
      "table[id*='postingsTable'] thead tr",
      "table.table__posting thead tr",
      "table.dataTable thead tr",
      "thead tr",
      "table tr:first-child",
      "tr:first-child",
    ],
    description: "The header row of the results table used to map columns by label",
  },
  resultsRow: {
    primary: "table.data-viewer-table tbody tr.table__row--body",
    fallbacks: [
      "#postingsTable tbody tr",
      "table[id*='postingsTable'] tbody tr",
      "table.table__posting tbody tr",
      "table.dataTable tbody tr",
      "tbody tr",
    ],
    description: "One posting row inside the results table",
  },
  resultsRowLink: {
    primary: "a[href*='postingId'], a[onclick*='postingId']",
    fallbacks: [
      "a.js--view-posting",
      "a[href*='ck_jobid']",
      "a[href*='action=posting']",
      "td a",
      "button",
    ],
    description: "The clickable job title link inside a results row",
  },
  pagerNext: {
    primary: "a.pagination__link[aria-label='Go to next page']",
    fallbacks: [
      "a.next, li.next > a, a[rel='next']",
      ".pagination a[aria-label='Next']",
      ".pagination li:not(.disabled) a[title='Next']",
      "a.pagination__next",
      "#postingsTablePager a.next",
      ".dataTables_paginate a.next",
    ],
    description: "The next-page link in the results pager",
  },
  pagerCurrent: {
    primary: "a.pagination__link.active",
    fallbacks: [
      ".pagination li.active, .pagination .active a",
      ".pagination__current",
      ".dataTables_paginate .current",
      "[aria-current='page']",
      ".pagination strong",
    ],
    description: "The active page indicator in the results pager",
  },
  postingOverlay: {
    primary: "div.modal.is--visible .modal__inner--document-overlay",
    fallbacks: ["div.modal.is--visible .modal__inner"],
    description: "The posting overlay WaterlooWorks opens on top of the results table",
  },
  postingHeader: {
    primary: "div.modal.is--visible .dashboard-header--mini__content",
    fallbacks: [".dashboard-header--mini__content"],
    description: "The overlay header that carries the posting id, title and organization",
  },
  postingActionBar: {
    primary: "div.modal.is--visible nav.floating--action-bar",
    fallbacks: ["nav.floating--action-bar"],
    description: "The floating bar under the posting overlay with Apply, Print and Close",
  },
  postingContainer: {
    primary: "div.modal.is--visible .modal__inner--document-overlay",
    fallbacks: [
      "#postingDiv",
      "[id^='postingDiv']",
      ".js--posting-details",
      "#np_posting_details",
      ".panel--posting",
      "#mainContentDiv .orbis-posting",
      "[data-posting-id]",
      "main",
    ],
    description: "The container that holds a single opened job posting",
  },
  postingTitle: {
    primary: "div.modal.is--visible .dashboard-header--mini__content h2",
    fallbacks: [
      "#postingDiv h1, #postingDiv h2",
      ".js--posting-details h1",
      ".js--posting-details h2",
      ".panel--posting .panel-heading",
      "h1.posting__title",
      "h1",
      "h2",
    ],
    description: "The posting heading, used as a title fallback",
  },
  postingIdHolder: {
    primary: "[data-posting-id]",
    fallbacks: [
      "[data-postingid]",
      "input[name='postingId']",
      "input[name='ck_jobid']",
      "#postingId",
    ],
    description: "An element that carries the currently open posting id",
  },
  postingBackLink: {
    primary: "a.js--back-to-search, a[href*='searchResults']",
    fallbacks: [
      "a.back-to-results",
      "button.js--close-posting",
      ".modal-header button.close",
      "a[title*='Back']",
      "button[aria-label='Close']",
    ],
    description: "The control that returns from a posting to the results table",
  },
  applyButton: {
    primary: "button.js--apply, a.js--apply",
    fallbacks: [
      "button[aria-label='Apply']",
      "input[type='submit'][value*='Apply']",
      "button[name='apply']",
      "a[href*='applicationCreate']",
      "a[href*='action=apply']",
      "button.btn--apply",
    ],
    description: "The Apply button on a posting or a results row",
  },
  applyContainer: {
    primary: "#applicationForm",
    fallbacks: [
      "form[name='applicationForm']",
      "form[action*='application']",
      ".js--application-package",
      "#applyDiv",
      "[id*='application']",
      "main",
    ],
    description: "The container of the application form",
  },
  applyPackageOption: {
    primary: "input[type='radio'][name*='package']",
    fallbacks: [
      "input[type='radio'][name*='Package']",
      ".js--application-package input[type='radio']",
      "table input[type='radio']",
      "input[type='radio']",
    ],
    description: "A radio input naming one existing application package",
  },
  applyPackageSelect: {
    primary: "select[name*='package']",
    fallbacks: ["select[name*='Package']", "select[id*='package']", "select[id*='Package']"],
    description: "A dropdown listing existing application packages",
  },
  applyDocumentSelect: {
    primary: "select[name*='document']",
    fallbacks: [
      "select[name*='Document']",
      "select[id*='document']",
      "select[id*='Document']",
      "table select",
      "select",
    ],
    description: "A per-document dropdown inside the application package builder",
  },
  applyDocumentRow: {
    primary: "tr:has(select)",
    fallbacks: [".form-group:has(select)", ".row:has(select)", "tr", ".form-group"],
    description: "The row that pairs a document kind label with its dropdown",
  },
  prescreenQuestion: {
    primary: "[data-question-id]",
    fallbacks: [
      ".js--prescreen-question",
      ".prescreen__question",
      "fieldset.question",
      ".form-group--question",
      ".question",
    ],
    description: "One pre-screening question block on the application form",
  },
  prescreenQuestionInput: {
    primary: "textarea, input[type='text'], select, input[type='radio'], input[type='checkbox']",
    fallbacks: ["textarea", "input", "select"],
    description: "The answer control inside a pre-screening question block",
  },
  submitButton: {
    primary: "button[type='submit'], input[type='submit']",
    fallbacks: [
      "button.js--submit-application",
      "button[name='submit']",
      "a.btn--submit",
      "button.btn-primary",
    ],
    description: "The button that submits the application",
  },
  confirmationMessage: {
    primary: ".alert-success",
    fallbacks: [
      ".alert--success",
      ".js--application-confirmation",
      ".confirmation",
      ".panel--confirmation",
      "[role='status']",
    ],
    description: "The banner shown after an application is submitted",
  },
  loginForm: {
    primary: "form#loginForm",
    fallbacks: [
      "form[action*='login']",
      "form[action*='signin']",
      "#loginArea form",
      ".cas-login form",
      "form:has(input[type='password'])",
    ],
    description: "The WaterlooWorks or campus single sign-on login form",
  },
  loginUsername: {
    primary: "input[name='userName']",
    fallbacks: [
      "input#userNameInput",
      "input[name='j_username']",
      "input[name='username']",
      "input[type='email']",
    ],
    description: "The username field on the login page",
  },
  loggedInUserName: {
    primary: "#userNameDisplay",
    fallbacks: [
      ".navbar__user-name",
      ".user-name",
      "[class*='userName']",
      "header [class*='profile'] [class*='name']",
      "#nav-user-menu .dropdown-toggle",
    ],
    description: "The signed-in student's name shown in the WaterlooWorks header",
  },
} as const satisfies Record<string, SelectorEntry>;

export type SelectorKey = keyof typeof selectorRegistry;

export const selectorKeys = Object.keys(selectorRegistry) as SelectorKey[];

export function isSelectorKey(value: string): value is SelectorKey {
  return Object.hasOwn(selectorRegistry, value);
}

export function selectorEntry(key: SelectorKey): SelectorEntry {
  return selectorRegistry[key];
}

function candidateSelectors(key: SelectorKey): string[] {
  const entry = selectorRegistry[key];
  return [entry.primary, ...entry.fallbacks];
}

function safeQueryAll(root: ParentNode, selector: string): Element[] {
  try {
    return Array.from(root.querySelectorAll(selector));
  } catch {
    return [];
  }
}

export function query(key: SelectorKey, root: ParentNode = document): HTMLElement | undefined {
  for (const selector of candidateSelectors(key)) {
    for (const element of safeQueryAll(root, selector)) {
      if (isHtmlElement(element)) return element;
    }
  }
  return undefined;
}

export function queryAll(key: SelectorKey, root: ParentNode = document): HTMLElement[] {
  for (const selector of candidateSelectors(key)) {
    const found = safeQueryAll(root, selector).filter(isHtmlElement);
    if (found.length > 0) return found;
  }
  return [];
}

export class SelectorNotFoundError extends Error {
  readonly key: SelectorKey;
  readonly attempted: string[];

  constructor(key: SelectorKey) {
    super(
      `no element matched selector "${key}" (${selectorRegistry[key].description}); tried ${candidateSelectors(key).join(" | ")}`,
    );
    this.name = "SelectorNotFoundError";
    this.key = key;
    this.attempted = candidateSelectors(key);
  }
}

export function queryRequired(key: SelectorKey, root: ParentNode = document): HTMLElement {
  const found = query(key, root);
  if (!found) throw new SelectorNotFoundError(key);
  return found;
}

export function exists(key: SelectorKey, root: ParentNode = document): boolean {
  return query(key, root) !== undefined;
}

export function isVisibleElement(element: HTMLElement): boolean {
  for (let current: HTMLElement | null = element; current; current = current.parentElement) {
    if (current.hidden || current.getAttribute("aria-hidden") === "true") return false;
    const style = current.ownerDocument.defaultView?.getComputedStyle(current) ?? current.style;
    if (style.display === "none" || style.visibility === "hidden") return false;
  }
  return true;
}

function isHtmlElement(value: Element): value is HTMLElement {
  return "style" in value && "click" in value;
}

export const labelPatterns = {
  jobId: /^job\s*(id|number)\s*:?$/i,
  workTerm: /^work\s*term\s*:?$/i,
  jobType: /^job\s*type\s*:?$/i,
  addressLine1: /^job\s*[-–—]?\s*address\s*line\s*(one|1)\s*:?$/i,
  addressLine2: /^job\s*[-–—]?\s*address\s*line\s*(two|2)\s*:?$/i,
  postalCode: /^job\s*[-–—]?\s*(postal|zip|postal\s*\/\s*zip)\s*code\s*:?$/i,
  specialRequirements: /^special\s*job\s*requirements\s*:?$/i,
  additionalArrangement: /^additional\s+employment\s+arrangement\s+location\s+information\s*:?$/i,
  jobTitle: /^job\s*title\s*:?$/i,
  organization: /^(organization|company|employer)\s*:?$/i,
  division: /^division\s*:?$/i,
  openings: /^(number\s+of\s+)?job\s*openings\s*:?$/i,
  jobCity: /^job\s*[-–—]?\s*city\s*:?$/i,
  jobRegion: /^job\s*[-–—]?\s*(province|state|region|province\s*\/\s*state)\s*:?$/i,
  jobCountry: /^job\s*[-–—]?\s*country\s*:?$/i,
  location: /^(job\s*)?location\s*:?$/i,
  arrangement:
    /^(employment\s+location\s+arrangement|work\s+location\s+arrangement|job\s*[-–—]?\s*arrangement)\s*:?$/i,
  workTermDuration: /^work\s*term\s*duration\s*:?$/i,
  level: /^(level|job\s*level|targeted\s+degrees?\s+and\s+level)\s*:?$/i,
  compensation: /^compensation\s+and\s+benefits(\s+information)?\s*:?$/i,
  jobSummary: /^job\s*summary\s*:?$/i,
  jobResponsibilities: /^job\s*responsibilit(y|ies)\s*:?$/i,
  requiredSkills:
    /^(required\s+skills|required\s+skills\s+and\s+qualifications|qualifications)\s*:?$/i,
  targetedPrograms: /^targeted\s+degrees?\s+and\s+disciplines\s*:?$/i,
  applicationDeadline: /^application\s*deadline\s*:?$/i,
  applicationDocuments: /^application\s*documents?\s*(required)?\s*:?$/i,
  applicationInformation: /^application\s*information\s*:?$/i,
  additionalApplicationInformation: /^additional\s+application\s+information\s*:?$/i,
  applicationMethod: /^application\s*(method|delivery)\s*:?$/i,
} as const;

export type LabelKey = keyof typeof labelPatterns;

export const columnPatterns = {
  jobId: /job\s*(id|number)|^id$/i,
  title: /job\s*title|position\s*title|^title$/i,
  company: /organization|company|employer/i,
  location: /location|city/i,
  openings: /openings/i,
  deadline: /deadline|closing|apply\s*by/i,
  status: /app(lication)?\s*status/i,
} as const;

export type ColumnKey = keyof typeof columnPatterns;

export const documentPatterns = {
  resume: /r[ée]sum[ée]|resume|cv\b/i,
  coverLetter: /cover\s*letter/i,
  gradeReport: /grade\s*(report|s)|transcript|marks/i,
} as const;

export const textPatterns = {
  loginPage: /(sign\s*in|log\s*in|username|waterloo\s+authentication|central\s+authentication)/i,
  prescreenPresent:
    /(pre[-\s]?screen|application\s+questions|additional\s+questions|employer\s+questions)/i,
  confirmationText:
    /(application\s+(was\s+)?submitted|successfully\s+submitted|thank\s+you\s+for\s+applying|your\s+application\s+has\s+been)/i,
  applyPage:
    /(application\s+package|select\s+(an?\s+)?(existing\s+)?package|create\s+(a\s+)?(new\s+)?package|submit\s+application)/i,
  remote: /\b(fully\s+remote|remote|work\s+from\s+home|telecommut)/i,
  hybrid: /\bhybrid\b/i,
  inPerson: /\b(in[-\s]?person|on[-\s]?site|onsite|in\s+office|at\s+employer)/i,
} as const;

function normalizeSpace(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function matchingLabelElements(pattern: RegExp, root: ParentNode): HTMLElement[] {
  const matches: HTMLElement[] = [];
  for (const element of Array.from(root.querySelectorAll("*"))) {
    if (!isHtmlElement(element)) continue;
    const text = normalizeSpace(element.textContent);
    if (text.length === 0 || text.length > 120) continue;
    if (pattern.test(text)) matches.push(element);
  }
  return matches.filter(
    (element) => !matches.some((other) => other !== element && element.contains(other)),
  );
}

function outermostWithSameText(element: HTMLElement, root: ParentNode): HTMLElement {
  const text = normalizeSpace(element.textContent);
  let current = element;
  while (current.parentElement) {
    const parent = current.parentElement;
    if (parent === root) break;
    if (normalizeSpace(parent.textContent) !== text) break;
    current = parent;
  }
  return current;
}

function nextValueElement(label: HTMLElement): HTMLElement | undefined {
  const tag = label.tagName.toLowerCase();
  if (tag === "label") {
    const forId = label.getAttribute("for");
    if (forId) {
      const target = label.ownerDocument.getElementById(forId);
      if (target && isHtmlElement(target)) return target;
    }
  }
  let sibling = label.nextElementSibling;
  while (sibling) {
    if (isHtmlElement(sibling) && normalizeSpace(sibling.textContent).length > 0) return sibling;
    sibling = sibling.nextElementSibling;
  }
  if (tag === "td" || tag === "th" || tag === "dt") return undefined;
  const parent = label.parentElement;
  let parentSibling = parent?.nextElementSibling ?? null;
  while (parentSibling) {
    if (isHtmlElement(parentSibling) && normalizeSpace(parentSibling.textContent).length > 0) {
      return parentSibling;
    }
    parentSibling = parentSibling.nextElementSibling;
  }
  return undefined;
}

export function findLabelledElement(key: LabelKey, root: ParentNode): HTMLElement | undefined {
  for (const match of matchingLabelElements(labelPatterns[key], root)) {
    const label = outermostWithSameText(match, root);
    const value = nextValueElement(label);
    if (value) return value;
  }
  return undefined;
}

export function findLabelElement(key: LabelKey, root: ParentNode): HTMLElement | undefined {
  const match = matchingLabelElements(labelPatterns[key], root)[0];
  return match ? outermostWithSameText(match, root) : undefined;
}

export function findLabelledText(key: LabelKey, root: ParentNode): string | undefined {
  const element = findLabelledElement(key, root);
  if (!element) return undefined;
  const text = normalizeSpace(element.textContent);
  return text.length > 0 ? text : undefined;
}

const structuralSelectors = {
  passwordField: "input[type='password']",
  anyLink: "a, button",
  firstAnchor: "a",
  headerCell: "th",
  headerLabel: ".js--data-grid--header--label",
  quickFilterToggle: ".js--data-grid-toggle-quick-filter",
  postingField: ".tag__key-value-list",
  postingFieldLabel: ".label",
  quickFilterButton: "button",
  quickFilterOnIcon: ".button--toggle-on",
  dataCell: "td",
  anyCell: "th, td",
  row: "tr",
  fieldGroup: "tr, .form-group, .row, li, fieldset",
  questionContainer:
    "[data-question-id], .js--prescreen-question, .prescreen__question, .question, fieldset.question",
  questionCaption: "legend, .question__text, label",
  freeTextControl: "textarea, input[type='text']",
  anyControl: "input, select, textarea, option",
  anyLabel: "label",
  anySelect: "select",
  anyRadio: "input[type='radio']",
  listItem: "li",
} as const;

export function hasPasswordField(root: ParentNode): boolean {
  return root.querySelector(structuralSelectors.passwordField) !== null;
}

export function cellsIn(row: Element): HTMLElement[] {
  return Array.from(row.children).filter(
    (child): child is HTMLElement => isHtmlElement(child) && /^(td|th)$/i.test(child.tagName),
  );
}

export function dataCellCount(row: Element): number {
  return row.querySelectorAll(structuralSelectors.dataCell).length;
}

export interface QuickFilterToggle {
  label: string;
  button: HTMLElement;
  on: boolean;
}

export function quickFilterToggles(root: ParentNode): QuickFilterToggle[] {
  const toggles: QuickFilterToggle[] = [];
  for (const container of Array.from(
    root.querySelectorAll(structuralSelectors.quickFilterToggle),
  )) {
    const button = container.querySelector(structuralSelectors.quickFilterButton);
    if (!button || !isHtmlElement(button)) continue;
    const label = normalizeSpace(button.textContent).replace(/\s*toggle_(on|off)\s*$/i, "");
    const on =
      container.querySelector(structuralSelectors.quickFilterOnIcon) !== null ||
      /toggle_on/.test(button.textContent ?? "");
    toggles.push({ label, button, on });
  }
  return toggles;
}

export function postingFieldsIn(root: ParentNode): { label: string; value: string }[] {
  const fields: { label: string; value: string }[] = [];
  for (const container of Array.from(root.querySelectorAll(structuralSelectors.postingField))) {
    const labelElement = container.querySelector(structuralSelectors.postingFieldLabel);
    if (!labelElement) continue;
    const label = normalizeSpace(labelElement.textContent).replace(/\s*:$/, "");
    if (label.length === 0) continue;
    const clone = container.cloneNode(true) as Element;
    clone.querySelector(structuralSelectors.postingFieldLabel)?.remove();
    fields.push({ label, value: clone.textContent ?? "" });
  }
  return fields;
}

export function headerLabelIn(cell: Element): Element | undefined {
  return cell.querySelector(structuralSelectors.headerLabel) ?? undefined;
}

export function hasHeaderCellsOnly(row: Element): boolean {
  return (
    row.querySelector(structuralSelectors.headerCell) !== null &&
    row.querySelector(structuralSelectors.dataCell) === null
  );
}

export function clickableDescendants(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll(structuralSelectors.anyLink)).filter(isHtmlElement);
}

export function firstAnchor(root: ParentNode): HTMLElement | undefined {
  const anchor = root.querySelector(structuralSelectors.firstAnchor);
  return anchor && isHtmlElement(anchor) ? anchor : undefined;
}

export function closestRow(element: Element): Element | undefined {
  return element.closest(structuralSelectors.row) ?? undefined;
}

export function closestFieldGroup(element: Element): Element | undefined {
  return element.closest(structuralSelectors.fieldGroup) ?? undefined;
}

export function questionContainerOf(element: Element): Element | undefined {
  return element.closest(structuralSelectors.questionContainer) ?? undefined;
}

export function questionCaptionIn(container: ParentNode): Element | undefined {
  return container.querySelector(structuralSelectors.questionCaption) ?? undefined;
}

export function freeTextControlsIn(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll(structuralSelectors.freeTextControl)).filter(
    isHtmlElement,
  );
}

export function scriptAndStyleNodes(root: ParentNode): Element[] {
  return Array.from(root.querySelectorAll("script, style, noscript, link, iframe"));
}

export function valueCarryingControls(root: ParentNode): Element[] {
  return Array.from(root.querySelectorAll("input, textarea, option"));
}

export function removeControlsFrom(element: Element): void {
  for (const control of Array.from(element.querySelectorAll(structuralSelectors.anyControl))) {
    control.remove();
  }
}

export function labelTextFor(element: Element, readText: (node: Element) => string): string {
  const ownerDocument = element.ownerDocument;
  if (element.id && ownerDocument) {
    for (const label of Array.from(ownerDocument.querySelectorAll(structuralSelectors.anyLabel))) {
      if (label.getAttribute("for") === element.id) return readText(label);
    }
  }
  const wrapping = element.closest(structuralSelectors.anyLabel);
  if (wrapping) return readText(wrapping);
  const row = closestRow(element);
  if (row) {
    const firstCell = row.querySelector(structuralSelectors.anyCell);
    if (firstCell && !firstCell.contains(element)) return readText(firstCell);
  }
  const group = closestFieldGroup(element);
  if (group) {
    const label = group.querySelector(structuralSelectors.anyLabel);
    if (label && !label.contains(element)) return readText(label);
  }
  return normalizeSpace(element.getAttribute("name"));
}

export function trailingCellsText(element: Element, readText: (node: Element) => string): string {
  const row = closestFieldGroup(element);
  if (!row) return "";
  const cells = Array.from(row.querySelectorAll(structuralSelectors.dataCell)).slice(1);
  return cells.map((cell) => readText(cell)).join("; ");
}

export function listItemsIn(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll(structuralSelectors.listItem)).filter(isHtmlElement);
}
