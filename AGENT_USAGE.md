# Agent Usage

## Tools I used

- **Claude Code** as my coding assistant. I used it to talk through the design, draft code and tests for each step, and debug errors.
- **Google Gemini** is the LLM inside the app itself. It classifies claims, explains them against the policy and asks follow-up questions. I'm using `gemini-3.5-flash-lite` as the main model and `gemini-3.1-flash-lite` as the backup (both set in `.env`).

## How I approached it

I picked the expense claim problem over the data migration one because I wanted to finish a complete, working and deployed app in the 48 hours rather than half of a bigger one.

Before writing any code I decided on one main rule for the whole app: anything that has to be exact (amounts, dates, limits, receipts, duplicates, totals) is done by normal code and tested. The AI is only used for the fuzzy parts, like working out the category from a vague description, explaining the decision and asking for missing information. And a human always makes the final call.

I built it in small steps: setup, sample data, database, validation rules, AI review, API, UI, then deployment. After every step I ran `npx tsc --noEmit` and `npm test`, tried it manually, and only then committed.

## Main decisions and why

**Stack.** I used Next.js with TypeScript because it's what I'm most comfortable with, and it lets me keep the frontend and backend in one project. For the database I used Postgres on Neon with Prisma, since SQLite wouldn't keep data on Vercel.

**Database design.** I kept claims, AI reviews, human decisions and the history log in separate tables so it's always clear what the AI said and what the reviewer decided. Reviews are never overwritten. If a claim is reviewed again, the old review stays in the history.

**Validation rules.** All the rules are plain functions with no database or AI calls, so they're easy to test. A few details I cared about:
- Money is stored as a Decimal and totals are added up in paise, so there are no floating point errors.
- The date is stored as text so a wrong date like 2026-02-30 gets flagged instead of crashing the app.
- Duplicates are matched on claimant, date, amount and currency, but not the description, so the same expense resubmitted with different wording is still caught.
- Each of the 13 sample claims is there to test one specific rule, and I used several currencies so the conversion actually gets tested. The seed script moves the dates relative to today so the date checks keep working.

**The AI part.** These are the things I put in so the AI can't just make things up:
- The AI only picks which policy clauses apply. The quoted text shown to the reviewer comes from the policy file, not from the AI.
- If the AI cites a clause it wasn't given, that citation is removed.
- The AI can't be more lenient than the rules. If the code finds a problem, the verdict can't be "compliant".
- If confidence is under 70%, the result is marked as uncertain and the reason is shown.
- The claimant's name isn't sent to Gemini, and the prompt tells the model to ignore any instructions written inside the claim description.

For policy retrieval I used keyword matching instead of embeddings, because the policy is only about 40 clauses and keywords are simpler, free and testable. For claims with no category, I send the AI the rules for every category, because it can't pick the right one without seeing all the options (more on that below).

**Reviewer workflow.** The AI only recommends. Approving or rejecting is always done by the reviewer, and rejecting, asking for clarification or changing the category all need a reason. Once a claim is approved or rejected it's locked. When the claimant answers a question, the answer is added to the claim and the review runs again automatically.

**Reliability.** If Gemini fails with a temporary error, the app retries with a short wait in between, and the last try uses the backup model. If it still fails, the app shows a clearly marked rule-based result and sends the claim for manual review. Every AI call and every action is logged as JSON so I could see what was happening.

**What I left out on purpose:** login and roles, receipt upload, dark mode and payments. I wanted to spend the time on the core review flow.

## What I delegated

Claude Code drafted the code for each step: the sample policy and claims, the database schema, the validation rules, the AI prompt and checks, the API routes, the UI and the tests. I reviewed it, changed what didn't fit, put it together and tested everything.

I made the decisions above, set up all the accounts and keys myself (Gemini, Neon, Vercel; I never shared the keys), chose the models and did all the testing.

## Things that went wrong and how I fixed them

- **Wrong model name.** The first model suggested (`gemini-2.5-flash`) wasn't available for new users and gave a 404. I caught it with a small test script before building anything on top of it, and just changed the model in `.env`.
- **Sample data.** The first version of the sample claims only had INR and Indian names. I changed it to use different names and USD, EUR and GBP too. That also meant updating the policy: I added a currency section and a list of valid categories, and renamed the company from "Acme" because one of the claims was a dinner with a client called "Acme Corp".
- **A type error the tests missed.** One test had a type that was too narrow. Vitest passed because it doesn't check types, but `tsc` failed. Since then I always run both.
- **Gemini overloaded.** Gemini kept returning 503 "high demand" errors. The fallback worked, but it missed things only the AI catches, like the alcohol rule. I added retries and a backup model. Later the logs showed all three retries were still hitting the same busy model because I hadn't set the backup. I listed the available models with a script (`scripts/list-models.mjs`), tested a few, and switched to Flash-Lite as the main model with another Lite model as the backup. I avoided the `-latest` model names because they can change without warning.
- **Misleading fallback result.** While Gemini was down, the fallback's keyword guess ("Meals") was being used to check limits and was labelled as "AI-suggested", which showed a wrong over-limit warning. I changed it so limits are only re-checked against a category the real AI chose.
- **AI missing the right policy section.** For "Lunch with Globex Ltd team to discuss contract renewal" with no category, the AI picked Client Entertainment but could only cite Meals rules. The review page shows which clauses were sent to the AI, and Client Entertainment wasn't there, because none of the keywords matched. Now claims without a category get all the category rules, and I added a test with that exact description so it doesn't break again. After the fix, the AI cited §4.1 and §4.2 and asked for the attendees' names.
- **Dark mode.** The starter CSS followed my Mac's dark mode and made the text unreadable on the white cards, so I made the app light theme only.

Things I decided not to do: use a vector database (not needed for a policy this size), and run `npm audit fix --force` (it would force breaking upgrades, so I listed the warnings as a known limitation instead).

## How I checked everything

- 46 unit tests for the validation rules, policy retrieval, AI checks and reviewer rules (`npm test`)
- `npx tsc --noEmit` before every commit
- Real Gemini runs on sample claims, reading the category, citations and questions myself
- Testing failures on purpose (a wrong model name) and during real Gemini outages
- curl and the browser Network tab for the API, e.g. rejecting without a reason gives a 422
- Prisma Studio to check what was actually saved in the database
- Going through the whole flow by hand: submit, AI review, clarification, review again, change category, approve or reject, and check the activity log