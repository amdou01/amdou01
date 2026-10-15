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
