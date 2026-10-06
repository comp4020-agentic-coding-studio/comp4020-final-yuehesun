// ADR 0004: identity is a room number only — a name isn't unique enough to
// safely key the fairness rule and reservation ownership on. 1-4 digits:
// enough for a real room number, tight enough to reject the 14-digit
// timestamp-shaped values a careless test run once left on the live site.
const ROOM_PATTERN = /^room([0-9]{1,4})$/;
const BARE_NUMBER = /^[0-9]{1,4}$/;

// Accepts "room304" or a bare "304" (prepends "room"), so a visitor who
// just types the number doesn't hit a confusing format error.
export function normalizeRoom(input: string): string | undefined {
  const value = input.trim().toLowerCase();
  if (ROOM_PATTERN.test(value)) return value;
  if (BARE_NUMBER.test(value)) return `room${value}`;
  return undefined;
}
