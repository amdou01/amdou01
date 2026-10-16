/*
 * Kalpe — logique métier (indépendante du DOM).
 * Utilisable dans le navigateur (window.KalpeCore) et sous Node (require).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KalpeCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TYPES = { INCOME: 'income', EXPENSE: 'expense', TRANSFER: 'transfer' };

  const ACCOUNT_GROUPS = [
    { id: 'cash', name: 'Espèces', liability: false },
    { id: 'bank', name: 'Comptes bancaires', liability: false },
    { id: 'card', name: 'Cartes de crédit', liability: true },
    { id: 'savings', name: 'Épargne', liability: false },
    { id: 'invest', name: 'Investissements', liability: false },
    { id: 'loan', name: 'Prêts', liability: true },
    { id: 'other', name: 'Autres', liability: false },
  ];

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function defaultState() {
    const cat = (name, icon) => ({ id: uid(), name, icon });
    return {
      version: 1,
      settings: { currency: '€', locale: 'fr-FR', weekStart: 1, monthStartDay: 1 },
      accounts: [
        { id: uid(), name: 'Espèces', group: 'cash', initial: 0 },
        { id: uid(), name: 'Compte courant', group: 'bank', initial: 0 },
        { id: uid(), name: 'Carte de crédit', group: 'card', initial: 0 },
      ],
      categories: {
        expense: [
          cat('Alimentation', '🍜'), cat('Vie sociale', '👫'), cat('Transport', '🚕'),
          cat('Logement', '🏠'), cat('Factures', '🧾'), cat('Santé', '🧘'),
          cat('Shopping', '🛍️'), cat('Éducation', '📚'), cat('Cadeaux', '🎁'),
          cat('Professionnel', '💼'), cat('Autres', '📦'),
        ],
        income: [
          cat('Salaire', '💰'), cat('Prime', '🏅'), cat('Ventes', '🧾'),
          cat('Placements', '📈'), cat('Autres', '📦'),
        ],
      },
      transactions: [],
      budgets: {},   // { categoryId: montant mensuel }
      bookmarks: [], // modèles de transactions favorites
      bills: [],     // factures payées / à payer
    };
  }

  // ---------- Dates ----------
  const pad = (n) => String(n).padStart(2, '0');
  const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const today = () => toISO(new Date());

  /**
   * Période "mensuelle" avec jour de début configurable (ex. le 25 pour un salaire).
   * Renvoie { start, end } au format ISO, bornes incluses.
   */
  function monthRange(year, month, startDay = 1) {
    const start = new Date(year, month, startDay);
    const end = new Date(year, month + 1, startDay - 1);
    return { start: toISO(start), end: toISO(end) };
  }

  function yearRange(year) {
    return { start: `${year}-01-01`, end: `${year}-12-31` };
  }

  function weekStartOf(iso, weekStart = 1) {
    const d = parseISO(iso);
    const diff = (d.getDay() - weekStart + 7) % 7;
    d.setDate(d.getDate() - diff);
    return toISO(d);
  }

  function addDays(iso, n) {
    const d = parseISO(iso);
    d.setDate(d.getDate() + n);
    return toISO(d);
  }

  const inRange = (iso, r) => iso >= r.start && iso <= r.end;

  // ---------- Agrégats ----------
  function filterRange(txs, range) {
    return txs.filter((t) => inRange(t.date, range));
  }

  function totals(txs) {
    let income = 0, expense = 0;
    for (const t of txs) {
      if (t.type === TYPES.INCOME) income += t.amount;
      else if (t.type === TYPES.EXPENSE) expense += t.amount;
    }
    return { income: round(income), expense: round(expense), total: round(income - expense) };
  }

  function round(n) { return Math.round(n * 100) / 100; }

  function sortTx(txs) {
    return [...txs].sort((a, b) => (b.date.localeCompare(a.date)) || ((b.createdAt || 0) - (a.createdAt || 0)));
  }

  /** Regroupe par jour : [{ date, items, income, expense }] trié du plus récent au plus ancien. */
  function groupByDay(txs) {
    const map = new Map();
    for (const t of sortTx(txs)) {
      if (!map.has(t.date)) map.set(t.date, []);
      map.get(t.date).push(t);
    }
    return [...map.entries()].map(([date, items]) => ({ date, items, ...totals(items) }));
  }

  /** Semaines couvrant une plage : [{ start, end, income, expense, total }] (plus récente en tête). */
  function groupByWeek(txs, range, weekStart = 1) {
    const weeks = [];
    let s = weekStartOf(range.start, weekStart);
    while (s <= range.end) {
      const e = addDays(s, 6);
      const r = { start: s < range.start ? range.start : s, end: e > range.end ? range.end : e };
      weeks.push({ start: s, end: e, ...totals(filterRange(txs, r)) });
      s = addDays(s, 7);
    }
    return weeks.reverse();
  }

  /** 12 mois d'une année : [{ month, start, end, income, expense, total }] (décembre en tête). */
  function groupByMonth(txs, year, startDay = 1) {
    const out = [];
    for (let m = 0; m < 12; m++) {
      const r = monthRange(year, m, startDay);
      out.push({ month: m, ...r, ...totals(filterRange(txs, r)) });
    }
    return out.reverse();
  }

  /** Répartition par catégorie pour les statistiques (camembert). */
  function byCategory(txs, type) {
    const map = new Map();
    let sum = 0;
    for (const t of txs) {
      if (t.type !== type) continue;
      map.set(t.categoryId, (map.get(t.categoryId) || 0) + t.amount);
      sum += t.amount;
    }
    return [...map.entries()]
      .map(([categoryId, amount]) => ({ categoryId, amount: round(amount), pct: sum ? (amount / sum) * 100 : 0 }))
      .sort((a, b) => b.amount - a.amount);
  }

  /** Solde de chaque compte (solde initial + flux, transferts et frais inclus). */
  function accountBalances(state, upTo) {
    const bal = {};
    for (const a of state.accounts) bal[a.id] = a.initial || 0;
    for (const t of state.transactions) {
      if (upTo && t.date > upTo) continue;
      if (t.type === TYPES.INCOME) bal[t.accountId] = (bal[t.accountId] || 0) + t.amount;
      else if (t.type === TYPES.EXPENSE) bal[t.accountId] = (bal[t.accountId] || 0) - t.amount;
      else if (t.type === TYPES.TRANSFER) {
        bal[t.accountId] = (bal[t.accountId] || 0) - t.amount - (t.fee || 0);
        bal[t.toAccountId] = (bal[t.toAccountId] || 0) + t.amount;
      }
    }
    for (const k in bal) bal[k] = round(bal[k]);
    return bal;
  }

  /** Actif / passif / patrimoine net. */
  function netWorth(state, upTo) {
    const bal = accountBalances(state, upTo);
    let assets = 0, liabilities = 0;
    for (const a of state.accounts) {
      const v = bal[a.id] || 0;
      if (v >= 0) assets += v; else liabilities += -v;
    }
    return { assets: round(assets), liabilities: round(liabilities), total: round(assets - liabilities) };
  }

  /** Suivi des budgets : [{ categoryId, budget, spent, remaining, pct }]. */
  function budgetStatus(state, range) {
    const spent = new Map(byCategory(filterRange(state.transactions, range), TYPES.EXPENSE)
      .map((c) => [c.categoryId, c.amount]));
    return Object.entries(state.budgets)
      .filter(([, b]) => b > 0)
      .map(([categoryId, budget]) => {
        const s = spent.get(categoryId) || 0;
        return { categoryId, budget, spent: s, remaining: round(budget - s), pct: (s / budget) * 100 };
      });
  }

  function search(txs, query, state) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const catName = (id) => {
      const c = [...state.categories.expense, ...state.categories.income].find((x) => x.id === id);
      return c ? c.name.toLowerCase() : '';
    };
    return sortTx(txs.filter((t) =>
      (t.note || '').toLowerCase().includes(q) ||
      (t.description || '').toLowerCase().includes(q) ||
      catName(t.categoryId).includes(q) ||
      String(t.amount).includes(q)));
  }

  // ---------- Validation / import-export ----------
  function validateTx(t) {
    const errors = [];
    if (!Object.values(TYPES).includes(t.type)) errors.push('Type invalide');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t.date || '')) errors.push('Date invalide');
    if (!(typeof t.amount === 'number' && t.amount > 0 && isFinite(t.amount))) errors.push('Montant invalide');
    if (!t.accountId) errors.push('Compte requis');
    if (t.type === TYPES.TRANSFER) {
      if (!t.toAccountId) errors.push('Compte de destination requis');
      else if (t.toAccountId === t.accountId) errors.push('Les comptes doivent être différents');
    } else if (!t.categoryId) errors.push('Catégorie requise');
    return errors;
  }

  function csvEscape(v) {
    const s = String(v ?? '');
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function toCSV(state) {
    const acc = Object.fromEntries(state.accounts.map((a) => [a.id, a.name]));
    const cats = Object.fromEntries([...state.categories.expense, ...state.categories.income].map((c) => [c.id, c.name]));
    const label = { income: 'Revenu', expense: 'Dépense', transfer: 'Transfert' };
    const rows = [['Date', 'Type', 'Compte', 'Catégorie / Vers', 'Montant', 'Frais', 'Note', 'Description']];
    for (const t of sortTx(state.transactions)) {
      rows.push([
        t.date, label[t.type], acc[t.accountId] || '',
        t.type === TYPES.TRANSFER ? (acc[t.toAccountId] || '') : (cats[t.categoryId] || ''),
        String(t.amount).replace('.', ','), t.fee ? String(t.fee).replace('.', ',') : '',
        t.note || '', t.description || '',
      ]);
    }
    // Séparateur ";" pour ouverture directe dans Excel en locale française.
    return '﻿' + rows.map((r) => r.map(csvEscape).join(';')).join('\n');
  }

  function migrate(raw) {
    const base = defaultState();
    if (!raw || typeof raw !== 'object') return base;
    return {
      ...base,
      ...raw,
      settings: { ...base.settings, ...(raw.settings || {}) },
      categories: raw.categories || base.categories,
      accounts: Array.isArray(raw.accounts) ? raw.accounts : base.accounts,
      transactions: Array.isArray(raw.transactions) ? raw.transactions : [],
      budgets: raw.budgets || {},
      bookmarks: Array.isArray(raw.bookmarks) ? raw.bookmarks : [],
      bills: Array.isArray(raw.bills) ? raw.bills : [],
    };
  }

  /** Fusionne une sauvegarde dans l'état courant (ajout sans doublon, par identifiant). */
  function mergeState(state, incoming) {
    const inc = migrate(incoming);
    const out = migrate(JSON.parse(JSON.stringify(state)));
    const addAll = (list, extra) => {
      const ids = new Set(list.map((x) => x.id));
      let n = 0;
      for (const x of extra) if (!ids.has(x.id)) { list.push(x); ids.add(x.id); n++; }
      return n;
    };
    addAll(out.accounts, inc.accounts);
    addAll(out.categories.expense, inc.categories.expense);
    addAll(out.categories.income, inc.categories.income);
    const added = { transactions: addAll(out.transactions, inc.transactions), bills: addAll(out.bills, inc.bills) };
    return { state: out, added };
  }

  // ---------- Factures ----------
  const RECURRENCES = { none: 'Ponctuelle', monthly: 'Mensuelle', quarterly: 'Trimestrielle', yearly: 'Annuelle' };

  /** Échéance suivante ; le jour est ramené à la fin du mois si besoin (31 janv. → 28 févr.). */
  function nextDueDate(iso, recurrence) {
    const step = { monthly: 1, quarterly: 3, yearly: 12 }[recurrence];
    if (!step) return null;
    const [y, m, d] = iso.split('-').map(Number);
    const last = new Date(y, m - 1 + step + 1, 0).getDate();
    return toISO(new Date(y, m - 1 + step, Math.min(d, last)));
  }

  /** 'paid' | 'overdue' (échue) | 'soon' (sous `soonDays` jours) | 'due'. */
  function billStatus(bill, ref = today(), soonDays = 7) {
    if (bill.paidDate) return 'paid';
    if (bill.dueDate < ref) return 'overdue';
    if (bill.dueDate <= addDays(ref, soonDays)) return 'soon';
    return 'due';
  }

  function billsSummary(bills, ref = today()) {
    const s = { toPay: 0, toPayCount: 0, overdue: 0, overdueCount: 0, soon: 0, soonCount: 0, paid: 0, paidCount: 0 };
    for (const b of bills) {
      const st = billStatus(b, ref);
      if (st === 'paid') { s.paid += b.amount; s.paidCount++; continue; }
      s.toPay += b.amount; s.toPayCount++;
      if (st === 'overdue') { s.overdue += b.amount; s.overdueCount++; }
      if (st === 'soon') { s.soon += b.amount; s.soonCount++; }
    }
    for (const k of ['toPay', 'overdue', 'soon', 'paid']) s[k] = round(s[k]);
    return s;
  }

  /** Tri : à payer d'abord (échéance la plus proche), puis payées (plus récentes d'abord). */
  function sortBills(bills) {
    return [...bills].sort((a, b) => {
      if (!!a.paidDate !== !!b.paidDate) return a.paidDate ? 1 : -1;
      return a.paidDate ? b.paidDate.localeCompare(a.paidDate) : a.dueDate.localeCompare(b.dueDate);
    });
  }

  function validateBill(b) {
    const errors = [];
    if (!(b.supplier || '').trim()) errors.push('Fournisseur requis');
    if (!(typeof b.amount === 'number' && b.amount > 0 && isFinite(b.amount))) errors.push('Montant invalide');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.dueDate || '')) errors.push('Échéance invalide');
    if (b.paidDate && !/^\d{4}-\d{2}-\d{2}$/.test(b.paidDate)) errors.push('Date de paiement invalide');
    if (!b.categoryId) errors.push('Catégorie requise');
    if (!b.accountId) errors.push('Compte requis');
    return errors;
  }

  /**
   * Règle une facture : crée la dépense correspondante, marque la facture payée
   * et, si elle est récurrente, prépare la prochaine échéance. Renvoie le nouvel état.
   */
  function payBill(state, billId, { date = today(), accountId } = {}) {
    const bill = state.bills.find((b) => b.id === billId);
    if (!bill || bill.paidDate) return state;
    const tx = {
      id: uid(), createdAt: Date.now(), type: TYPES.EXPENSE, date, amount: bill.amount,
      accountId: accountId || bill.accountId, categoryId: bill.categoryId,
      note: bill.supplier, description: [bill.reference && `Facture ${bill.reference}`, bill.note].filter(Boolean).join(' — '),
      billId: bill.id,
    };
    const paid = { ...bill, paidDate: date, accountId: tx.accountId, txId: tx.id };
    const bills = state.bills.map((b) => (b.id === billId ? paid : b));
    const next = nextDueDate(bill.dueDate, bill.recurrence);
    if (next) {
      const { paidDate, txId, reference, ...rest } = paid;
      bills.push({ ...rest, id: uid(), dueDate: next });
    }
    return { ...state, bills, transactions: [...state.transactions, tx] };
  }

  /** Annule un règlement : supprime la dépense liée et repasse la facture « à payer ». */
  function unpayBill(state, billId) {
    const bill = state.bills.find((b) => b.id === billId);
    if (!bill || !bill.paidDate) return state;
    const { paidDate, txId, ...rest } = bill;
    return {
      ...state,
      bills: state.bills.map((b) => (b.id === billId ? rest : b)),
      transactions: state.transactions.filter((t) => t.id !== txId),
    };
  }

  // ---------- Tableau de bord ----------
  /**
   * Dépenses des `count` derniers mois jusqu'au mois (year, month) inclus :
   * [{ year, month, start, end, total, byCat: { categoryId: montant } }] du plus ancien au plus récent.
   */
  function monthlyExpenseSeries(txs, year, month, count = 12, startDay = 1) {
    const out = [];
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(year, month - i, 1);
      const r = monthRange(d.getFullYear(), d.getMonth(), startDay);
      const byCat = {};
      let total = 0;
      for (const t of filterRange(txs, r)) {
        if (t.type !== TYPES.EXPENSE) continue;
        byCat[t.categoryId] = (byCat[t.categoryId] || 0) + t.amount;
        total += t.amount;
      }
      for (const k in byCat) byCat[k] = round(byCat[k]);
      out.push({ year: d.getFullYear(), month: d.getMonth(), ...r, total: round(total), byCat });
    }
    return out;
  }

  return {
    TYPES, ACCOUNT_GROUPS, uid, defaultState, migrate,
    toISO, parseISO, today, addDays, monthRange, yearRange, weekStartOf, inRange,
    filterRange, totals, sortTx, groupByDay, groupByWeek, groupByMonth, byCategory,
    accountBalances, netWorth, budgetStatus, search, validateTx, toCSV, round, mergeState,
    RECURRENCES, nextDueDate, billStatus, billsSummary, sortBills, validateBill, payBill, unpayBill,
    monthlyExpenseSeries,
  };
});
