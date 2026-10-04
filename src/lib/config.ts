// Enforced limits. Keep in sync with data/expense-policy.md (the policy text is what the AI cites).

export const BASE_CURRENCY = "INR";

// Policy 13.1: fixed rates for the current period (INR per 1 unit of currency)
export const EXCHANGE_RATES: Record<string, number> = {
  INR: 1,
  USD: 83,
  EUR: 90,
  GBP: 105,
};

// Policy 1.5
export const CATEGORIES = [
  "Meals",
  "Client Entertainment",
  "Ground Transport",
  "Air and Rail Travel",
  "Lodging",
  "Office Supplies",
  "Equipment",
  "Software",
  "Training",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LIMITS: Record<Category, { limit: number; per: string; policyRef: string }> = {
  Meals: { limit: 1500, per: "person per day", policyRef: "3.1" },
  "Client Entertainment": { limit: 5000, per: "event", policyRef: "4.1" },
  "Ground Transport": { limit: 2000, per: "trip", policyRef: "5.1" },
  "Air and Rail Travel": { limit: 25000, per: "trip", policyRef: "6.1" },
  Lodging: { limit: 8000, per: "night", policyRef: "7.1" },
  "Office Supplies": { limit: 3000, per: "claim", policyRef: "8.1" },
  Equipment: { limit: 15000, per: "claim", policyRef: "8.2" },
  Software: { limit: 5000, per: "month", policyRef: "9.1" },
  Training: { limit: 20000, per: "year", policyRef: "10.1" },
};

export const RECEIPT_REQUIRED_ABOVE = 500; // Policy 2.1
export const SUBMISSION_WINDOW_DAYS = 60; // Policy 1.2
export const AI_CONFIDENCE_THRESHOLD = 0.7; // below this, a classification is marked uncertain