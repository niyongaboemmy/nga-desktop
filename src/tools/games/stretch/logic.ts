// Stand & Stretch: six two-minute routines, five moves of 24 seconds each.
export const STEP_SEC = 24;

export const ROUTINES = [
  { id: "desk", steps: ["desk1", "desk2", "desk3", "desk4", "desk5"] },
  { id: "tall", steps: ["tall1", "tall2", "tall3", "tall4", "tall5"] },
  { id: "eyes", steps: ["eyes1", "eyes2", "eyes3", "eyes4", "eyes5"] },
  { id: "energy", steps: ["energy1", "energy2", "energy3", "energy4", "energy5"] },
  { id: "clap", steps: ["clap1", "clap2", "clap3", "clap4", "clap5"] },
  { id: "back", steps: ["back1", "back2", "back3", "back4", "back5"] },
] as const;

export type RoutineId = (typeof ROUTINES)[number]["id"];

export interface State {
  routine: RoutineId | null;
  /** Seconds into the routine. */
  elapsed: number;
}

export const routine = (id: RoutineId | null) => ROUTINES.find((r) => r.id === id) ?? null;
export const totalSec = (id: RoutineId) => routine(id)!.steps.length * STEP_SEC;

/** The current move, its seconds left, and whether the routine is over. */
export function at(s: State): { index: number; left: number; over: boolean } {
  const r = routine(s.routine);
  if (!r) return { index: 0, left: STEP_SEC, over: false };
  const index = Math.floor(s.elapsed / STEP_SEC);
  if (index >= r.steps.length) return { index: r.steps.length - 1, left: 0, over: true };
  return { index, left: Math.ceil(STEP_SEC - (s.elapsed - index * STEP_SEC)), over: false };
}

/** Jump to the start of the next / previous move. */
export const skip = (s: State, by: 1 | -1): State => {
  const r = routine(s.routine);
  if (!r) return s;
  const i = Math.max(0, Math.min(r.steps.length, Math.floor(s.elapsed / STEP_SEC) + by));
  return { ...s, elapsed: i * STEP_SEC };
};
