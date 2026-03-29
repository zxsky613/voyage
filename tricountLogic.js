/**
 * Logique type Tricount : soldes par personne et remboursements simplifiés.
 * Chaque dépense : un payeur avance `amount`, réparti équitablement entre `splitSet`.
 */

const EPS = 1e-6;

/**
 * @param {string[]} canonicalParticipants — ex. ["Moi", "a@b.com"]
 * @param {Array<{ amount?: number, paid_by?: string, split_between?: string[] }>} expenses
 * @returns {Record<string, number>} solde positif = on vous doit, négatif = vous devez
 */
export function computeTricountBalances(canonicalParticipants, expenses) {
  const base =
    Array.isArray(canonicalParticipants) && canonicalParticipants.length > 0
      ? [...canonicalParticipants].map(String)
      : ["Moi"];
  const keys = new Set(base);
  for (const e of expenses || []) {
    keys.add(String(e?.paid_by || "Moi"));
    (Array.isArray(e?.split_between) ? e.split_between : []).forEach((s) => keys.add(String(s)));
  }
  const balances = Object.fromEntries([...keys].map((k) => [k, 0])); // payeurs hors liste initiale inclus

  for (const e of expenses || []) {
    const amount = Number(e?.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const payer = String(e?.paid_by || "Moi");
    const rawSplit = Array.isArray(e?.split_between) ? e.split_between.map(String) : [];
    let effective =
      rawSplit.length > 0 ? rawSplit.filter((p) => base.includes(p)) : [...base];
    if (effective.length === 0) effective = [...base];
    const share = amount / effective.length;
    if (balances[payer] === undefined) balances[payer] = 0;
    balances[payer] += amount;
    for (const s of effective) {
      if (balances[s] === undefined) balances[s] = 0;
      balances[s] -= share;
    }
  }
  return balances;
}

/**
 * @param {Record<string, number>} balances
 * @returns {Array<{ from: string, to: string, amount: number }>}
 */
export function simplifyTricountDebts(balances) {
  const entries = Object.entries(balances || {}).map(([person, bal]) => ({
    person,
    bal: Number(bal) || 0,
  }));
  const debtors = entries
    .filter((x) => x.bal < -EPS)
    .map((x) => ({ person: x.person, amount: -x.bal }))
    .sort((a, b) => b.amount - a.amount);
  const creditors = entries
    .filter((x) => x.bal > EPS)
    .map((x) => ({ person: x.person, amount: x.bal }))
    .sort((a, b) => b.amount - a.amount);
  const transfers = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amount, creditors[j].amount);
    if (pay > EPS) {
      transfers.push({
        from: debtors[i].person,
        to: creditors[j].person,
        amount: Math.round(pay * 100) / 100,
      });
    }
    debtors[i].amount -= pay;
    creditors[j].amount -= pay;
    if (debtors[i].amount < EPS) i += 1;
    if (creditors[j].amount < EPS) j += 1;
  }
  return transfers;
}
