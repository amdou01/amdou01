/* Kalpe — interface (vanilla JS, aucune dépendance). */
(function () {
  'use strict';
  const C = window.KalpeCore;
  const { TYPES } = C;
  const STORE_KEY = 'kalpe.v1';
  const $ = (s) => document.querySelector(s);
  const WD = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const PALETTE = ['#f04b4b', '#f7883b', '#f6c344', '#5cc489', '#3a7bd5', '#8e6bd8', '#e45fa5', '#30b4c5', '#9aa36b', '#b07a4f', '#7a7a86'];

  // ---------- État ----------
  let state = load();
  const now = new Date();
  const ui = {
    view: 'trans', transTab: 'daily', statsTab: 'expense',
    year: now.getFullYear(), month: now.getMonth(), selDay: C.today(),
  };

  function load() {
    try { return C.migrate(JSON.parse(localStorage.getItem(STORE_KEY))); }
    catch { return C.defaultState(); }
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
    catch { toast('Enregistrement impossible (stockage indisponible)'); }
  }

  // ---------- Helpers ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function money(n, sign) {
    const dec = state.settings.decimals ?? 2;
    const s = Math.abs(n).toLocaleString(state.settings.locale, { minimumFractionDigits: dec, maximumFractionDigits: dec });
    const prefix = n < 0 || sign === '-' ? '-' : '';
    return `${prefix}${s} ${esc(state.settings.currency)}`;
  }
  const allCats = () => [...state.categories.expense, ...state.categories.income];
  const catById = (id) => allCats().find((c) => c.id === id);
  const accById = (id) => state.accounts.find((a) => a.id === id);
  const catLabel = (id) => { const c = catById(id); return c ? `${c.icon} ${c.name}` : '—'; };
  const monthRange = () => C.monthRange(ui.year, ui.month, state.settings.monthStartDay);
  const monthTx = () => C.filterRange(state.transactions, monthRange());
  function dayLabel(iso) {
    const d = C.parseISO(iso);
    return { day: d.getDate(), wd: WD[d.getDay()], wdIdx: d.getDay(), ym: `${pad(d.getMonth() + 1)}.${d.getFullYear()}` };
  }
  const pad = (n) => String(n).padStart(2, '0');
  /** Accepte « 1 234,56 » comme « 1234.56 ». */
  const num = (v) => parseFloat(String(v ?? '').replace(/[\s\u00a0]/g, '').replace(',', '.'));
  const shortDate = (iso) => { const d = C.parseISO(iso); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`; };

  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 1800);
  }

  function summaryHTML(t) {
    return `<div class="income">Revenus<b class="num">${money(t.income)}</b></div>
            <div class="expense">Dépenses<b class="num">${money(t.expense)}</b></div>
            <div>Total<b class="num">${money(t.total)}</b></div>`;
  }

  function txRowHTML(t, withDate) {
    let cat, sub, amtClass, amt;
    if (t.type === TYPES.TRANSFER) {
      cat = 'Transfert';
      sub = `${esc(accById(t.accountId)?.name)} → ${esc(accById(t.toAccountId)?.name)}`;
      amtClass = ''; amt = money(t.amount);
    } else {
      const c = catById(t.categoryId);
      cat = c ? `${c.icon} ${esc(c.name)}` : '—';
      sub = esc(accById(t.accountId)?.name || '');
      amtClass = t.type; amt = money(t.amount);
    }
    return `<button class="tx" data-tx="${t.id}">
      <span class="cat">${withDate ? `<span class="muted">${shortDate(t.date)}</span><br>` : ''}${cat}</span>
      <span class="note"><div>${esc(t.note) || '&nbsp;'}</div><div class="muted">${sub}</div></span>
      <span class="num ${amtClass}">${amt}</span></button>`;
  }

  function dayCardHTML(g) {
    const l = dayLabel(g.date);
    const wdCls = l.wdIdx === 0 ? 'sun' : l.wdIdx === 6 ? 'sat' : '';
    return `<div class="card"><div class="day-head">
        <span class="d">${l.day}</span><span class="wd ${wdCls}">${l.wd}</span><span class="muted">${l.ym}</span>
        <span class="amts"><span class="num income">${money(g.income)}</span><span class="num expense">${money(g.expense)}</span></span>
      </div>${g.items.map((t) => txRowHTML(t)).join('')}</div>`;
  }

  // ---------- Rendu principal ----------
  function render() {
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('hidden', v.id !== `view-${ui.view}`));
    document.querySelectorAll('#bottomNav button').forEach((b) => b.classList.toggle('active', b.dataset.view === ui.view));
    document.querySelectorAll('#transTabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === ui.transTab));
    document.querySelectorAll('#statsTabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === ui.statsTab));
    const yearly = ui.view === 'trans' && ui.transTab === 'monthly';
    $('#periodLabel').textContent = yearly ? String(ui.year) : `${MONTHS[ui.month]} ${ui.year}`;
    const showNav = ui.view === 'trans' || ui.view === 'stats';
    ['#prevPeriod', '#nextPeriod'].forEach((s) => $(s).style.visibility = showNav ? 'visible' : 'hidden');
    $('#addBtn').classList.toggle('hidden', ui.view === 'more');
    ({ trans: renderTrans, stats: renderStats, accounts: renderAccounts, more: renderMore })[ui.view]();
  }

  // ----- Transactions -----
  function renderTrans() {
    const out = $('#transContent');
    if (ui.transTab === 'monthly') {
      const yr = C.filterRange(state.transactions, C.yearRange(ui.year));
      $('#transSummary').innerHTML = summaryHTML(C.totals(yr));
      const months = C.groupByMonth(state.transactions, ui.year, state.settings.monthStartDay);
      out.innerHTML = `<div class="card">${months.map((m) => `
        <button class="row" data-month="${m.month}">
          <div><b>${MONTHS[m.month]}</b><div class="muted">${shortDate(m.start)} ~ ${shortDate(m.end)}</div></div>
          <div class="right"><div class="num income">${money(m.income)}</div><div class="num expense">${money(m.expense)}</div>
          <div class="num muted">${money(m.total)}</div></div></button>`).join('')}</div>`;
      return;
    }
    const txs = monthTx();
    $('#transSummary').innerHTML = summaryHTML(C.totals(txs));

    if (ui.transTab === 'daily') {
      const groups = C.groupByDay(txs);
      out.innerHTML = groups.length ? groups.map(dayCardHTML).join('')
        : `<div class="empty">Aucune transaction ce mois-ci.<br>Appuyez sur « + » pour commencer.</div>`;
    } else if (ui.transTab === 'calendar') {
      out.innerHTML = calendarHTML(txs) + dayDetailHTML(txs);
    } else if (ui.transTab === 'weekly') {
      const weeks = C.groupByWeek(txs, monthRange(), state.settings.weekStart);
      out.innerHTML = `<div class="card">${weeks.map((w) => `
        <div class="row"><div>${shortDate(w.start)} ~ ${shortDate(w.end)}</div>
        <div class="right"><div class="num income">${money(w.income)}</div><div class="num expense">${money(w.expense)}</div>
        <div class="num muted">${money(w.total)}</div></div></div>`).join('')}</div>`;
    } else {
      out.innerHTML = totalTabHTML(txs);
    }
  }

  function calendarHTML(txs) {
    const r = monthRange();
    const ws = state.settings.weekStart;
    const byDay = new Map(C.groupByDay(txs).map((g) => [g.date, g]));
    const head = Array.from({ length: 7 }, (_, i) => `<div class="h">${WD[(i + ws) % 7]}</div>`).join('');
    let cells = '';
    let d = C.weekStartOf(r.start, ws);
    const last = C.addDays(C.weekStartOf(r.end, ws), 6);
    const today = C.today();
    while (d <= last) {
      const g = byDay.get(d);
      const cls = [!C.inRange(d, r) && 'out', d === today && 'today', d === ui.selDay && 'sel'].filter(Boolean).join(' ');
      cells += `<button class="c ${cls}" data-day="${d}"><div class="n">${C.parseISO(d).getDate()}</div>
        ${g && g.income ? `<div class="num income">${money(g.income)}</div>` : ''}
        ${g && g.expense ? `<div class="num expense">${money(g.expense)}</div>` : ''}</button>`;
      d = C.addDays(d, 1);
    }
    return `<div class="cal">${head}${cells}</div>`;
  }

  function dayDetailHTML(txs) {
    const g = C.groupByDay(txs.filter((t) => t.date === ui.selDay))[0];
    return g ? dayCardHTML(g) : `<div class="empty">Aucune transaction le ${shortDate(ui.selDay)}.</div>`;
  }

  /** Onglet « Total » : synthèse budget + répartition par compte + export. */
  function totalTabHTML(txs) {
    const bs = C.budgetStatus(state, monthRange());
    const totalBudget = bs.reduce((s, b) => s + b.budget, 0);
    const spentBudgeted = bs.reduce((s, b) => s + b.spent, 0);
    const exp = C.totals(txs).expense;
    const pct = totalBudget ? Math.min(100, (spentBudgeted / totalBudget) * 100) : 0;
    const perAcc = state.accounts.map((a) => {
      const t = C.totals(txs.filter((x) => x.accountId === a.id));
      return { a, ...t };
    }).filter((x) => x.income || x.expense);
    return `
      <div class="section-title">Budget du mois</div>
      <div class="card"><div class="row" style="display:block">
        ${totalBudget ? `<div style="display:flex"><span>Dépensé ${money(spentBudgeted)}</span><span class="right">sur ${money(totalBudget)}</span></div>
          <div class="bar"><i class="${spentBudgeted > totalBudget ? 'over' : ''}" style="width:${pct}%"></i></div>
          <div class="muted" style="margin-top:6px">Reste : ${money(totalBudget - spentBudgeted)}</div>`
          : `<span class="muted">Aucun budget défini. Allez dans Stats › Budget pour en créer.</span>`}
      </div></div>
      <div class="section-title">Par compte</div>
      <div class="card">${perAcc.length ? perAcc.map((x) => `
        <div class="row"><span>${esc(x.a.name)}</span><span class="right">
          <div class="num income">${money(x.income)}</div><div class="num expense">${money(x.expense)}</div></span></div>`).join('')
        : '<div class="row muted">Aucun mouvement.</div>'}</div>
      <div class="section-title">Indicateurs</div>
      <div class="card">
        <div class="row"><span>Dépense moyenne / jour</span><span class="right num">${money(C.round(exp / daysIn(monthRange())))}</span></div>
        <div class="row"><span>Nombre de transactions</span><span class="right num">${txs.length}</span></div>
      </div>
      <div class="card"><button class="row" data-action="export-csv">📤 Exporter le mois en CSV (Excel)</button></div>`;
  }
  const daysIn = (r) => Math.round((C.parseISO(r.end) - C.parseISO(r.start)) / 864e5) + 1;

  // ----- Statistiques -----
  function renderStats() {
    const out = $('#statsContent');
    if (ui.statsTab === 'budget') return renderBudget(out);
    const type = ui.statsTab;
    const txs = monthTx();
    const rows = C.byCategory(txs, type);
    const total = rows.reduce((s, r) => s + r.amount, 0);
    if (!rows.length) { out.innerHTML = `<div class="empty">Aucune donnée pour cette période.</div>` + trendHTML(type); return; }
    out.innerHTML = `<div class="chart-wrap">${donutSVG(rows, total)}</div>
      <div class="card legend">${rows.map((r, i) => `
        <button class="row" data-statcat="${r.categoryId}"><span class="badge" style="background:${PALETTE[i % PALETTE.length]}">${Math.round(r.pct)}%</span>
        <span>${esc(catLabel(r.categoryId))}</span><span class="right num">${money(r.amount)}</span></button>`).join('')}</div>`
      + trendHTML(type);
  }

  function donutSVG(rows, total) {
    const R = 80, r = 48, cx = 100, cy = 100;
    let a0 = -Math.PI / 2;
    const arcs = rows.map((row, i) => {
      const frac = row.amount / total;
      const color = PALETTE[i % PALETTE.length];
      if (frac >= 0.9999) return `<circle cx="${cx}" cy="${cy}" r="${(R + r) / 2}" fill="none" stroke="${color}" stroke-width="${R - r}"/>`;
      const a1 = a0 + frac * 2 * Math.PI;
      const large = frac > 0.5 ? 1 : 0;
      const p = (rad, ang) => `${cx + rad * Math.cos(ang)} ${cy + rad * Math.sin(ang)}`;
      const d = `M ${p(R, a0)} A ${R} ${R} 0 ${large} 1 ${p(R, a1)} L ${p(r, a1)} A ${r} ${r} 0 ${large} 0 ${p(r, a0)} Z`;
      a0 = a1;
      return `<path d="${d}" fill="${color}" stroke="var(--surface)" stroke-width="1"/>`;
    }).join('');
    return `<svg viewBox="0 0 200 200" width="220" height="220" role="img" aria-label="Répartition par catégorie">${arcs}
      <text x="100" y="98" text-anchor="middle" font-size="11" fill="var(--muted)">Total</text>
      <text x="100" y="116" text-anchor="middle" font-size="13" font-weight="700" fill="var(--text)">${money(total)}</text></svg>`;
  }

  /** Tendance des 6 derniers mois (barres). */
  function trendHTML(type, categoryId) {
    const bars = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(ui.year, ui.month - i, 1);
      const r = C.monthRange(d.getFullYear(), d.getMonth(), state.settings.monthStartDay);
      let txs = C.filterRange(state.transactions, r).filter((t) => t.type === type);
      if (categoryId) txs = txs.filter((t) => t.categoryId === categoryId);
      bars.push({ label: MONTHS[d.getMonth()], v: txs.reduce((s, t) => s + t.amount, 0), cur: i === 0 });
    }
    const max = Math.max(1, ...bars.map((b) => b.v));
    return `<div class="section-title">Tendance sur 6 mois</div><div class="trend">${bars.map((b) => `
      <div class="${b.cur ? 'cur' : ''}" title="${money(b.v)}"><i style="height:${(b.v / max) * 85}%"></i>${b.label}</div>`).join('')}</div>`;
  }

  function renderBudget(out) {
    const r = monthRange();
    const spent = new Map(C.byCategory(C.filterRange(state.transactions, r), TYPES.EXPENSE).map((c) => [c.categoryId, c.amount]));
    out.innerHTML = `<div class="section-title">Appuyez sur une catégorie pour définir son budget mensuel</div>
      <div class="card">${state.categories.expense.map((c) => {
        const b = state.budgets[c.id] || 0;
        const s = spent.get(c.id) || 0;
        const pct = b ? Math.min(100, (s / b) * 100) : 0;
        return `<button class="row" data-budget="${c.id}" style="display:block">
          <div style="display:flex"><span>${c.icon} ${esc(c.name)}</span>
          <span class="right num">${money(s)}${b ? ` / ${money(b)}` : ''}</span></div>
          ${b ? `<div class="bar"><i class="${s > b ? 'over' : ''}" style="width:${pct}%"></i></div>
          <div class="muted">${s > b ? `Dépassement de ${money(s - b)}` : `Reste ${money(b - s)}`}</div>` : ''}
        </button>`;
      }).join('')}</div>`;
  }

  // ----- Comptes -----
  function renderAccounts() {
    const nw = C.netWorth(state);
    $('#accSummary').innerHTML = `<div class="income">Actifs<b class="num">${money(nw.assets)}</b></div>
      <div class="expense">Passifs<b class="num">${money(nw.liabilities)}</b></div>
      <div>Total<b class="num">${money(nw.total)}</b></div>`;
    const bal = C.accountBalances(state);
    $('#accContent').innerHTML = C.ACCOUNT_GROUPS.map((g) => {
      const accs = state.accounts.filter((a) => a.group === g.id);
      if (!accs.length) return '';
      const sum = accs.reduce((s, a) => s + (bal[a.id] || 0), 0);
      return `<div class="section-title" style="display:flex">${g.name}<span class="right num" style="margin-left:auto">${money(sum)}</span></div>
        <div class="card">${accs.map((a) => `<button class="row" data-account="${a.id}"><span>${esc(a.name)}</span>
          <span class="right num ${bal[a.id] < 0 ? 'expense' : 'income'}">${money(bal[a.id] || 0)}</span></button>`).join('')}</div>`;
    }).join('') + `<div class="card"><button class="row" data-action="add-account">➕ Ajouter un compte</button></div>`;
  }

  // ----- Plus / Réglages -----
  function renderMore() {
    const s = state.settings;
    $('#moreContent').innerHTML = `
      <div class="section-title">Paramètres</div>
      <div class="card" style="padding:0 12px">
        <div class="field"><label>Devise</label><input id="setCurrency" value="${esc(s.currency)}" maxlength="6"></div>
        <div class="field"><label>Décimales</label><select id="setDecimals">
          ${[0, 2].map((n) => `<option value="${n}" ${(s.decimals ?? 2) === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
        <div class="field"><label>Début du mois</label><select id="setMonthStart">
          ${Array.from({ length: 28 }, (_, i) => `<option ${s.monthStartDay === i + 1 ? 'selected' : ''}>${i + 1}</option>`).join('')}</select></div>
        <div class="field"><label>Début semaine</label><select id="setWeekStart">
          <option value="1" ${s.weekStart === 1 ? 'selected' : ''}>Lundi</option>
          <option value="0" ${s.weekStart === 0 ? 'selected' : ''}>Dimanche</option></select></div>
      </div>
      <div class="section-title">Gestion</div>
      <div class="card">
        <button class="row" data-action="cats-expense">🏷️ Catégories de dépenses</button>
        <button class="row" data-action="cats-income">🏷️ Catégories de revenus</button>
        <button class="row" data-action="add-account">💳 Ajouter un compte</button>
        <button class="row" data-action="bookmarks">☆ Transactions favorites</button>
      </div>
      <div class="section-title">Sauvegarde</div>
      <div class="card">
        <button class="row" data-action="export-csv-all">📤 Exporter tout en CSV (Excel)</button>
        <button class="row" data-action="backup">💾 Sauvegarder (JSON)</button>
        <button class="row" data-action="restore">📥 Restaurer une sauvegarde</button>
        <button class="row" data-action="demo">🧪 Charger des données de démonstration</button>
        <button class="row expense" data-action="reset">🗑️ Réinitialiser toutes les données</button>
      </div>
      <p class="muted" style="text-align:center;padding:12px">Données stockées uniquement sur cet appareil.</p>`;
    const bind = (id, key, cast) => $(id).addEventListener('change', (e) => { state.settings[key] = cast(e.target.value); save(); toast('Paramètre enregistré'); });
    bind('#setCurrency', 'currency', (v) => v.trim() || '€');
    bind('#setDecimals', 'decimals', Number);
    bind('#setMonthStart', 'monthStartDay', Number);
    bind('#setWeekStart', 'weekStart', Number);
  }

  // ---------- Modales ----------
  const modal = $('#modal');
  function openModal(title, bodyHTML, onMount) {
    $('#modalBody').innerHTML = `<div class="modal-head"><button class="icon-btn" data-close aria-label="Fermer">✕</button>
      <h2>${esc(title)}</h2><span style="width:36px"></span></div><div class="modal-body">${bodyHTML}</div>`;
    if (!modal.open) modal.showModal();
    onMount && onMount($('#modalBody'));
  }
  const closeModal = () => modal.open && modal.close();
  modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-close]')) closeModal(); });

  function txForm(tx, opts = {}) {
    const editing = !!(tx && tx.id && state.transactions.some((x) => x.id === tx.id));
    const t = { type: TYPES.EXPENSE, date: defaultDate(), amount: '', accountId: state.accounts[0]?.id, ...tx };
    const accOpts = (sel) => state.accounts.map((a) => `<option value="${a.id}" ${a.id === sel ? 'selected' : ''}>${esc(a.name)}</option>`).join('');
    const catOpts = (type, sel) => state.categories[type].map((c) => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${c.icon} ${esc(c.name)}</option>`).join('');
    const typeLabel = { income: 'Revenu', expense: 'Dépense', transfer: 'Transfert' };
    const draw = () => `
      <div class="seg">${Object.values(TYPES).map((k) => `<button type="button" data-type="${k}" class="${t.type === k ? 'on' : ''}">${typeLabel[k]}</button>`).join('')}</div>
      <form id="txForm" autocomplete="off">
        <div class="field"><label>Date</label><input type="date" name="date" value="${t.date}" required></div>
        <div class="field"><label>Montant</label><input type="text" name="amount" inputmode="decimal" value="${t.amount ?? ''}" placeholder="0" required></div>
        ${t.type === TYPES.TRANSFER ? `
          <div class="field"><label>De</label><select name="accountId">${accOpts(t.accountId)}</select></div>
          <div class="field"><label>Vers</label><select name="toAccountId">${accOpts(t.toAccountId || state.accounts.find((a) => a.id !== t.accountId)?.id)}</select></div>
          <div class="field"><label>Frais</label><input type="text" name="fee" inputmode="decimal" value="${t.fee || ''}" placeholder="0"></div>`
        : `<div class="field"><label>Catégorie</label><select name="categoryId">${catOpts(t.type, t.categoryId)}</select></div>
          <div class="field"><label>Compte</label><select name="accountId">${accOpts(t.accountId)}</select></div>`}
        <div class="field"><label>Note</label><input name="note" value="${esc(t.note)}" maxlength="80" placeholder="ex. Déjeuner fournisseur"></div>
        <div class="field"><label>Description</label><textarea name="description" rows="2" maxlength="500">${esc(t.description)}</textarea></div>
        <div class="errors" id="formErrors"></div>
        <div class="actions">
          <button class="btn primary" type="submit" data-mode="save">Enregistrer</button>
          ${editing ? '' : '<button class="btn" type="submit" data-mode="continue">Continuer</button>'}
        </div>
        <div class="actions">
          ${editing ? '<button class="btn" type="button" data-act="copy">Copier</button>' : ''}
          <button class="btn" type="button" data-act="bookmark">☆ Favori</button>
          ${editing ? '<button class="btn danger" type="button" data-act="delete">Supprimer</button>' : ''}
        </div>
      </form>`;
    const read = (form) => {
      const f = Object.fromEntries(new FormData(form));
      const out = { ...t, ...f, amount: num(f.amount) };
      if (t.type === TYPES.TRANSFER) { out.fee = num(f.fee) || 0; delete out.categoryId; }
      else { delete out.toAccountId; delete out.fee; }
      return out;
    };
    const mount = (root) => {
      root.querySelectorAll('.seg button').forEach((b) => b.onclick = () => {
        Object.assign(t, read(root.querySelector('#txForm')));
        if (t.type !== b.dataset.type) { t.type = b.dataset.type; t.categoryId = undefined; }
        root.querySelector('.modal-body').innerHTML = draw(); mount(root);
      });
      const form = root.querySelector('#txForm');
      if (!editing && !opts.keepFocus) setTimeout(() => form.amount.focus(), 50);
      form.onsubmit = (e) => {
        e.preventDefault();
        const mode = e.submitter?.dataset.mode || 'save';
        const data = read(form);
        const errs = C.validateTx(data);
        if (errs.length) { root.querySelector('#formErrors').textContent = errs.join(' · '); return; }
        if (editing) {
          const i = state.transactions.findIndex((x) => x.id === data.id);
          state.transactions[i] = data;
        } else {
          state.transactions.push({ ...data, id: C.uid(), createdAt: Date.now() });
        }
        save(); render();
        if (mode === 'continue') {
          toast('Transaction ajoutée');
          txForm({ type: data.type, date: data.date, accountId: data.accountId, categoryId: data.categoryId });
        } else { closeModal(); toast(editing ? 'Transaction modifiée' : 'Transaction ajoutée'); }
      };
      root.querySelectorAll('[data-act]').forEach((b) => b.onclick = () => {
        const act = b.dataset.act;
        if (act === 'delete') {
          if (!confirm('Supprimer cette transaction ?')) return;
          state.transactions = state.transactions.filter((x) => x.id !== t.id);
          save(); render(); closeModal(); toast('Transaction supprimée');
        } else if (act === 'copy') {
          const { id, createdAt, ...rest } = read(form);
          txForm({ ...rest, date: C.today() });
        } else if (act === 'bookmark') {
          const { id, createdAt, date, ...rest } = read(form);
          if (!(rest.amount > 0)) delete rest.amount;
          state.bookmarks.push({ ...rest, id: C.uid() });
          save(); toast('Ajouté aux favoris');
        }
      });
    };
    openModal(editing ? 'Modifier' : 'Nouvelle transaction', draw(), mount);
  }

  /** Date par défaut : jour sélectionné dans le calendrier, sinon aujourd'hui si dans le mois affiché, sinon 1er du mois. */
  function defaultDate() {
    const r = monthRange();
    if (ui.view === 'trans' && ui.transTab === 'calendar' && C.inRange(ui.selDay, r)) return ui.selDay;
    const t = C.today();
    return C.inRange(t, r) ? t : r.start;
  }

  function searchModal() {
    openModal('Rechercher', `<input class="search-input" id="q" placeholder="Note, catégorie, montant…" autofocus><div id="results" class="card"></div>`, (root) => {
      const q = root.querySelector('#q');
      const res = root.querySelector('#results');
      const run = () => {
        const list = C.search(state.transactions, q.value, state);
        const t = C.totals(list);
        res.innerHTML = q.value.trim()
          ? (list.length ? `<div class="row muted">${list.length} résultat(s) · <span class="income">${money(t.income)}</span> · <span class="expense">${money(t.expense)}</span></div>`
            + list.slice(0, 200).map((x) => txRowHTML(x, true)).join('') : '<div class="row muted">Aucun résultat</div>')
          : '';
      };
      q.oninput = run;
      setTimeout(() => q.focus(), 50);
    });
  }

  function bookmarksModal() {
    const list = state.bookmarks;
    openModal('Favoris', list.length ? `<div class="card">${list.map((b) => `
      <div class="row"><button style="flex:1;text-align:left" data-usebm="${b.id}">
        ${b.type === TYPES.TRANSFER ? '🔁 Transfert' : esc(catLabel(b.categoryId))} <span class="muted">${esc(b.note || '')}</span></button>
        <span class="num ${b.type}">${b.amount ? money(b.amount) : ''}</span>
        <button class="icon-btn" data-delbm="${b.id}" aria-label="Supprimer">🗑️</button></div>`).join('')}</div>`
      : '<div class="empty">Aucun favori.<br>Dans le formulaire d’une transaction, appuyez sur « ☆ Favori ».</div>', (root) => {
      root.querySelectorAll('[data-usebm]').forEach((b) => b.onclick = () => {
        const { id, ...bm } = state.bookmarks.find((x) => x.id === b.dataset.usebm);
        txForm({ ...bm, date: C.today() });
      });
      root.querySelectorAll('[data-delbm]').forEach((b) => b.onclick = () => {
        state.bookmarks = state.bookmarks.filter((x) => x.id !== b.dataset.delbm); save(); bookmarksModal();
      });
    });
  }

  function accountModal(acc) {
    const a = acc || { name: '', group: 'bank', initial: 0 };
    const editing = !!acc;
    const bal = C.accountBalances(state)[a.id] || 0;
    const r = monthRange();
    const txs = C.sortTx(C.filterRange(state.transactions, r).filter((t) => t.accountId === a.id || t.toAccountId === a.id));
    openModal(editing ? a.name : 'Nouveau compte', `
      <form id="accForm">
        <div class="field"><label>Groupe</label><select name="group">${C.ACCOUNT_GROUPS.map((g) => `<option value="${g.id}" ${g.id === a.group ? 'selected' : ''}>${g.name}</option>`).join('')}</select></div>
        <div class="field"><label>Nom</label><input name="name" value="${esc(a.name)}" required maxlength="40"></div>
        <div class="field"><label>Solde initial</label><input name="initial" type="text" inputmode="decimal" value="${a.initial || 0}"></div>
        <div class="actions"><button class="btn primary" type="submit">Enregistrer</button>
        ${editing ? '<button class="btn danger" type="button" id="delAcc">Supprimer</button>' : ''}</div>
      </form>
      ${editing ? `<div class="section-title">Solde actuel : <b class="num">${money(bal)}</b> — ${MONTHS[ui.month]} ${ui.year}</div>
        <div class="card">${txs.map((t) => txRowHTML(t, true)).join('') || '<div class="row muted">Aucun mouvement ce mois-ci.</div>'}</div>` : ''}`,
    (root) => {
      root.querySelector('#accForm').onsubmit = (e) => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.target));
        const data = { name: f.name.trim(), group: f.group, initial: num(f.initial) || 0 };
        if (!data.name) return;
        if (editing) Object.assign(accById(a.id), data);
        else state.accounts.push({ id: C.uid(), ...data });
        save(); render(); closeModal(); toast('Compte enregistré');
      };
      const del = root.querySelector('#delAcc');
      if (del) del.onclick = () => {
        if (state.transactions.some((t) => t.accountId === a.id || t.toAccountId === a.id))
          return toast('Compte utilisé par des transactions : suppression impossible');
        if (!confirm(`Supprimer le compte « ${a.name} » ?`)) return;
        state.accounts = state.accounts.filter((x) => x.id !== a.id);
        save(); render(); closeModal();
      };
    });
  }

  function categoriesModal(type) {
    const cats = state.categories[type];
    openModal(type === 'expense' ? 'Catégories de dépenses' : 'Catégories de revenus', `
      <div class="card">${cats.map((c) => `<div class="row"><span>${c.icon}</span>
        <input data-rename="${c.id}" value="${esc(c.name)}" class="search-input" style="padding:6px 8px">
        <button class="icon-btn" data-delcat="${c.id}" aria-label="Supprimer">🗑️</button></div>`).join('')}</div>
      <form id="catForm" class="row"><input name="icon" class="search-input" style="width:56px" value="🔖" maxlength="4">
        <input name="name" class="search-input" placeholder="Nouvelle catégorie" required maxlength="30">
        <button class="btn primary" style="flex:0 0 auto">Ajouter</button></form>`, (root) => {
      root.querySelectorAll('[data-rename]').forEach((i) => i.onchange = () => {
        const c = cats.find((x) => x.id === i.dataset.rename); if (i.value.trim()) c.name = i.value.trim(); save(); render();
      });
      root.querySelectorAll('[data-delcat]').forEach((b) => b.onclick = () => {
        const id = b.dataset.delcat;
        if (state.transactions.some((t) => t.categoryId === id)) return toast('Catégorie utilisée : suppression impossible');
        state.categories[type] = cats.filter((x) => x.id !== id); delete state.budgets[id];
        save(); render(); categoriesModal(type);
      });
      root.querySelector('#catForm').onsubmit = (e) => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.target));
        cats.push({ id: C.uid(), name: f.name.trim(), icon: f.icon.trim() || '🔖' });
        save(); render(); categoriesModal(type);
      };
    });
  }

  function budgetModal(catId) {
    const c = catById(catId);
    openModal(`Budget — ${c.name}`, `<form id="bForm">
      <div class="field"><label>Mensuel</label><input type="text" name="amount" inputmode="decimal" value="${state.budgets[catId] || ''}" placeholder="0 = aucun"></div>
      <div class="actions"><button class="btn primary">Enregistrer</button></div></form>` + trendHTML(TYPES.EXPENSE, catId), (root) => {
      root.querySelector('#bForm').onsubmit = (e) => {
        e.preventDefault();
        const v = num(e.target.amount.value) || 0;
        if (v > 0) state.budgets[catId] = v; else delete state.budgets[catId];
        save(); render(); closeModal(); toast('Budget enregistré');
      };
    });
  }

  function categoryDetailModal(catId) {
    const txs = C.sortTx(monthTx().filter((t) => t.categoryId === catId));
    const type = catById(catId) && state.categories.income.some((c) => c.id === catId) ? TYPES.INCOME : TYPES.EXPENSE;
    openModal(catLabel(catId), `<div class="card">${txs.map((t) => txRowHTML(t, true)).join('')}</div>` + trendHTML(type, catId));
  }

  // ---------- Fichiers ----------
  function download(name, content, mime) {
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function restore() {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.json,application/json' });
    input.onchange = async () => {
      try {
        const data = JSON.parse(await input.files[0].text());
        if (!Array.isArray(data.transactions) || !Array.isArray(data.accounts)) throw new Error('format');
        if (!confirm('Remplacer toutes les données actuelles par cette sauvegarde ?')) return;
        state = C.migrate(data); save(); render(); toast('Sauvegarde restaurée');
      } catch { toast('Fichier de sauvegarde invalide'); }
    };
    input.click();
  }

  function loadDemo() {
    if (state.transactions.length && !confirm('Ajouter des données de démonstration aux données existantes ?')) return;
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const ex = state.categories.expense, inc = state.categories.income;
    const notes = ['Déjeuner client', 'Courses', 'Taxi', 'Abonnement', 'Fournitures', 'Essence', 'Pharmacie', 'Restaurant'];
    const base = new Date();
    for (let m = 0; m < 4; m++) {
      const y = base.getFullYear(), mo = base.getMonth() - m;
      state.transactions.push({ id: C.uid(), createdAt: Date.now(), type: 'income', date: C.toISO(new Date(y, mo, 1)),
        amount: 3200, accountId: state.accounts[1]?.id || state.accounts[0].id, categoryId: inc[0].id, note: 'Salaire' });
      for (let i = 0; i < 18; i++) {
        const day = 1 + Math.floor(Math.random() * 27);
        const d = new Date(y, mo, day);
        if (d > base) continue;
        state.transactions.push({ id: C.uid(), createdAt: Date.now() + i, type: 'expense', date: C.toISO(d),
          amount: Math.round((5 + Math.random() * 120) * 100) / 100, accountId: pick(state.accounts).id,
          categoryId: pick(ex).id, note: pick(notes) });
      }
    }
    state.budgets[ex[0].id] = 400; state.budgets[ex[2].id] = 150;
    save(); render(); toast('Données de démonstration chargées');
  }

  // ---------- Événements ----------
  $('#bottomNav').onclick = (e) => { const b = e.target.closest('button'); if (b) { ui.view = b.dataset.view; render(); } };
  $('#transTabs').onclick = (e) => { const b = e.target.closest('button'); if (b) { ui.transTab = b.dataset.tab; render(); } };
  $('#statsTabs').onclick = (e) => { const b = e.target.closest('button'); if (b) { ui.statsTab = b.dataset.tab; render(); } };
  function shift(dir) {
    if (ui.view === 'trans' && ui.transTab === 'monthly') ui.year += dir;
    else { const d = new Date(ui.year, ui.month + dir, 1); ui.year = d.getFullYear(); ui.month = d.getMonth(); }
    render();
  }
  $('#prevPeriod').onclick = () => shift(-1);
  $('#nextPeriod').onclick = () => shift(1);
  $('#addBtn').onclick = () => ui.view === 'accounts' ? accountModal() : txForm();
  $('#searchBtn').onclick = searchModal;
  $('#bookmarkBtn').onclick = bookmarksModal;

  // Délégation globale pour les éléments générés.
  document.body.addEventListener('click', (e) => {
    const el = e.target.closest('[data-tx],[data-day],[data-month],[data-account],[data-budget],[data-statcat],[data-action]');
    if (!el) return;
    const d = el.dataset;
    if (d.tx) { const t = state.transactions.find((x) => x.id === d.tx); if (t) txForm({ ...t }); }
    else if (d.day) {
      if (ui.selDay === d.day) return txForm({ date: d.day });
      ui.selDay = d.day;
      const p = C.parseISO(d.day);
      if (p.getMonth() !== ui.month && !C.inRange(d.day, monthRange())) { ui.year = p.getFullYear(); ui.month = p.getMonth(); }
      render();
    }
    else if (d.month !== undefined) { ui.month = Number(d.month); ui.transTab = 'daily'; render(); }
    else if (d.account) accountModal(accById(d.account));
    else if (d.budget) budgetModal(d.budget);
    else if (d.statcat) categoryDetailModal(d.statcat);
    else if (d.action) {
      const stamp = C.today();
      ({
        'export-csv': () => download(`kalpe-${ui.year}-${pad(ui.month + 1)}.csv`, C.toCSV({ ...state, transactions: monthTx() }), 'text/csv;charset=utf-8'),
        'export-csv-all': () => download(`kalpe-${stamp}.csv`, C.toCSV(state), 'text/csv;charset=utf-8'),
        backup: () => download(`kalpe-sauvegarde-${stamp}.json`, JSON.stringify(state, null, 2), 'application/json'),
        restore, demo: loadDemo, bookmarks: bookmarksModal,
        'add-account': () => accountModal(),
        'cats-expense': () => categoriesModal('expense'),
        'cats-income': () => categoriesModal('income'),
        reset: () => { if (confirm('Effacer définitivement toutes les données ?')) { state = C.defaultState(); save(); render(); toast('Données réinitialisées'); } },
      })[d.action]?.();
    }
  });

  // Glisser à gauche / droite pour changer de période.
  let sx = null;
  document.addEventListener('touchstart', (e) => { sx = modal.open ? null : e.touches[0].clientX; }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (sx === null || !(ui.view === 'trans' || ui.view === 'stats')) return;
    const dx = e.changedTouches[0].clientX - sx;
    if (Math.abs(dx) > 70) shift(dx < 0 ? 1 : -1);
    sx = null;
  }, { passive: true });

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  render();
})();
