import { getState } from './store.js';
import { exerciseById } from './exercises.js';
import { ymd, parseDay, today } from './format.js';

// Epley estimated one-rep max.
export const e1rm = (w, r) => (w > 0 && r > 0 ? (r === 1 ? w : w * (1 + r / 30)) : 0);

const byTime = (a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : a.t - b.t);
const heavier = (a, b) => a.w > b.w || (a.w === b.w && a.r > b.r);

export const setsOf = (exId) => getState().sets.filter((s) => s.ex === exId).sort(byTime);
export const setsOn = (exId, d) => getState().sets.filter((s) => s.ex === exId && s.d === d).sort(byTime);

function summarize(d, sets) {
  let top = sets[0];
  let best = sets[0];
  let maxRep = sets[0];
  let volume = 0;
  let reps = 0;
  for (const s of sets) {
    if (heavier(s, top)) top = s;
    if (e1rm(s.w, s.r) > e1rm(best.w, best.r)) best = s;
    if (s.r > maxRep.r || (s.r === maxRep.r && s.w > maxRep.w)) maxRep = s;
    volume += s.w * s.r;
    reps += s.r;
  }
  return { d, sets, top, e1rm: e1rm(best.w, best.r), e1rmSet: best, maxRep, volume, reps };
}

// One entry per training day for an exercise, oldest first.
export function sessionsOf(exId) {
  const byDay = new Map();
  for (const s of setsOf(exId)) {
    if (!byDay.has(s.d)) byDay.set(s.d, []);
    byDay.get(s.d).push(s);
  }
  return [...byDay].map(([d, sets]) => summarize(d, sets));
}

export function lastSessionBefore(exId, d) {
  const prior = sessionsOf(exId).filter((x) => x.d < d);
  return prior[prior.length - 1] || null;
}

export function bestsOf(exId) {
  const sets = setsOf(exId);
  if (!sets.length) return null;
  let heavy = sets[0];
  let est = sets[0];
  let reps = sets[0];
  for (const s of sets) {
    if (heavier(s, heavy)) heavy = s;
    if (e1rm(s.w, s.r) > e1rm(est.w, est.r)) est = s;
    if (s.r > reps.r || (s.r === reps.r && s.w > reps.w)) reps = s;
  }
  return { heavy, est, e1rm: e1rm(est.w, est.r), reps, count: sets.length, days: new Set(sets.map((s) => s.d)).size, last: sets[sets.length - 1] };
}

// Best load lifted for at least n reps, for each n.
export function repMaxes(exId, targets = [1, 3, 5, 8, 10]) {
  const sets = setsOf(exId);
  return targets.map((n) => {
    let best = null;
    for (const s of sets) if (s.r >= n && (!best || s.w > best.w)) best = s;
    return { n, set: best };
  });
}

// Walks every set in order and records which ones beat that exercise's previous best.
// The first day logged for an exercise is the baseline, so it never earns a badge.
function walkRecords(sets, onRecord) {
  const seen = new Map();
  for (const s of sets) {
    const bw = exerciseById(s.ex).kind === 'bodyweight';
    const e = e1rm(s.w, s.r);
    const prev = seen.get(s.ex);
    if (!prev) {
      seen.set(s.ex, { first: s.d, w: s.w, e, r: s.r });
      onRecord(s, ['first'], null);
      continue;
    }
    const kinds = [];
    if (s.d !== prev.first) {
      if (s.w > prev.w) kinds.push('weight');
      if (bw ? s.r > prev.r : e > prev.e + 1e-9) kinds.push(bw ? 'reps' : 'e1rm');
    }
    if (kinds.length) onRecord(s, kinds, { ...prev });
    prev.w = Math.max(prev.w, s.w);
    prev.e = Math.max(prev.e, e);
    prev.r = Math.max(prev.r, s.r);
  }
}

export function prMap() {
  const out = new Map();
  walkRecords([...getState().sets].sort(byTime), (s, kinds) => {
    if (kinds[0] !== 'first') out.set(s.id, kinds);
  });
  return out;
}

export function prTimeline(exId) {
  const out = [];
  walkRecords(setsOf(exId), (set, kinds, prev) => out.push({ set, kinds, prev, e1rm: e1rm(set.w, set.r) }));
  return out.reverse();
}

export function weekStart(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

export function weekSummary() {
  const start = weekStart();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return ymd(d);
  });
  const sets = getState().sets.filter((s) => s.d >= days[0] && s.d <= days[6]);
  return {
    days,
    trained: new Set(sets.map((s) => s.d)),
    sets: sets.length,
    volume: sets.reduce((a, s) => a + s.w * s.r, 0),
  };
}

// Consecutive weeks with at least one session. An untrained current week doesn't break it yet.
export function weekStreak() {
  const weeks = new Set(getState().sets.map((s) => ymd(weekStart(parseDay(s.d)))));
  if (!weeks.size) return 0;
  const cur = weekStart();
  if (!weeks.has(ymd(cur))) cur.setDate(cur.getDate() - 7);
  let n = 0;
  while (weeks.has(ymd(cur))) {
    n++;
    cur.setDate(cur.getDate() - 7);
  }
  return n;
}

// Every training day, newest first, with its sets grouped by exercise in the order performed.
export function trainingDays() {
  const byDay = new Map();
  for (const s of getState().sets) {
    if (!byDay.has(s.d)) byDay.set(s.d, []);
    byDay.get(s.d).push(s);
  }
  return [...byDay]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([d, sets]) => {
      sets.sort(byTime);
      const groups = new Map();
      for (const s of sets) {
        if (!groups.has(s.ex)) groups.set(s.ex, []);
        groups.get(s.ex).push(s);
      }
      return { d, sets, groups, volume: sets.reduce((a, s) => a + s.w * s.r, 0) };
    });
}

export const setsToday = () => getState().sets.filter((s) => s.d === today());
