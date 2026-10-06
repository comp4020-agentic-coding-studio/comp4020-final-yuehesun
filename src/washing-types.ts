// The washing type is chosen at reservation time and fixes the duration up
// front — plan.md's "User story": nothing about duration is decided later.
export const WASHING_TYPES = {
  quick: { label: "Quick wash", minutes: 15 },
  normal: { label: "Normal wash", minutes: 30 },
  heavy: { label: "Heavy wash", minutes: 45 },
} as const;

export type WashingType = keyof typeof WASHING_TYPES;

export function isWashingType(value: string): value is WashingType {
  return value in WASHING_TYPES;
}

export function durationFor(washingType: WashingType): number {
  return WASHING_TYPES[washingType].minutes;
}
