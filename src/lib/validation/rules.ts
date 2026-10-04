import {
  BASE_CURRENCY,
  CATEGORIES,
  CATEGORY_LIMITS,
  EXCHANGE_RATES,
  RECEIPT_REQUIRED_ABOVE,
  SUBMISSION_WINDOW_DAYS,
  type Category,
} from "../config";

export type ClaimInput = {
  claimant: string;
  date: string; // YYYY-MM-DD
  category: string;
  amount: number;
  currency: string;
  description: string;
  receiptAvailable: boolean;
};

// error = cannot be approved as submitted, warning = reviewer must look, info = for context
export type Severity = "error" | "warning" | "info";

export type Finding = {
  code: string;
  severity: Severity;
  message: string;
  field?: keyof ClaimInput;
  policyRef?: string;
};

export type ValidationContext = {
  today: Date;
  // ids of other claims with the same fingerprint
  duplicateIds?: string[];
  // category to check limits against; defaults to the submitted category
  effectiveCategory?: string;
  categorySource?: "submitted" | "ai" | "reviewer";
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function isValidCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value);
}

// Converts to the base currency, or returns null for unsupported currencies
export function toBaseAmount(amount: number, currency: string): number | null {
  const rate = EXCHANGE_RATES[currency.trim().toUpperCase()];
  if (rate === undefined || !Number.isFinite(amount)) return null;
  return Math.round(amount * rate * 100) / 100;
}

// Strict YYYY-MM-DD parse; rejects impossible dates such as 2026-02-30
export function parseIsoDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return date;
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function formatInr(value: number): string {
  return `${BASE_CURRENCY} ${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

// Same person, same day, same amount and currency is treated as the same expense,
// even if the description or category was reworded (policy 12.1, 12.2)
export function buildFingerprint(
  claim: Pick<ClaimInput, "claimant" | "date" | "amount" | "currency">,
): string {
  return [
    claim.claimant.trim().toLowerCase().replace(/\s+/g, " "),
    claim.date.trim(),
    Number(claim.amount).toFixed(2),
    claim.currency.trim().toUpperCase(),
  ].join("|");
}

export function validateClaim(claim: ClaimInput, ctx: ValidationContext): Finding[] {
  const findings: Finding[] = [];

  // Required fields (1.1)
  const required: (keyof ClaimInput)[] = ["claimant", "date", "currency", "description"];
  for (const field of required) {
    if (String(claim[field] ?? "").trim() === "") {
      findings.push({
        code: "MISSING_FIELD",
        severity: "error",
        field,
        message: `${field} is required.`,
        policyRef: "1.1",
      });
    }
  }

  // Category (1.5): empty, "Other" or unknown categories are left for AI classification
  const category = claim.category.trim();
  if (!isValidCategory(category)) {
    findings.push({
      code: "NEEDS_CLASSIFICATION",
      severity: "warning",
      field: "category",
      message:
        category === ""
          ? "Category is missing and must be classified."
          : `"${category}" is not a policy category and must be classified.`,
      policyRef: "1.5",
    });
  }

  // Date (1.1, 1.2, 1.3)
  if (claim.date.trim() !== "") {
    const expenseDate = parseIsoDate(claim.date.trim());
    if (!expenseDate) {
      findings.push({
        code: "INVALID_DATE",
        severity: "error",
        field: "date",
        message: `"${claim.date}" is not a valid date (expected YYYY-MM-DD).`,
        policyRef: "1.1",
      });
    } else {
      const ageDays = Math.round((startOfUtcDay(ctx.today).getTime() - expenseDate.getTime()) / DAY_MS);
      if (ageDays < 0) {
        findings.push({
          code: "FUTURE_DATE",
          severity: "error",
          field: "date",
          message: "Expense date is in the future.",
          policyRef: "1.3",
        });
      } else if (ageDays > SUBMISSION_WINDOW_DAYS) {
        findings.push({
          code: "STALE_CLAIM",
          severity: "warning",
          field: "date",
          message: `Expense is ${ageDays} days old (limit is ${SUBMISSION_WINDOW_DAYS}); requires finance review.`,
          policyRef: "1.2",
        });
      }
    }
  }

  // Amount and currency (13.1, 13.2)
  const amountValid = Number.isFinite(claim.amount) && claim.amount > 0;
  if (!amountValid) {
    findings.push({
      code: "INVALID_AMOUNT",
      severity: "error",
      field: "amount",
      message: "Amount must be a positive number.",
    });
  }

  const baseAmount = amountValid ? toBaseAmount(claim.amount, claim.currency) : null;
  if (amountValid && claim.currency.trim() !== "" && baseAmount === null) {
    findings.push({
      code: "UNSUPPORTED_CURRENCY",
      severity: "warning",
      field: "currency",
      message: `Currency "${claim.currency}" is not supported; requires finance review.`,
      policyRef: "13.2",
    });
  }

  // Receipt (2.1)
  if (baseAmount !== null && !claim.receiptAvailable && baseAmount > RECEIPT_REQUIRED_ABOVE) {
    findings.push({
      code: "MISSING_RECEIPT",
      severity: "warning",
      field: "receiptAvailable",
      message: `Receipt required above ${formatInr(RECEIPT_REQUIRED_ABOVE)} (this claim: ${formatInr(baseAmount)}). A written explanation is needed.`,
      policyRef: "2.2",
    });
  }

  // Category limit (3-10)
  const limitCategory = ctx.effectiveCategory ?? category;
  if (baseAmount !== null && isValidCategory(limitCategory)) {
    const rule = CATEGORY_LIMITS[limitCategory];
    if (baseAmount > rule.limit) {
      const basis =
        ctx.categorySource === "ai"
          ? " (based on the AI-suggested category)"
          : ctx.categorySource === "reviewer"
            ? " (based on the reviewer's category)"
            : "";
      findings.push({
        code: "OVER_LIMIT",
        severity: "warning",
        field: "amount",
        message: `${formatInr(baseAmount)} exceeds the ${limitCategory} limit of ${formatInr(rule.limit)} per ${rule.per}${basis}.`,
        policyRef: rule.policyRef,
      });
    }
  }

  // Duplicates (12.1)
  if (ctx.duplicateIds && ctx.duplicateIds.length > 0) {
    findings.push({
      code: "DUPLICATE",
      severity: "warning",
      message: `Matches ${ctx.duplicateIds.length} other claim(s) with the same claimant, date, amount and currency.`,
      policyRef: "12.1",
    });
  }

  return findings;
}

export type TotalsInput = Pick<ClaimInput, "amount" | "currency" | "category"> & { status: string };

// Sums in integer paise so floating-point errors can't creep into totals
export function calculateTotals(claims: TotalsInput[]) {
  let totalMinor = 0;
  let unconvertedCount = 0;
  const byCategoryMinor: Record<string, number> = {};
  const byStatus: Record<string, number> = {};

  for (const claim of claims) {
    byStatus[claim.status] = (byStatus[claim.status] ?? 0) + 1;

    const base = toBaseAmount(claim.amount, claim.currency);
    if (base === null) {
      unconvertedCount++;
      continue;
    }
    const minor = Math.round(base * 100);
    totalMinor += minor;
    const key = claim.category || "Unclassified";
    byCategoryMinor[key] = (byCategoryMinor[key] ?? 0) + minor;
  }

  return {
    claimCount: claims.length,
    currency: BASE_CURRENCY,
    total: totalMinor / 100,
    byCategory: Object.fromEntries(
      Object.entries(byCategoryMinor).map(([key, minor]) => [key, minor / 100]),
    ),
    byStatus,
    unconvertedCount,
  };
}