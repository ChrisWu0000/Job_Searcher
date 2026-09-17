import { readFileSync } from "node:fs";
import { join } from "node:path";

export type FixtureName =
  | "results-page-1"
  | "results-page-2"
  | "results-real-page-1"
  | "posting-full"
  | "posting-missing-sections"
  | "posting-overlay"
  | "apply-with-packages"
  | "apply-no-questions"
  | "apply-confirmation"
  | "login";

export const fixtureDirectory = join(process.cwd(), "test", "fixtures", "waterlooworks");

export function fixtureHtml(name: FixtureName): string {
  return readFileSync(join(fixtureDirectory, `${name}.html`), "utf8");
}

export function parseFixture(name: FixtureName): Document {
  return new DOMParser().parseFromString(fixtureHtml(name), "text/html");
}

export function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

export function withoutClassesAndIds(html: string): string {
  return html.replace(/\sclass="[^"]*"/g, "").replace(/\sid="[^"]*"/g, "");
}

export function mountFixture(name: FixtureName): Document {
  document.body.innerHTML = parseFixture(name).body.innerHTML;
  return document;
}
