import { expect, inject, it } from "vitest";
import { cleanupReservation, identityCookie, join, state, uniqueRoom } from "./support/queue-client.ts";
import { acceptOffer, claimAndStart, declineOffer, finish, waitForOffer } from "./support/offer-client.ts";

// Crit 9 Stage 3 (plans/crit-9.md): the "earlier machine" offer. The
// eligibility algorithm looks across *every* machine of the same type
// (plan.md's User story), so every machine except the two this test
// actually uses has to be kept occupied for the whole test — otherwise an
// unrelated idle machine (left over from another spec file, or just the
// seeded default) could win the offer instead of the one this test means
// to test, non-deterministically.
const baseUrl = inject("baseUrl");
const [HOLDER_MACHINE, IDLE_MACHINE] = [7, 8];
const OTHER_MACHINES = [1, 2, 3, 4, 5, 6, 9, 10];

async function occupyOthers(): Promise<{ cookie: string; reservationId: number }[]> {
  const fillers: { cookie: string; reservationId: number }[] = [];
  for (const machineId of OTHER_MACHINES) {
    const cookie = await identityCookie(baseUrl, uniqueRoom());
    const reservationId = await join(baseUrl, cookie, machineId);
    fillers.push({ cookie, reservationId });
  }
  return fillers;
}

async function releaseOthers(fillers: { cookie: string; reservationId: number }[]): Promise<void> {
  for (const { cookie, reservationId } of fillers) {
    await cleanupReservation(baseUrl, cookie, reservationId);
  }
}

it("offers a newly idle machine to the longest-waiting eligible person elsewhere, and accepting swaps them over", async () => {
  const fillers = await occupyOthers();
  try {
    // A long wash ahead of candidate on HOLDER_MACHINE means candidate's
    // own scheduledStartMs is well in the future — genuinely worth
    // switching.
    const candidateRoom = uniqueRoom();
    const holder = await identityCookie(baseUrl, uniqueRoom());
    const candidate = await identityCookie(baseUrl, candidateRoom);
    const holderReservation = await join(baseUrl, holder, HOLDER_MACHINE);
    const candidateReservation = await join(baseUrl, candidate, HOLDER_MACHINE);

    // IDLE_MACHINE goes fully idle by someone finishing early
    // (plans/crit-9.md Stage 1.5's "end the wash"), not by waiting out a
    // real duration.
    const finisher = await identityCookie(baseUrl, uniqueRoom());
    const finisherReservation = await join(baseUrl, finisher, IDLE_MACHINE);
    await claimAndStart(baseUrl, finisher, finisherReservation);
    await finish(baseUrl, finisher, finisherReservation);

    const offerId = await waitForOffer(baseUrl, candidate);

    const acceptStatus = await acceptOffer(baseUrl, candidate, offerId);
    expect(acceptStatus, "accepting an offer should succeed").toBeLessThan(400);

    const holderMachineState = await state(baseUrl, HOLDER_MACHINE);
    expect(
      holderMachineState.some((r) => r.reservationId === candidateReservation),
      "accepting should vacate the candidate's original reservation",
    ).toBe(false);

    const idleMachineState = await state(baseUrl, IDLE_MACHINE);
    const candidateRow = idleMachineState.find((r) => r.person === candidateRoom);
    expect(candidateRow, "the candidate should now be waiting on the newly idle machine").toBeTruthy();
    expect(candidateRow?.status).toBe("waiting");

    await cleanupReservation(baseUrl, holder, holderReservation);
    if (candidateRow) await cleanupReservation(baseUrl, candidate, candidateRow.reservationId);
  } finally {
    await releaseOthers(fillers);
  }
});

it("declining an offer leaves the original reservation untouched", async () => {
  const fillers = await occupyOthers();
  try {
    const candidateRoom = uniqueRoom();
    const holder = await identityCookie(baseUrl, uniqueRoom());
    const candidate = await identityCookie(baseUrl, candidateRoom);
    const holderReservation = await join(baseUrl, holder, HOLDER_MACHINE);
    const candidateReservation = await join(baseUrl, candidate, HOLDER_MACHINE);

    const finisher = await identityCookie(baseUrl, uniqueRoom());
    const finisherReservation = await join(baseUrl, finisher, IDLE_MACHINE);
    await claimAndStart(baseUrl, finisher, finisherReservation);
    await finish(baseUrl, finisher, finisherReservation);

    const offerId = await waitForOffer(baseUrl, candidate);
    const declineStatus = await declineOffer(baseUrl, candidate, offerId);
    expect(declineStatus, "declining an offer should succeed").toBeLessThan(400);

    const holderMachineState = await state(baseUrl, HOLDER_MACHINE);
    const candidateRow = holderMachineState.find((r) => r.reservationId === candidateReservation);
    expect(candidateRow, "declining should leave the original reservation in place").toBeTruthy();
    expect(candidateRow?.status).toBe("waiting");

    await cleanupReservation(baseUrl, holder, holderReservation);
    await cleanupReservation(baseUrl, candidate, candidateReservation);
  } finally {
    await releaseOthers(fillers);
  }
});
