import { readFileSync } from "node:fs";
import path from "node:path";
import { BASE_CURRENCY, CATEGORIES, CATEGORY_LIMITS, type Category } from "../config";
import { isValidCategory, type ClaimInput, type Finding } from "../validation/rules";

export type PolicyClause = { ref: string; text: string; sectionId: string; sectionTitle: string };
export type PolicySection = { id: string; title: string; clauses: PolicyClause[] };
export type Policy = { title: string; intro: string; sections: PolicySection[] };

const POLICY_PATH = path.join(process.cwd(), "data", "expense-policy.md");

let cached: Policy | null = null;

// Turns the markdown policy into sections ("## 3. Meals") and clauses ("3.1 ...")
export function parsePolicy(markdown: string): Policy {
  const policy: Policy = { title: "", intro: "", sections: [] };
  let current: PolicySection | null = null;

  for (const rawLine of markdown.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const heading = line.match(/^##\s+(\d+)\.\s+(.+)$/);
    const title = line.match(/^#\s+(.+)$/);
    const clause = line.match(/^(\d+\.\d+)\s+(.+)$/);

    if (heading) {
      current = { id: heading[1], title: heading[2], clauses: [] };
      policy.sections.push(current);
    } else if (title) {
      policy.title = title[1];
    } else if (clause && current) {
      current.clauses.push({ ref: clause[1], text: clause[2], sectionId: current.id, sectionTitle: current.title });
    } else if (!current) {
      policy.intro += (policy.intro ? " " : "") + line;
    }
  }
  return policy;
}

export function loadPolicy(): Policy {
  if (!cached) cached = parsePolicy(readFileSync(POLICY_PATH, "utf8"));
  return cached;
}

export function allClauses(policy: Policy = loadPolicy()): PolicyClause[] {
  return policy.sections.flatMap((section) => section.clauses);
}

// Hand-written hints linking everyday words to policy categories
const CATEGORY_KEYWORDS: Record<Category, string[]> = {
  Meals: ["meal", "meals", "lunch", "dinner", "breakfast", "food", "snack", "coffee", "restaurant", "team"],
  "Client Entertainment": ["client", "clients", "customer", "prospect", "partner", "entertainment", "procurement", "corp"],
  "Ground Transport": ["taxi", "cab", "uber", "ola", "lyft", "rickshaw", "auto", "bus", "metro", "parking", "airport"],
  "Air and Rail Travel": ["flight", "airfare", "airline", "train", "rail"],
  Lodging: ["hotel", "stay", "accommodation", "lodging", "airbnb", "room"],
  "Office Supplies": ["stationery", "notebook", "notebooks", "pen", "pens", "paper", "printer", "supplies"],
  Equipment: ["monitor", "chair", "keyboard", "mouse", "headset", "laptop", "desk", "wfh", "setup", "equipment"],
  Software: ["software", "subscription", "license", "licence", "saas", "plan", "figma", "github", "slack"],
  Training: ["course", "training", "certification", "book", "books", "learning", "udemy", "coursera"],
};

// Topics that pull in specific clauses regardless of category
const TOPIC_KEYWORDS: { words: string[]; refs: string[] }[] = [
  { words: ["drinks", "drink", "bar", "pub", "beer", "wine", "alcohol", "cocktail", "cocktails"], refs: ["3.3", "11.1"] },
  { words: ["office", "commute", "home"], refs: ["5.2"] },
  { words: ["gift", "gifts", "fine", "penalty", "personal"], refs: ["11.1"] },
  { words: ["netflix", "spotify", "streaming"], refs: ["9.2"] },
];

// Clauses that apply to every claim
const ALWAYS_INCLUDED = ["1.4", "2.1", "2.2"];

function tokenize(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1));
}

export function rankCategories(description: string): { category: Category; score: number }[] {
  const tokens = tokenize(description);
  return CATEGORIES.map((category) => ({
    category,
    score: CATEGORY_KEYWORDS[category].filter((word) => tokens.has(word)).length,
  }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
}

// Keyword-only guess, used when the AI is unavailable. Deliberately low confidence.
export function classifyByKeywords(description: string): { category: Category | null; confidence: number } {
  const [top, second] = rankCategories(description);
  if (!top) return { category: null, confidence: 0 };
  if (second && second.score === top.score) return { category: top.category, confidence: 0.3 };
  return { category: top.category, confidence: top.score >= 2 ? 0.6 : 0.45 };
}

// Picks the policy clauses relevant to a claim: its category, likely categories,
// topic keywords (e.g. alcohol), currency rules, and every clause a rule finding referenced
export function retrievePolicy(
  claim: Pick<ClaimInput, "category" | "description" | "currency">,
  findings: Finding[] = [],
  policy: Policy = loadPolicy(),
) {
  const tokens = tokenize(`${claim.category} ${claim.description}`);
  const refs = new Set<string>(ALWAYS_INCLUDED);
  const sectionIds = new Set<string>();

  const categories: Category[] = [];
  const submitted = claim.category.trim();
  if (isValidCategory(submitted)) categories.push(submitted);
  else refs.add("1.5");
  for (const { category } of rankCategories(claim.description).slice(0, 3)) {
    if (!categories.includes(category)) categories.push(category);
  }
  for (const category of categories) sectionIds.add(CATEGORY_LIMITS[category].policyRef.split(".")[0]);

  for (const topic of TOPIC_KEYWORDS) {
    if (topic.words.some((word) => tokens.has(word))) topic.refs.forEach((ref) => refs.add(ref));
  }
  if (claim.currency.trim().toUpperCase() !== BASE_CURRENCY) {
    refs.add("13.1");
    refs.add("13.3");
  }
  for (const finding of findings) if (finding.policyRef) refs.add(finding.policyRef);

  const clauses = allClauses(policy).filter((c) => refs.has(c.ref) || sectionIds.has(c.sectionId));
  return { clauses, matchedCategories: categories };
}