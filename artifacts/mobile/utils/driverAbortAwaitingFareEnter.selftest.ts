/**
 * Smoke: Mid-Trip-Abort Fare-Modal — Poll-Ticks dürfen Tippen nicht zurücksetzen.
 *   npx tsx artifacts/mobile/utils/driverAbortAwaitingFareEnter.selftest.ts
 */
import { planAbortAwaitingFareEnter } from "./driverAbortAwaitingFareEnter";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const first = planAbortAwaitingFareEnter(false);
assert(first.seedFareInput === true, "first entry seeds fare");
assert(first.promptDriver === true, "first entry prompts");
assert(first.markPrompted === true, "first entry marks prompted");

const again = planAbortAwaitingFareEnter(true);
assert(again.seedFareInput === false, "repeat must not seed");
assert(again.promptDriver === false, "repeat must not alert");
assert(again.markPrompted === false, "repeat must not re-mark");

/** Simuliert navigation.tsx enterAbortAwaitingFare + Polling während Tippen. */
function simulateEnterLoop(): void {
  let prompted = false;
  let fareInput = "";
  let modalOpen = false;
  let status = "in_progress";

  const enter = (defaultSeed: string) => {
    status = "customer_abort_pending_fare";
    modalOpen = true;
    const plan = planAbortAwaitingFareEnter(prompted);
    if (plan.seedFareInput) {
      fareInput = defaultSeed;
    }
    if (plan.markPrompted) {
      prompted = true;
    }
  };

  enter("0,00");
  assert(modalOpen && fareInput === "0,00" && prompted, "first poll opens + seeds");

  fareInput = "1";
  enter("0,00");
  assert(fareInput === "1", "poll while typing digit 1");

  fareInput = "12";
  enter("0,00");
  enter("5,00");
  enter("0,00");
  assert(fareInput === "12", "multiple poll ticks keep typed value");
  assert(status === "customer_abort_pending_fare", "status stays pending");
  assert(modalOpen, "modal stays open");
}

simulateEnterLoop();

console.log("driverAbortAwaitingFareEnter.selftest: OK");
