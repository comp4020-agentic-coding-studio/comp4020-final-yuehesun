#!/usr/bin/env node
// Crit 10 extension, Stage 13 (plans/crit-10.md "Extension"; ADR 0007,
// second use). ADR 0005 argues in words only that "move back one place" is
// fairer than crit 8's "eject outright"; this simulates a day under both,
// plus a third alternative never shipped ("wait forever" — no forfeit at
// all), on the real src/queue.ts rules via sim/harness.ts (ADR 0007's
// whole point is never re-implementing the rules a second time — a copy
// could agree with itself while the real one is wrong). Report the
// numbers only: CLAUDE.md's test harness rules forbid writing a
// conclusion about which policy is "better" into README/PROCESS, and this
// script and sim/results.json draw none either.
import { writeFileSync } from "node:fs";
import { createHarness, type Harness, type MissedWindowPolicy } from "../sim/harness.ts";
import { makeRng, type Rng } from "../sim/rng.ts";
import { durationFor, isWashingType } from "../src/washing-types.ts";
import { dryingDurationFor, isDryingType } from "../src/drying-types.ts";
import { BOARD_STATE_CLASS, boardStateFor, boardStateLabel, boardTimeLeftSeconds, type BoardState } from "../src/board-state.ts";

// Real incident (plans/crit-10.md Stage 13 detail): the full batch below
// is 50 seeds x 3 policies x 840 simulated minutes each — about 126,000
// ticks, each doing several synchronous better-sqlite3 queries against
// unindexed tables — and running all of it inside one synchronous call
// stack with no await anywhere hung the whole WSL2 machine hard enough to
// need a Windows restart, twice, including once with no Claude Code
// session involved at all. This yields control back to Node's event loop
// (and, under virtualization, the host scheduler) periodically, so the
// process stays genuinely interruptible and the host gets to breathe.
// setImmediate costs microseconds, not milliseconds, so this doesn't
// meaningfully slow the actual computation down.
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

// --- behaviour model -----------------------------------------------------
// Everything below is an assumption about how a building full of residents
// behaves, not a measurement of a real one — nobody logged a real laundry
// room for this. Changing these numbers changes the results; they're
// collected here, commented, so anyone reading sim/results.json's own
// "assumptions" field (and /simulation, which repeats the warning) knows
// exactly what was guessed. One simplification worth naming up front:
// dryers are only ever reached through the post-wash "queue a dryer"
// prompt here, never booked directly — matching the main pattern the
// dryer feature (plans/crit-9.md Stage 8) was built around, not the full
// set of things the real UI technically allows.
export const MODEL = {
  simulatedMinutes: (22 - 8) * 60, // one Saturday, 08:00-22:00
  residentCount: 100,
  // Expected number of wash loads a resident starts across the whole day
  // (Poisson-distributed) — not everyone does laundry on a given Saturday,
  // a few do more than one load.
  meanLoadsPerResident: 0.6,
  washingTypeWeights: { quick: 0.3, normal: 0.5, heavy: 0.2 } as Record<string, number>,
  dryingTypeWeights: { quick: 0.3, normal: 0.5, heavy: 0.2 } as Record<string, number>,
  // Once a reservation is created, the chance the resident never acts on
  // it again at all (forgets to come back), checked independently at each
  // of the two decision points.
  chanceNeverClaims: 0.05,
  chanceNeverStartsOnceClaimed: 0.03,
  // Given that they do act, how late past "it's your turn"/"you claimed
  // it" they are, in minutes — uniform up to a cap that's deliberately
  // past the real window, so lateness sometimes costs them the window and
  // sometimes doesn't.
  maxClaimLatenessMinutes: 6, // the real window is 3 minutes
  maxStartLatenessMinutes: 9, // the real window is 5 minutes
  // Whether a resident takes the post-wash dryer prompt, and how they
  // answer a cross-machine "earlier machine" offer if one ever reaches them.
  chanceQueuesDryerAfterWash: 0.4,
  chanceRespondsToOfferAtAll: 0.85,
  chanceAcceptsOfferGivenResponds: 0.7,
} as const;

const POLICIES: MissedWindowPolicy[] = ["wait-forever", "eject", "move-back-one"];
const SEED_COUNT = 50;
const RESULTS_PATH = "sim/results.json";

function weightedPick(rng: Rng, weights: Record<string, number>): string {
  const entries = Object.entries(weights);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = rng.next() * total;
  for (const [key, w] of entries) {
    roll -= w;
    if (roll <= 0) return key;
  }
  return entries[entries.length - 1][0];
}

interface ResidentPlan {
  room: string;
  arriveAtMinute: number;
  washingType: string;
  dryingType: string;
  // Whether this resident ever claims/starts at all is fixed per load
  // (plausible as a trait: some people really do forget a given load
  // entirely), but *how late*, given that they do act, is re-rolled fresh
  // every time a window newly opens (see rollLateness below) — rolling it
  // once at plan-generation time and reusing it every retry would mean a
  // resident whose first roll exceeded the window keeps re-missing the
  // same window forever, bouncing back and forth with whoever's behind
  // them for the rest of the simulated day. A real person doesn't miss by
  // the exact same margin twice in a row.
  neverClaims: boolean;
  neverStartsOnceClaimed: boolean;
  queuesDryer: boolean;
  respondsToOffer: boolean;
  acceptsOfferGivenResponds: boolean;
}

// Each plan is one resident's one load — a resident with more than one
// load this day gets one plan per load, all under their own room number,
// so the real MAX_ACTIVE_PER_TYPE cap applies exactly as it would for a
// real resident (a third same-day washer load for one room is a real,
// expected rejection, not something this script works around).
function planResidents(rng: Rng): ResidentPlan[] {
  const plans: ResidentPlan[] = [];
  for (let i = 0; i < MODEL.residentCount; i++) {
    const room = `simroom${1000 + i}`;
    let loads = 0;
    let p = Math.exp(-MODEL.meanLoadsPerResident);
    let cumulative = p;
    const roll = rng.next();
    while (cumulative < roll && loads < 5) {
      loads++;
      p *= MODEL.meanLoadsPerResident / loads;
      cumulative += p;
    }
    for (let load = 0; load < loads; load++) {
      plans.push({
        room,
        arriveAtMinute: rng.int(0, MODEL.simulatedMinutes - 1),
        washingType: weightedPick(rng, MODEL.washingTypeWeights),
        dryingType: weightedPick(rng, MODEL.dryingTypeWeights),
        neverClaims: rng.chance(MODEL.chanceNeverClaims),
        neverStartsOnceClaimed: rng.chance(MODEL.chanceNeverStartsOnceClaimed),
        queuesDryer: rng.chance(MODEL.chanceQueuesDryerAfterWash),
        respondsToOffer: rng.chance(MODEL.chanceRespondsToOfferAtAll),
        acceptsOfferGivenResponds: rng.chance(MODEL.chanceAcceptsOfferGivenResponds),
      });
    }
  }
  return plans.sort((a, b) => a.arriveAtMinute - b.arriveAtMinute);
}

interface ResidentState {
  plan: ResidentPlan;
  reservationId: number | undefined;
  lastSeenClaimDeadlineMs: number | undefined;
  claimScheduledAtMinute: number | undefined;
  claimAttempted: boolean;
  lastSeenClaimedAt: number | undefined;
  startScheduledAtMinute: number | undefined;
  startAttempted: boolean;
  dryerQueued: boolean;
  offerResponded: boolean;
}

export interface RawMetrics {
  joinToStartWaitMinutes: number[];
  movedBackOrEjectedCount: number;
  machineIdleMinutesWhileSomeoneWaitedBehindAbsentFront: number;
  extraWaitCausedForOthersMinutes: number;
  extraWaitPaidBySelfMinutes: number;
}

// Crit 10 extension, Stage 14 (plans/crit-10.md "Extension"): one
// simulated minute's board state, recorded only when runOneDay is asked
// to (the `record` parameter) — the 50-seeds-x-3-policies batch that
// produces sim/results.json's metrics never records a replay for every
// run, only the one picked seed per policy does (see runSimulation's own
// comment on which seed that is). `state` mirrors src/board-state.ts's
// BoardState exactly — the client-side replay builds its own labels from
// the same values src/views.ts's board already uses, so "what does this
// state mean" can't drift between the real board and the replay.
export interface ReplayFrame {
  minute: number;
  machines: {
    machineId: number;
    state: BoardState;
    // Pre-computed by boardStateLabel/BOARD_STATE_CLASS (src/board-state.ts,
    // src/views.ts) at recording time, not re-derived client-side — the
    // client has no machine-type lookup of its own, and duplicating the
    // state->label switch in client JS would be exactly the kind of
    // second copy ADR 0007 exists to avoid, just in JS instead of TS.
    label: string;
    cls: string;
    nextRoom: string | undefined;
    timeLeftSeconds: number | undefined;
  }[];
  events: { kind: "moved_back" | "moved_up" | "ejected" | "offer_created" | "dryer_queued"; room: string; machineId: number }[];
}

// Runs one simulated day on an existing harness (reset before the call) —
// not a fresh harness per call, since sim/harness.ts's createHarness() can
// only run once per process (better-sqlite3's :memory: db is per-connection).
// Exported so spec/simulate-determinism.test.ts can run it twice against
// the same harness (reset between calls) with the same seed and compare.
//
// Stage 14: `record: true` additionally builds a ReplayFrame per
// simulated minute, for the one seed per policy runSimulation picks to
// ship as /simulation's playback. Off by default — every other seed in
// the 50-per-policy batch only needs RawMetrics, and recording a frame
// for all of them would be 50x the replay data for 49 recordings nothing
// ever reads.
export async function runOneDay(
  h: Harness,
  seed: number,
  policy: MissedWindowPolicy,
  record = false,
): Promise<{ metrics: RawMetrics; replay?: ReplayFrame[] }> {
  h.queue.setMissedWindowPolicy(policy);
  const rng = makeRng(seed);
  const plans = planResidents(rng);
  const states: ResidentState[] = plans.map((plan) => ({
    plan,
    reservationId: undefined,
    lastSeenClaimDeadlineMs: undefined,
    claimScheduledAtMinute: undefined,
    claimAttempted: false,
    lastSeenClaimedAt: undefined,
    startScheduledAtMinute: undefined,
    startAttempted: false,
    dryerQueued: false,
    offerResponded: false,
  }));

  const metrics: RawMetrics = {
    joinToStartWaitMinutes: [],
    movedBackOrEjectedCount: 0,
    machineIdleMinutesWhileSomeoneWaitedBehindAbsentFront: 0,
    extraWaitCausedForOthersMinutes: 0,
    extraWaitPaidBySelfMinutes: 0,
  };
  const replay: ReplayFrame[] | undefined = record ? [] : undefined;

  let planIndex = 0;
  const washerIds = h.machines.filter((m) => m.type === "washer").map((m) => m.id);
  const stateByPlan = new Map(plans.map((plan, i) => [plan, states[i]]));

  for (let currentMinute = 0; currentMinute < MODEL.simulatedMinutes; currentMinute++) {
    // Yield once an hour of simulated time (14 points across one simulated
    // day) — see yieldToEventLoop's own comment for why this exists.
    if (currentMinute > 0 && currentMinute % 60 === 0) await yieldToEventLoop();

    const now = h.clock.now();
    const minuteEvents: ReplayFrame["events"] = [];

    // 1. New arrivals: join, picking the washer with the shortest queue
    // right now (mirrors the home page's "let the app assign" option —
    // plan.md's User story — rather than a uniformly random pick, since a
    // building full of residents who all wanted a machine right now would
    // realistically gravitate toward whichever queue is shortest). Queue
    // length alone (not a fresh queueFor() per candidate, which would
    // trigger settleMachine() up to 8 extra times a minute for no reason —
    // this tick's own step 2 already computes the real queueFor() once per
    // machine right after) is a good enough proxy for "which would start
    // soonest" at arrival time.
    if (planIndex < plans.length && plans[planIndex].arriveAtMinute === currentMinute) {
      // One allReservations() read, reused for every arrival this same
      // minute, rather than one call per candidate machine per arrival.
      const active = h.allReservations().filter((r) => r.status === "waiting" || r.status === "claimed" || r.status === "running");
      const activeCountByMachine = new Map<number, number>();
      for (const r of active) activeCountByMachine.set(r.machineId, (activeCountByMachine.get(r.machineId) ?? 0) + 1);

      while (planIndex < plans.length && plans[planIndex].arriveAtMinute === currentMinute) {
        const plan = plans[planIndex++];
        const state = stateByPlan.get(plan)!;
        let best: { id: number; len: number } | undefined;
        for (const id of washerIds) {
          const len = activeCountByMachine.get(id) ?? 0;
          if (!best || len < best.len) best = { id, len };
        }
        const duration = isWashingType(plan.washingType) ? durationFor(plan.washingType) : 0;
        const result = h.queue.join(best!.id, plan.room, plan.washingType, duration);
        if (result.ok) {
          activeCountByMachine.set(best!.id, (activeCountByMachine.get(best!.id) ?? 0) + 1);
          state.reservationId = result.reservationId;
        }
      }
    }

    // 2. This tick's "before" truth: every machine's queue, computed
    // exactly once per machine per tick, and the raw reservation table —
    // as of right now, before any resident reacts and before the clock
    // moves. Reused for resident scheduling and the policy-event diff
    // below (step 5).
    const rowsById = new Map<number, ReturnType<Harness["queue"]["queueFor"]>[number]>();
    const beforeFrontByMachine = new Map<number, { reservationId: number; status: string; queueLength: number }>();
    for (const m of h.machines) {
      const rows = h.queue.queueFor(m.id, now);
      for (const r of rows) rowsById.set(r.reservationId, r);
      if (rows.length > 0) beforeFrontByMachine.set(m.id, { reservationId: rows[0].reservationId, status: rows[0].status, queueLength: rows.length });
    }
    const reservationsById = new Map(h.allReservations().map((r) => [r.id, r]));

    // 3. Resident reactions, in a fixed order (arrival order) so the same
    // seed always produces the same sequence of actions.
    for (const state of states) {
      if (state.reservationId == null) continue;
      const row = rowsById.get(state.reservationId);
      const reservation = reservationsById.get(state.reservationId);
      if (!row || !reservation) continue; // done/missed/cancelled — nothing left to do

      // Claim scheduling: a fresh claimDeadlineMs (first time waiting at
      // the front, or a new one after a move-back cycled them through
      // again) means a fresh chance, with freshly-rolled lateness — never
      // the same margin twice, so a resident who happens to miss once
      // isn't guaranteed to miss every future chance on this same load too.
      if (row.status === "waiting" && row.position === 1 && row.claimDeadlineMs != null && row.claimDeadlineMs !== state.lastSeenClaimDeadlineMs) {
        state.lastSeenClaimDeadlineMs = row.claimDeadlineMs;
        state.claimAttempted = false;
        state.claimScheduledAtMinute = state.plan.neverClaims ? undefined : currentMinute + rng.int(0, MODEL.maxClaimLatenessMinutes);
      }
      if (state.claimScheduledAtMinute != null && currentMinute >= state.claimScheduledAtMinute && !state.claimAttempted) {
        h.queue.claim(state.reservationId, state.plan.room);
        state.claimAttempted = true;
      }

      // Start scheduling: same idea, keyed on a fresh claimedAt.
      if (reservation.status === "claimed" && reservation.claimedAt !== state.lastSeenClaimedAt) {
        state.lastSeenClaimedAt = reservation.claimedAt ?? undefined;
        state.startAttempted = false;
        state.startScheduledAtMinute = state.plan.neverStartsOnceClaimed ? undefined : currentMinute + rng.int(0, MODEL.maxStartLatenessMinutes);
      }
      if (state.startScheduledAtMinute != null && currentMinute >= state.startScheduledAtMinute && !state.startAttempted) {
        h.queue.start(state.reservationId, state.plan.room);
        state.startAttempted = true;
      }

      // The dryer prompt is offered the instant a wash reservation exists
      // (plan.md's User story: offered right after reserving, not after
      // it starts), so react to it once, as soon as we see this reservation.
      if (!state.dryerQueued && state.plan.queuesDryer) {
        state.dryerQueued = true; // only one attempt, success or not
        const dryingDuration = isDryingType(state.plan.dryingType) ? dryingDurationFor(state.plan.dryingType) : 0;
        const dryerResult = h.queue.queueDryer(state.reservationId, state.plan.room, state.plan.dryingType, dryingDuration);
        if (dryerResult.ok) {
          const dryerReservation = h.allReservations().find((r) => r.id === dryerResult.reservationId);
          if (dryerReservation) minuteEvents.push({ kind: "dryer_queued", room: state.plan.room, machineId: dryerReservation.machineId });
        }
      }
    }

    // 4. Offer responses, same pass shape.
    const pendingOffersByReservation = new Map(h.allOffers().filter((o) => o.status === "pending").map((o) => [o.reservationId, o]));
    for (const state of states) {
      if (state.reservationId == null || state.offerResponded) continue;
      const offer = pendingOffersByReservation.get(state.reservationId);
      if (!offer) continue;
      if (!state.plan.respondsToOffer) continue; // leaves it to expire naturally
      state.offerResponded = true;
      if (state.plan.acceptsOfferGivenResponds) {
        h.queue.acceptOffer(offer.id, state.plan.room);
        // acceptOffer() cancels the old reservation and inserts a new one
        // (with this offer's id) on the offered machine — this resident's
        // tracked reservationId must follow it, or every later step (claim/
        // start scheduling, the join-to-start wait read at the end) would
        // silently stop seeing them the instant their offer is accepted.
        const replacement = h.allReservations().find((r) => r.offerId === offer.id);
        if (replacement) {
          state.reservationId = replacement.id;
          // Fresh reservation, fresh claim window: step 3's own
          // claimDeadlineMs-change detection (above) picks this up and
          // schedules the claim attempt the next time it sees this
          // reservation, the same as it would for any other waiting front.
          state.lastSeenClaimDeadlineMs = undefined;
          state.claimAttempted = false;
        }
      } else {
        h.queue.declineOffer(offer.id, state.plan.room);
      }
    }

    // 5. Idle-while-someone-waits check, using the "before" truth (state
    // as of the start of this tick, which is exactly when an overdue
    // front — one still waiting past its own deadline — would show up).
    // By construction this can only ever be nonzero under "wait-forever":
    // under the other two policies, settleMachine resolves an overdue
    // front within the very tick its deadline passes (see step 6's own
    // advanceMinutes call), so one can never still be sitting overdue at
    // the START of a later tick.
    for (const m of h.machines) {
      const front = beforeFrontByMachine.get(m.id);
      if (!front || front.queueLength < 2) continue;
      const reservation = reservationsById.get(front.reservationId)!;
      const overdue =
        (front.status === "waiting" &&
          reservation.turnStartedAt != null &&
          now - reservation.turnStartedAt >= (reservation.offerId != null ? h.queue.OFFER_CLAIM_WINDOW_MS : h.queue.CLAIM_WINDOW_MS)) ||
        (front.status === "claimed" && reservation.claimedAt != null && now - reservation.claimedAt >= h.queue.START_WINDOW_MS);
      if (overdue) metrics.machineIdleMinutesWhileSomeoneWaitedBehindAbsentFront += 1;
    }

    // 6. Advance the clock — this is where queue.ts's own settleMachine/
    // processOffers actually fire any policy transition, exactly as the
    // real realtime tick would. New offers are created inside this call
    // (processOffers, not something runOneDay calls directly), so
    // offer_created is detected by diffing pending offer ids before/after
    // rather than at a single call site.
    const pendingOfferIdsBefore = new Set(h.allOffers().filter((o) => o.status === "pending").map((o) => o.id));
    h.advanceMinutes(1);
    const afterNow = h.clock.now();
    if (replay) {
      for (const offer of h.allOffers()) {
        if (offer.status === "pending" && !pendingOfferIdsBefore.has(offer.id)) {
          const reservation = h.allReservations().find((r) => r.id === offer.reservationId);
          if (reservation) minuteEvents.push({ kind: "offer_created", room: reservation.personName, machineId: offer.machineId });
        }
      }
    }

    // 7. Diff each machine's front against step 2's "before" snapshot to
    // detect a policy event. A legitimate state progression (claim/start
    // succeeding, or a wash finishing on schedule) never changes which
    // reservationId sits at the front mid-cycle except by the resident's
    // own action above or a normal completion — both leave the
    // reservationId at the front unchanged (completion simply removes it
    // once "running" naturally finishes, which this model's own residents
    // never cut short, so a "running" front disappearing here is always a
    // real finish, never a policy event; only "waiting"/"claimed" fronts
    // are eligible for a missed-window policy at all).
    for (const [machineId, before] of beforeFrontByMachine) {
      if (before.status !== "waiting" && before.status !== "claimed") continue;
      const afterRows = h.queue.queueFor(machineId, afterNow);
      const stillAtFront = afterRows[0]?.reservationId === before.reservationId;
      if (stillAtFront) continue; // no policy event — still there (or legitimately progressed, same id)

      const windowMinutes = before.status === "waiting" ? 3 : 5; // CLAIM_WINDOW_MS / START_WINDOW_MS, in minutes
      metrics.movedBackOrEjectedCount += 1;
      metrics.extraWaitCausedForOthersMinutes += windowMinutes;

      const missedRoom = reservationsById.get(before.reservationId)?.personName ?? "?";
      const stillActiveSomewhere = afterRows.some((r) => r.reservationId === before.reservationId);
      if (stillActiveSomewhere) {
        // Moved back one place: the "self cost" is waiting behind whoever
        // now sits ahead of them — that reservation's own duration.
        const newFront = afterRows[0];
        const newFrontReservation = h.allReservations().find((r) => r.id === newFront.reservationId);
        if (newFrontReservation) metrics.extraWaitPaidBySelfMinutes += newFrontReservation.durationMinutes;
        minuteEvents.push({ kind: "moved_back", room: missedRoom, machineId });
        if (newFrontReservation) minuteEvents.push({ kind: "moved_up", room: newFrontReservation.personName, machineId });
      } else {
        // Ejected: no further wait is tracked for them at all (they're
        // simply gone from the data) — recorded as 0 additional self-cost
        // deliberately, not omitted, so the metric's meaning stays
        // "additional minutes measured," distinct from "no further measurable
        // outcome," which movedBackOrEjectedCount and the join-to-start wait
        // array (which an ejected reservation never joins) already show.
        minuteEvents.push({ kind: "ejected", room: missedRoom, machineId });
      }
    }

    // 8. Stage 14: one ReplayFrame for this minute, if recording — full
    // machine state after the clock advanced (so a resident who just
    // claimed/started this minute shows their new state, not the stale
    // "before" one), plus every event minuteEvents collected above.
    if (replay) {
      replay.push({
        minute: currentMinute,
        machines: h.machines.map((m) => {
          const rows = h.queue.queueFor(m.id, afterNow);
          const front = rows[0];
          const state = boardStateFor(front, false);
          return {
            machineId: m.id,
            state,
            label: boardStateLabel(state, m.type),
            cls: BOARD_STATE_CLASS[state],
            nextRoom: front?.person,
            timeLeftSeconds: boardTimeLeftSeconds(front, afterNow),
          };
        }),
        events: minuteEvents,
      });
    }
  }

  // Join-to-start wait, read directly off the real schema fields rather
  // than tracked during the loop — every reservation that ever reached
  // "running" has both joinedAt and startedAt set by queue.ts itself.
  for (const r of h.allReservations()) {
    if (r.startedAt != null) metrics.joinToStartWaitMinutes.push((r.startedAt - r.joinedAt) / 60_000);
  }

  return { metrics, replay };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
}

export interface SeedResult {
  seed: number;
  joinToStartWaitMedianMinutes: number;
  joinToStartWaitP90Minutes: number;
  joinToStartWaitMaxMinutes: number;
  movedBackOrEjectedCount: number;
  machineIdleMinutesWhileSomeoneWaitedBehindAbsentFront: number;
  extraWaitCausedForOthersMinutes: number;
  extraWaitPaidBySelfMinutes: number;
}

function summarizeSeed(seed: number, raw: RawMetrics): SeedResult {
  return {
    seed,
    joinToStartWaitMedianMinutes: median(raw.joinToStartWaitMinutes),
    joinToStartWaitP90Minutes: percentile(raw.joinToStartWaitMinutes, 90),
    joinToStartWaitMaxMinutes: raw.joinToStartWaitMinutes.length > 0 ? Math.max(...raw.joinToStartWaitMinutes) : 0,
    movedBackOrEjectedCount: raw.movedBackOrEjectedCount,
    machineIdleMinutesWhileSomeoneWaitedBehindAbsentFront: raw.machineIdleMinutesWhileSomeoneWaitedBehindAbsentFront,
    extraWaitCausedForOthersMinutes: raw.extraWaitCausedForOthersMinutes,
    extraWaitPaidBySelfMinutes: raw.extraWaitPaidBySelfMinutes,
  };
}

function aggregateStat(seeds: SeedResult[], key: keyof Omit<SeedResult, "seed">): { mean: number; stddev: number } {
  const values = seeds.map((s) => s[key]);
  return { mean: mean(values), stddev: stddev(values) };
}

export interface PolicySummary {
  policy: MissedWindowPolicy;
  seeds: SeedResult[];
  aggregate: Record<keyof Omit<SeedResult, "seed">, { mean: number; stddev: number }>;
  // Stage 14: one representative day's full board history, for
  // /simulation's playback — the seed whose movedBackOrEjectedCount is
  // closest to this policy's own mean (not the most dramatic seed, which
  // would misrepresent what's typical).
  replaySeed: number;
  replay: ReplayFrame[];
}

export interface SimulationResults {
  generatedBy: "scripts/simulate.ts";
  seedCount: number;
  model: typeof MODEL;
  policies: PolicySummary[];
}

export async function runSimulation(): Promise<SimulationResults> {
  const h = await createHarness({ silent: true });
  const policies: PolicySummary[] = [];

  for (const policy of POLICIES) {
    const seeds: SeedResult[] = [];
    for (let seed = 1; seed <= SEED_COUNT; seed++) {
      h.reset();
      const { metrics } = await runOneDay(h, seed, policy);
      seeds.push(summarizeSeed(seed, metrics));
      process.stdout.write(`\r${policy}: seed ${seed}/${SEED_COUNT}          `);
    }
    process.stdout.write("\n");
    const keys: (keyof Omit<SeedResult, "seed">)[] = [
      "joinToStartWaitMedianMinutes",
      "joinToStartWaitP90Minutes",
      "joinToStartWaitMaxMinutes",
      "movedBackOrEjectedCount",
      "machineIdleMinutesWhileSomeoneWaitedBehindAbsentFront",
      "extraWaitCausedForOthersMinutes",
      "extraWaitPaidBySelfMinutes",
    ];
    const aggregate = Object.fromEntries(keys.map((k) => [k, aggregateStat(seeds, k)])) as PolicySummary["aggregate"];

    // Stage 14: re-run the seed closest to this policy's own mean
    // movedBackOrEjectedCount, this time recording a replay — a second
    // run rather than recording all 50 the first time, since only one
    // per policy ever gets read (see ReplayFrame's own comment).
    const meanSwaps = aggregate.movedBackOrEjectedCount.mean;
    const replaySeed = seeds.reduce((closest, s) =>
      Math.abs(s.movedBackOrEjectedCount - meanSwaps) < Math.abs(closest.movedBackOrEjectedCount - meanSwaps) ? s : closest,
    ).seed;
    h.reset();
    const { replay } = await runOneDay(h, replaySeed, policy, true);

    policies.push({ policy, seeds, aggregate, replaySeed, replay: replay ?? [] });
  }

  return { generatedBy: "scripts/simulate.ts", seedCount: SEED_COUNT, model: MODEL, policies };
}

async function main(): Promise<void> {
  console.log(`Simulating ${SEED_COUNT} seeds x ${POLICIES.length} policies, ${MODEL.residentCount} residents over ${MODEL.simulatedMinutes / 60} hours each...`);
  const results = await runSimulation();
  writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2) + "\n");
  console.log(`Wrote ${RESULTS_PATH}`);
  for (const p of results.policies) {
    console.log(
      `${p.policy}: join-to-start wait median ${p.aggregate.joinToStartWaitMedianMinutes.mean.toFixed(1)}min, moved-back-or-ejected ${p.aggregate.movedBackOrEjectedCount.mean.toFixed(1)}, idle-while-waiting ${p.aggregate.machineIdleMinutesWhileSomeoneWaitedBehindAbsentFront.mean.toFixed(1)}min`,
    );
  }
}

if (process.argv[1]?.endsWith("simulate.ts")) {
  main();
}
