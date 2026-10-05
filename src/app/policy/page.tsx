import { Card } from "@/components/ui";
import { BASE_CURRENCY, CATEGORY_LIMITS, EXCHANGE_RATES } from "@/lib/config";
import { formatMoney } from "@/lib/format";
import { loadPolicy } from "@/lib/policy/policy";

// Rendered on the server from data/expense-policy.md, so clause links (#clause-3.1) jump straight to the text
export default function PolicyPage() {
  const policy = loadPolicy();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{policy.title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">{policy.intro}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {policy.sections.map((section) => (
            <section key={section.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="font-semibold">
                {section.id}. {section.title}
              </h2>
              <ul className="mt-2 space-y-1">
                {section.clauses.map((clause) => (
                  <li
                    key={clause.ref}
                    id={`clause-${clause.ref}`}
                    className="scroll-mt-4 rounded-md p-2 text-sm target:bg-amber-50 target:ring-1 target:ring-amber-300"
                  >
                    <span className="mr-2 font-mono text-xs text-slate-500">{clause.ref}</span>
                    {clause.text}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div className="space-y-4">
          <Card title="Enforced limits">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {Object.entries(CATEGORY_LIMITS).map(([category, rule]) => (
                  <tr key={category}>
                    <td className="py-2">{category}</td>
                    <td className="py-2 text-right tabular-nums">
                      {formatMoney(rule.limit, BASE_CURRENCY)}
                      <div className="text-xs text-slate-500">
                        per {rule.per} · §{rule.policyRef}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Card title="Exchange rates">
            <ul className="space-y-1 text-sm">
              {Object.entries(EXCHANGE_RATES)
                .filter(([code]) => code !== BASE_CURRENCY)
                .map(([code, rate]) => (
                  <li key={code} className="flex justify-between">
                    <span>1 {code}</span>
                    <span className="tabular-nums">{formatMoney(rate, BASE_CURRENCY)}</span>
                  </li>
                ))}
            </ul>
          </Card>
          <p className="text-xs text-slate-500">
            Limits are enforced by code and must match the policy text above, which is what the AI cites.
          </p>
        </div>
      </div>
    </div>
  );
}