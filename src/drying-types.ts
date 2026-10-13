// Crit 9 (plans/crit-9.md Stage 8): a separate lookup from WASHING_TYPES,
// not a reuse of the same durations — drying genuinely runs longer in
// practice, and the two are free to diverge rather than secretly being
// the same table wearing two names.
export const DRYING_TYPES = {
  test: { label: "Test dry (for trying the app)", minutes: 1 },
  quick: { label: "Quick dry", minutes: 20 },
  normal: { label: "Normal dry", minutes: 40 },
  heavy: { label: "Heavy dry", minutes: 60 },
} as const;

export type DryingType = keyof typeof DRYING_TYPES;

export function isDryingType(value: string): value is DryingType {
  return value in DRYING_TYPES;
}

export function dryingDurationFor(dryingType: DryingType): number {
  return DRYING_TYPES[dryingType].minutes;
}
