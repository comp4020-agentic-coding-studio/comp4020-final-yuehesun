// Crit 10 extension, Stage 9 (plans/crit-10.md "Extension"; ADR 0007): the
// driver applies one action at a time through the real src/queue.ts
// functions — join, claim, start, cancel, finish, accept/decline an offer,
// queue a dryer, or let N minutes pass. Both spec/fairness-properties.test.ts
// (fast-check) and scripts/simulate.ts build their own action sequences and
// run them through this one function, so there is exactly one place that
// calls into queue.ts on the harness's behalf.
import { dryingDurationFor, isDryingType } from "../src/drying-types.ts";
import { durationFor, isWashingType } from "../src/washing-types.ts";
import type { Harness } from "./harness.ts";

export type Action =
  | { kind: "join"; room: string; machineId: number; washingType: string }
  | { kind: "claim"; room: string; reservationId: number }
  | { kind: "start"; room: string; reservationId: number }
  | { kind: "cancel"; room: string; reservationId: number }
  | { kind: "finish"; room: string; reservationId: number }
  | { kind: "acceptOffer"; room: string; offerId: number }
  | { kind: "declineOffer"; room: string; offerId: number }
  | { kind: "queueDryer"; room: string; washReservationId: number; dryingType: string }
  | { kind: "advanceMinutes"; minutes: number };

export interface ActionOutcome {
  action: Action;
  ok: boolean;
  message?: string;
}

// Applies one action and returns whether it succeeded — never throws on a
// business-rule rejection (a 409, a 403, ...), since those are expected,
// everyday outcomes a random sequence will hit constantly; a thrown error
// means something actually went wrong.
export function applyAction(h: Harness, action: Action): ActionOutcome {
  switch (action.kind) {
    case "join": {
      // Mirrors app.ts's own POST /machines/:id/reservations: a malformed
      // type is a 400 before queue.ts is even called — not a queue rule,
      // so this isn't "copying queue logic" (ADR 0007/CLAUDE.md's rule),
      // just the same request-shape validation every real join goes
      // through first.
      const duration = isWashingType(action.washingType)
        ? durationFor(action.washingType)
        : isDryingType(action.washingType)
          ? dryingDurationFor(action.washingType)
          : undefined;
      if (duration == null) return { action, ok: false, message: "invalid washing/drying type" };
      const result = h.queue.join(action.machineId, action.room, action.washingType, duration);
      return { action, ok: result.ok, message: result.ok ? undefined : result.message };
    }
    case "claim": {
      const result = h.queue.claim(action.reservationId, action.room);
      return { action, ok: result.ok, message: result.ok ? undefined : result.message };
    }
    case "start": {
      const result = h.queue.start(action.reservationId, action.room);
      return { action, ok: result.ok, message: result.ok ? undefined : result.message };
    }
    case "cancel": {
      const result = h.queue.cancel(action.reservationId, action.room);
      return { action, ok: result.ok, message: result.ok ? undefined : result.message };
    }
    case "finish": {
      const result = h.queue.finish(action.reservationId, action.room);
      return { action, ok: result.ok, message: result.ok ? undefined : result.message };
    }
    case "acceptOffer": {
      const result = h.queue.acceptOffer(action.offerId, action.room);
      return { action, ok: result.ok, message: result.ok ? undefined : result.message };
    }
    case "declineOffer": {
      const result = h.queue.declineOffer(action.offerId, action.room);
      return { action, ok: result.ok, message: result.ok ? undefined : result.message };
    }
    case "queueDryer": {
      if (!isDryingType(action.dryingType)) return { action, ok: false, message: "invalid drying type" };
      const result = h.queue.queueDryer(
        action.washReservationId,
        action.room,
        action.dryingType,
        dryingDurationFor(action.dryingType),
      );
      return { action, ok: result.ok, message: result.ok ? undefined : result.message };
    }
    case "advanceMinutes": {
      h.advanceMinutes(action.minutes);
      return { action, ok: true };
    }
  }
}
