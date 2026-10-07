import { describe, expect, it } from "vitest";
import { classifyJobCategories } from "@/lib/ranking/categories";
import {
  canonicalJobUrl,
  feedEntries,
  normalizeFeedEntry,
  type PublicJobFeed,
} from "@/lib/sources/publicFeeds";

const feed: PublicJobFeed = {
  id: "test",
  label: "Test feed",
  url: "https://example.com/feed.json",
  parse: (payload) => {
    if (!Array.isArray(payload)) throw new Error("expected array");
    return payload;
  },
};

describe("public job feeds", () => {
  it("canonicalizes secure posting URLs and drops tracking parameters", () => {
    expect(canonicalJobUrl("https://jobs.example.com/role?id=4&utm_source=feed#apply")).toBe(
      "https://jobs.example.com/role?id=4",
    );
    expect(canonicalJobUrl("http://jobs.example.com/role")).toBeUndefined();
    expect(canonicalJobUrl("not a url")).toBeUndefined();
  });

  it("normalizes the public curated-list shape and retains its external link", () => {
    const job = normalizeFeedEntry(
      {
        id: "raw-id",
        company_name: "Acme",
        title: "Hardware Engineer Intern",
        locations: ["Toronto, ON", "Remote"],
        category: "Hardware",
        sponsorship: "U.S. Citizenship is Required",
        url: "https://jobs.example.com/role?utm_source=feed",
        active: true,
      },
      feed,
    );
    expect(job).toMatchObject({
      id: "url:https://jobs.example.com/role",
      company: "Acme",
      title: "Hardware Engineer Intern",
      location: "Toronto, ON; Remote",
      source: "test",
      url: "https://jobs.example.com/role",
      tags: ["Hardware"],
      fields: { sponsorship: "U.S. Citizenship is Required" },
    });
    expect(job && classifyJobCategories(job)).toContain("hardware-engineering");
  });

  it("skips closed, malformed, unlinked, and out-of-scope roles", () => {
    const { jobs, skipped } = feedEntries(
      [
        {
          company: "Acme",
          role: "Cyber Security Analyst",
          url: "https://jobs.example.com/security",
          active: true,
        },
        {
          company: "Acme",
          role: "Marketing Intern",
          url: "https://jobs.example.com/marketing",
        },
        {
          company: "Acme",
          role: "Data Scientist",
          url: "https://jobs.example.com/closed",
          active: false,
        },
        { company: "Acme", role: "Software Engineer", url: "" },
        { company: "Acme", role: "Fintech Analyst", url: "javascript:alert(1)" },
      ],
      feed,
    );
    expect(jobs.map((job) => job.title)).toEqual(["Cyber Security Analyst"]);
    expect(skipped).toBe(4);
  });

  it("recognizes curated source category labels for data jobs", () => {
    const job = normalizeFeedEntry(
      {
        company: "Acme",
        title: "Applied Scientist Intern",
        category: "Data & ML/AI",
        url: "https://jobs.example.com/scientist",
      },
      feed,
    );
    expect(job && classifyJobCategories(job)).toContain("data-science");
  });
});
