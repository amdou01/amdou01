const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core.js');

function fixture() {
  const s = C.defaultState();
  const [cash, bank, card] = s.accounts;
  const food = s.categories.expense[0];
  const transport = s.categories.expense[2];
  const salary = s.categories.income[0];
  s.transactions = [
    { id: 'a', type: 'income', date: '2026-10-01', amount: 3000, accountId: bank.id, categoryId: salary.id },
    { id: 'b', type: 'expense', date: '2026-10-02', amount: 50.5, accountId: cash.id, categoryId: food.id, note: 'Déjeuner' },
    { id: 'c', type: 'expense', date: '2026-10-02', amount: 20, accountId: card.id, categoryId: transport.id },
    { id: 'd', type: 'transfer', date: '2026-10-03', amount: 200, fee: 1.5, accountId: bank.id, toAccountId: cash.id },
    { id: 'e', type: 'expense', date: '2026-09-30', amount: 10, accountId: cash.id, categoryId: food.id },
  ];
  return { s, cash, bank, card, food, transport, salary };
}

test('monthRange gère le jour de début du mois', () => {
  assert.deepEqual(C.monthRange(2026, 9, 1), { start: '2026-10-01', end: '2026-10-31' });
  assert.deepEqual(C.monthRange(2026, 1, 1), { start: '2026-02-01', end: '2026-02-28' });
  assert.deepEqual(C.monthRange(2026, 9, 25), { start: '2026-10-25', end: '2026-11-24' });
});

test('totals ignore les transferts', () => {
  const { s } = fixture();
  const oct = C.filterRange(s.transactions, C.monthRange(2026, 9));
  assert.deepEqual(C.totals(oct), { income: 3000, expense: 70.5, total: 2929.5 });
});

test('groupByDay regroupe et trie du plus récent au plus ancien', () => {
  const { s } = fixture();
  const g = C.groupByDay(C.filterRange(s.transactions, C.monthRange(2026, 9)));
  assert.deepEqual(g.map((x) => x.date), ['2026-10-03', '2026-10-02', '2026-10-01']);
  assert.equal(g[1].expense, 70.5);
  assert.equal(g[1].items.length, 2);
});

test('groupByWeek couvre tout le mois', () => {
  const { s } = fixture();
  const r = C.monthRange(2026, 9);
  const weeks = C.groupByWeek(C.filterRange(s.transactions, r), r, 1);
  assert.equal(weeks.at(-1).start, '2026-09-28'); // lundi
  const sum = weeks.reduce((a, w) => a + w.expense, 0);
  assert.equal(sum, 70.5);
});

test('accountBalances applique transferts et frais', () => {
  const { s, cash, bank, card } = fixture();
  const bal = C.accountBalances(s);
  assert.equal(bal[bank.id], 3000 - 200 - 1.5);
  assert.equal(bal[cash.id], -50.5 + 200 - 10);
  assert.equal(bal[card.id], -20);
  assert.deepEqual(C.netWorth(s), { assets: 2798.5 + 139.5, liabilities: 20, total: 2918 });
});

test('byCategory calcule les pourcentages', () => {
  const { s, food, transport } = fixture();
  const rows = C.byCategory(C.filterRange(s.transactions, C.monthRange(2026, 9)), 'expense');
  assert.equal(rows[0].categoryId, food.id);
  assert.equal(rows[1].categoryId, transport.id);
  assert.ok(Math.abs(rows[0].pct + rows[1].pct - 100) < 1e-9);
});

test('budgetStatus compare budget et dépenses', () => {
  const { s, food } = fixture();
  s.budgets[food.id] = 40;
  const [b] = C.budgetStatus(s, C.monthRange(2026, 9));
  assert.equal(b.spent, 50.5);
  assert.equal(b.remaining, -10.5);
});

test('validateTx refuse les saisies invalides', () => {
  const { cash } = fixture();
  assert.ok(C.validateTx({ type: 'expense', date: '2026-10-01', amount: 0, accountId: cash.id }).length >= 2);
  assert.deepEqual(C.validateTx({ type: 'transfer', date: '2026-10-01', amount: 5, accountId: cash.id, toAccountId: cash.id }),
    ['Les comptes doivent être différents']);
});

test('search et export CSV', () => {
  const { s } = fixture();
  assert.equal(C.search(s.transactions, 'déj', s).length, 1);
  assert.equal(C.search(s.transactions, 'alimentation', s).length, 2);
  const csv = C.toCSV(s);
  assert.ok(csv.startsWith('﻿Date;Type;'));
  assert.ok(csv.includes('2026-10-02;Dépense;Espèces;Alimentation;50,5'));
});

test('migrate complète un état partiel', () => {
  const m = C.migrate({ transactions: [], settings: { currency: 'FCFA' } });
  assert.equal(m.settings.currency, 'FCFA');
  assert.equal(m.settings.monthStartDay, 1);
  assert.ok(m.accounts.length > 0);
});

function billFixture() {
  const { s, bank, food } = fixture();
  const factures = s.categories.expense[4];
  s.bills = [
    { id: 'f1', supplier: 'Senelec', amount: 25000, dueDate: '2026-10-10', categoryId: factures.id, accountId: bank.id, recurrence: 'monthly' },
    { id: 'f2', supplier: 'Orange', amount: 15000, dueDate: '2026-10-20', categoryId: factures.id, accountId: bank.id, recurrence: 'none' },
    { id: 'f3', supplier: 'Loyer', amount: 200000, dueDate: '2026-11-30', categoryId: food.id, accountId: bank.id },
    { id: 'f4', supplier: 'LWS', amount: 9000, dueDate: '2026-09-01', paidDate: '2026-09-01', categoryId: factures.id, accountId: bank.id },
  ];
  return { s, bank, factures };
}

test('nextDueDate gère les fins de mois et les récurrences', () => {
  assert.equal(C.nextDueDate('2026-01-31', 'monthly'), '2026-02-28');
  assert.equal(C.nextDueDate('2026-11-15', 'quarterly'), '2027-02-15');
  assert.equal(C.nextDueDate('2028-02-29', 'yearly'), '2029-02-28');
  assert.equal(C.nextDueDate('2026-10-10', 'none'), null);
});

test('billStatus et billsSummary classent les factures', () => {
  const { s } = billFixture();
  const ref = '2026-10-16';
  assert.deepEqual(s.bills.map((b) => C.billStatus(b, ref)), ['overdue', 'soon', 'due', 'paid']);
  const sum = C.billsSummary(s.bills, ref);
  assert.equal(sum.toPay, 240000);
  assert.equal(sum.toPayCount, 3);
  assert.equal(sum.overdue, 25000);
  assert.equal(sum.soon, 15000);
  assert.equal(sum.paid, 9000);
  assert.deepEqual(C.sortBills(s.bills).map((b) => b.id), ['f1', 'f2', 'f3', 'f4']);
});

test('payBill crée la dépense et la prochaine échéance ; unpayBill annule', () => {
  const { s, bank, factures } = billFixture();
  const n = s.transactions.length;
  const paid = C.payBill(s, 'f1', { date: '2026-10-16' });
  const f1 = paid.bills.find((b) => b.id === 'f1');
  assert.equal(f1.paidDate, '2026-10-16');
  const tx = paid.transactions.find((t) => t.id === f1.txId);
  assert.deepEqual([tx.type, tx.amount, tx.accountId, tx.categoryId, tx.note], ['expense', 25000, bank.id, factures.id, 'Senelec']);
  assert.equal(paid.transactions.length, n + 1);
  const next = paid.bills.find((b) => b.supplier === 'Senelec' && !b.paidDate);
  assert.equal(next.dueDate, '2026-11-10');
  assert.equal(s.bills.find((b) => b.id === 'f1').paidDate, undefined, 'état initial inchangé');
  // Facture ponctuelle : pas de nouvelle échéance.
  assert.equal(C.payBill(paid, 'f2').bills.length, paid.bills.length);
  const undone = C.unpayBill(paid, 'f1');
  assert.equal(undone.bills.find((b) => b.id === 'f1').paidDate, undefined);
  assert.equal(undone.transactions.length, n);
});

test('validateBill refuse les saisies incomplètes', () => {
  assert.ok(C.validateBill({ supplier: ' ', amount: 0, dueDate: '' }).length >= 4);
  const { s } = billFixture();
  assert.deepEqual(C.validateBill(s.bills[0]), []);
});

test('mergeState ajoute sans doublon', () => {
  const { s } = billFixture();
  const incoming = { accounts: s.accounts, transactions: [...s.transactions.slice(0, 2), { ...s.transactions[0], id: 'z' }], bills: [s.bills[0]] };
  const { state, added } = C.mergeState(s, incoming);
  assert.deepEqual(added, { transactions: 1, bills: 0 });
  assert.equal(state.transactions.length, s.transactions.length + 1);
  assert.equal(state.accounts.length, s.accounts.length);
});

test('monthlyExpenseSeries répartit les dépenses par mois et catégorie', () => {
  const { s, food, transport } = fixture();
  const series = C.monthlyExpenseSeries(s.transactions, 2026, 9, 3);
  assert.deepEqual(series.map((m) => m.start), ['2026-08-01', '2026-09-01', '2026-10-01']);
  assert.equal(series[1].total, 10);
  assert.deepEqual(series[2].byCat, { [food.id]: 50.5, [transport.id]: 20 });
});
