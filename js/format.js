import { getState } from './store.js';
import { exerciseById } from './exercises.js';

const KG_PER_LB = 0.45359237;

export const unit = () => getState().settings.unit;
export const toDisplay = (kg) => (unit() === 'lb' ? kg / KG_PER_LB : kg);
export const fromDisplay = (v) => (unit() === 'lb' ? v * KG_PER_LB : v);
export const stepSize = () => (unit() === 'lb' ? 5 : 2.5);

export function num(v, dp = 1) {
  const p = 10 ** dp;
  return (Math.round(v * p) / p).toLocaleString('en-GB', { maximumFractionDigits: dp });
}

// Weight in the user's unit, e.g. "62.5"; wu() adds the unit.
export const w = (kg) => num(toDisplay(kg));
export const wu = (kg) => `${w(kg)} ${unit()}`;
// "100 × 5" (or "100 kg × 5" with the unit). Bodyweight moves read "BW × 12" / "+10 × 8".
export function setText(s, withUnit = false) {
  const u = withUnit ? ` ${unit()}` : '';
  if (exerciseById(s.ex).kind === 'bodyweight') return s.w > 0 ? `+${w(s.w)}${u} × ${s.r}` : `BW × ${s.r}`;
  return `${w(s.w)}${u} × ${s.r}`;
}

export function compact(kg) {
  const v = toDisplay(kg);
  if (v >= 1e6) return `${num(v / 1e6, 1)}M`;
  if (v >= 1e4) return `${num(v / 1e3, 1)}K`;
  return num(v, 0);
}

export const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const parseDay = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const today = () => ymd(new Date());
export const addDays = (s, n) => {
  const d = parseDay(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
};

const sameYear = (s) => parseDay(s).getFullYear() === new Date().getFullYear();

export function dayLabel(s) {
  if (s === today()) return 'Today';
  if (s === addDays(today(), -1)) return 'Yesterday';
  return parseDay(s).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', ...(sameYear(s) ? {} : { year: 'numeric' }),
  });
}

export const shortDate = (s) =>
  parseDay(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(sameYear(s) ? {} : { year: '2-digit' }) });

export const monthLabel = (s) => parseDay(s).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

export function ago(s) {
  const days = Math.round((parseDay(today()) - parseDay(s)) / 864e5);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} wks ago`;
  return shortDate(s);
}
