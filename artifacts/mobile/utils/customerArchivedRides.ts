import AsyncStorage from "@react-native-async-storage/async-storage";

const keyFor = (passengerId: string) => `@Onroda_customer_archived_rides:${passengerId.trim()}`;

export async function loadCustomerArchivedRideIds(passengerId: string): Promise<Set<string>> {
  const id = passengerId.trim();
  if (!id) return new Set();
  try {
    const raw = await AsyncStorage.getItem(keyFor(id));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === "string" && x.trim().length > 0));
  } catch {
    return new Set();
  }
}

export async function archiveCustomerRide(passengerId: string, rideId: string): Promise<Set<string>> {
  const pid = passengerId.trim();
  const rid = rideId.trim();
  if (!pid || !rid) return new Set();
  const current = await loadCustomerArchivedRideIds(pid);
  current.add(rid);
  const list = [...current];
  await AsyncStorage.setItem(keyFor(pid), JSON.stringify(list)).catch(() => undefined);
  return current;
}
