import type { Claim } from "@prisma/client";
import { z } from "zod";
import type { ClaimInput } from "./validation/rules";

// Used by the API and the New Claim form, so both validate the same way
export const CreateClaimSchema = z.object({
  claimant: z.string().trim().min(1, "Claimant is required").max(100),
  date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD"),
  category: z.string().trim().max(50),
  amount: z.coerce.number().positive("Amount must be greater than 0").max(10_000_000),
  currency: z.string().trim().toUpperCase().length(3, "Use a 3-letter currency code"),
  description: z.string().trim().min(3, "Describe the business purpose").max(500),
  receiptAvailable: z.boolean(),
});

export function toClaimInput(claim: Claim): ClaimInput {
  return {
    claimant: claim.claimant,
    date: claim.expenseDate,
    category: claim.category,
    amount: Number(claim.amount),
    currency: claim.currency,
    description: claim.description,
    receiptAvailable: claim.receiptAvailable,
  };
}

// Prisma returns money as a Decimal object; the frontend gets a plain number
export function serializeClaim<T extends Claim>(claim: T) {
  return { ...claim, amount: Number(claim.amount) };
}