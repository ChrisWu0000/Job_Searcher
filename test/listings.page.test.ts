import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderListings, renderListingsPage } from "@/lib/listings/render";
import { jobCategories, jobCategoryLabels } from "@/lib/ranking/categories";
import { jobTermLabels, jobTerms } from "@/lib/ranking/terms";

describe("interactive listings page", () => {
  it("uses the requested job-board title in both generated views", () => {
    const { markdown } = renderListings([], [], new Date("2026-10-06T00:00:00.000Z"));

    expect(markdown.startsWith("# Chris Wu's Job Board")).toBe(true);
    expect(renderListingsPage()).toContain("<title>Chris Wu's Job Board</title>");
  });

  it("links to every term and category subsection in the generated README", () => {
    const { markdown } = renderListings([], [], new Date("2026-10-06T00:00:00.000Z"));

    for (const term of jobTerms) {
      const termSlug = jobTermLabels[term].toLowerCase().replaceAll(" ", "-");
      expect(markdown).toContain(`[${jobTermLabels[term]}](#${termSlug})`);
      for (const category of jobCategories) {
        expect(markdown).toContain(
          `[${jobCategoryLabels[category]}](#${term}-${category})`,
        );
        expect(markdown).toContain(`<a id="${term}-${category}"></a>`);
      }
    }
  });

  it("renders the data-driven site shell and downloadable CSV link", () => {
    const html = renderListingsPage();
    expect(html).toContain('<a class="download" href="./listings.csv" download>Download CSV</a>');
    expect(html).toContain("EU member countries");
    expect(html).toContain("remote roles worldwide");
    expect(html).toContain('id="term-filter"');
    expect(html).toContain('id="category-filter"');
    expect(html).toContain('<script src="./app.js" defer></script>');
  });

  it("creates Apply links that open safely in a new tab", () => {
    const app = readFileSync("site/app.js", "utf8");

    expect(app).toContain('applyLink.target = "_blank"');
    expect(app).toContain('applyLink.rel = "noopener noreferrer"');
    expect(app).toContain('applyLink.textContent = "Apply"');
  });

  it("loads the published CSV and reports load failures visibly", () => {
    const app = readFileSync("site/app.js", "utf8");

    expect(app).toContain('fetch("./listings.csv"');
    expect(app).toContain("The listings CSV contains a malformed row.");
    expect(app).toContain("Unable to load listings:");
  });
});
