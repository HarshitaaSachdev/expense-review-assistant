"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { buttonClass, Card, ErrorBox } from "@/components/ui";
import { ApiError, api } from "@/lib/api-client";
import { CreateClaimSchema } from "@/lib/claims";
import { BASE_CURRENCY, CATEGORIES, EXCHANGE_RATES } from "@/lib/config";
import { formatMoney } from "@/lib/format";
import { toBaseAmount } from "@/lib/validation/rules";

type FormState = {
  claimant: string;
  date: string;
  category: string;
  amount: string;
  currency: string;
  description: string;
  receiptAvailable: "" | "yes" | "no";
};

const EMPTY: FormState = {
  claimant: "",
  date: "",
  category: "",
  amount: "",
  currency: BASE_CURRENCY,
  description: "",
  receiptAvailable: "",
};

const inputClass = (hasError: boolean) =>
  `w-full rounded-md border bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-200 ${
    hasError ? "border-red-400" : "border-slate-300 focus:border-slate-500"
  }`;

export default function NewClaimPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const update =
    (field: keyof FormState) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((current) => ({ ...current, [field]: event.target.value }));

  const amountNumber = Number(form.amount);
  const converted = form.amount && amountNumber > 0 ? toBaseAmount(amountNumber, form.currency) : null;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitError(null);

    // Same schema as the API, so the user sees problems before anything is sent
    const parsed = CreateClaimSchema.safeParse({ ...form, receiptAvailable: form.receiptAvailable === "yes" });
    const fieldErrors: Record<string, string> = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    }
    if (form.receiptAvailable === "") fieldErrors.receiptAvailable = "Select whether a receipt is available";
    setErrors(fieldErrors);
    if (!parsed.success || Object.keys(fieldErrors).length > 0) return;

    setSubmitting(true);
    try {
      const { claim } = await api<{ claim: { id: string } }>("/api/claims", { method: "POST", json: parsed.data });
      router.push(`/claims/${claim.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.details) setErrors(err.details);
      setSubmitError(err instanceof Error ? err.message : "Could not submit the claim.");
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <Link href="/" className="text-sm text-slate-500 hover:underline">
          ← Back to claims
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">New expense claim</h1>
        <p className="text-sm text-slate-500">After you submit, the claim is checked against the policy automatically.</p>
      </div>

      {submitError && <ErrorBox message={submitError} />}

      <Card>
        <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
          <Field label="Claimant" error={errors.claimant}>
            <input className={inputClass(!!errors.claimant)} value={form.claimant} onChange={update("claimant")} placeholder="Full name" />
          </Field>

          <Field label="Expense date" error={errors.date}>
            <input type="date" className={inputClass(!!errors.date)} value={form.date} onChange={update("date")} />
          </Field>

          <Field label="Category" error={errors.category} hint="Not sure? Leave it empty and the AI will suggest one.">
            <select className={inputClass(!!errors.category)} value={form.category} onChange={update("category")}>
              <option value="">Not sure (let the AI classify)</option>
              {CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
              <option value="Other">Other</option>
            </select>
          </Field>

          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Field
              label="Amount"
              error={errors.amount}
              hint={converted !== null && form.currency !== BASE_CURRENCY ? `≈ ${formatMoney(converted, BASE_CURRENCY)}` : undefined}
            >
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                className={inputClass(!!errors.amount)}
                value={form.amount}
                onChange={update("amount")}
              />
            </Field>
            <Field label="Currency" error={errors.currency}>
              <select className={inputClass(!!errors.currency)} value={form.currency} onChange={update("currency")}>
                {Object.keys(EXCHANGE_RATES).map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="sm:col-span-2">
            <Field label="Description" error={errors.description} hint="What was it for? Include the business purpose and attendees if relevant.">
              <textarea
                rows={3}
                className={inputClass(!!errors.description)}
                value={form.description}
                onChange={update("description")}
              />
            </Field>
          </div>

          <fieldset className="sm:col-span-2">
            <legend className="text-sm font-medium text-slate-700">Receipt available?</legend>
            <div className="mt-2 flex gap-4 text-sm">
              {(["yes", "no"] as const).map((value) => (
                <label key={value} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="receiptAvailable"
                    value={value}
                    checked={form.receiptAvailable === value}
                    onChange={update("receiptAvailable")}
                  />
                  {value === "yes" ? "Yes" : "No"}
                </label>
              ))}
            </div>
            {errors.receiptAvailable && <p className="mt-1 text-xs text-red-600">{errors.receiptAvailable}</p>}
          </fieldset>

          <div className="flex justify-end gap-2 sm:col-span-2">
            <Link href="/" className={buttonClass("secondary")}>
              Cancel
            </Link>
            <button type="submit" disabled={submitting} className={buttonClass("primary")}>
              {submitting ? "Submitting…" : "Submit claim"}
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <div className="mt-1">{children}</div>
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </label>
  );
}