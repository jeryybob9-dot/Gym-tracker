import * as store from './store.js';
import * as S from './stats.js';
import * as F from './format.js';
import { allExercises, exerciseById, categories, CATEGORIES, BENCH_ID } from './exercises.js';
import { lineChart } from './chart.js';
import { icon } from './icons.js';

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const parseNum = (v) => {
  const n = parseFloat(String(v).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};
// Plain number for an <input>, in the user's unit, no thousands separators.
const inputW = (kg) => String(Math.round(F.toDisplay(kg) * 100) / 100);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

const TABS = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'progress', label: 'Progress', icon: 'chart' },
  { id: 'log', label: 'Log', icon: 'plus', center: true },
  { id: 'prs', label: 'PRs', icon: 'trophy' },
  { id: 'history', label: 'History', icon: 'clock' },
];
const CAT_TINT = { Back: 'cyan', Biceps: 'orange', Triceps: 'pink', Chest: 'blue', Shoulders: 'violet' };

const METRICS = {
  weight: [
    { id: 'top', label: 'Top set', get: (s) => s.top.w, fmt: F.w, unit: true, sub: (s) => `Top set ${F.setText(s.top, true)}` },
    { id: 'e1rm', label: 'Est. 1RM', get: (s) => s.e1rm, fmt: F.w, unit: true, sub: (s) => `From ${F.setText(s.e1rmSet, true)}` },
    { id: 'volume', label: 'Volume', get: (s) => s.volume, fmt: F.compact, unit: true, sub: (s) => `${plural(s.sets.length, 'set')} · ${s.reps} reps` },
  ],
  bodyweight: [
    { id: 'reps', label: 'Max reps', get: (s) => s.maxRep.r, fmt: (v) => F.num(v, 0), unit: false, sub: (s) => `Best set ${F.setText(s.maxRep, true)}` },
    { id: 'added', label: 'Added weight', get: (s) => s.top.w, fmt: F.w, unit: true, sub: (s) => `Heaviest ${F.setText(s.top, true)}` },
    { id: 'total', label: 'Total reps', get: (s) => s.reps, fmt: (v) => F.num(v, 0), unit: false, sub: (s) => plural(s.sets.length, 'set') },
  ],
};
const RANGES = [['1m', '1M', 30], ['3m', '3M', 91], ['6m', '6M', 182], ['1y', '1Y', 365], ['all', 'All', Infinity]];

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

// ---------- Shared bits ----------
const tintOf = (ex) => `tint-${CAT_TINT[ex.cat] || 'orange'}`;
const exIcon = (ex) => `<span class="ex-ico ${tintOf(ex)}">${icon(ex.kind === 'bodyweight' ? 'bolt' : 'dumbbell')}</span>`;

const wordmark = () => `
  <div class="brand" role="img" aria-label="Novo Tracker, Welling">
    <span class="wm">NOVO</span>
    <span class="wm-bars" aria-hidden="true"><i></i><i></i><i></i></span>
    <span class="wm-sub" aria-hidden="true">Tracker<em>Welling</em></span>
  </div>`;

const datePicker = (d, id) => `
  <label class="date-pill">${icon('calendar')}<span>${esc(F.dayLabel(d))}</span>
    <input type="date" id="${id}" value="${d}" max="${F.today()}" aria-label="Workout date">
  </label>`;

const seg = (action, options, current, label) => `
  <div class="seg" role="radiogroup" aria-label="${esc(label)}">
    ${options.map(([v, text]) => `<button type="button" role="radio" aria-checked="${String(v) === String(current)}" data-action="${action}" data-v="${esc(v)}">${esc(text)}</button>`).join('')}
  </div>`;

const stepperHTML = (id, kind, label, value, hint = '') => `
  <div class="stepper">
    <label class="stepper-label" for="${id}">${esc(label)}</label>
    <div class="stepper-row">
      <button type="button" class="step" data-step="${id}" data-kind="${kind}" data-dir="-1" aria-label="Decrease ${esc(label)}">${icon('minus')}</button>
      <input id="${id}" class="step-input" type="text" inputmode="${kind === 'r' ? 'numeric' : 'decimal'}" autocomplete="off" enterkeyhint="${kind === 'r' ? 'done' : 'next'}" value="${esc(value)}">
      <button type="button" class="step" data-step="${id}" data-kind="${kind}" data-dir="1" aria-label="Increase ${esc(label)}">${icon('plus')}</button>
    </div>
    ${hint ? `<p class="stepper-hint">${esc(hint)}</p>` : ''}
  </div>`;

function wireSteppers(root, onChange) {
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
  root.addEventListener('input', (e) => { if (e.target.matches('.step-input')) onChange?.(); });
}

function invalid(input, msg) {
  input.closest('.stepper')?.classList.remove('shake');
  void input.offsetWidth;
  input.closest('.stepper')?.classList.add('shake');
  toast(msg);
}

function readSet(wInput, rInput) {
  const w = parseNum(wInput.value);
  const r = parseNum(rInput.value);
  if (!Number.isFinite(w) || w < 0) return invalid(wInput, 'Enter a weight (0 or more)');
  if (!Number.isInteger(r) || r < 1) return invalid(rInput, 'Reps must be a whole number');
  return { w: F.fromDisplay(w), r };
}

function goalMeter(val, goal) {
  const pct = Math.min(100, (val / goal) * 100);
  const left = goal - val;
  return `
    <div class="meter" role="meter" aria-label="Progress to bench goal" aria-valuemin="0" aria-valuemax="${goal.toFixed(1)}" aria-valuenow="${val.toFixed(1)}"><i style="width:${pct.toFixed(1)}%"></i></div>
    <div class="meter-foot"><span>${left > 0.05 ? `${F.wu(left)} to go` : 'Goal smashed — set a new one'}</span><span>Goal ${F.wu(goal)}</span></div>`;
}

function dayCard(day, prs) {
  const groups = [...day.groups];
  return `
  <article class="card day">
    <header class="day-head">
      <h3>${esc(F.dayLabel(day.d))}</h3>
      <p>${plural(day.sets.length, 'set')} · ${F.compact(day.volume)} ${F.unit()}</p>
    </header>
    ${groups.map(([exId, sets]) => `
      <div class="day-ex">
        <div class="day-ex-name">${esc(exerciseById(exId).name)}</div>
        <div class="set-chips">${sets.map((s) => `<button type="button" class="set-chip${prs.has(s.id) ? ' is-pr' : ''}" data-action="edit-set" data-id="${esc(s.id)}" aria-label="Edit set ${esc(F.setText(s, true))}">${esc(F.setText(s))}${prs.has(s.id) ? '<b>PR</b>' : ''}</button>`).join('')}</div>
      </div>`).join('')}
  </article>`;
}

function installHint() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  if (!ios || standalone || ui.hideInstall) return '';
  return `
  <section class="card install">
    <span class="install-ico">${icon('share')}</span>
    <p><b>Add to your Home Screen</b><br>Tap <b>Share</b>, then <b>Add to Home Screen</b> for a full-screen app that works offline.</p>
    <button type="button" class="icon-btn sm" data-action="hide-install" aria-label="Dismiss">${icon('x')}</button>
  </section>`;
}

// ---------- Views ----------
let mounts = [];
const onMount = (fn) => mounts.push(fn);

function viewHome() {
  const wk = S.weekSummary();
  const streak = S.weekStreak();
  const todayCount = S.setsToday().length;
  const days = S.trainingDays().slice(0, 3);
  const prs = S.prMap();
  const t = F.today();
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const letters = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  return `
  <header class="top">
    ${wordmark()}
    <button type="button" class="icon-btn" data-action="settings" aria-label="Settings">${icon('sliders')}</button>
  </header>
  <p class="greet"><b>${greet}.</b> ${esc(new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }))}</p>
  ${installHint()}
  <section class="card led">
    <div class="card-head">
      <h2 class="eyebrow">This week</h2>
      ${streak ? `<span class="pill pill-hot">${icon('flame')}${streak}-week streak</span>` : ''}
    </div>
    <ol class="week-strip">
      ${wk.days.map((d, i) => `<li class="${wk.trained.has(d) ? 'on' : ''}${d === t ? ' today' : ''}" aria-label="${esc(F.parseDay(d).toLocaleDateString('en-GB', { weekday: 'long' }))}${wk.trained.has(d) ? ', trained' : ''}"><span>${letters[i]}</span><i></i></li>`).join('')}
    </ol>
    <div class="stats3">
      <div class="stat"><div class="stat-v">${wk.trained.size}</div><div class="stat-l">Sessions</div></div>
      <div class="stat"><div class="stat-v">${wk.sets}</div><div class="stat-l">Sets</div></div>
      <div class="stat"><div class="stat-v">${F.compact(wk.volume)}</div><div class="stat-l">Volume · ${F.unit()}</div></div>
    </div>
  </section>
  <a class="btn btn-primary btn-xl" href="#log">${icon('dumbbell')}<span>${todayCount ? `Continue workout · ${plural(todayCount, 'set')}` : 'Start workout'}</span></a>
  ${benchCard()}
  ${days.length
    ? `<h2 class="section-title">Recent sessions <a href="#history">See all</a></h2>${days.map((d) => dayCard(d, prs)).join('')}`
    : `<section class="card welcome">
        <h2>Let’s get started</h2>
        <ol class="steps">
          <li>Tap <b>Log</b> and pick an exercise.</li>
          <li>Enter weight and reps, then hit <b>Log set</b>.</li>
          <li>Watch your lifts climb in <b>Progress</b> and <b>PRs</b>.</li>
        </ol>
      </section>`}`;
}

function benchCard() {
  const b = S.bestsOf(BENCH_ID);
  const goal = store.getState().settings.benchGoal;
  if (!b) {
    return `
    <section class="card pr-card">
      <div class="card-head"><h2 class="eyebrow">${icon('trophy')} Bench press PR</h2></div>
      <p class="note">No bench sets yet. Log a Flat Bench Press and your PRs show up here.</p>
      <button type="button" class="btn" data-action="open-ex" data-ex="${BENCH_ID}">${icon('plus')} Log bench press</button>
    </section>`;
  }
  return `
  <a class="card pr-card" href="#prs" aria-label="Bench press PRs">
    <div class="card-head"><h2 class="eyebrow">${icon('trophy')} Bench press PR</h2>${icon('chev', 'muted')}</div>
    <div class="pr-pair">
      <div><div class="big">${F.w(b.e1rm)}<small>${F.unit()}</small></div><div class="lbl">Est. 1RM</div></div>
      <div><div class="big">${F.w(b.heavy.w)}<small>× ${b.heavy.r}</small></div><div class="lbl">Heaviest set · ${esc(F.shortDate(b.heavy.d))}</div></div>
    </div>
    ${goalMeter(b.e1rm, goal)}
  </a>`;
}

function viewLog() {
  const d = logDate();
  const cats = ['All', ...categories()];
  const list = allExercises().filter((e) => ui.logCat === 'All' || e.cat === ui.logCat);
  const daySets = store.getState().sets.filter((s) => s.d === d);
  const day = S.trainingDays().find((x) => x.d === d);
  return `
  <header class="page-head">
    <div><p class="eyebrow">Log workout</p><h1>${esc(F.dayLabel(d))}</h1></div>
    ${datePicker(d, 'log-date')}
  </header>
  ${day ? dayCard(day, S.prMap()) : ''}
  <div class="chips" role="tablist" aria-label="Muscle group">
    ${cats.map((c) => `<button type="button" class="chip${c === ui.logCat ? ' on' : ''}" role="tab" aria-selected="${c === ui.logCat}" data-action="log-cat" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}
  </div>
  <div class="ex-list">
    ${list.map((ex) => {
      const n = daySets.filter((s) => s.ex === ex.id).length;
      const last = S.lastSessionBefore(ex.id, d);
      const meta = last ? `Last: ${F.setText(last.top, true)} · ${F.ago(last.d)}` : ex.equip;
      return `
      <button type="button" class="ex-card" data-action="open-ex" data-ex="${esc(ex.id)}">
        ${exIcon(ex)}
        <span class="ex-main"><span class="ex-name">${esc(ex.name)}</span><span class="ex-meta">${esc(meta)}</span></span>
        ${n ? `<span class="ex-count" aria-label="${plural(n, 'set')} logged">${n}</span>` : ''}
        ${icon('chev', 'ex-chev')}
      </button>`;
    }).join('')}
  </div>
  <button type="button" class="btn btn-ghost btn-block add-ex" data-action="settings" data-focus="custom">${icon('plus')} Add your own exercise</button>`;
}

function viewProgress() {
  const ex = exerciseById(ui.progEx);
  const metrics = METRICS[ex.kind === 'bodyweight' ? 'bodyweight' : 'weight'];
  const m = metrics.find((x) => x.id === ui.progMetric) || metrics[0];
  const range = RANGES.find((r) => r[0] === ui.progRange) || RANGES[1];
  const cutoff = range[2] === Infinity ? '' : F.addDays(F.today(), -range[2]);
  const all = S.sessionsOf(ex.id);
  const sess = all.filter((s) => s.d >= cutoff);
  const vals = sess.map((s) => m.get(s));
  const u = m.unit ? F.unit() : 'reps';
  const bw = ex.kind === 'bodyweight';

  const options = categories().map((c) => {
    const exs = allExercises().filter((e) => e.cat === c);
    return exs.length ? `<optgroup label="${esc(c)}">${exs.map((e) => `<option value="${esc(e.id)}"${e.id === ex.id ? ' selected' : ''}>${esc(e.name)}</option>`).join('')}</optgroup>` : '';
  }).join('');

  let body;
  if (!sess.length) {
    body = `
    <section class="card empty-card">
      <p>${all.length ? `No ${esc(ex.name)} sessions in the last ${esc(range[1])}. Try a longer range.` : `Log a few sessions of ${esc(ex.name)} and your progress chart appears here.`}</p>
      <button type="button" class="btn" data-action="open-ex" data-ex="${esc(ex.id)}">${icon('plus')} Log ${esc(ex.name)}</button>
    </section>`;
  } else {
    const latest = vals[vals.length - 1];
    let bestI = 0;
    vals.forEach((v, i) => { if (v >= vals[bestI]) bestI = i; });
    let change = `<div class="tile"><p class="tile-l">Change</p><p class="tile-v">—</p><p class="tile-s">Needs 2+ sessions</p></div>`;
    if (vals.length > 1) {
      const diff = latest - vals[0];
      const dir = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
      const pct = vals[0] > 0 ? `${diff >= 0 ? '+' : '−'}${Math.abs((diff / vals[0]) * 100).toFixed(0)}% · ` : '';
      change = `
        <div class="tile delta-${dir}"><p class="tile-l">Change</p>
          <p class="tile-v">${dir === 'flat' ? '' : icon(dir, 'delta-ico')}${diff > 0 ? '+' : diff < 0 ? '−' : ''}${m.fmt(Math.abs(diff))}<small>${u}</small></p>
          <p class="tile-s">${pct}since ${esc(F.shortDate(sess[0].d))}</p></div>`;
    }
    body = `
    <div class="tiles3">
      <div class="tile"><p class="tile-l">Latest</p><p class="tile-v">${m.fmt(latest)}<small>${u}</small></p><p class="tile-s">${esc(F.shortDate(sess[sess.length - 1].d))}</p></div>
      <div class="tile"><p class="tile-l">Best</p><p class="tile-v">${m.fmt(vals[bestI])}<small>${u}</small></p><p class="tile-s">${esc(F.shortDate(sess[bestI].d))}</p></div>
      ${change}
    </div>
    <section class="card chart-card">
      <h2 class="eyebrow">${esc(m.label)} · ${u}</h2>
      <div class="chart" id="prog-chart"></div>
    </section>
    <section class="card">
      <h2 class="eyebrow">Sessions</h2>
      <table class="tbl">
        <thead><tr><th>Date</th><th>${bw ? 'Best set' : 'Top set'}</th><th>${bw ? 'Reps' : 'Est. 1RM'}</th><th>${bw ? 'Sets' : 'Volume'}</th></tr></thead>
        <tbody>${sess.slice(-40).reverse().map((s) => `<tr>
          <td>${esc(F.shortDate(s.d))}</td>
          <td>${esc(F.setText(bw ? s.maxRep : s.top))}</td>
          <td>${bw ? s.reps : F.w(s.e1rm)}</td>
          <td>${bw ? s.sets.length : F.compact(s.volume)}</td></tr>`).join('')}</tbody>
      </table>
    </section>`;
    const points = sess.map((s) => ({ x: F.parseDay(s.d).getTime(), y: m.unit ? F.toDisplay(m.get(s)) : m.get(s), sub: m.sub(s) }));
    const short = (v) => (Math.abs(v) >= 1e4 ? `${F.num(v / 1000, 1)}K` : F.num(v, 1));
    onMount(() => lineChart($('#prog-chart'), points, {
      tick: short,
      value: (v) => (m.unit ? `${short(v)} ${F.unit()}` : `${F.num(v, 0)} reps`),
      label: `${ex.name} ${m.label} over the last ${range[1]}`,
    }));
  }

  return `
  <header class="page-head"><div><p class="eyebrow">Progress</p><h1>Your lifts</h1></div></header>
  <div class="field-select">
    <select id="prog-ex" aria-label="Exercise">${options}</select>${icon('chevdown')}
  </div>
  ${seg('prog-range', RANGES.map((r) => [r[0], r[1]]), range[0], 'Time range')}
  ${seg('prog-metric', metrics.map((x) => [x.id, x.label]), m.id, 'Metric')}
  ${body}`;
}

function viewPRs() {
  const b = S.bestsOf(BENCH_ID);
  const goal = store.getState().settings.benchGoal;
  const u = F.unit();
  let bench;
  if (!b) {
    bench = `
    <section class="card led hero-card">
      <h2 class="eyebrow">${icon('trophy')} Flat bench press</h2>
      <div class="hero hero-empty">—</div>
      <p class="hero-sub">Log your first bench set to start your PR board.</p>
      <button type="button" class="btn btn-primary btn-block" data-action="open-ex" data-ex="${BENCH_ID}">${icon('plus')} Log bench press</button>
    </section>`;
  } else {
    const timeline = S.prTimeline(BENCH_ID).slice(0, 12);
    const benchSessions = S.sessionsOf(BENCH_ID);
    bench = `
    <section class="card led hero-card">
      <div class="card-head">
        <h2 class="eyebrow">${icon('trophy')} Flat bench press</h2>
        <button type="button" class="pill" data-action="open-ex" data-ex="${BENCH_ID}">${icon('plus')} Log</button>
      </div>
      <div class="hero">${F.w(b.e1rm)}<span>${u}</span></div>
      <p class="hero-sub">Best estimated 1RM · from ${esc(F.setText(b.est, true))} on ${esc(F.shortDate(b.est.d))}</p>
      <div class="tiles2">
        <div class="tile"><p class="tile-l">Heaviest set</p><p class="tile-v">${F.w(b.heavy.w)}<small>${u} × ${b.heavy.r}</small></p><p class="tile-s">${esc(F.shortDate(b.heavy.d))}</p></div>
        <div class="tile"><p class="tile-l">Bench sessions</p><p class="tile-v">${b.days}</p><p class="tile-s">${plural(b.count, 'set')} logged</p></div>
      </div>
      <div class="goal">
        <div class="goal-head"><span class="eyebrow">Goal · est. 1RM</span><button type="button" class="link" data-action="edit-goal">${icon('edit')} Edit goal</button></div>
        ${goalMeter(b.e1rm, goal)}
      </div>
    </section>
    <section class="card">
      <h2 class="eyebrow">Rep maxes · ${u}</h2>
      <div class="rm-grid">
        ${S.repMaxes(BENCH_ID).map(({ n, set }) => `
          <div class="rm"><p class="rm-n">${n}RM</p><p class="rm-v">${set ? F.w(set.w) : '—'}</p><p class="rm-d">${set ? esc(F.shortDate(set.d)) : '&nbsp;'}</p></div>`).join('')}
      </div>
      <p class="note">Heaviest weight you’ve benched for at least that many reps.</p>
    </section>
    <section class="card chart-card">
      <h2 class="eyebrow">Est. 1RM over time · ${u}</h2>
      <div class="chart" id="bench-chart"></div>
    </section>
    <section class="card">
      <h2 class="eyebrow">PR timeline</h2>
      <ol class="timeline">
        ${timeline.map(({ set, kinds, prev, e1rm }) => {
          const tags = kinds[0] === 'first'
            ? ['First logged']
            : kinds.map((k) => (k === 'weight' ? `+${F.wu(set.w - prev.w)} heaviest` : `+${F.w(e1rm - prev.e)} e1RM`));
          return `<li><span class="tl-dot"></span><div><p class="tl-main">${esc(F.setText(set, true))}</p><p class="tl-sub">${esc(F.shortDate(set.d))} · ${esc(tags.join(' · '))}</p></div><span class="tl-e">${F.w(e1rm)}<small>e1RM</small></span></li>`;
        }).join('')}
      </ol>
    </section>`;
    onMount(() => lineChart($('#bench-chart'), benchSessions.map((s) => ({ x: F.parseDay(s.d).getTime(), y: F.toDisplay(s.e1rm), sub: `From ${F.setText(s.e1rmSet, true)}` })), {
      tick: (v) => F.num(v, 1),
      value: (v) => `${F.num(v, 1)} ${u}`,
      label: 'Bench press estimated one-rep max over time',
    }));
  }

  return `
  <header class="page-head"><div><p class="eyebrow">Personal records</p><h1>PR board</h1></div></header>
  ${bench}
  <h2 class="section-title">All exercises</h2>
  <div class="ex-list">
    ${allExercises().map((ex) => {
      const best = S.bestsOf(ex.id);
      const bw = ex.kind === 'bodyweight';
      const meta = !best ? 'No sets yet' : bw ? `Best ${F.setText(best.reps, true)} · ${F.shortDate(best.reps.d)}` : `Est. 1RM ${F.wu(best.e1rm)} · ${F.shortDate(best.est.d)}`;
      const big = !best ? '—' : bw ? `${best.reps.r}<small>reps</small>` : `${F.w(best.heavy.w)}<small>${u}</small>`;
      return `
      <button type="button" class="ex-card" data-action="view-progress" data-ex="${esc(ex.id)}">
        ${exIcon(ex)}
        <span class="ex-main"><span class="ex-name">${esc(ex.name)}</span><span class="ex-meta">${esc(meta)}</span></span>
        <span class="pr-best">${big}</span>
      </button>`;
    }).join('')}
  </div>`;
}

function viewHistory() {
  const days = S.trainingDays();
  const prs = S.prMap();
  const total = store.getState().sets.length;
  if (!days.length) {
    return `
    <header class="page-head"><div><p class="eyebrow">History</p><h1>Every session</h1></div></header>
    <section class="card empty-card"><p>No workouts yet. Sessions you log show up here, newest first.</p><a class="btn" href="#log">${icon('plus')} Log a workout</a></section>`;
  }
  let html = '';
  let month = '';
  for (const day of days.slice(0, ui.historyLimit)) {
    const ml = F.monthLabel(day.d);
    if (ml !== month) {
      month = ml;
      html += `<h2 class="section-title">${esc(ml)}</h2>`;
    }
    html += dayCard(day, prs);
  }
  return `
  <header class="page-head"><div><p class="eyebrow">History</p><h1>Every session</h1></div><p class="head-meta">${plural(days.length, 'session')}<br>${plural(total, 'set')}</p></header>
  <p class="note">Tap any set to edit or delete it.</p>
  ${html}
  ${days.length > ui.historyLimit ? `<button type="button" class="btn btn-block" data-action="history-more">Show older sessions</button>` : ''}`;
}

const VIEWS = { home: viewHome, log: viewLog, progress: viewProgress, prs: viewPRs, history: viewHistory };

function render() {
  mounts = [];
  $('#view').innerHTML = VIEWS[ui.tab]();
  mounts.forEach((fn) => fn());
  $('#tabbar').innerHTML = TABS.map((t) => `
    <a href="#${t.id}" class="tab${t.center ? ' tab-center' : ''}"${ui.tab === t.id ? ' aria-current="page"' : ''}>
      ${t.center ? `<span class="tab-fab">${icon('plus')}</span>` : icon(t.icon)}<span class="tab-l">${t.label}</span>
    </a>`).join('');
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
        <button type="button" class="icon-btn" data-close aria-label="Close">${icon('x')}</button>
      </header>
      <div class="sheet-body">${body}</div>
    </section>`;
  document.body.append(root);
  document.body.classList.add('sheet-open');
  root.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeSheet(); });

  // Drag the header down to dismiss, like a native sheet.
  const panel = $('.sheet', root);
  const head = $('.sheet-head', root);
  let y0 = null;
  head.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    y0 = e.clientY;
    panel.style.transition = 'none';
    head.setPointerCapture(e.pointerId);
  });
  head.addEventListener('pointermove', (e) => {
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
  head.addEventListener('pointerup', release);
  head.addEventListener('pointercancel', release);

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
  else setTimeout(() => root.remove(), 320);
  if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
}

function openLogger(exId) {
  const ex = exerciseById(exId);
  const bw = ex.kind === 'bodyweight';
  let d = logDate();
  const ref = S.setsOn(exId, d).at(-1) || S.lastSessionBefore(exId, d)?.top;
  const body = `
    <div class="lg-bar">${datePicker(d, 'lg-date')}<span class="lg-e1rm" aria-live="polite"></span></div>
    <div class="lg-last"></div>
    ${stepperHTML('lg-w', 'w', bw ? `Added weight · ${F.unit()}` : `Weight · ${F.unit()}`, ref ? inputW(ref.w) : bw ? '0' : '', ex.hint)}
    ${stepperHTML('lg-r', 'r', 'Reps', ref ? ref.r : 8)}
    <button type="button" class="btn btn-primary btn-xl lg-submit">${icon('check')}<span>Log set</span></button>
    <div class="rest rest-inline rest-ui" role="timer" aria-label="Rest timer" hidden>${restInner()}</div>
    <h3 class="section-title lg-title"></h3>
    <ol class="lg-sets"></ol>`;

  openSheet({
    title: ex.name,
    sub: `${ex.cat} · ${ex.equip}`,
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
        $('.date-pill span', root).textContent = F.dayLabel(d);
        $('.lg-title', root).textContent = `Sets · ${F.dayLabel(d)}`;
        const last = S.lastSessionBefore(exId, d);
        $('.lg-last', root).innerHTML = last
          ? `<p class="eyebrow">Last time · ${esc(F.ago(last.d))} <span class="muted-n">tap to reuse</span></p>
             <div class="set-chips">${last.sets.map((s) => `<button type="button" class="set-chip" data-fill="${esc(s.id)}">${esc(F.setText(s))}</button>`).join('')}</div>`
          : `<p class="note">First time logging ${esc(ex.name)}${d === F.today() ? '' : ' before this date'} — this session is your baseline.</p>`;
        $('.lg-sets', root).innerHTML = sets.length
          ? sets.map((s, i) => `
            <li>
              <span class="set-n">${i + 1}</span>
              <span class="set-main">${esc(F.setText(s, true))}</span>
              ${prs.has(s.id) ? '<span class="badge-pr">PR</span>' : ''}
              <span class="set-e">${bw ? '' : `e1RM ${F.w(S.e1rm(s.w, s.r))}`}</span>
              <button type="button" class="icon-btn sm" data-del="${esc(s.id)}" aria-label="Delete set ${i + 1}">${icon('trash')}</button>
            </li>`).join('')
          : `<li class="empty">No sets logged ${d === F.today() ? 'yet today' : 'on this day'}.</li>`;
        const w = parseNum($w.value);
        const r = parseNum($r.value);
        const est = !bw && w > 0 && Number.isInteger(r) && r > 0 ? S.e1rm(F.fromDisplay(w), r) : 0;
        $('.lg-e1rm', root).innerHTML = est ? `Est. 1RM <b>${esc(F.wu(est))}</b>` : '';
      };

      const submit = () => {
        const v = readSet($w, $r);
        if (!v) return;
        const set = store.addSet({ ex: exId, ...v, d });
        askPersist();
        if (S.prMap().has(set.id)) {
          toast(`New PR! ${ex.name} · ${F.setText(set, true)}`, { kind: 'pr', duration: 4500 });
          $btn.classList.add('pr-burst');
        }
        $btn.classList.add('logged');
        $('span', $btn).textContent = `Set ${S.setsOn(exId, d).length} logged`;
        clearTimeout(flash);
        flash = setTimeout(() => {
          $btn.classList.remove('logged', 'pr-burst');
          $('span', $btn).textContent = 'Log set';
        }, 1200);
        startRest(store.getState().settings.rest);
      };

      wireSteppers(root, refresh);
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
    sub: `${ex.name} · ${F.dayLabel(s.d)}`,
    body: `
      ${stepperHTML('es-w', 'w', bw ? `Added weight · ${F.unit()}` : `Weight · ${F.unit()}`, inputW(s.w))}
      ${stepperHTML('es-r', 'r', 'Reps', s.r)}
      <label class="field"><span>Date</span><input class="input" type="date" id="es-d" value="${s.d}" max="${F.today()}"></label>
      <div class="btn-row">
        <button type="button" class="btn btn-danger" id="es-del">${icon('trash')} Delete</button>
        <button type="button" class="btn btn-primary" id="es-save">${icon('check')} Save</button>
      </div>`,
    onMount(root) {
      wireSteppers(root);
      $('#es-save', root).addEventListener('click', () => {
        const v = readSet($('#es-w', root), $('#es-r', root));
        if (!v) return;
        const nd = $('#es-d', root).value;
        store.updateSet(id, { ...v, d: nd && nd <= F.today() ? nd : s.d });
        closeSheet();
        toast('Set updated');
      });
      $('#es-del', root).addEventListener('click', () => {
        closeSheet();
        deleteWithUndo(id);
      });
    },
  });
}

function openGoal() {
  const goal = store.getState().settings.benchGoal;
  openSheet({
    title: 'Bench press goal',
    sub: 'The estimated 1RM you’re chasing',
    body: `
      ${stepperHTML('goal-w', 'w', `Goal · ${F.unit()}`, inputW(goal))}
      <button type="button" class="btn btn-primary btn-xl" id="goal-save">${icon('check')}<span>Save goal</span></button>`,
    onMount(root) {
      wireSteppers(root);
      $('#goal-save', root).addEventListener('click', () => {
        const input = $('#goal-w', root);
        const v = parseNum(input.value);
        if (!(v > 0)) return invalid(input, 'Enter a goal above 0');
        store.setSetting('benchGoal', F.fromDisplay(v));
        closeSheet();
        toast(`Goal set · ${F.wu(F.fromDisplay(v))}`);
      });
    },
  });
}

function settingsBody() {
  const st = store.getState();
  const { unit, rest, benchGoal } = st.settings;
  return `
    <section class="set-group">
      <h3 class="eyebrow">Units</h3>
      ${seg('set-unit', [['kg', 'Kilograms'], ['lb', 'Pounds']], unit, 'Units')}
    </section>
    <section class="set-group">
      <h3 class="eyebrow">Rest timer after each set</h3>
      ${seg('set-rest', [[0, 'Off'], [60, '60s'], [90, '90s'], [120, '2m'], [180, '3m']], rest, 'Rest timer')}
    </section>
    <section class="set-group">
      <h3 class="eyebrow">Bench press goal</h3>
      <button type="button" class="row-btn" data-action="edit-goal"><span>Est. 1RM goal</span><b>${esc(F.wu(benchGoal))}</b>${icon('chev')}</button>
    </section>
    <section class="set-group" id="custom">
      <h3 class="eyebrow">Your own exercises</h3>
      ${st.custom.length ? `<ul class="custom-list">${st.custom.map((c) => `
        <li><span><b>${esc(c.name)}</b><small>${esc(c.cat)} · ${c.kind === 'bodyweight' ? 'Bodyweight' : 'Weighted'}</small></span>
        <button type="button" class="icon-btn sm" data-action="del-custom" data-id="${esc(c.id)}" aria-label="Delete ${esc(c.name)}">${icon('trash')}</button></li>`).join('')}</ul>` : ''}
      <form class="add-form" data-form="custom">
        <input class="input" name="name" placeholder="Exercise name, e.g. Leg Press" maxlength="40" required autocomplete="off" aria-label="Exercise name">
        <div class="row2">
          <select class="input" name="cat" aria-label="Muscle group">${[...CATEGORIES, 'Legs', 'Core', 'Other'].map((c) => `<option>${c}</option>`).join('')}</select>
          <select class="input" name="kind" aria-label="Type"><option value="weight">Weighted</option><option value="bodyweight">Bodyweight</option></select>
        </div>
        <button class="btn btn-block">${icon('plus')} Add exercise</button>
      </form>
    </section>
    <section class="set-group">
      <h3 class="eyebrow">Backup</h3>
      <p class="note">Your log is saved on this phone only. Export a backup now and then, and before switching phones.</p>
      <div class="btn-row">
        <button type="button" class="btn" data-action="export">${icon('download')} Export</button>
        <label class="btn">${icon('upload')} Import<input class="visually-hidden" type="file" accept=".json,application/json" id="import-file"></label>
      </div>
    </section>
    <section class="set-group">
      <button type="button" class="btn btn-danger btn-block" data-action="reset">${icon('trash')} Reset all data</button>
    </section>
    <p class="about">Novo Tracker · ${plural(st.sets.length, 'set')} logged<br>Unofficial personal tracker, themed on Novo Gym Welling. Works offline.</p>`;
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
  <span class="rest-ico">${icon('timer')}</span>
  <span class="rest-l">Rest</span>
  <span class="rest-t">0:00</span>
  <button type="button" data-action="rest-add" aria-label="Add 30 seconds">+30s</button>
  <button type="button" class="rest-x" data-action="rest-stop" aria-label="Stop rest timer">${icon('x')}</button>
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
    $('.rest-l', el).textContent = done ? 'Rest done' : 'Rest';
    $('.rest-t', el).textContent = done ? 'Go!' : `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
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
function toast(msg, { kind = '', action, duration = 3000 } = {}) {
  const t = $('#toast');
  t.className = `toast ${kind}`;
  t.innerHTML = `${kind === 'pr' ? icon('trophy') : ''}<span></span>${action ? `<button type="button">${esc(action.label)}</button>` : ''}`;
  $('span', t).textContent = msg;
  if (action) $('button', t).addEventListener('click', () => { action.fn(); hideToast(); });
  void t.offsetWidth;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, duration);
}
const hideToast = () => $('#toast').classList.remove('show');

function deleteWithUndo(id) {
  const removed = store.deleteSet(id);
  if (removed) toast('Set deleted', { action: { label: 'Undo', fn: () => store.restoreSet(removed) }, duration: 5000 });
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
    toast(`Backup restored · ${plural(next.sets.length, 'set')}`);
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
    if (!confirm('Delete every logged set and custom exercise? This can’t be undone — export a backup first if unsure.')) return;
    store.resetAll();
    stopRest();
    closeSheet();
    toast('All data cleared');
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
  if (!name) return toast('Give the exercise a name');
  if (allExercises().some((x) => x.name.toLowerCase() === name.toLowerCase())) return toast('You already have an exercise with that name');
  store.addCustomExercise({ name, cat: String(data.get('cat')), kind: data.get('kind') === 'bodyweight' ? 'bodyweight' : 'weight' });
  refreshSettings();
  toast(`${name} added to your exercises`);
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
