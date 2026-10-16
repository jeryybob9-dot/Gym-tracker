import { getState } from './store.js';

export const CATEGORIES = ['Back', 'Biceps', 'Triceps', 'Chest', 'Shoulders'];
export const BENCH_ID = 'flat-bench';

// kind: 'weight' logs load lifted; 'bodyweight' logs added load (0 = just bodyweight).
export const DEFAULT_EXERCISES = [
  { id: 'low-pulley', name: 'Low Pulley Row', cat: 'Back', kind: 'weight', equip: 'Seated cable · stack', hint: 'Stack weight' },
  { id: 'pull-ups', name: 'Pull Ups', cat: 'Back', kind: 'bodyweight', equip: 'Bodyweight', hint: 'Added weight · 0 = bodyweight' },
  { id: 't-bar-row', name: 'T-Bar Row', cat: 'Back', kind: 'weight', equip: 'Chest supported · plate loaded', hint: 'Plates loaded' },
  { id: 'muscle-ups', name: 'Muscle Ups', cat: 'Back', kind: 'bodyweight', equip: 'Bodyweight', hint: 'Added weight · 0 = bodyweight' },
  { id: 'cable-curl', name: 'Cable Bicep Curls', cat: 'Biceps', kind: 'weight', equip: 'Cable · stack', hint: 'Stack weight' },
  { id: 'preacher-curl', name: 'Preacher Curls', cat: 'Biceps', kind: 'weight', equip: 'Primal preacher', hint: 'Weight' },
  { id: 'tricep-pushdown', name: 'Tricep Push Down', cat: 'Triceps', kind: 'weight', equip: 'Cable · stack', hint: 'Stack weight' },
  { id: 'seated-dips', name: 'Seated Tricep Dips', cat: 'Triceps', kind: 'weight', equip: 'Primal seated dip · stack', hint: 'Stack weight' },
  { id: 'primal-chest-press', name: 'Primal Chest Press', cat: 'Chest', kind: 'weight', equip: 'Primal · plate loaded', hint: 'Plates loaded, both sides' },
  { id: 'pec-deck', name: 'Pec Deck', cat: 'Chest', kind: 'weight', equip: 'Machine · stack', hint: 'Stack weight' },
  { id: BENCH_ID, name: 'Flat Bench Press', cat: 'Chest', kind: 'weight', equip: 'Barbell', hint: 'Bar + plates' },
  { id: 'viking-press', name: 'Viking Press', cat: 'Shoulders', kind: 'weight', equip: 'Standing · plate loaded', hint: 'Plates loaded' },
];

export const allExercises = () => [...DEFAULT_EXERCISES, ...getState().custom];

export const exerciseById = (id) =>
  allExercises().find((e) => e.id === id) || { id, name: 'Unknown exercise', cat: 'Other', kind: 'weight', equip: '' };

export const categories = () => {
  const extra = getState().custom.map((c) => c.cat).filter((c) => !CATEGORIES.includes(c));
  return [...CATEGORIES, ...new Set(extra)];
};
