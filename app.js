(function () {
  'use strict';

  // ---------- Konstanten & Helfer ----------
  const STORE_KEY = 'geschenkideen.v1';
  const STATUS = [
    ['idee', 'Idee'],
    ['bestellt', 'Bestellt'],
    ['gekauft', 'Gekauft'],
    ['verpackt', 'Verpackt'],
    ['verschenkt', 'Verschenkt'],
    ['verworfen', 'Verworfen'],
  ];
  const STATUS_LABEL = Object.fromEntries(STATUS);
  const BOUGHT = new Set(['bestellt', 'gekauft', 'verpackt', 'verschenkt']);

  const eur = new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' });
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v) => { const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0; };
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const fmtDate = (d) => { if (!d) return ''; const [y, m, dd] = d.split('-'); return `${dd}.${m}.${y}`; };
  const statusOf = (g) => (STATUS_LABEL[g.status] ? g.status : 'idee');

  function daysUntil(d) {
    if (!d) return null;
    const [y, m, dd] = d.split('-').map(Number);
    const target = new Date(y, m - 1, dd);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return Math.round((target - today) / 86400000);
  }
  function countdownHtml(d) {
    const n = daysUntil(d);
    if (n === null) return '';
    if (n < 0) return `<span class="countdown past">vorbei</span>`;
    if (n === 0) return `<span class="countdown soon">heute</span>`;
    return `<span class="countdown${n <= 14 ? ' soon' : ''}">${n === 1 ? 'morgen' : 'in ' + n + ' Tagen'}</span>`;
  }

  // ---------- Daten ----------
  let state = load();
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (Array.isArray(d.anlaesse) && Array.isArray(d.geschenke)) return d;
      }
    } catch (e) { console.error(e); }
    return { anlaesse: [], geschenke: [] };
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); return true; }
    catch (e) { console.error(e); toast('Speichern fehlgeschlagen – Browser-Speicher voll oder gesperrt.'); return false; }
  }
  const findA = (id) => state.anlaesse.find((a) => a.id === id);
  const findG = (id) => state.geschenke.find((g) => g.id === id);

  // ---------- UI-Zustand ----------
  const ui = load_ui();
  function load_ui() {
    const d = { view: 'anlass', person: '', anlass: '', status: '', search: '', hide: false };
    try { return Object.assign(d, JSON.parse(localStorage.getItem(STORE_KEY + '.ui') || '{}')); } catch (_) { return d; }
  }
  function saveUi() { try { localStorage.setItem(STORE_KEY + '.ui', JSON.stringify(ui)); } catch (_) {} }
  let confirmKey = null;
  const list = $('#list');

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
    document.body.appendChild(t); setTimeout(() => t.remove(), 2600);
  }

  // ---------- Berechnungen ----------
  function sortedAnlaesse() {
    return [...state.anlaesse].sort((a, b) => {
      if (a.datum && b.datum) return a.datum.localeCompare(b.datum);
      if (a.datum) return -1; if (b.datum) return 1;
      return (a.created || 0) - (b.created || 0);
    });
  }
  const giftsOf = (id) => state.geschenke.filter((g) => g.anlassId === id).sort((a, b) => (a.created || 0) - (b.created || 0));
  function persons() {
    return [...new Set(state.geschenke.map((g) => (g.person || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
  }
  function stats(gs, budget) {
    const active = gs.filter((g) => statusOf(g) !== 'verworfen');
    const geplant = active.reduce((s, g) => s + (+g.kosten || 0), 0);
    const gekauft = gs.filter((g) => BOUGHT.has(statusOf(g))).reduce((s, g) => s + (+g.kosten || 0), 0);
    const b = +budget || 0;
    return { geplant, gekauft, budget: b, rest: b - geplant, over: b > 0 && geplant - b > 0.004 };
  }
  function matches(g) {
    if (ui.person && (g.person || '').trim() !== ui.person) return false;
    if (ui.anlass && g.anlassId !== ui.anlass) return false;
    if (ui.status && statusOf(g) !== ui.status) return false;
    if (ui.hide && !ui.status && statusOf(g) === 'verworfen') return false;
    if (ui.search) {
      const q = ui.search.toLowerCase();
      if (![g.idee, g.notiz, g.person].some((v) => (v || '').toLowerCase().includes(q))) return false;
    }
    return true;
  }
  const isFiltered = () => !!(ui.person || ui.status || ui.search || ui.hide);

  // ---------- Rendering ----------
  function barHtml(s) {
    const max = Math.max(s.budget, s.geplant, 1);
    const b = (s.gekauft / max) * 100, p = Math.max(0, (s.geplant - s.gekauft) / max) * 100;
    return `<div class="bar${s.over ? ' over' : ''}" role="img" aria-label="${eur.format(s.geplant)} von ${eur.format(s.budget)} geplant"><span class="bought" style="width:${b}%"></span><span class="planned" style="width:${p}%"></span></div>`;
  }
  function sumHtml(s, withBudget) {
    return `<div class="a-sum num">
      <span>Geplant <b>${eur.format(s.geplant)}</b></span>
      <span>Gekauft <b>${eur.format(s.gekauft)}</b></span>
      ${withBudget && s.budget ? `<span class="${s.over ? 'over' : ''}">${s.over ? 'Überzogen' : 'Übrig'} <b>${eur.format(Math.abs(s.rest))}</b></span>` : ''}
      ${s.over ? '<span class="flag">Budget überschritten</span>' : ''}
    </div>`;
  }
  function statusChips(gs) {
    const c = {};
    gs.forEach((g) => { const s = statusOf(g); c[s] = (c[s] || 0) + 1; });
    const parts = STATUS.filter(([v]) => c[v]).map(([v, l]) => `<span class="chip">${l}: ${c[v]}</span>`);
    return parts.length ? `<div class="chips">${parts.join('')}</div>` : '';
  }

  function renderTotals() {
    let budget = 0, geplant = 0, gekauft = 0;
    for (const a of state.anlaesse) { const s = stats(giftsOf(a.id), a.budget); budget += s.budget; geplant += s.geplant; gekauft += s.gekauft; }
    const offen = state.geschenke.filter((g) => statusOf(g) === 'idee').length;
    const rest = budget - geplant, over = rest < -0.004;
    $('#totals').innerHTML =
      `<div><span class="label">Gesamtbudget</span><strong>${eur.format(budget)}</strong></div>` +
      `<div><span class="label">Geplant</span><strong>${eur.format(geplant)}</strong></div>` +
      `<div><span class="label">Gekauft</span><strong>${eur.format(gekauft)}</strong></div>` +
      `<div class="${over ? 'over' : 'rest'}"><span class="label">${over ? 'Überzogen' : 'Übrig'}</span><strong>${eur.format(Math.abs(rest))}</strong></div>` +
      `<div><span class="label">Offene Ideen</span><strong>${offen}</strong></div>`;
  }

  function renderFilters() {
    const ps = persons();
    if (ui.person && !ps.includes(ui.person)) ui.person = '';
    if (ui.anlass && !findA(ui.anlass)) ui.anlass = '';
    $('#f-person').innerHTML = '<option value="">Alle</option>' + ps.map((p) => `<option${p === ui.person ? ' selected' : ''}>${esc(p)}</option>`).join('');
    $('#f-anlass').innerHTML = '<option value="">Alle</option>' + sortedAnlaesse().map((a) => `<option value="${a.id}"${a.id === ui.anlass ? ' selected' : ''}>${esc(a.name)}</option>`).join('');
    $('#f-status').innerHTML = '<option value="">Alle</option>' + STATUS.map(([v, l]) => `<option value="${v}"${v === ui.status ? ' selected' : ''}>${l}</option>`).join('');
    $('#f-search').value = ui.search;
    $('#f-hide').checked = ui.hide;
    $('#persons').innerHTML = ps.map((p) => `<option value="${esc(p)}">`).join('');
    document.querySelectorAll('.seg [data-view]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === ui.view)));
  }

  function statusSelect(g) {
    const s = statusOf(g);
    return `<select class="c-status st st-${s}" data-key="g:${g.id}:status" data-g="${g.id}" data-f="status" aria-label="Status">${STATUS.map(([v, l]) => `<option value="${v}"${s === v ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
  }
  function anlassSelect(attrs, current, cls = 'c-person') {
    return `<select class="${cls}" ${attrs} aria-label="Anlass">${sortedAnlaesse().map((a) => `<option value="${a.id}"${a.id === current ? ' selected' : ''}>${esc(a.name)}</option>`).join('')}</select>`;
  }
  function delButton(g) {
    return confirmKey === 'g:' + g.id
      ? `<div class="confirm c-del"><button type="button" class="danger" data-act="del-g" data-id="${g.id}">Löschen</button><button type="button" class="ghost" data-act="cancel">Abbrechen</button></div>`
      : `<button type="button" class="ghost c-del" data-act="ask" data-key="g:${g.id}" aria-label="Geschenk löschen" title="Löschen">✕</button>`;
  }

  function rowHtml(g, mode) {
    const s = statusOf(g);
    const first = mode === 'person'
      ? anlassSelect(`data-key="g:${g.id}:anlassId" data-g="${g.id}" data-f="anlassId"`, g.anlassId)
      : `<input class="c-person" list="persons" data-key="g:${g.id}:person" data-g="${g.id}" data-f="person" value="${esc(g.person)}" placeholder="Für wen" aria-label="Für wen">`;
    return `<div class="row${s === 'verschenkt' ? ' done' : ''}${s === 'verworfen' ? ' dropped' : ''}">
      ${first}
      <input class="c-idee" data-key="g:${g.id}:idee" data-g="${g.id}" data-f="idee" value="${esc(g.idee)}" placeholder="Geschenk" aria-label="Geschenk">
      <input class="c-kosten num" type="number" min="0" step="0.01" inputmode="decimal" data-key="g:${g.id}:kosten" data-g="${g.id}" data-f="kosten" value="${g.kosten || ''}" placeholder="€" aria-label="Kosten in Euro">
      ${statusSelect(g)}
      <input class="c-notiz" data-key="g:${g.id}:notiz" data-g="${g.id}" data-f="notiz" value="${esc(g.notiz)}" placeholder="Notiz, Link, Größe …" aria-label="Notiz">
      ${delButton(g)}
    </div>`;
  }

  function addFormHtml(kind, id, defaults) {
    const first = kind === 'person'
      ? anlassSelect(`name="anlassId" data-key="add:p:${esc(id)}:anlassId"`, ui.anlass || (sortedAnlaesse().find((a) => (daysUntil(a.datum) ?? 1) >= 0) || {}).id)
      : `<input class="c-person" list="persons" name="person" data-key="add:a:${id}:person" placeholder="+ Für wen" aria-label="Neue Person" value="${esc(defaults.person || '')}">`;
    return `<form class="row add" data-add-kind="${kind}" data-add="${esc(id)}">
      ${first}
      <input class="c-idee" name="idee" data-key="add:${kind}:${esc(id)}:idee" placeholder="+ Geschenkidee" aria-label="Neue Geschenkidee">
      <input class="c-kosten num" name="kosten" data-key="add:${kind}:${esc(id)}:kosten" type="number" min="0" step="0.01" inputmode="decimal" placeholder="€" aria-label="Kosten in Euro">
      <select class="c-status" name="status" data-key="add:${kind}:${esc(id)}:status" aria-label="Status">${STATUS.map(([v, l]) => `<option value="${v}"${v === (ui.status || 'idee') ? ' selected' : ''}>${l}</option>`).join('')}</select>
      <input class="c-notiz" name="notiz" data-key="add:${kind}:${esc(id)}:notiz" placeholder="Notiz" aria-label="Notiz">
      <button type="submit" class="primary c-del" aria-label="Geschenk hinzufügen" title="Hinzufügen">+</button>
    </form>`;
  }

  function anlassCard(a) {
    const all = giftsOf(a.id);
    const s = stats(all, a.budget);
    const shown = all.filter(matches);
    const del = confirmKey === 'a:' + a.id
      ? `<div class="confirm"><span>Anlass mit ${all.length} Geschenk${all.length === 1 ? '' : 'en'} löschen?</span><button type="button" class="danger" data-act="del-a" data-id="${a.id}">Löschen</button><button type="button" class="ghost" data-act="cancel">Abbrechen</button></div>`
      : `<button type="button" class="ghost" data-act="ask" data-key="a:${a.id}">Anlass löschen</button>`;
    return `<section class="card${s.over ? ' is-over' : ''}">
      <div class="a-head">
        <div class="field"><label class="label" for="a-${a.id}-name">Anlass${a.datum ? ' · ' + fmtDate(a.datum) : ''}${countdownHtml(a.datum)}</label><input id="a-${a.id}-name" class="title" data-key="a:${a.id}:name" data-a="${a.id}" data-f="name" value="${esc(a.name)}"></div>
        <div class="field"><label class="label" for="a-${a.id}-datum">Datum</label><input id="a-${a.id}-datum" type="date" data-key="a:${a.id}:datum" data-a="${a.id}" data-f="datum" value="${esc(a.datum)}"></div>
        <div class="field"><label class="label" for="a-${a.id}-budget">Budget (€)</label><input id="a-${a.id}-budget" class="num" type="number" min="0" step="1" inputmode="decimal" data-key="a:${a.id}:budget" data-a="${a.id}" data-f="budget" value="${a.budget || ''}"></div>
        ${del}
      </div>
      ${s.budget ? barHtml(s) : ''}
      ${sumHtml(s, true)}
      ${statusChips(all)}
      <div class="rows">
        ${shown.length ? `<div class="row-head label"><span>Für wen</span><span>Geschenk</span><span>Kosten</span><span>Status</span><span>Notiz</span><span></span></div>` : ''}
        ${shown.map((g) => rowHtml(g, 'anlass')).join('')}
        ${!shown.length ? `<div class="empty">${isFiltered() ? 'Keine Geschenke für diesen Filter.' : 'Noch keine Geschenke. Trag unten die erste Idee ein.'}</div>` : ''}
        ${addFormHtml('anlass', a.id, { person: ui.person })}
      </div>
    </section>`;
  }

  function personCard(name, gifts) {
    const s = stats(gifts, 0);
    const label = name || 'Ohne Person';
    return `<section class="card person">
      <h2>${esc(label)}</h2>
      ${sumHtml(s, false)}
      ${statusChips(gifts)}
      <div class="rows person-view">
        ${gifts.length ? `<div class="row-head label"><span>Anlass</span><span>Geschenk</span><span>Kosten</span><span>Status</span><span>Notiz</span><span></span></div>` : ''}
        ${gifts.map((g) => rowHtml(g, 'person')).join('')}
        ${name ? addFormHtml('person', name, {}) : ''}
      </div>
    </section>`;
  }

  function renderAnlassView() {
    const as = sortedAnlaesse()
      .filter((a) => !ui.anlass || a.id === ui.anlass)
      .filter((a) => !isFiltered() || ui.anlass || giftsOf(a.id).some(matches));
    return as.length ? as.map(anlassCard).join('') : '<div class="state">Keine Treffer für diesen Filter.</div>';
  }
  function renderPersonView() {
    const order = new Map(sortedAnlaesse().map((a, i) => [a.id, i]));
    const groups = new Map();
    state.geschenke.filter(matches).forEach((g) => {
      const k = (g.person || '').trim();
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(g);
    });
    const names = [...groups.keys()].sort((a, b) => (a === '') - (b === '') || a.localeCompare(b, 'de'));
    if (!names.length) return `<div class="state">${state.geschenke.length ? 'Keine Treffer für diesen Filter.' : 'Noch keine Geschenke erfasst. Wechsle zu „Nach Anlass“ und trag die erste Idee ein.'}</div>`;
    return names.map((n) => personCard(n, groups.get(n).sort((a, b) => (order.get(a.anlassId) - order.get(b.anlassId)) || (a.created - b.created)))).join('');
  }

  function render() {
    // Fokus und laufende Eingaben über das Neurendern hinweg erhalten
    const ae = document.activeElement;
    const key = ae && list.contains(ae) && ae.dataset ? ae.dataset.key : null;
    const val = key ? ae.value : null;
    let sel = null; try { sel = key ? [ae.selectionStart, ae.selectionEnd] : null; } catch (_) {}
    const addVals = {};
    list.querySelectorAll('form[data-add] [data-key]').forEach((el) => { if (el.value && el.tagName === 'INPUT') addVals[el.dataset.key] = el.value; });

    renderTotals(); renderFilters();
    if (!state.anlaesse.length) {
      list.innerHTML = `<div class="state"><img src="icon.svg" alt="" width="64" height="64">Noch kein Anlass angelegt. Leg oben deinen ersten an, etwa „Weihnachten 2026“ mit Budget.</div>`;
      return;
    }
    list.innerHTML = `<div class="stack">${ui.view === 'person' ? renderPersonView() : renderAnlassView()}</div>`;
    for (const k in addVals) { const el = list.querySelector(`[data-key="${CSS.escape(k)}"]`); if (el) el.value = addVals[k]; }
    if (key) {
      const el = list.querySelector(`[data-key="${CSS.escape(key)}"]`);
      if (el) { el.value = val; el.focus(); try { if (sel) el.setSelectionRange(sel[0], sel[1]); } catch (_) {} }
    }
  }

  // ---------- Ereignisse ----------
  list.addEventListener('change', (e) => {
    const el = e.target; const f = el.dataset.f; if (!f) return;
    let v = el.value;
    if (f === 'kosten' || f === 'budget') v = num(v);
    else v = v.trim();
    if (el.dataset.g) {
      const g = findG(el.dataset.g); if (!g) return;
      g[f] = v; g.updated = Date.now();
      if (f === 'status') toast(`Status: ${STATUS_LABEL[v]}`);
    } else if (el.dataset.a) {
      const a = findA(el.dataset.a); if (!a) return;
      if (f === 'name' && !v) { toast('Der Anlass braucht einen Namen.'); render(); return; }
      a[f] = v;
    }
    save(); render();
  });

  list.addEventListener('submit', (e) => {
    const form = e.target.closest('form[data-add]'); if (!form) return;
    e.preventDefault();
    const d = Object.fromEntries(new FormData(form));
    const kind = form.dataset.addKind;
    const person = kind === 'person' ? form.dataset.add : (d.person || '').trim();
    const anlassId = kind === 'person' ? d.anlassId : form.dataset.add;
    if (!(d.idee || '').trim() && !person) { toast('Bitte Person oder Geschenk eintragen.'); return; }
    if (!findA(anlassId)) { toast('Bitte zuerst einen Anlass anlegen.'); return; }
    state.geschenke.push({ id: uid(), anlassId, person, idee: (d.idee || '').trim(), kosten: num(d.kosten), status: d.status || 'idee', notiz: (d.notiz || '').trim(), created: Date.now() });
    if (!save()) return;
    form.querySelectorAll('input').forEach((i) => { if (!(kind === 'anlass' && i.name === 'person')) i.value = ''; });
    render();
    const again = list.querySelector(`form[data-add="${CSS.escape(form.dataset.add)}"] input[name="idee"]`);
    if (again) again.focus();
  });

  list.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    const act = b.dataset.act;
    if (act === 'ask') { confirmKey = b.dataset.key; render(); return; }
    if (act === 'cancel') { confirmKey = null; render(); return; }
    if (act === 'del-g') {
      state.geschenke = state.geschenke.filter((g) => g.id !== b.dataset.id);
      confirmKey = null; save(); render(); toast('Geschenk gelöscht');
    }
    if (act === 'del-a') {
      const id = b.dataset.id;
      state.geschenke = state.geschenke.filter((g) => g.anlassId !== id);
      state.anlaesse = state.anlaesse.filter((a) => a.id !== id);
      confirmKey = null; save(); render(); toast('Anlass gelöscht');
    }
  });

  $('#new-anlass').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#na-name').value.trim(); if (!name) return;
    state.anlaesse.push({ id: uid(), name, datum: $('#na-datum').value, budget: num($('#na-budget').value || 0), created: Date.now() });
    if (!save()) return;
    $('#na-name').value = ''; $('#na-datum').value = ''; $('#na-budget').value = '';
    ui.view = 'anlass'; saveUi();
    render(); toast('Anlass angelegt');
  });

  const setUi = (k, v) => { ui[k] = v; saveUi(); render(); };
  $('#f-person').addEventListener('change', (e) => setUi('person', e.target.value));
  $('#f-anlass').addEventListener('change', (e) => setUi('anlass', e.target.value));
  $('#f-status').addEventListener('change', (e) => setUi('status', e.target.value));
  $('#f-hide').addEventListener('change', (e) => setUi('hide', e.target.checked));
  let searchTimer;
  $('#f-search').addEventListener('input', (e) => { clearTimeout(searchTimer); searchTimer = setTimeout(() => setUi('search', e.target.value.trim()), 200); });
  $('#f-reset').addEventListener('click', () => { Object.assign(ui, { person: '', anlass: '', status: '', search: '', hide: false }); saveUi(); render(); });
  document.querySelectorAll('.seg [data-view]').forEach((b) => b.addEventListener('click', () => setUi('view', b.dataset.view)));

  // ---------- Export / Import ----------
  $('#btn-export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ app: 'geschenkideen', version: 1, exported: new Date().toISOString(), ...state }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `geschenkideen-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('#file-import').addEventListener('change', async (e) => {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    try {
      const d = JSON.parse(await file.text());
      if (!Array.isArray(d.anlaesse) || !Array.isArray(d.geschenke)) throw new Error('Format');
      const replace = !(state.anlaesse.length || state.geschenke.length) ||
        confirm('Vorhandene Daten ersetzen?\n\nOK = ersetzen, Abbrechen = zusammenführen');
      const clean = (arr, fields) => arr.filter((x) => x && typeof x === 'object' && x.id).map((x) => Object.fromEntries(fields.map((f) => [f, x[f]]).filter(([, v]) => v !== undefined)));
      const A = clean(d.anlaesse, ['id', 'name', 'datum', 'budget', 'created']);
      const G = clean(d.geschenke, ['id', 'anlassId', 'person', 'idee', 'kosten', 'status', 'notiz', 'created', 'updated']);
      if (replace) state = { anlaesse: A, geschenke: G };
      else {
        const ia = new Set(state.anlaesse.map((x) => x.id)), ig = new Set(state.geschenke.map((x) => x.id));
        state.anlaesse.push(...A.filter((x) => !ia.has(x.id)));
        state.geschenke.push(...G.filter((x) => !ig.has(x.id)));
      }
      save(); render(); toast(`Import: ${A.length} Anlässe, ${G.length} Geschenke`);
    } catch (err) { console.error(err); toast('Import fehlgeschlagen: keine gültige Geschenkideen-Datei.'); }
  });

  // Änderungen aus anderen Tabs übernehmen
  window.addEventListener('storage', (e) => { if (e.key === STORE_KEY) { state = load(); render(); } });

  render();
})();
