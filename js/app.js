import * as store from './store.js';
import * as S from './stats.js';
import * as F from './format.js';
import { allExercises, exerciseById, categories, CATEGORIES, BENCH_ID } from './exercises.js';
import { lineChart } from './chart.js';

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const parseNum = (v) => {
  const n = parseFloat(String(v).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};
// Plain number for an <input>, in the user's unit, no thousands separators.
const inputW = (kg) => String(Math.round(F.toDisplay(kg) * 100) / 100);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const longDate = (d) => F.parseDay(d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

const TABS = [
  { id: 'home', label: 'Today' },
  { id: 'progress', label: 'Progress' },
  { id: 'log', label: 'Log', primary: true },
  { id: 'prs', label: 'Records' },
  { id: 'history', label: 'History' },
];

const METRICS = {
  weight: [
    { id: 'top', label: 'Top set', get: (s) => s.top.w, fmt: F.w, unit: true, sub: (s) => `Top set ${F.setText(s.top, true)}` },
    { id: 'e1rm', label: 'Est. 1RM', get: (s) => s.e1rm, fmt: F.w, unit: true, sub: (s) => `From ${F.setText(s.e1rmSet, true)}` },
    { id: 'volume', label: 'Volume', get: (s) => s.volume, fmt: F.whole, unit: true, sub: (s) => `${plural(s.sets.length, 'set')}, ${s.reps} reps` },
  ],
  bodyweight: [
    { id: 'reps', label: 'Max reps', get: (s) => s.maxRep.r, fmt: (v) => F.num(v, 0), unit: false, sub: (s) => `Best set ${F.setText(s.maxRep, true)}` },
    { id: 'added', label: 'Added weight', get: (s) => s.top.w, fmt: F.w, unit: true, sub: (s) => `Heaviest ${F.setText(s.top, true)}` },
    { id: 'total', label: 'Total reps', get: (s) => s.reps, fmt: (v) => F.num(v, 0), unit: false, sub: (s) => plural(s.sets.length, 'set') },
  ],
};
const RANGES = [
  ['1m', '1M', 30, 'the last month'],
  ['3m', '3M', 91, 'the last 3 months'],
  ['6m', '6M', 182, 'the last 6 months'],
  ['1y', '1Y', 365, 'the last year'],
  ['all', 'All', Infinity, null],
];

// ---------- UI state (view prefs survive reloads; the log date is per visit) ----------
const PREFS_KEY = 'novo-tracker:ui';
const prefs = (() => {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch { return {}; }
})();
const ui = {
  tab: 'home',
  logCat: 'All',
  logDate: null,
  historyLimit: 30,
  progAll: false,
  addOpen: false,
  progEx: prefs.progEx || BENCH_ID,
  progMetric: prefs.progMetric || null,
  progRange: prefs.progRange || '3m',
  hideInstall: !!prefs.hideInstall,
};
function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ progEx: ui.progEx, progMetric: ui.progMetric, progRange: ui.progRange, hideInstall: ui.hideInstall }));
  } catch {}
}
const logDate = () => (ui.logDate && ui.logDate < F.today() ? ui.logDate : F.today());
const setLogDate = (d) => { ui.logDate = d && d < F.today() ? d : null; };

// ---------- Shared pieces ----------
const sec = (title, aside = '') => `<div class="sec"><h2>${esc(title)}</h2>${aside}</div>`;

const head = (title, lede = '', aside = '') => `
  <header class="head">
    <div class="head-row"><h1>${title}</h1>${aside}</div>
    ${lede ? `<p class="lede">${lede}</p>` : ''}
  </header>`;

const opts = (action, options, current, label, cls = '') => `
  <div class="opts ${cls}" role="radiogroup" aria-label="${esc(label)}">
    ${options.map(([v, t]) => `<button type="button" role="radio" aria-checked="${String(v) === String(current)}" data-action="${action}" data-v="${esc(v)}">${esc(t)}</button>`).join('')}
  </div>`;

// A text button with the native date picker laid invisibly over it.
const dateButton = (d, id) => `
  <label class="date-btn">Change date
    <input type="date" id="${id}" value="${d}" max="${F.today()}" aria-label="Workout date">
  </label>`;

const dial = (id, kind, label, value) => {
  const step = kind === 'r' ? '1' : F.num(F.stepSize(), 1);
  return `
  <div class="dial">
    <label for="${id}">${esc(kind === 'r' ? label : `${label} · ${F.unit()}`)}</label>
    <input id="${id}" class="dial-n" type="text" inputmode="${kind === 'r' ? 'numeric' : 'decimal'}" autocomplete="off" enterkeyhint="${kind === 'r' ? 'done' : 'next'}" value="${esc(value)}">
    <div class="dial-steps">
      <button type="button" data-step="${id}" data-kind="${kind}" data-dir="-1" aria-label="${esc(label)} minus ${step}">−${step}</button>
      <button type="button" data-step="${id}" data-kind="${kind}" data-dir="1" aria-label="${esc(label)} plus ${step}">+${step}</button>
    </div>
  </div>`;
};

function wireDials(root) {
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-step]');
    if (!b) return;
    const input = root.querySelector(`#${b.dataset.step}`);
    const reps = b.dataset.kind === 'r';
    const cur = parseNum(input.value);
    const next = (Number.isFinite(cur) ? cur : 0) + (reps ? 1 : F.stepSize()) * Number(b.dataset.dir);
    input.value = reps ? String(Math.max(1, Math.round(next))) : String(Math.max(0, Math.round(next * 100) / 100));
  });
}

function invalid(input, msg) {
  const box = input.closest('.dial');
  box?.classList.remove('shake');
  void input.offsetWidth;
  box?.classList.add('shake');
  toast(msg);
}

function readSet(wInput, rInput) {
  const w = parseNum(wInput.value);
  const r = parseNum(rInput.value);
  if (!Number.isFinite(w) || w < 0) return invalid(wInput, 'Enter a weight, 0 or more.');
  if (!Number.isInteger(r) || r < 1) return invalid(rInput, 'Reps must be a whole number, 1 or more.');
  return { w: F.fromDisplay(w), r };
}

// "Low Pulley Row, Pull Ups and 4 more"
function exerciseNames(ids) {
  const names = ids.map((id) => exerciseById(id).name);
  if (names.length <= 2) return names.join(' and ');
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
}

const goalStep = () => (F.unit() === 'lb' ? 20 : 10);

// Bench goal as a row of 10 kg (20 lb) blocks, filled up to the current estimated 1RM.
function goalStack(val, goal) {
  const step = goalStep();
  const g = F.toDisplay(goal);
  const v = F.toDisplay(val);
  const blocks = [];
  for (let start = 0; start < g - 1e-9; start += step) {
    let end = Math.min(start + step, g);
    if (g - end < step * 0.35) end = g;
    const fill = Math.max(0, Math.min(1, (v - start) / (end - start)));
    blocks.push(`<i style="flex:${((end - start) / step).toFixed(3)}"><b style="width:${(fill * 100).toFixed(1)}%"></b></i>`);
    if (end === g) break;
  }
  return `<div class="stack" role="meter" aria-label="Estimated 1RM against goal" aria-valuemin="0" aria-valuemax="${g.toFixed(1)}" aria-valuenow="${v.toFixed(1)}">${blocks.join('')}</div>`;
}

function setButton(s, prs) {
  const pr = prs.has(s.id);
  return `<button type="button" class="set${pr ? ' pr' : ''}" data-action="edit-set" data-id="${esc(s.id)}" aria-label="Edit set ${esc(F.setText(s, true))}${pr ? ', personal record' : ''}">${esc(F.setText(s))}${pr ? '<span class="pr-tag">PR</span>' : ''}</button>`;
}

function dayBlock(day, prs) {
  return `
  <article class="day">
    <header class="day-h">
      <h3>${esc(F.dayLabel(day.d))}</h3>
      <span>${plural(day.sets.length, 'set')} · ${F.whole(day.volume)} ${F.unit()}</span>
    </header>
    ${[...day.groups].map(([exId, sets]) => `
      <div class="day-ex">
        <div class="day-ex-name">${esc(exerciseById(exId).name)}</div>
        <div class="sets">${sets.map((s) => setButton(s, prs)).join('')}</div>
      </div>`).join('')}
  </article>`;
}

function installNotice() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  if (!ios || standalone || ui.hideInstall) return '';
  return `
  <aside class="notice">
    <p>Install it: tap <b>Share</b>, then <b>Add to Home Screen</b>.</p>
    <button type="button" class="text-btn" data-action="hide-install">Dismiss</button>
  </aside>`;
}

// ---------- Views ----------
let mounts = [];
const onMount = (fn) => mounts.push(fn);

function viewHome() {
  const t = F.today();
  const days = S.trainingDays();
  const todayDay = days.find((d) => d.d === t);
  const lastDay = days.find((d) => d.d < t);
  const wk = S.weekSummary();
  const streak = S.weekStreak();

  let lede;
  if (todayDay) lede = `<b>${plural(todayDay.sets.length, 'set')}</b> logged today: ${esc(exerciseNames([...todayDay.groups.keys()]))}.`;
  else if (lastDay) lede = `Last trained <b>${esc(F.ago(lastDay.d))}</b>: ${esc(exerciseNames([...lastDay.groups.keys()]))}.`;
  else lede = 'Nothing logged yet. Tap <b>Log</b> and pick an exercise.';

  const letters = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  return `
  <div class="mast">
    <span class="brand" role="img" aria-label="Novo Tracker, Welling"><span class="brand-block">NOVO</span><span class="brand-txt">Welling</span></span>
    <button type="button" class="text-btn" data-action="settings">Settings</button>
  </div>
  ${head(esc(longDate(t)), lede)}
  ${installNotice()}
  <a class="act" href="#log"><span>${todayDay ? 'Carry on logging' : 'Log a workout'}</span></a>

  <section class="block">
    ${sec('This week', streak > 1 ? `<span class="sec-note">${streak} weeks running</span>` : '')}
    <ol class="week">
      ${wk.days.map((d, i) => `<li class="${wk.trained.has(d) ? 'on' : ''}${d === t ? ' today' : ''}" aria-label="${esc(longDate(d))}${wk.trained.has(d) ? ', trained' : ''}"><span class="wk-d">${letters[i]}</span><span class="wk-n">${F.parseDay(d).getDate()}</span></li>`).join('')}
    </ol>
    <p class="week-sum">${wk.sets
      ? `${plural(wk.trained.size, 'session')} · ${plural(wk.sets, 'set')} · ${F.whole(wk.volume)} ${F.unit()}`
      : 'Nothing logged since Monday.'}</p>
  </section>

  ${benchBlock()}`;
}

function benchBlock() {
  const b = S.bestsOf(BENCH_ID);
  const goal = store.getState().settings.benchGoal;
  if (!b) {
    return `
    <section class="block">
      ${sec('Bench press')}
      <p class="note">No bench sets yet.</p>
      <button type="button" class="btn" data-action="open-ex" data-ex="${BENCH_ID}">Log flat bench press</button>
    </section>`;
  }
  const goalLine = !goal ? '' : b.e1rm >= goal ? ` Goal of ${F.wu(goal)} reached.` : ` ${F.wu(goal - b.e1rm)} short of your ${F.wu(goal)} goal.`;
  return `
  <section class="block">
    ${sec('Bench press', '<a href="#prs">Records</a>')}
    <p class="figure"><span class="fig-n">${F.w(b.e1rm)}</span><span class="fig-u">${F.unit()}</span><span class="fig-l">est. 1RM</span></p>
    <p class="fig-src">Heaviest set ${esc(F.setText(b.heavy, true))}.${esc(goalLine)}</p>
    ${goal ? goalStack(b.e1rm, goal) : ''}
  </section>`;
}

function viewLog() {
  const d = logDate();
  const cats = ['All', ...categories()];
  const list = allExercises().filter((e) => ui.logCat === 'All' || e.cat === ui.logCat);
  const daySets = store.getState().sets.filter((s) => s.d === d);
  const volume = daySets.reduce((a, s) => a + s.w * s.r, 0);
  const lede = daySets.length ? `${plural(daySets.length, 'set')} · ${F.whole(volume)} ${F.unit()}${d === F.today() ? ' so far' : ''}` : '';
  return `
  ${head(esc(F.dayLabel(d)), lede, dateButton(d, 'log-date'))}
  <div class="filters" role="tablist" aria-label="Muscle group">
    ${cats.map((c) => `<button type="button" role="tab" aria-selected="${c === ui.logCat}" data-action="log-cat" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}
  </div>
  <ul class="rows">
    ${list.map((ex) => {
      const n = daySets.filter((s) => s.ex === ex.id).length;
      const last = n ? null : S.lastSessionBefore(ex.id, d);
      const val = n
        ? `<span class="row-val hot">${plural(n, 'set')}</span>`
        : last ? `<span class="row-val">${esc(F.setText(last.top))}</span>` : '';
      return `<li><button type="button" class="row" data-action="open-ex" data-ex="${esc(ex.id)}"><span class="row-name">${esc(ex.name)}</span>${val}</button></li>`;
    }).join('')}
  </ul>
  <button type="button" class="text-btn" data-action="settings" data-focus="custom">Add an exercise</button>`;
}

function trendLede(ex, m, sess, vals, range) {
  const u = m.unit ? ` ${F.unit()}` : ' reps';
  const span = range[3] ? `in ${range[3]}` : F.sinceDay(sess[0].d);
  if (vals.length === 1) {
    return `One session ${esc(span)}: <b>${m.fmt(vals[0])}${u}</b> ${esc(F.onDay(sess[0].d))}. Log another to see a trend.`;
  }
  const first = vals[0];
  const last = vals[vals.length - 1];
  const diff = last - first;
  const sessions = `${plural(sess.length, 'session')} ${esc(span)}`;
  if (Math.abs(diff) < 1e-9) return `${esc(m.label)} held at <b>${m.fmt(last)}${u}</b> across ${sessions}.`;
  return `${esc(m.label)} <b>${diff > 0 ? 'up' : 'down'} ${m.fmt(Math.abs(diff))}${u}</b> across ${sessions}, from ${m.fmt(first)} to ${m.fmt(last)}${u}.`;
}

function viewProgress() {
  const ex = exerciseById(ui.progEx);
  const bw = ex.kind === 'bodyweight';
  const metrics = METRICS[bw ? 'bodyweight' : 'weight'];
  const m = metrics.find((x) => x.id === ui.progMetric) || metrics[0];
  const range = RANGES.find((r) => r[0] === ui.progRange) || RANGES[1];
  const cutoff = range[2] === Infinity ? '' : F.addDays(F.today(), -range[2]);
  const all = S.sessionsOf(ex.id);
  const sess = all.filter((s) => s.d >= cutoff);
  const vals = sess.map((s) => m.get(s));

  const options = categories().map((c) => {
    const exs = allExercises().filter((e) => e.cat === c);
    return exs.length ? `<optgroup label="${esc(c)}">${exs.map((e) => `<option value="${esc(e.id)}"${e.id === ex.id ? ' selected' : ''}>${esc(e.name)}</option>`).join('')}</optgroup>` : '';
  }).join('');

  let lede;
  let body;
  if (!sess.length) {
    lede = all.length
      ? `Nothing ${esc(range[3] ? `in ${range[3]}` : 'logged')}. Last session was ${esc(F.ago(all[all.length - 1].d))}.`
      : 'Not logged yet. After a couple of sessions this page charts it.';
    body = `<button type="button" class="btn" data-action="open-ex" data-ex="${esc(ex.id)}">Log ${esc(ex.name)}</button>`;
  } else {
    lede = trendLede(ex, m, sess, vals, range);
    const rows = ui.progAll ? sess : sess.slice(-10);
    body = `
    <div class="chart" id="prog-chart"></div>
    <section class="block">
      ${sec('Sessions')}
      <table class="log">
        <thead><tr><th>Date</th><th>${bw ? 'Best set' : 'Top set'}</th><th class="r">${bw ? 'Total reps' : 'e1RM'}</th></tr></thead>
        <tbody>${rows.slice().reverse().map((s) => `<tr>
          <td class="dim">${esc(F.shortDate(s.d))}</td>
          <td class="num">${esc(F.setText(bw ? s.maxRep : s.top))}</td>
          <td class="r">${bw ? s.reps : F.w(s.e1rm)}</td></tr>`).join('')}</tbody>
      </table>
      ${rows.length < sess.length ? `<button type="button" class="text-btn" data-action="prog-all">Show all ${sess.length}</button>` : ''}
    </section>`;
    const points = sess.map((s) => ({ x: F.parseDay(s.d).getTime(), y: m.unit ? F.toDisplay(m.get(s)) : m.get(s), sub: m.sub(s) }));
    const short = (v) => (Math.abs(v) >= 1e4 ? `${F.num(v / 1000, 1)}k` : F.num(v, 1));
    onMount(() => lineChart($('#prog-chart'), points, {
      tick: short,
      value: (v) => (m.unit ? `${m.id === 'volume' ? F.num(v, 0) : F.num(v, 1)} ${F.unit()}` : `${F.num(v, 0)} reps`),
      label: `${ex.name}, ${m.label}, ${range[3] || 'all time'}`,
    }));
  }

  return `
  <header class="head">
    <label class="pick"><span class="vh">Exercise</span>
      <select id="prog-ex">${options}</select><span class="pick-cue">Change</span>
    </label>
    <p class="lede">${lede}</p>
  </header>
  ${opts('prog-metric', metrics.map((x) => [x.id, x.label]), m.id, 'Measure')}
  ${opts('prog-range', RANGES.map((r) => [r[0], r[1]]), range[0], 'Time range', 'quiet')}
  ${body}`;
}

function viewPRs() {
  const b = S.bestsOf(BENCH_ID);
  const goal = store.getState().settings.benchGoal;
  const u = F.unit();
  let bench;
  if (!b) {
    bench = `
    ${head('Bench press', 'No bench sets yet. Your first one is the baseline; anything heavier after it is a record.')}
    <button type="button" class="act" data-action="open-ex" data-ex="${BENCH_ID}"><span>Log flat bench press</span></button>`;
  } else {
    const records = S.prTimeline(BENCH_ID).filter((x) => x.kinds[0] !== 'first').slice(0, 5);
    const firstSet = S.setsOf(BENCH_ID)[0];
    const goalNote = !goal ? '' : b.e1rm >= goal
      ? `Reached, ${F.wu(b.e1rm - goal)} past it.`
      : `${F.wu(goal - b.e1rm)} to go. Each block is ${goalStep()} ${u}.`;
    bench = `
    ${head('Bench press', `${plural(b.days, 'session')} ${esc(F.sinceDay(firstSet.d))}.`)}
    <p class="figure"><span class="fig-n">${F.w(b.e1rm)}</span><span class="fig-u">${u}</span><span class="fig-l">est. 1RM</span></p>
    <p class="fig-src">From ${esc(F.setText(b.est, true))} ${esc(F.onDay(b.est.d))}.</p>
    <dl class="facts">
      <div><dt>Heaviest set</dt><dd>${esc(F.setText(b.heavy, true))}</dd><dd class="when">${esc(F.shortDate(b.heavy.d))}</dd></div>
      <div><dt>Goal</dt>${goal
        ? `<dd>${esc(F.wu(goal))}</dd><dd class="when"><button type="button" class="text-btn inline" data-action="edit-goal">Edit</button></dd>`
        : `<dd class="none">Not set</dd><dd class="when"><button type="button" class="text-btn inline" data-action="edit-goal">Set</button></dd>`}</div>
    </dl>
    ${goal ? `${goalStack(b.e1rm, goal)}<p class="note">${esc(goalNote)}</p>` : ''}

    <section class="block">
      ${sec('Rep maxes')}
      <table class="log">
        <thead><tr><th>Reps</th><th class="r">Heaviest</th></tr></thead>
        <tbody>${S.repMaxes(BENCH_ID).map(({ n, set }) => `<tr><td>${n}+</td><td class="r num">${set ? esc(F.setText(set, true)) : '<span class="dim">none yet</span>'}</td></tr>`).join('')}</tbody>
      </table>
    </section>

    ${records.length ? `
    <section class="block">
      ${sec('Latest records')}
      <table class="log">
        <thead><tr><th>Date</th><th>Set</th><th class="r">Gain</th></tr></thead>
        <tbody>${records.map(({ set, kinds, prev, e1rm }) => `<tr>
          <td class="dim">${esc(F.shortDate(set.d))}</td>
          <td class="num">${esc(F.setText(set))}</td>
          <td class="r gain">${esc(kinds.includes('weight') ? `+${F.wu(set.w - prev.w)}` : `+${F.w(e1rm - prev.e)} e1RM`)}</td></tr>`).join('')}</tbody>
      </table>
    </section>` : ''}`;
  }

  return `
  ${bench}
  <section class="block">
    ${sec('Other exercises')}
    <ul class="rows">
      ${allExercises().filter((ex) => ex.id !== BENCH_ID).map((ex) => {
        const best = S.bestsOf(ex.id);
        const val = !best ? '<span class="row-val dim">—</span>'
          : ex.kind === 'bodyweight' ? `<span class="row-val">${best.reps.r} reps</span>`
          : `<span class="row-val">${esc(F.setText(best.heavy))}</span>`;
        return `<li><button type="button" class="row" data-action="view-progress" data-ex="${esc(ex.id)}"><span class="row-name">${esc(ex.name)}</span>${val}</button></li>`;
      }).join('')}
    </ul>
  </section>`;
}

function viewHistory() {
  const days = S.trainingDays();
  const prs = S.prMap();
  const total = store.getState().sets.length;
  if (!days.length) {
    return `
    ${head('No sessions yet', 'Every day you train shows up here, newest first.')}
    <a class="act" href="#log"><span>Log a workout</span></a>`;
  }
  const shown = days.slice(0, ui.historyLimit);
  let html = '';
  shown.forEach((day, i) => {
    const ml = F.monthLabel(day.d);
    if (i === 0 || F.monthLabel(shown[i - 1].d) !== ml) html += `<section class="block block-month">${sec(ml)}`;
    html += dayBlock(day, prs);
    if (i === shown.length - 1 || F.monthLabel(shown[i + 1].d) !== ml) html += '</section>';
  });
  return `
  ${head(esc(plural(days.length, 'session')), `${plural(total, 'set')} ${esc(F.sinceDay(days[days.length - 1].d))}. Tap a set to edit it.`)}
  ${html}
  ${days.length > ui.historyLimit ? `<button type="button" class="btn" data-action="history-more">Show older sessions</button>` : ''}`;
}

const VIEWS = { home: viewHome, log: viewLog, progress: viewProgress, prs: viewPRs, history: viewHistory };

function render() {
  mounts = [];
  $('#view').innerHTML = VIEWS[ui.tab]();
  mounts.forEach((fn) => fn());
  $('#tabbar').innerHTML = TABS.map((t) => `<a href="#${t.id}" class="tab${t.primary ? ' tab-log' : ''}"${ui.tab === t.id ? ' aria-current="page"' : ''}>${t.label}</a>`).join('');
}

let queued = false;
function scheduleRender() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; render(); });
}

function go(tab) {
  if (location.hash === `#${tab}`) render();
  else location.hash = tab;
}

function route() {
  const id = location.hash.slice(1);
  ui.tab = VIEWS[id] ? id : 'home';
  if (sheet) closeSheet(true);
  render();
  window.scrollTo(0, 0);
}

// ---------- Sheets ----------
let sheet = null;

function openSheet({ title, sub = '', body, cls = '', kind = '', onMount: mount }) {
  if (sheet) closeSheet(true);
  const opener = document.activeElement;
  const root = document.createElement('div');
  root.className = 'sheet-root';
  root.innerHTML = `
    <div class="sheet-backdrop" data-close></div>
    <section class="sheet ${cls}" role="dialog" aria-modal="true" aria-labelledby="sheet-title" tabindex="-1">
      <header class="sheet-head">
        <div class="grab" aria-hidden="true"></div>
        <div><h2 id="sheet-title">${esc(title)}</h2>${sub ? `<p class="sheet-sub">${esc(sub)}</p>` : ''}</div>
        <button type="button" class="text-btn" data-close>Close</button>
      </header>
      <div class="sheet-body">${body}</div>
    </section>`;
  document.body.append(root);
  document.body.classList.add('sheet-open');
  root.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeSheet(); });

  // Drag the header down to dismiss, like a native sheet.
  const panel = $('.sheet', root);
  const header = $('.sheet-head', root);
  let y0 = null;
  header.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    y0 = e.clientY;
    panel.style.transition = 'none';
    header.setPointerCapture(e.pointerId);
  });
  header.addEventListener('pointermove', (e) => {
    if (y0 !== null) panel.style.transform = `translateY(${Math.max(0, e.clientY - y0)}px)`;
  });
  const release = (e) => {
    if (y0 === null) return;
    const dy = e.clientY - y0;
    y0 = null;
    panel.style.transition = '';
    panel.style.transform = '';
    if (dy > 90) closeSheet();
  };
  header.addEventListener('pointerup', release);
  header.addEventListener('pointercancel', release);

  sheet = { root, kind, opener, cleanup: null };
  sheet.cleanup = mount?.(root) || null;
  void root.offsetHeight;
  root.classList.add('open');
  panel.focus({ preventScroll: true });
  return root;
}

function closeSheet(immediate = false) {
  if (!sheet) return;
  const { root, cleanup, opener } = sheet;
  sheet = null;
  cleanup?.();
  document.body.classList.remove('sheet-open');
  root.classList.remove('open');
  if (immediate) root.remove();
  else setTimeout(() => root.remove(), 280);
  if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
}

// How a set compares with the same set number last session: "+2.5 kg", "+1 rep", "same".
function versus(s, prev) {
  if (!prev) return { text: '', cls: '' };
  const dw = s.w - prev.w;
  if (Math.abs(dw) > 1e-6) return { text: `${dw > 0 ? '+' : '−'}${F.wu(Math.abs(dw))}`, cls: dw > 0 ? 'up' : 'down' };
  const dr = s.r - prev.r;
  if (dr) return { text: `${dr > 0 ? '+' : '−'}${plural(Math.abs(dr), 'rep')}`, cls: dr > 0 ? 'up' : 'down' };
  return { text: 'same', cls: '' };
}

function openLogger(exId) {
  const ex = exerciseById(exId);
  const bw = ex.kind === 'bodyweight';
  const d = logDate();
  let landing = false; // the next refresh highlights the newest set
  let armedId = null;
  const ref = S.setsOn(exId, d).at(-1) || S.lastSessionBefore(exId, d)?.top;
  const body = `
    ${d === F.today() ? '' : `<p class="note note-top">Logging for ${esc(F.dayLabel(d))}.</p>`}
    <div class="lg-last"></div>
    <div class="dials">
      ${dial('lg-w', 'w', bw ? 'Added' : 'Weight', ref ? inputW(ref.w) : bw ? '0' : '')}
      ${dial('lg-r', 'r', 'Reps', ref ? ref.r : 8)}
    </div>
    <button type="button" class="act lg-submit"><span class="lg-label">Log set</span></button>
    <div class="rest rest-inline rest-ui" role="timer" aria-label="Rest timer" hidden>${restInner()}</div>
    <div class="lg-sets-head"></div>
    <ol class="today-sets"></ol>`;

  openSheet({
    title: ex.name,
    sub: ex.note || ex.cat,
    body,
    cls: 'sheet-tall',
    kind: 'logger',
    onMount(root) {
      const $w = $('#lg-w', root);
      const $r = $('#lg-r', root);
      const $btn = $('.lg-submit', root);
      const $label = $('.lg-label', $btn);
      let flash = 0;

      const refresh = () => {
        const sets = S.setsOn(exId, d);
        const prs = S.prMap();
        const last = S.lastSessionBefore(exId, d);
        if (!flash) $label.textContent = `Log set ${sets.length + 1}`;
        $('.lg-last', root).innerHTML = last
          ? `${sec(`Last time · ${F.dayLabel(last.d)}`)}
             <div class="sets">${last.sets.map((s) => `<button type="button" class="set" data-fill="${esc(s.id)}" aria-label="Copy ${esc(F.setText(s, true))}">${esc(F.setText(s))}</button>`).join('')}</div>`
          : '<p class="note note-top">First time logging this. It becomes the baseline for next time.</p>';
        $('.lg-sets-head', root).innerHTML = sets.length ? sec(F.dayLabel(d), last ? '<span class="sec-note">vs last time</span>' : '') : '';
        $('.today-sets', root).innerHTML = sets.map((s, i) => {
          const v = versus(s, last?.sets[i]);
          const armed = s.id === armedId;
          return `
          <li${landing && i === sets.length - 1 ? ' class="fresh"' : ''}>
            <button type="button" class="ts-main" data-arm="${esc(s.id)}" aria-expanded="${armed}">
              <span class="ts-n">${i + 1}</span>
              <span class="ts-set">${esc(F.setText(s, true))}${prs.has(s.id) ? '<span class="pr-tag">PR</span>' : ''}</span>
              <span class="ts-cmp ${v.cls}">${esc(v.text)}</span>
            </button>
            ${armed ? `<button type="button" class="ts-del" data-del="${esc(s.id)}">Remove</button>` : ''}
          </li>`;
        }).join('');
        landing = false;
      };

      const submit = () => {
        const v = readSet($w, $r);
        if (!v) return;
        const before = S.bestsOf(exId);
        landing = true;
        const set = store.addSet({ ex: exId, ...v, d });
        askPersist();
        const kinds = S.prMap().get(set.id);
        if (kinds && before) {
          const parts = kinds.map((k) => (k === 'weight'
            ? `Previous heaviest ${F.setText(before.heavy, true)}.`
            : k === 'reps' ? `Previous most reps ${before.reps.r}.` : `Est. 1RM up from ${F.wu(before.e1rm)} to ${F.wu(S.e1rm(set.w, set.r))}.`));
          toast(`${ex.name} ${F.setText(set, true)}. ${parts.join(' ')}`, { kind: 'pr', label: 'Record' });
        }
        clearTimeout(flash);
        $btn.classList.add('logged');
        $label.textContent = `Logged ${F.setText(set, true)}`;
        flash = setTimeout(() => {
          flash = 0;
          $btn.classList.remove('logged');
          refresh();
        }, 1300);
        startRest(store.getState().settings.rest);
      };

      const unsub = store.subscribe(() => refresh());
      $btn.addEventListener('click', submit);
      wireDials(root);
      $w.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $r.focus(); } });
      $r.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $r.blur(); submit(); } });
      root.addEventListener('click', (e) => {
        const fill = e.target.closest('[data-fill]');
        if (fill) {
          const s = store.getState().sets.find((x) => x.id === fill.dataset.fill);
          if (s) { $w.value = inputW(s.w); $r.value = String(s.r); }
          return;
        }
        const del = e.target.closest('[data-del]');
        if (del) { armedId = null; deleteWithUndo(del.dataset.del); return; }
        const arm = e.target.closest('[data-arm]');
        if (arm) { armedId = armedId === arm.dataset.arm ? null : arm.dataset.arm; refresh(); }
      });
      refresh();
      tickRest();
      return () => { unsub(); clearTimeout(flash); };
    },
  });
}

function openEditSet(id) {
  const s = store.getState().sets.find((x) => x.id === id);
  if (!s) return;
  const ex = exerciseById(s.ex);
  const bw = ex.kind === 'bodyweight';
  openSheet({
    title: 'Edit set',
    sub: `${ex.name} · ${F.dayLabel(s.d)}`,
    body: `
      <div class="dials">
        ${dial('es-w', 'w', bw ? 'Added' : 'Weight', inputW(s.w))}
        ${dial('es-r', 'r', 'Reps', s.r)}
      </div>
      <label class="field"><span>Date</span><input class="input" type="date" id="es-d" value="${s.d}" max="${F.today()}"></label>
      <button type="button" class="act" id="es-save"><span>Save changes</span></button>
      <button type="button" class="text-btn danger" id="es-del">Delete this set</button>`,
    onMount(root) {
      wireDials(root);
      $('#es-save', root).addEventListener('click', () => {
        const v = readSet($('#es-w', root), $('#es-r', root));
        if (!v) return;
        const nd = $('#es-d', root).value;
        store.updateSet(id, { ...v, d: nd && nd <= F.today() ? nd : s.d });
        closeSheet();
        toast(`Saved: ${ex.name} ${F.setText({ ...s, ...v }, true)}.`);
      });
      $('#es-del', root).addEventListener('click', () => {
        closeSheet();
        deleteWithUndo(id);
      });
    },
  });
}

function openGoal() {
  const { benchGoal } = store.getState().settings;
  const b = S.bestsOf(BENCH_ID);
  // Suggest the next 5 kg (10 lb) mark above the current estimate when no goal exists yet.
  const stepD = F.unit() === 'lb' ? 10 : 5;
  const suggestion = b ? F.fromDisplay(Math.ceil((F.toDisplay(b.e1rm) + 0.01) / stepD) * stepD) : null;
  const start = benchGoal || suggestion;
  openSheet({
    title: 'Bench goal',
    sub: b ? `Your estimated 1RM is ${F.wu(b.e1rm)}.` : 'Measured against your estimated 1RM.',
    body: `
      <div class="dials dials-one">${dial('goal-w', 'w', 'Goal', start ? inputW(start) : '')}</div>
      <button type="button" class="act" id="goal-save"><span>Save goal</span></button>
      ${benchGoal ? '<button type="button" class="text-btn" id="goal-clear">Remove goal</button>' : ''}`,
    onMount(root) {
      wireDials(root);
      $('#goal-save', root).addEventListener('click', () => {
        const input = $('#goal-w', root);
        const v = parseNum(input.value);
        if (!(v > 0)) return invalid(input, 'Enter a goal above 0.');
        store.setSetting('benchGoal', F.fromDisplay(v));
        closeSheet();
        toast(`Bench goal set to ${F.wu(F.fromDisplay(v))}.`);
      });
      $('#goal-clear', root)?.addEventListener('click', () => {
        store.setSetting('benchGoal', null);
        closeSheet();
        toast('Bench goal removed.');
      });
    },
  });
}

function settingsBody() {
  const st = store.getState();
  const { unit, rest, benchGoal } = st.settings;
  return `
    <section class="set-group">
      ${sec('Units')}
      ${opts('set-unit', [['kg', 'Kilograms'], ['lb', 'Pounds']], unit, 'Units')}
    </section>
    <section class="set-group">
      ${sec('Rest after each set')}
      ${opts('set-rest', [[0, 'Off'], [60, '1:00'], [90, '1:30'], [120, '2:00'], [180, '3:00']], rest, 'Rest timer')}
    </section>
    <section class="set-group">
      ${sec('Bench goal')}
      <button type="button" class="row" data-action="edit-goal"><span class="row-name">Estimated 1RM goal</span><span class="row-val">${benchGoal ? esc(F.wu(benchGoal)) : '<span class="dim">Not set</span>'}</span></button>
    </section>
    <section class="set-group" id="custom">
      ${sec('Your exercises')}
      ${st.custom.length ? `<ul class="rows">${st.custom.map((c) => `
        <li class="row row-static">
          <span class="row-name">${esc(c.name)} <small>${esc(c.cat)}</small></span>
          <button type="button" class="text-btn small" data-action="del-custom" data-id="${esc(c.id)}">Delete</button>
        </li>`).join('')}</ul>` : ''}
      ${ui.addOpen ? `
      <form class="add-form" data-form="custom">
        <label class="field"><span>Name</span><input class="input" name="name" placeholder="e.g. Leg Press" maxlength="40" required autocomplete="off"></label>
        <div class="row2">
          <label class="field"><span>Muscle group</span><select class="input" name="cat">${[...CATEGORIES, 'Legs', 'Core', 'Other'].map((c) => `<option>${c}</option>`).join('')}</select></label>
          <label class="field"><span>Load</span><select class="input" name="kind"><option value="weight">Weighted</option><option value="bodyweight">Bodyweight</option></select></label>
        </div>
        <button class="btn">Add</button>
      </form>` : '<button type="button" class="text-btn" data-action="open-add">Add an exercise</button>'}
    </section>
    <section class="set-group">
      ${sec('Backup')}
      <p class="note note-top">Your ${plural(st.sets.length, 'set')} are stored on this phone only.</p>
      <div class="btn-pair">
        <button type="button" class="btn" data-action="export">Export</button>
        <label class="btn">Import<input class="vh" type="file" accept=".json,application/json" id="import-file"></label>
      </div>
    </section>
    <button type="button" class="text-btn danger" data-action="reset">Delete all data</button>
    <p class="about">Unofficial, styled after Novo Gym Welling. Works offline once installed.</p>`;
}

function openSettings(focus) {
  if (focus === 'custom') ui.addOpen = true;
  openSheet({ title: 'Settings', body: settingsBody(), cls: 'sheet-tall', kind: 'settings', onMount: () => () => { ui.addOpen = false; } });
  if (focus) {
    requestAnimationFrame(() => {
      $(`#${focus}`, sheet.root)?.scrollIntoView({ block: 'start' });
      if (focus === 'custom') $('input[name="name"]', sheet.root)?.focus();
    });
  }
}

function refreshSettings() {
  if (sheet?.kind === 'settings') $('.sheet-body', sheet.root).innerHTML = settingsBody();
}

// ---------- Rest timer ----------
const rest = { end: 0, total: 0, timer: 0, buzzed: false };

const restInner = () => `
  <span class="rest-l">Rest</span>
  <span class="rest-t">0:00</span>
  <button type="button" data-action="rest-add" aria-label="Add 30 seconds">+0:30</button>
  <button type="button" data-action="rest-stop">Stop</button>
  <i class="rest-bar"></i>`;

function startRest(sec) {
  if (!sec) return;
  rest.total = sec * 1000;
  rest.end = Date.now() + rest.total;
  rest.buzzed = false;
  tickRest();
}

function stopRest() {
  rest.end = 0;
  tickRest();
}

function tickRest() {
  clearTimeout(rest.timer);
  const els = document.querySelectorAll('.rest-ui');
  document.body.classList.toggle('resting', !!rest.end);
  if (!rest.end) {
    els.forEach((el) => { el.hidden = true; });
    return;
  }
  const left = rest.end - Date.now();
  const done = left <= 0;
  const secs = Math.ceil(left / 1000);
  els.forEach((el) => {
    el.hidden = false;
    el.classList.toggle('done', done);
    $('.rest-l', el).textContent = done ? 'Rest over' : 'Rest';
    $('.rest-t', el).textContent = done ? 'Next set' : `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    $('.rest-bar', el).style.width = done ? '100%' : `${(1 - left / rest.total) * 100}%`;
  });
  if (done && !rest.buzzed) {
    rest.buzzed = true;
    navigator.vibrate?.([120, 80, 120]);
  }
  if (left < -8000) return stopRest();
  rest.timer = setTimeout(tickRest, 250);
}

// ---------- Toast ----------
let toastTimer;
function toast(msg, { kind = '', label = '', action, duration } = {}) {
  const t = $('#toast');
  t.className = `toast show ${kind}`;
  t.innerHTML = `<p>${label ? `<span class="t-kind">${esc(label)}</span>` : ''}<span class="t-msg"></span></p>${action ? `<button type="button" class="text-btn">${esc(action.label)}</button>` : ''}`;
  $('.t-msg', t).textContent = msg;
  if (action) $('button', t).addEventListener('click', () => { action.fn(); hideToast(); });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, duration || (kind === 'pr' ? 5000 : 3200));
}
const hideToast = () => $('#toast').classList.remove('show');

function deleteWithUndo(id) {
  const removed = store.deleteSet(id);
  if (removed) toast(`Removed ${exerciseById(removed.ex).name} ${F.setText(removed, true)}.`, { action: { label: 'Undo', fn: () => store.restoreSet(removed) }, duration: 5000 });
}

let persistAsked = false;
function askPersist() {
  if (persistAsked) return;
  persistAsked = true;
  navigator.storage?.persist?.().catch(() => {});
}

async function exportBackup() {
  const name = `novo-tracker-${F.today()}.json`;
  const file = new File([store.exportJSON()], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Novo Tracker backup' });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function importBackup(input) {
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    const next = store.parseBackup(await file.text());
    const cur = store.getState().sets.length;
    if (!confirm(`Replace your current log (${plural(cur, 'set')}) with this backup (${plural(next.sets.length, 'set')})?`)) return;
    store.replaceAll(next);
    closeSheet();
    toast(`Backup restored: ${plural(next.sets.length, 'set')}.`);
  } catch (err) {
    toast(err instanceof SyntaxError ? 'That file isn’t valid JSON.' : err.message);
  }
}

// ---------- Events ----------
const actions = {
  settings: (el) => openSettings(el.dataset.focus),
  'open-ex': (el) => openLogger(el.dataset.ex),
  'log-cat': (el) => { ui.logCat = el.dataset.cat; render(); },
  'edit-set': (el) => openEditSet(el.dataset.id),
  'edit-goal': () => openGoal(),
  'view-progress': (el) => { ui.progEx = el.dataset.ex; ui.progMetric = null; ui.progAll = false; savePrefs(); go('progress'); },
  'prog-range': (el) => { ui.progRange = el.dataset.v; ui.progAll = false; savePrefs(); render(); },
  'prog-metric': (el) => { ui.progMetric = el.dataset.v; savePrefs(); render(); },
  'prog-all': () => { ui.progAll = true; render(); },
  'open-add': () => {
    ui.addOpen = true;
    refreshSettings();
    $('input[name="name"]', sheet.root)?.focus();
  },
  'history-more': () => { ui.historyLimit += 30; render(); },
  'hide-install': () => { ui.hideInstall = true; savePrefs(); render(); },
  'rest-add': () => {
    if (rest.end < Date.now()) { rest.end = Date.now(); rest.total = 0; }
    rest.end += 30000;
    rest.total += 30000;
    rest.buzzed = false;
    tickRest();
  },
  'rest-stop': () => stopRest(),
  'set-unit': (el) => { store.setSetting('unit', el.dataset.v === 'lb' ? 'lb' : 'kg'); refreshSettings(); },
  'set-rest': (el) => { store.setSetting('rest', Number(el.dataset.v)); refreshSettings(); },
  export: () => exportBackup(),
  reset: () => {
    const n = store.getState().sets.length;
    if (!confirm(`Delete all ${plural(n, 'set')} and your custom exercises from this phone? This can’t be undone, so export a backup first if you’re unsure.`)) return;
    store.resetAll();
    stopRest();
    closeSheet();
    toast(`Deleted ${plural(n, 'set')}.`);
  },
  'del-custom': (el) => {
    const id = el.dataset.id;
    const n = store.getState().sets.filter((s) => s.ex === id).length;
    if (!confirm(`Delete ${exerciseById(id).name}${n ? ` and its ${plural(n, 'logged set')}` : ''}?`)) return;
    store.deleteCustomExercise(id);
    if (ui.progEx === id) { ui.progEx = BENCH_ID; savePrefs(); }
    refreshSettings();
  },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || !actions[el.dataset.action]) return;
  e.preventDefault();
  actions[el.dataset.action](el, e);
});

document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.id === 'prog-ex') {
    ui.progEx = t.value;
    ui.progMetric = null;
    ui.progAll = false;
    savePrefs();
    render();
  } else if (t.id === 'log-date') {
    setLogDate(t.value);
    render();
  } else if (t.id === 'import-file') {
    importBackup(t);
  }
});

document.addEventListener('submit', (e) => {
  const form = e.target.closest('[data-form="custom"]');
  if (!form) return;
  e.preventDefault();
  const data = new FormData(form);
  const name = String(data.get('name') || '').trim();
  if (!name) return toast('Give the exercise a name.');
  if (allExercises().some((x) => x.name.toLowerCase() === name.toLowerCase())) return toast(`${name} is already in your list.`);
  store.addCustomExercise({ name, cat: String(data.get('cat')), kind: data.get('kind') === 'bodyweight' ? 'bodyweight' : 'weight' });
  ui.addOpen = false;
  refreshSettings();
  toast(`Added ${name}.`);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && sheet) closeSheet();
});

// ---------- Boot ----------
function boot() {
  $('#rest').innerHTML = restInner();

  store.subscribe(scheduleRender);
  window.addEventListener('hashchange', route);
  window.addEventListener('novo:save-error', () => toast('Couldn’t save. Your phone’s storage may be full.'));

  // Charts are sized to their container, so redraw when the width actually changes.
  let width = innerWidth;
  let resizeT;
  window.addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => {
      if (innerWidth !== width) { width = innerWidth; render(); }
    }, 150);
  });

  // Coming back to the app (e.g. the next day) should show fresh dates and an accurate timer.
  let shownDay = F.today();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    tickRest();
    if (F.today() !== shownDay) { shownDay = F.today(); render(); }
  });

  route();

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('Offline mode unavailable', err));
  }
}

boot();
