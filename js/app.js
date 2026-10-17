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
const daysSince = (d) => Math.round((F.parseDay(F.today()) - F.parseDay(d)) / 864e5);
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
// Station number: each exercise's fixed position in the full list, like a numbered machine.
const stationNo = (exId) => String(allExercises().findIndex((e) => e.id === exId) + 1).padStart(2, '0');

const sec = (title, link = '') => `<div class="sec"><h2>${esc(title)}</h2>${link}</div>`;

const head = (kicker, title, lede = '') => `
  <header class="head">
    <p class="kicker">${esc(kicker)}</p>
    <h1>${title}</h1>
    ${lede ? `<p class="lede">${lede}</p>` : ''}
  </header>`;

const opts = (action, options, current, label) => `
  <div class="opts" role="radiogroup" aria-label="${esc(label)}">
    ${options.map(([v, t]) => `<button type="button" role="radio" aria-checked="${String(v) === String(current)}" data-action="${action}" data-v="${esc(v)}">${esc(t)}</button>`).join('')}
  </div>`;

const dateButton = (d, id) => `
  <label class="date-btn"><span>${esc(F.dayLabel(d))}</span><em>Change</em>
    <input type="date" id="${id}" value="${d}" max="${F.today()}" aria-label="Workout date">
  </label>`;

const dial = (id, kind, label, unitLabel, value, hint = '') => {
  const step = kind === 'r' ? '1' : F.num(F.stepSize(), 1);
  return `
  <div class="dial dial-${kind}">
    <label for="${id}">${esc(label)}<span>${esc(unitLabel)}</span></label>
    <input id="${id}" class="dial-n" type="text" inputmode="${kind === 'r' ? 'numeric' : 'decimal'}" autocomplete="off" enterkeyhint="${kind === 'r' ? 'done' : 'next'}" value="${esc(value)}">
    <div class="dial-steps">
      <button type="button" data-step="${id}" data-kind="${kind}" data-dir="-1" aria-label="${esc(label)} minus ${step}">−${step}</button>
      <button type="button" data-step="${id}" data-kind="${kind}" data-dir="1" aria-label="${esc(label)} plus ${step}">+${step}</button>
    </div>
    ${hint ? `<p class="dial-hint">${esc(hint)}</p>` : ''}
  </div>`;
};

function wireDials(root, onChange) {
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-step]');
    if (!b) return;
    const input = root.querySelector(`#${b.dataset.step}`);
    const reps = b.dataset.kind === 'r';
    const cur = parseNum(input.value);
    const next = (Number.isFinite(cur) ? cur : 0) + (reps ? 1 : F.stepSize()) * Number(b.dataset.dir);
    input.value = reps ? String(Math.max(1, Math.round(next))) : String(Math.max(0, Math.round(next * 100) / 100));
    onChange?.();
  });
  root.addEventListener('input', (e) => { if (e.target.matches('.dial-n')) onChange?.(); });
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

// Bench goal as a row of 10 kg (20 lb) blocks, filled up to the current estimated 1RM.
function goalStack(val, goal) {
  const step = F.unit() === 'lb' ? 20 : 10;
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
  return `
    <div class="stack" role="meter" aria-label="Estimated 1RM against goal" aria-valuemin="0" aria-valuemax="${g.toFixed(1)}" aria-valuenow="${v.toFixed(1)}">${blocks.join('')}</div>
    <p class="stack-scale"><span>0</span><span>Each block ${step} ${F.unit()}</span><span>${F.num(g, 1)}</span></p>`;
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
    <p>To install: tap <b>Share</b> in Safari, then <b>Add to Home Screen</b>. It opens full screen and keeps working when the gym signal drops.</p>
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
  const prs = S.prMap();

  let lede;
  if (todayDay) lede = `<b>${plural(todayDay.sets.length, 'set')}</b> logged so far today: ${esc(exerciseNames([...todayDay.groups.keys()]))}.`;
  else if (lastDay) lede = `Last trained <b>${esc(F.ago(lastDay.d))}</b>: ${esc(exerciseNames([...lastDay.groups.keys()]))}.`;
  else lede = 'Nothing logged yet. Tap <b>Log</b>, pick an exercise and enter your first set. Everything else on this screen builds from that.';

  const letters = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const due = allExercises()
    .map((ex) => {
      const sets = S.setsOf(ex.id);
      return sets.length ? { ex, last: sets[sets.length - 1], days: daysSince(sets[sets.length - 1].d) } : null;
    })
    .filter((x) => x && x.days > 0)
    .sort((a, b) => b.days - a.days)
    .slice(0, 4);

  return `
  <div class="mast">
    <div class="brand" aria-label="Novo Tracker, Welling"><span class="brand-block">NOVO</span><span class="brand-txt">Tracker<br>Welling</span></div>
    <button type="button" class="text-btn" data-action="settings">Settings</button>
  </div>
  ${head(F.parseDay(t).toLocaleDateString('en-GB', { weekday: 'long' }), esc(F.parseDay(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })), lede)}
  ${installNotice()}
  <a class="act" href="#log"><span>${todayDay ? 'Carry on logging' : 'Log a workout'}</span>${todayDay ? `<small>${plural(todayDay.sets.length, 'set')} today</small>` : ''}</a>

  <section class="block">
    ${sec('This week', streak > 1 ? `<span class="sec-note">${streak} weeks in a row</span>` : '')}
    <ol class="week">
      ${wk.days.map((d, i) => `<li class="${wk.trained.has(d) ? 'on' : ''}${d === t ? ' today' : ''}" aria-label="${esc(longDate(d))}${wk.trained.has(d) ? ', trained' : ''}"><span class="wk-d">${letters[i]}</span><span class="wk-n">${F.parseDay(d).getDate()}</span></li>`).join('')}
    </ol>
    <p class="week-sum">${wk.sets
      ? `<b>${plural(wk.trained.size, 'session')}</b>, <b>${plural(wk.sets, 'set')}</b> and <b>${F.whole(wk.volume)} ${F.unit()}</b> moved since Monday.`
      : 'No sessions since Monday yet.'}</p>
  </section>

  ${benchBlock()}

  ${due.length ? `
  <section class="block">
    ${sec('Longest since you trained')}
    <ul class="rows">
      ${due.map(({ ex, last, days: n }) => `
        <li><button type="button" class="row" data-action="open-ex" data-ex="${esc(ex.id)}">
          <span class="row-no">${stationNo(ex.id)}</span>
          <span><span class="row-name">${esc(ex.name)}</span><span class="row-meta">Last: ${esc(F.setText(last, true))} on ${esc(F.shortDate(last.d))}</span></span>
          <span class="row-val">${n}<small>${n === 1 ? 'day' : 'days'}</small></span>
        </button></li>`).join('')}
    </ul>
  </section>` : ''}

  ${days.length ? `
  <section class="block">
    ${sec('Recent sessions', '<a href="#history">History</a>')}
    ${days.slice(0, 2).map((d) => dayBlock(d, prs)).join('')}
  </section>` : ''}`;
}

function benchBlock() {
  const b = S.bestsOf(BENCH_ID);
  const goal = store.getState().settings.benchGoal;
  if (!b) {
    return `
    <section class="block">
      ${sec('Bench press')}
      <p class="note">No bench sets yet. Your estimated 1RM, heaviest set and goal progress appear here after the first one.</p>
      <button type="button" class="btn" data-action="open-ex" data-ex="${BENCH_ID}">Log flat bench press</button>
    </section>`;
  }
  return `
  <section class="block">
    ${sec('Bench press', '<a href="#prs">Records</a>')}
    <p class="figure"><span class="fig-n">${F.w(b.e1rm)}</span><span class="fig-u">${F.unit()}</span><span class="fig-l">est. 1RM</span></p>
    <p class="fig-src">From ${esc(F.setText(b.est, true))} ${esc(F.onDay(b.est.d))}.</p>
    <dl class="facts">
      <div><dt>Heaviest set</dt><dd>${esc(F.setText(b.heavy, true))}</dd><dd class="when">${esc(F.shortDate(b.heavy.d))}</dd></div>
      ${goal ? `<div><dt>Goal</dt><dd>${esc(F.wu(goal))}</dd><dd class="when">${b.e1rm >= goal ? 'reached' : `${esc(F.wu(goal - b.e1rm))} to go`}</dd></div>` : ''}
    </dl>
    ${goal ? goalStack(b.e1rm, goal) : `<p class="note">No goal set. <button type="button" class="text-btn inline" data-action="edit-goal">Set a bench goal</button></p>`}
  </section>`;
}

function viewLog() {
  const d = logDate();
  const cats = ['All', ...categories()];
  const list = allExercises().filter((e) => ui.logCat === 'All' || e.cat === ui.logCat);
  const daySets = store.getState().sets.filter((s) => s.d === d);
  const day = S.trainingDays().find((x) => x.d === d);
  const lede = day
    ? `<b>${plural(day.sets.length, 'set')}</b> and <b>${F.whole(day.volume)} ${F.unit()}</b> logged${d === F.today() ? ' so far' : ''}.`
    : `Nothing logged ${d === F.today() ? 'yet today' : 'on this day'}. Pick an exercise below.`;
  return `
  ${head('Log', esc(longDate(d)), lede)}
  <div class="head-tools">${dateButton(d, 'log-date')}</div>
  ${day ? `<section class="block block-tight">${sec(d === F.today() ? 'Logged today' : 'Logged on this day')}${dayBlock(day, S.prMap())}</section>` : ''}
  <section class="block">
    ${sec('Exercises', `<span class="sec-note">${plural(list.length, 'exercise')}</span>`)}
    <div class="filters" role="tablist" aria-label="Muscle group">
      ${cats.map((c) => `<button type="button" role="tab" aria-selected="${c === ui.logCat}" data-action="log-cat" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}
    </div>
    <ul class="rows">
      ${list.map((ex) => {
        const n = daySets.filter((s) => s.ex === ex.id).length;
        const last = S.lastSessionBefore(ex.id, d);
        return `
        <li><button type="button" class="row" data-action="open-ex" data-ex="${esc(ex.id)}">
          <span class="row-no">${stationNo(ex.id)}</span>
          <span><span class="row-name">${esc(ex.name)}</span><span class="row-meta">${esc(ex.cat)} · ${esc(ex.equip)}</span></span>
          ${n
            ? `<span class="row-val hot">${plural(n, 'set')}<small>${d === F.today() ? 'today' : 'this day'}</small></span>`
            : last
              ? `<span class="row-val">${esc(F.setText(last.top))}<small>${esc(F.ago(last.d))}</small></span>`
              : '<span class="row-val dim">new<small>not logged</small></span>'}
        </button></li>`;
      }).join('')}
    </ul>
    <button type="button" class="text-btn" data-action="settings" data-focus="custom">Add an exercise that isn’t listed</button>
  </section>`;
}

function trendLede(ex, m, sess, vals, range) {
  const u = m.unit ? ` ${F.unit()}` : ' reps';
  const span = range[3] ? `in ${range[3]}` : F.sinceDay(sess[0].d);
  if (vals.length === 1) {
    return `One ${esc(ex.name)} session ${esc(span)}: ${esc(m.label.toLowerCase())} <b>${m.fmt(vals[0])}${u}</b> ${esc(F.onDay(sess[0].d))}. Log another to see a trend.`;
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
  const u = m.unit ? F.unit() : 'reps';

  const options = categories().map((c) => {
    const exs = allExercises().filter((e) => e.cat === c);
    return exs.length ? `<optgroup label="${esc(c)}">${exs.map((e) => `<option value="${esc(e.id)}"${e.id === ex.id ? ' selected' : ''}>${esc(e.name)}</option>`).join('')}</optgroup>` : '';
  }).join('');

  let lede;
  let body;
  if (!sess.length) {
    lede = all.length
      ? `No ${esc(ex.name)} sessions in ${esc(range[3] || 'this range')}. The last one was ${esc(F.ago(all[all.length - 1].d))}; try a longer range.`
      : `You haven’t logged ${esc(ex.name)} yet. After a couple of sessions this page charts it.`;
    body = `<button type="button" class="btn" data-action="open-ex" data-ex="${esc(ex.id)}">Log ${esc(ex.name)}</button>`;
  } else {
    lede = trendLede(ex, m, sess, vals, range);
    let bestI = 0;
    vals.forEach((v, i) => { if (v >= vals[bestI]) bestI = i; });
    const pick = (s) => (bw ? s.maxRep : m.id === 'e1rm' ? s.e1rmSet : s.top);
    const latest = sess[sess.length - 1];
    body = `
    <div class="chart" id="prog-chart"></div>
    <dl class="facts">
      <div><dt>Latest</dt><dd>${m.fmt(vals[vals.length - 1])} <small>${u}</small></dd><dd class="when">${esc(F.setText(pick(latest), true))}, ${esc(F.shortDate(latest.d))}</dd></div>
      <div><dt>Best</dt><dd>${m.fmt(vals[bestI])} <small>${u}</small></dd><dd class="when">${esc(F.setText(pick(sess[bestI]), true))}, ${esc(F.shortDate(sess[bestI].d))}</dd></div>
      ${sess.length > 1 ? `<div><dt>First in range</dt><dd>${m.fmt(vals[0])} <small>${u}</small></dd><dd class="when">${esc(F.setText(pick(sess[0]), true))}, ${esc(F.shortDate(sess[0].d))}</dd></div>` : ''}
    </dl>
    <section class="block">
      ${sec('Every session', `<span class="sec-note">${plural(sess.length, 'session')}</span>`)}
      <table class="log">
        <thead><tr><th>Date</th><th>${bw ? 'Best set' : 'Top set'}</th><th class="r">${bw ? 'Reps' : 'e1RM'}</th><th class="r">${bw ? 'Sets' : `Vol. ${F.unit()}`}</th></tr></thead>
        <tbody>${sess.slice(-40).reverse().map((s) => `<tr>
          <td class="dim">${esc(F.shortDate(s.d))}</td>
          <td class="num">${esc(F.setText(bw ? s.maxRep : s.top))}</td>
          <td class="r">${bw ? s.reps : F.w(s.e1rm)}</td>
          <td class="r">${bw ? s.sets.length : F.whole(s.volume)}</td></tr>`).join('')}</tbody>
      </table>
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
    <p class="kicker">Progress</p>
    <label class="pick"><span class="vh">Exercise</span>
      <select id="prog-ex">${options}</select><span class="pick-cue">Change</span>
    </label>
    <p class="lede">${lede}</p>
  </header>
  ${opts('prog-range', RANGES.map((r) => [r[0], r[1]]), range[0], 'Time range')}
  ${opts('prog-metric', metrics.map((x) => [x.id, x.label]), m.id, 'Measure')}
  ${body}`;
}

function viewPRs() {
  const b = S.bestsOf(BENCH_ID);
  const goal = store.getState().settings.benchGoal;
  const u = F.unit();
  let bench;
  if (!b) {
    bench = `
    ${head('Records', 'Bench press', 'No bench sets logged yet. Your first set becomes the baseline; every heavier set or higher estimated 1RM after it is a record.')}
    <button type="button" class="act" data-action="open-ex" data-ex="${BENCH_ID}"><span>Log flat bench press</span><small>${stationNo(BENCH_ID)}</small></button>`;
  } else {
    const timeline = S.prTimeline(BENCH_ID).slice(0, 12);
    const firstSet = S.setsOf(BENCH_ID)[0];
    const sessions = S.sessionsOf(BENCH_ID);
    bench = `
    ${head('Records', 'Bench press', `<b>${plural(b.days, 'session')}</b> and <b>${plural(b.count, 'set')}</b> ${esc(F.sinceDay(firstSet.d))}. Last benched ${esc(F.ago(b.last.d))}.`)}
    <p class="figure"><span class="fig-n">${F.w(b.e1rm)}</span><span class="fig-u">${u}</span><span class="fig-l">est. 1RM</span></p>
    <p class="fig-src">Epley estimate from ${esc(F.setText(b.est, true))} ${esc(F.onDay(b.est.d))}.</p>
    <dl class="facts">
      <div><dt>Heaviest set</dt><dd>${esc(F.setText(b.heavy, true))}</dd><dd class="when">${esc(F.shortDate(b.heavy.d))}</dd></div>
      <div><dt>Goal</dt>${goal
        ? `<dd>${esc(F.wu(goal))}</dd><dd class="when"><button type="button" class="text-btn inline" data-action="edit-goal">Edit</button></dd>`
        : `<dd class="none">not set</dd><dd class="when"><button type="button" class="text-btn inline" data-action="edit-goal">Set one</button></dd>`}</div>
    </dl>
    ${goal ? `${goalStack(b.e1rm, goal)}<p class="note">${b.e1rm >= goal ? `Goal reached. Your estimate is ${esc(F.wu(b.e1rm - goal))} past it.` : `${esc(F.wu(goal - b.e1rm))} to go on your estimated 1RM.`}</p>` : ''}

    <section class="block">
      ${sec('Rep maxes')}
      <table class="log">
        <thead><tr><th>Reps</th><th>Heaviest for that many</th><th class="r">Date</th></tr></thead>
        <tbody>${S.repMaxes(BENCH_ID).map(({ n, set }) => `<tr>
          <td>${n}+</td><td class="num">${set ? esc(F.setText(set, true)) : '<span class="dim">none yet</span>'}</td><td class="r dim">${set ? esc(F.shortDate(set.d)) : ''}</td></tr>`).join('')}</tbody>
      </table>
    </section>

    <section class="block">
      ${sec('Estimated 1RM by session', `<span class="sec-note">${u}</span>`)}
      <div class="chart" id="bench-chart"></div>
    </section>

    <section class="block">
      ${sec('Record history', `<span class="sec-note">newest first</span>`)}
      <table class="log">
        <thead><tr><th>Date</th><th>Set</th><th class="r">e1RM</th><th class="r">Gain</th></tr></thead>
        <tbody>${timeline.map(({ set, kinds, prev, e1rm }) => {
          const gain = kinds[0] === 'first'
            ? 'first set'
            : kinds.map((k) => (k === 'weight' ? `+${F.w(set.w - prev.w)} top` : `+${F.w(e1rm - prev.e)} e1RM`)).join(', ');
          return `<tr><td class="dim">${esc(F.shortDate(set.d))}</td><td class="num">${esc(F.setText(set))}</td><td class="r">${F.w(e1rm)}</td><td class="r gain">${esc(gain)}</td></tr>`;
        }).join('')}</tbody>
      </table>
    </section>`;
    onMount(() => lineChart($('#bench-chart'), sessions.map((s) => ({ x: F.parseDay(s.d).getTime(), y: F.toDisplay(s.e1rm), sub: `From ${F.setText(s.e1rmSet, true)}` })), {
      tick: (v) => F.num(v, 1),
      value: (v) => `${F.num(v, 1)} ${u}`,
      label: 'Bench press estimated one-rep max by session',
    }));
  }

  return `
  ${bench}
  <section class="block">
    ${sec('Every exercise', '<span class="sec-note">tap for progress</span>')}
    <ul class="rows">
      ${allExercises().map((ex) => {
        const best = S.bestsOf(ex.id);
        const bw = ex.kind === 'bodyweight';
        const meta = !best ? 'Not logged yet' : bw ? `Most reps ${F.setText(best.reps, true)}, ${F.shortDate(best.reps.d)}` : `Est. 1RM ${F.wu(best.e1rm)}, ${F.shortDate(best.est.d)}`;
        const val = !best ? '<span class="row-val dim">none</span>' : bw
          ? `<span class="row-val">${best.reps.r}<small>reps</small></span>`
          : `<span class="row-val">${esc(F.setText(best.heavy))}<small>heaviest</small></span>`;
        return `
        <li><button type="button" class="row" data-action="view-progress" data-ex="${esc(ex.id)}">
          <span class="row-no">${stationNo(ex.id)}</span>
          <span><span class="row-name">${esc(ex.name)}</span><span class="row-meta">${esc(meta)}</span></span>
          ${val}
        </button></li>`;
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
    ${head('History', 'No sessions yet', 'Each day you train appears here with every set, newest first. Tap a set later to fix a typo or delete it.')}
    <a class="act" href="#log"><span>Log a workout</span></a>`;
  }
  let html = '';
  let month = '';
  for (const day of days.slice(0, ui.historyLimit)) {
    const ml = F.monthLabel(day.d);
    if (ml !== month) {
      month = ml;
      const inMonth = days.filter((d) => F.monthLabel(d.d) === ml).length;
      html += `<section class="block block-month">${sec(ml, `<span class="sec-note">${plural(inMonth, 'session')}</span>`)}`;
    }
    html += dayBlock(day, prs);
    const next = days[days.indexOf(day) + 1];
    if (!next || F.monthLabel(next.d) !== ml || days.indexOf(day) + 1 >= ui.historyLimit) html += '</section>';
  }
  return `
  ${head('History', esc(plural(days.length, 'session')), `<b>${plural(total, 'set')}</b> ${esc(F.sinceDay(days[days.length - 1].d))}. Tap any set to edit or delete it.`)}
  ${html}
  ${days.length > ui.historyLimit ? `<button type="button" class="btn" data-action="history-more">Show ${Math.min(30, days.length - ui.historyLimit)} older sessions</button>` : ''}`;
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
  let d = logDate();
  let freshId = null;
  const ref = S.setsOn(exId, d).at(-1) || S.lastSessionBefore(exId, d)?.top;
  const body = `
    <div class="lg-top">${dateButton(d, 'lg-date')}<span class="lg-est" aria-live="polite"></span></div>
    <div class="lg-last"></div>
    <div class="dials">
      ${dial('lg-w', 'w', bw ? 'Added' : 'Weight', F.unit(), ref ? inputW(ref.w) : bw ? '0' : '', ex.hint)}
      ${dial('lg-r', 'r', 'Reps', '', ref ? ref.r : 8)}
    </div>
    <button type="button" class="act lg-submit"><span class="lg-label">Log set</span><small class="lg-count"></small></button>
    <div class="rest rest-inline rest-ui" role="timer" aria-label="Rest timer" hidden>${restInner()}</div>
    <div class="lg-sets-head"></div>
    <ol class="today-sets"></ol>`;

  openSheet({
    title: ex.name,
    sub: `${stationNo(ex.id)} · ${ex.cat} · ${ex.equip}`,
    body,
    cls: 'sheet-tall',
    kind: 'logger',
    onMount(root) {
      const $w = $('#lg-w', root);
      const $r = $('#lg-r', root);
      const $btn = $('.lg-submit', root);
      let flash;

      const refresh = () => {
        const sets = S.setsOn(exId, d);
        const prs = S.prMap();
        const last = S.lastSessionBefore(exId, d);
        const best = S.bestsOf(exId);
        $('.date-btn span', root).textContent = F.dayLabel(d);
        $('.lg-count', root).textContent = `set ${sets.length + 1}`;
        $('.lg-last', root).innerHTML = last
          ? `${sec(`Last time · ${F.dayLabel(last.d)}`, '<span class="sec-note">tap a set to copy it</span>')}
             <div class="sets">${last.sets.map((s) => `<button type="button" class="set" data-fill="${esc(s.id)}">${esc(F.setText(s))}</button>`).join('')}</div>`
          : `<p class="note">First ${esc(ex.name)} session${d === F.today() ? '' : ' before this date'}. Whatever you log now is the baseline the next session is compared against.</p>`;
        $('.lg-sets-head', root).innerHTML = sec(d === F.today() ? 'Today' : F.dayLabel(d), sets.length && last ? '<span class="sec-note">vs same set last time</span>' : '');
        $('.today-sets', root).innerHTML = sets.length
          ? sets.map((s, i) => {
              const v = versus(s, last?.sets[i]);
              return `
              <li${s.id === freshId ? ' class="fresh"' : ''}>
                <span class="ts-n">${i + 1}</span>
                <span class="ts-set">${esc(F.setText(s, true))}${prs.has(s.id) ? '<span class="pr-tag">PR</span>' : ''}${bw ? '' : `<small>e1RM ${F.w(S.e1rm(s.w, s.r))}</small>`}</span>
                <span class="ts-cmp ${v.cls}">${esc(v.text)}</span>
                <button type="button" class="text-btn small" data-del="${esc(s.id)}" aria-label="Remove set ${i + 1}">Remove</button>
              </li>`;
            }).join('')
          : `<li class="empty">No sets ${d === F.today() ? 'yet today' : 'on this day'}.</li>`;
        const w = parseNum($w.value);
        const r = parseNum($r.value);
        const est = !bw && w > 0 && Number.isInteger(r) && r > 0 ? S.e1rm(F.fromDisplay(w), r) : 0;
        $('.lg-est', root).innerHTML = est
          ? `e1RM <b>${esc(F.w(est))}</b>${best && best.e1rm > 0 ? ` <span>/ best ${esc(F.w(best.e1rm))}</span>` : ''}`
          : '';
      };

      const submit = () => {
        const v = readSet($w, $r);
        if (!v) return;
        const before = S.bestsOf(exId);
        const set = store.addSet({ ex: exId, ...v, d });
        freshId = set.id;
        askPersist();
        const kinds = S.prMap().get(set.id);
        if (kinds && before) {
          const parts = kinds.map((k) => (k === 'weight'
            ? `Previous heaviest ${F.setText(before.heavy, true)}.`
            : k === 'reps' ? `Previous most reps ${before.reps.r}.` : `Est. 1RM up from ${F.wu(before.e1rm)} to ${F.wu(S.e1rm(set.w, set.r))}.`));
          toast(`${ex.name} ${F.setText(set, true)}. ${parts.join(' ')}`, { kind: 'pr', label: 'Record' });
        }
        $btn.classList.add('logged');
        $('.lg-label', $btn).textContent = `Logged ${F.setText(set, true)}`;
        clearTimeout(flash);
        flash = setTimeout(() => {
          $btn.classList.remove('logged');
          $('.lg-label', $btn).textContent = 'Log set';
        }, 1300);
        startRest(store.getState().settings.rest);
      };

      wireDials(root, refresh);
      $btn.addEventListener('click', submit);
      $w.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $r.focus(); } });
      $r.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $r.blur(); submit(); } });
      $('#lg-date', root).addEventListener('change', (e) => {
        d = e.target.value && e.target.value <= F.today() ? e.target.value : F.today();
        setLogDate(d);
        refresh();
      });
      root.addEventListener('click', (e) => {
        const fill = e.target.closest('[data-fill]');
        if (fill) {
          const s = store.getState().sets.find((x) => x.id === fill.dataset.fill);
          if (s) { $w.value = inputW(s.w); $r.value = String(s.r); refresh(); }
        }
        const del = e.target.closest('[data-del]');
        if (del) deleteWithUndo(del.dataset.del);
      });
      const unsub = store.subscribe(refresh);
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
    sub: `${ex.name} · ${F.dayLabel(s.d)} · logged as ${F.setText(s, true)}`,
    body: `
      <div class="dials">
        ${dial('es-w', 'w', bw ? 'Added' : 'Weight', F.unit(), inputW(s.w))}
        ${dial('es-r', 'r', 'Reps', '', s.r)}
      </div>
      <label class="field"><span>Date</span><input class="input" type="date" id="es-d" value="${s.d}" max="${F.today()}"></label>
      <button type="button" class="act" id="es-save"><span>Save changes</span></button>
      <button type="button" class="btn btn-danger" id="es-del">Delete this set</button>`,
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
    title: 'Bench press goal',
    sub: b ? `Your estimated 1RM is ${F.wu(b.e1rm)}.` : 'Measured against your estimated 1RM.',
    body: `
      <div class="dials dials-one">${dial('goal-w', 'w', 'Goal', F.unit(), start ? inputW(start) : '')}</div>
      <button type="button" class="act" id="goal-save"><span>Save goal</span></button>
      ${benchGoal ? '<button type="button" class="btn" id="goal-clear">Remove goal</button>' : ''}`,
    onMount(root) {
      wireDials(root);
      $('#goal-save', root).addEventListener('click', () => {
        const input = $('#goal-w', root);
        const v = parseNum(input.value);
        if (!(v > 0)) return invalid(input, 'Enter a goal above 0.');
        store.setSetting('benchGoal', F.fromDisplay(v));
        closeSheet();
        refreshSettings();
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
      <p class="note">Steppers move in ${unit === 'lb' ? '5 lb' : '2.5 kg'} jumps. Everything is stored in kilograms, so switching never loses precision.</p>
    </section>
    <section class="set-group">
      ${sec('Rest timer')}
      ${opts('set-rest', [[0, 'Off'], [60, '1:00'], [90, '1:30'], [120, '2:00'], [180, '3:00']], rest, 'Rest timer')}
      <p class="note">Starts when you log a set.</p>
    </section>
    <section class="set-group">
      ${sec('Bench press goal')}
      <button type="button" class="row row-plain" data-action="edit-goal">
        <span><span class="row-name">Estimated 1RM goal</span><span class="row-meta">Shown on Today and Records</span></span>
        <span class="row-val">${benchGoal ? esc(F.wu(benchGoal)) : '<span class="dim">not set</span>'}</span>
      </button>
    </section>
    <section class="set-group" id="custom">
      ${sec('Your own exercises', st.custom.length ? `<span class="sec-note">${st.custom.length}</span>` : '')}
      ${st.custom.length ? `<ul class="rows">${st.custom.map((c) => `
        <li class="row row-static">
          <span class="row-no">${stationNo(c.id)}</span>
          <span><span class="row-name">${esc(c.name)}</span><span class="row-meta">${esc(c.cat)} · ${c.kind === 'bodyweight' ? 'bodyweight' : 'weighted'}</span></span>
          <button type="button" class="text-btn small" data-action="del-custom" data-id="${esc(c.id)}">Delete</button>
        </li>`).join('')}</ul>` : ''}
      <form class="add-form" data-form="custom">
        <label class="field"><span>Name</span><input class="input" name="name" placeholder="e.g. Leg Press" maxlength="40" required autocomplete="off"></label>
        <div class="row2">
          <label class="field"><span>Muscle group</span><select class="input" name="cat">${[...CATEGORIES, 'Legs', 'Core', 'Other'].map((c) => `<option>${c}</option>`).join('')}</select></label>
          <label class="field"><span>Load</span><select class="input" name="kind"><option value="weight">Weighted</option><option value="bodyweight">Bodyweight</option></select></label>
        </div>
        <button class="btn">Add exercise</button>
      </form>
    </section>
    <section class="set-group">
      ${sec('Backup')}
      <p class="note">Your ${plural(st.sets.length, 'set')} live on this phone only. Export a copy now and then, and before switching phones.</p>
      <div class="btn-pair">
        <button type="button" class="btn" data-action="export">Export file</button>
        <label class="btn">Import file<input class="vh" type="file" accept=".json,application/json" id="import-file"></label>
      </div>
    </section>
    <section class="set-group">
      ${sec('Reset')}
      <button type="button" class="btn btn-danger" data-action="reset">Delete all data on this phone</button>
    </section>
    <p class="about">Novo Tracker is an unofficial personal log, styled after Novo Gym Welling. It keeps working offline once installed.</p>`;
}

function openSettings(focus) {
  openSheet({ title: 'Settings', body: settingsBody(), cls: 'sheet-tall', kind: 'settings' });
  if (focus) requestAnimationFrame(() => $(`#${focus}`, sheet.root)?.scrollIntoView({ block: 'start' }));
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
  'view-progress': (el) => { ui.progEx = el.dataset.ex; ui.progMetric = null; savePrefs(); go('progress'); },
  'prog-range': (el) => { ui.progRange = el.dataset.v; savePrefs(); render(); },
  'prog-metric': (el) => { ui.progMetric = el.dataset.v; savePrefs(); render(); },
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
  const ex = store.addCustomExercise({ name, cat: String(data.get('cat')), kind: data.get('kind') === 'bodyweight' ? 'bodyweight' : 'weight' });
  refreshSettings();
  toast(`Added ${name} as station ${stationNo(ex.id)}.`);
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
