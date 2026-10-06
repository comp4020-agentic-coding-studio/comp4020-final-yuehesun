// ADR 0004: identity is a room number only — a name isn't unique enough to
// safely key the fairness rule and reservation ownership on.
const ROOM_PATTERN = /^room[0-9]+$/;

export function normalizeRoom(input: string): string | undefined {
  const room = input.trim().toLowerCase();
  return ROOM_PATTERN.test(room) ? room : undefined;
}
