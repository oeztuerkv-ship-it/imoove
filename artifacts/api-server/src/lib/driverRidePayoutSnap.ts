/** ONRODA-Fahrerprovision auf Fahrtpreis (Brutto/Taxameter) — Stand: fix 8 %. */
export const ONRODA_DRIVER_PROVISION_RATE = 0.08;

export type DriverRidePayoutSnap = {
  provisionAmount: number;
  payoutAmount: number;
  provisionRate: number;
};

function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Brutto-Fahrtpreis → Provision + Fahrer-Anteil (ohne Trinkgeld). */
export function computeDriverRidePayoutSnap(finalFareEur: number): DriverRidePayoutSnap | null {
  const gross = roundMoney(Math.max(0, finalFareEur));
  if (gross <= 0) return null;
  const provisionAmount = roundMoney(gross * ONRODA_DRIVER_PROVISION_RATE);
  const payoutAmount = roundMoney(Math.max(0, gross - provisionAmount));
  return {
    provisionAmount,
    payoutAmount,
    provisionRate: ONRODA_DRIVER_PROVISION_RATE,
  };
}
