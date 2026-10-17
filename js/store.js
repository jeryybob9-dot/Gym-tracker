// Local persistence. Everything lives in this browser's localStorage under one key;
// weights are always stored in kilograms and converted for display.
const KEY = 'novo-tracker:v1';

const defaults = () => ({
  version: 1,
  settings: { unit: 'kg', rest: 90, benchGoal: null },
  custom: [],
  sets: [],
});

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const isSet = (s) =>
  s && typeof s.ex === 'string' && Number.isFinite(+s.w) && +s.w >= 0 &&
  Number.isInteger(+s.r) && +s.r > 0 && DAY.test(s.d);

const byTime = (a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : a.t - b.t);

// Validates a parsed backup (or stored state) and returns a clean copy. Throws if it isn't one of ours.
export function normalize(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.sets)) {
    throw new Error('That file isn’t a Novo Tracker backup.');
  }
  const d = defaults();
  const s = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
  return {
    version: 1,
    settings: {
      unit: s.unit === 'lb' ? 'lb' : 'kg',
      rest: Number.isFinite(+s.rest) && +s.rest >= 0 ? +s.rest : d.settings.rest,
      benchGoal: s.benchGoal != null && +s.benchGoal > 0 ? +s.benchGoal : null,
    },
    custom: Array.isArray(raw.custom)
      ? raw.custom
          .filter((c) => c && typeof c.id === 'string' && typeof c.name === 'string' && c.name.trim())
          .map((c) => ({
            id: c.id,
            name: c.name.trim().slice(0, 40),
            cat: typeof c.cat === 'string' ? c.cat : 'Other',
            kind: c.kind === 'bodyweight' ? 'bodyweight' : 'weight',
            equip: 'Custom',
          }))
      : [],
    sets: raw.sets
      .filter(isSet)
      .map((x) => ({ id: String(x.id || uid()), ex: x.ex, w: +x.w, r: +x.r, d: x.d, t: Number.isFinite(+x.t) ? +x.t : 0 }))
      .sort(byTime),
  };
}

function read() {
  let raw = null;
  try {
    raw = localStorage.getItem(KEY);
    return raw ? normalize(JSON.parse(raw)) : defaults();
  } catch (err) {
    console.error('Could not read saved data', err);
    // Keep the unreadable copy so a bad parse never silently wipes someone's history.
    try { if (raw) localStorage.setItem(`${KEY}:unreadable`, raw); } catch {}
    return defaults();
  }
}

const subs = new Set();
let state = read();

function commit() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    console.error('Save failed', err);
    window.dispatchEvent(new CustomEvent('novo:save-error'));
  }
  subs.forEach((fn) => fn(state));
}

export const getState = () => state;
export const subscribe = (fn) => (subs.add(fn), () => subs.delete(fn));

export function addSet({ ex, w, r, d }) {
  const set = { id: uid(), ex, w, r, d, t: Date.now() };
  state.sets.push(set);
  state.sets.sort(byTime);
  commit();
  return set;
}

export function updateSet(id, patch) {
  const set = state.sets.find((s) => s.id === id);
  if (!set) return;
  Object.assign(set, patch);
  state.sets.sort(byTime);
  commit();
}

export function deleteSet(id) {
  const i = state.sets.findIndex((s) => s.id === id);
  if (i < 0) return null;
  const [removed] = state.sets.splice(i, 1);
  commit();
  return removed;
}

export function restoreSet(set) {
  state.sets.push(set);
  state.sets.sort(byTime);
  commit();
}

export function setSetting(key, value) {
  state.settings[key] = value;
  commit();
}

export function addCustomExercise({ name, cat, kind }) {
  const ex = { id: `c-${uid()}`, name: name.trim().slice(0, 40), cat, kind, equip: 'Custom' };
  state.custom.push(ex);
  commit();
  return ex;
}

export function deleteCustomExercise(id) {
  state.custom = state.custom.filter((c) => c.id !== id);
  state.sets = state.sets.filter((s) => s.ex !== id);
  commit();
}

export const exportJSON = () => JSON.stringify({ app: 'novo-tracker', exportedAt: new Date().toISOString(), ...state }, null, 2);

// Parses and validates a backup without applying it, so the caller can confirm first.
export const parseBackup = (text) => normalize(JSON.parse(text));

export function replaceAll(next) {
  state = next;
  commit();
}

export function resetAll() {
  state = defaults();
  commit();
}
