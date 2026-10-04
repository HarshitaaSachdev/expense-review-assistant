import { describe, expect, it } from "vitest";
import { classifyByKeywords, loadPolicy, retrievePolicy } from "../src/lib/policy/policy";
import type { Finding } from "../src/lib/validation/rules";

function refs(claim: { category: string; description: string; currency: string }, findings: Finding[] = []) {
  return retrievePolicy(claim, findings).clauses.map((c) => c.ref);
}

describe("parsePolicy", () => {
  it("parses every section and clause", () => {
    const policy = loadPolicy();
    expect(policy.title).toContain("Brightpath");
    expect(policy.sections).toHaveLength(13);
    const alcohol = policy.sections.flatMap((s) => s.clauses).find((c) => c.ref === "3.3");
    expect(alcohol?.text).toMatch(/^Alcohol/);
  });
});

describe("retrievePolicy", () => {
  it("retrieves alcohol and currency clauses for a drinks claim in GBP", () => {
    const result = refs({ category: "Meals", description: "Drinks at the bar after the conference", currency: "GBP" });
    expect(result).toEqual(expect.arrayContaining(["3.1", "3.3", "11.1", "13.1"]));
  });

  it("retrieves the commuting clause for a cab to the office", () => {
    expect(refs({ category: "Ground Transport", description: "Cab to office", currency: "INR" })).toContain("5.2");
  });

  it("includes clauses referenced by rule findings", () => {
    const duplicate: Finding = { code: "DUPLICATE", severity: "warning", message: "dup", policyRef: "12.1" };
    expect(refs({ category: "Meals", description: "Lunch", currency: "INR" }, [duplicate])).toContain("12.1");
  });

  it("includes the category list when the category is missing", () => {
    expect(refs({ category: "", description: "Online course on cloud architecture", currency: "EUR" })).toEqual(
      expect.arrayContaining(["1.5", "10.1", "10.2"]),
    );
  });
});

describe("classifyByKeywords", () => {
  it.each([
    ["Taxi from Berlin airport to hotel", "Ground Transport"],
    ["Online course on cloud architecture", "Training"],
    ["Stuff for WFH setup", "Equipment"],
  ])("classifies %s as %s", (description, category) => {
    expect(classifyByKeywords(description).category).toBe(category);
  });

  it("returns no category when nothing matches", () => {
    expect(classifyByKeywords("Miscellaneous")).toEqual({ category: null, confidence: 0 });
  });
});