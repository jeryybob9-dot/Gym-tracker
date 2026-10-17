import { getState } from './store.js';

export const CATEGORIES = ['Back', 'Biceps', 'Triceps', 'Chest', 'Shoulders'];
export const BENCH_ID = 'flat-bench';

// kind: 'weight' logs load lifted; 'bodyweight' logs added load (0 = just bodyweight).
// note: one line on what to enter, shown under the name when logging.
export const DEFAULT_EXERCISES = [
  { id: 'low-pulley', name: 'Low Pulley Row', cat: 'Back', kind: 'weight', note: 'Seated cable. Log the stack weight.' },
  { id: 'pull-ups', name: 'Pull Ups', cat: 'Back', kind: 'bodyweight', note: 'Log added weight. 0 means bodyweight only.' },
  { id: 't-bar-row', name: 'T-Bar Row', cat: 'Back', kind: 'weight', note: 'Chest supported. Log the plates loaded.' },
  { id: 'muscle-ups', name: 'Muscle Ups', cat: 'Back', kind: 'bodyweight', note: 'Log added weight. 0 means bodyweight only.' },
  { id: 'cable-curl', name: 'Cable Bicep Curls', cat: 'Biceps', kind: 'weight', note: 'Cable stack. Log the stack weight.' },
  { id: 'preacher-curl', name: 'Preacher Curls', cat: 'Biceps', kind: 'weight', note: 'Primal preacher. Log the weight.' },
  { id: 'tricep-pushdown', name: 'Tricep Push Down', cat: 'Triceps', kind: 'weight', note: 'Cable stack. Log the stack weight.' },
  { id: 'seated-dips', name: 'Seated Tricep Dips', cat: 'Triceps', kind: 'weight', note: 'Primal seated dip. Log the stack weight.' },
  { id: 'primal-chest-press', name: 'Primal Chest Press', cat: 'Chest', kind: 'weight', note: 'Plate loaded. Log the plates on both sides.' },
  { id: 'pec-deck', name: 'Pec Deck', cat: 'Chest', kind: 'weight', note: 'Machine stack. Log the stack weight.' },
  { id: BENCH_ID, name: 'Flat Bench Press', cat: 'Chest', kind: 'weight', note: 'Barbell. Log the bar plus plates.' },
  { id: 'viking-press', name: 'Viking Press', cat: 'Shoulders', kind: 'weight', note: 'Standing, plate loaded. Log the plates.' },
];

export const allExercises = () => [...DEFAULT_EXERCISES, ...getState().custom];

export const exerciseById = (id) =>
  allExercises().find((e) => e.id === id) || { id, name: 'Unknown exercise', cat: 'Other', kind: 'weight', note: '' };

export const categories = () => {
  const extra = getState().custom.map((c) => c.cat).filter((c) => !CATEGORIES.includes(c));
  return [...CATEGORIES, ...new Set(extra)];
};
