import { describe, expect, it } from "vitest";
import {
  buildFingerprint,
  calculateTotals,
  parseIsoDate,
  validateClaim,
  type ClaimInput,
} from "../src/lib/validation/rules";

const TODAY = new Date("2026-10-04T12:00:00Z");

const validClaim: ClaimInput = {
  claimant: "Priya Sharma",
  date: "2026-09-15",
  category: "Meals",
  amount: 850,
  currency: "INR",
  description: "Lunch during client workshop in Pune",
  receiptAvailable: true,
};

function codes(claim: Partial<ClaimInput>, ctx: Partial<Parameters<typeof validateClaim>[1]> = {}) {
  return validateClaim({ ...validClaim, ...claim }, { today: TODAY, ...ctx }).map((f) => f.code);
}

describe("validateClaim", () => {
  it("returns no findings for a compliant claim", () => {
    expect(codes({})).toEqual([]);
  });

  it("flags missing required fields", () => {
    const findings = validateClaim({ ...validClaim, claimant: "  " }, { today: TODAY });
    expect(findings).toContainEqual(expect.objectContaining({ code: "MISSING_FIELD", field: "claimant" }));
  });

  it.each(["2026-13-45", "2026-02-30", "15/09/2026"])("rejects invalid date %s", (date) => {
    expect(codes({ date })).toContain("INVALID_DATE");
  });

  it("rejects future dates", () => {
    expect(codes({ date: "2026-11-15" })).toContain("FUTURE_DATE");
  });

  it("flags claims older than the submission window", () => {
    expect(codes({ date: "2026-06-01" })).toContain("STALE_CLAIM");
  });

  it("requires a receipt above the threshold, after conversion", () => {
    expect(codes({ amount: 1200, category: "Ground Transport", receiptAvailable: false })).toContain("MISSING_RECEIPT");
    expect(codes({ amount: 300, category: "Ground Transport", receiptAvailable: false })).not.toContain("MISSING_RECEIPT");
    expect(codes({ amount: 10, currency: "USD", receiptAvailable: false })).toContain("MISSING_RECEIPT"); // INR 830
  });

  it("checks category limits using the converted amount", () => {
    expect(codes({ amount: 18, currency: "GBP" })).toContain("OVER_LIMIT"); // INR 1,890 > 1,500
    expect(codes({ amount: 14, currency: "GBP" })).not.toContain("OVER_LIMIT"); // INR 1,470
  });

  it("checks limits against the AI-suggested category when given", () => {
    const asMeals = validateClaim(
      { ...validClaim, category: "Other", amount: 3200 },
      { today: TODAY, effectiveCategory: "Meals", categorySource: "ai" },
    );
    const overLimit = asMeals.find((f) => f.code === "OVER_LIMIT");
    expect(overLimit?.message).toContain("AI-suggested");

    expect(
      codes({ category: "Other", amount: 3200 }, { effectiveCategory: "Client Entertainment", categorySource: "ai" }),
    ).not.toContain("OVER_LIMIT");
  });

  it("marks empty or unknown categories for classification", () => {
    expect(codes({ category: "" })).toContain("NEEDS_CLASSIFICATION");
    expect(codes({ category: "Other" })).toContain("NEEDS_CLASSIFICATION");
  });

  it("flags unsupported currencies", () => {
    expect(codes({ currency: "JPY" })).toContain("UNSUPPORTED_CURRENCY");
  });

  it.each([0, -5, Number.NaN])("rejects invalid amount %s", (amount) => {
    expect(codes({ amount })).toContain("INVALID_AMOUNT");
  });

  it("flags duplicates", () => {
    expect(codes({}, { duplicateIds: ["other-claim"] })).toContain("DUPLICATE");
  });
});

describe("buildFingerprint", () => {
  it("ignores case, extra whitespace, and description", () => {
    const a = buildFingerprint({ claimant: " lukas  schmidt ", date: "2026-09-18", amount: 20, currency: "eur" });
    const b = buildFingerprint({ claimant: "Lukas Schmidt", date: "2026-09-18", amount: 20.0, currency: "EUR" });
    expect(a).toBe(b);
  });
});

describe("parseIsoDate", () => {
  it("parses real dates", () => {
    expect(parseIsoDate("2026-09-15")?.toISOString()).toBe("2026-09-15T00:00:00.000Z");
  });
});

describe("calculateTotals", () => {
  it("converts currencies and skips unsupported ones", () => {
    const totals = calculateTotals([
      { amount: 850, currency: "INR", category: "Meals", status: "APPROVED" },
      { amount: 20, currency: "EUR", category: "Ground Transport", status: "PENDING_REVIEW" },
      { amount: 49, currency: "USD", category: "Software", status: "PENDING_REVIEW" },
      { amount: 10, currency: "JPY", category: "Meals", status: "PENDING_REVIEW" },
    ]);
    expect(totals.total).toBe(6717); // 850 + 1800 + 4067
    expect(totals.unconvertedCount).toBe(1);
    expect(totals.byStatus.PENDING_REVIEW).toBe(3);
  });

  it("avoids floating-point drift", () => {
    const totals = calculateTotals([
      { amount: 0.1, currency: "INR", category: "Meals", status: "APPROVED" },
      { amount: 0.2, currency: "INR", category: "Meals", status: "APPROVED" },
    ]);
    expect(totals.total).toBe(0.3);
  });
});