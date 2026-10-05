# Expense Claim Policy Review Assistant

An internal tool that reviews employee expense claims against a company expense policy. Deterministic code checks the hard rules, an LLM helps with the judgement calls and explains its reasoning with policy citations, and a human reviewer makes every final decision.

- **Live app:** (https://expense-review-assistant.vercel.app/)
- **Repository:** https://github.com/HarshitaaSachdev/expense-review-assistant

No login is needed. Enter any name in "Your name" on a claim page to act as the reviewer.

## What it does

1. An employee submits a claim (claimant, date, category, amount, currency, description, receipt yes/no).
2. **Rule checks (code):** required fields, valid and non-future dates, the 60-day submission window, supported currency, receipt requirement, category limit (after currency conversion) and duplicate detection.
3. **AI review (Gemini):** classifies vague or missing categories, retrieves the relevant policy clauses, explains whether the claim looks compliant, needs clarification or needs review, asks the claimant for missing information, cites the policy behind each point, and clearly marks uncertain classifications.
4. **Reviewer:** approves, rejects, requests clarification, adds the claimant's answer, or overrides the AI category with a reason.
5. **History:** every submission, rule check, AI review and decision is recorded and shown per claim and in the activity log.

## Architecture

```
Browser (Next.js pages)
   │  fetch
   ▼
API routes (src/app/api)
   ├── Rules       src/lib/validation/rules.ts    deterministic checks and totals
   ├── Retrieval   src/lib/policy/policy.ts       picks relevant policy clauses
   ├── AI agent    src/lib/ai/reviewAgent.ts      Gemini call, retries, fallback
   ├── Guardrails  src/lib/ai/guardrails.ts       validates and corrects AI output
   └── Decisions   src/lib/review/decisions.ts    reviewer business rules
   │
   ▼
PostgreSQL (Neon) via Prisma: Claim, Review, Decision, AuditEvent
```

**Stack:** Next.js 16 (App Router) + TypeScript, Tailwind CSS, Prisma 6, PostgreSQL on Neon, Google Gemini (`@google/genai`), zod, Vitest, deployed on Vercel.

### How a review works (`src/lib/review/runReview.ts`)

1. Load the claim, any reviewer category override, and any clarifications from the claimant.
2. Find other claims with the same fingerprint (claimant + date + amount + currency) to detect duplicates.
3. Run the deterministic rules.
4. Retrieve policy clauses: the claim's category section, topic clauses (e.g. alcohol), currency rules and every clause referenced by a rule finding. Unclassified claims get every category's rules so the model can compare them.
5. Ask Gemini for structured JSON (category, confidence, verdict, explanation, citations, questions).
6. Apply guardrails: schema validation with zod; citations restricted to retrieved clauses, with quote text taken from the policy file; the verdict can never be more lenient than the rule findings; confidence below 70% is marked uncertain.
7. If Gemini fails (overload, rate limit, timeout, invalid output), retry with exponential backoff and a backup model, then fall back to a clearly labelled rule-based result that is always sent for manual review.
8. Save the review and an audit event. Earlier reviews are kept.

### Data model

| Table | Purpose |
| --- | --- |
| `Claim` | The submitted claim, its status and an optional reviewer-set category |
| `Review` | Each automated review run: rule findings and AI output |
| `Decision` | Each reviewer action, with reviewer name, reason and category change |
| `AuditEvent` | Append-only history of everything that happened |

### API

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/claims` | List claims with their latest review, plus totals |
| POST | `/api/claims` | Submit a claim |
| GET | `/api/claims/:id` | Claim with all reviews, decisions and history |
| POST | `/api/claims/:id/review` | Run rule checks and the AI review |
| POST | `/api/claims/:id/decision` | Approve, reject, request or add clarification, override category |
| GET | `/api/activity` | Latest 200 audit events |
| GET | `/api/policy` | Parsed policy, limits and exchange rates |

Errors use one format, `{ "error": "...", "details"?: {...} }`, with 400 (invalid input), 404 (not found), 409 (claim is final), 422 (business rule) and 500 (logged server error).

## Project structure

```
data/                 expense-policy.md, sample-claims.json
prisma/               schema.prisma, migrations/, seed.ts
scripts/              test-gemini.mjs, list-models.mjs, try-review.ts
src/app/              pages (claims, new claim, claim review, activity, policy) and API routes
src/components/       shared UI and claim review components
src/lib/              config, validation rules, policy retrieval, AI agent and guardrails,
                      review pipeline, decision rules, audit log, logger
tests/                unit tests
```

## Running locally

Requirements: Node.js 20.6+, a Neon (or any PostgreSQL) database, and a Gemini API key from https://aistudio.google.com/apikey.

```bash
git clone https://github.com/YOUR-USERNAME/expense-review-assistant.git
cd expense-review-assistant
npm install
cp .env.example .env          # then fill in the values
npx prisma migrate deploy     # create the tables
npm run db:seed               # load 13 sample claims (deletes existing data)
npm run dev                   # http://localhost:3000
```

### Environment variables

| Name | Description |
| --- | --- |
| `GEMINI_API_KEY` | Gemini API key |
| `GEMINI_MODEL` | Primary model, default `gemini-3.5-flash-lite` |
| `GEMINI_FALLBACK_MODEL` | Optional backup model used on the last retry |
| `DATABASE_URL` | Pooled PostgreSQL connection string (used by the app) |
| `DIRECT_URL` | Direct PostgreSQL connection string (used by migrations) |

If the Gemini variables are missing, the app still works using the rule-based fallback.

### Useful scripts

```bash
npm test                                    # unit tests
npx tsc --noEmit                            # type check
node --env-file=.env scripts/test-gemini.mjs   # check the Gemini key and model
node --env-file=.env scripts/list-models.mjs   # list available Flash models
npm run try:review -- 4                     # run the AI review on sample claim #4
npx prisma studio                           # browse the database
```

## Sample data for reviewers

The 13 sample claims each exercise a specific requirement:

| Claimant | What it shows |
| --- | --- |
| Priya Sharma | Compliant claim (happy path) |
| Lukas Schmidt (×2) | Duplicate detection, EUR conversion |
| Emily Chen | Team dinner over the per-person limit; AI asks for attendee count |
| Vikram Singh | Category "Other" classified as Client Entertainment; AI asks for attendee names |
| Neha Kapoor | Missing receipt; possible personal commute |
| Carlos Mendez | Future date (blocking) |
| Sana Iqbal | Older than 60 days |
| Karan Joshi | USD conversion within limit |
| Sophie Martin | No category; AI suggests Training and asks about manager approval |
| Daniel O'Brien | Alcohol, which only the AI detects |
| (no claimant) | Missing required field |
| Divya Rao | Vague description ("Stuff for WFH setup"); uncertain classification |

Some claims are already reviewed; opening an unreviewed claim starts its review automatically. You can also submit your own claims, for example one with no category such as "Lunch with Globex Ltd team to discuss contract renewal".

## Tests

```bash
npm test
```

46 unit tests across four files:
- `validation.test.ts`: required fields, impossible dates, future and stale dates, receipts after currency conversion, category limits, unsupported currencies, duplicates, totals without floating-point drift
- `policy.test.ts`: policy parsing, clause retrieval (alcohol, commuting, currency, finding references, unclassified claims), keyword classification
- `guardrails.test.ts`: citation text taken from the policy, invented citations removed, verdict never more lenient than the rules, uncertainty marking, fallback behaviour
- `decisions.test.ts`: reasons required, approval rules for blocking issues, final decisions locked, status transitions

The AI agent, API routes and UI were tested manually end to end, including Gemini outages and invalid model names.

## Deployment

- Hosted on **Vercel**, connected to the GitHub repository (each push to `main` deploys).
- Database: **Neon PostgreSQL** in AWS US East, the same region as the Vercel functions.
- Environment variables are set in the Vercel project settings.
- `next.config.ts` bundles `data/expense-policy.md` with the server functions, because the policy is read at runtime.
- The AI review route allows up to 60 seconds, to cover retries.
- Schema changes are applied with `npx prisma migrate deploy`.
- Demo data is reset with `npm run db:seed`.

## Scope

**Completed**
- Claim submission with client- and server-side validation
- Deterministic checks: duplicates, totals, missing receipts, category limits, dates and required fields
- AI classification, policy retrieval, explanations, clarification questions, policy citations and uncertainty marking
- Reviewer actions: approve, reject, request clarification, add the claimant's answer, override category with a reason
- Full review and decision history per claim, plus a global activity log
- Retries, a backup model and a rule-based fallback for LLM failures
- Structured JSON logs, unit tests, hosted deployment

**Intentionally excluded**
- Authentication and roles (the reviewer types their name)
- Reimbursement, payroll, tax advice, receipt upload/OCR, payments (excluded by the brief)
- Dark mode
- Pagination (the activity log shows the latest 200 events)

## Limitations

- **No authentication:** anyone with the link can act as a reviewer, and the reviewer name is self-entered and remembered in the browser.
- **Limits are defined twice:** in `src/lib/config.ts` (enforced by code) and in the policy text (cited by the AI). They are kept in sync manually; a production version would generate one from the other.
- **Per-person and per-night limits** are checked against the full claim amount, since attendee counts and nights are not captured as fields. The AI asks for these details instead.
- **Fixed exchange rates** from the policy, not live rates.
- **Keyword retrieval** suits this small policy; a much larger policy would need embeddings.
- **Gemini free tier:** rate limits and occasional overload can trigger the fallback; free-tier data may be used by Google, which is acceptable here because all data is fictional.
- **One shared database** for local development and the demo; production would use separate databases.
- `npm audit` reports vulnerabilities in dependencies; `npm audit fix --force` was not applied because it forces breaking upgrades.
- Light theme only.

## AI usage

See [AGENT_USAGE.md](AGENT_USAGE.md).
