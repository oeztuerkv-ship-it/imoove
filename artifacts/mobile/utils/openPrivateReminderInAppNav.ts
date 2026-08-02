import { Alert } from "react-native";
import * as Location from "expo-location";

import {
  buildPrivateMemoNavigationHref,
  replaceDriverStackExclusive,
} from "@/utils/driverNavigationRoute";
import { geocodeAddressNominatim } from "@/utils/geocodeAddressNominatim";

/**
 * Private Notiz → integrierte Fahrer-Navi (nicht Apple/Google Maps-App).
 * Geocodiert Adresstext, startet /driver/navigation mit privateMemo=1.
 */
export async function openPrivateReminderInAppNav(input: {
  reminderId: string;
  fromFull: string;
  toFull: string;
  driverId: string;
  driverPos?: { lat: number; lon: number } | null;
}): Promise<void> {
  const from = input.fromFull.trim();
  const to = input.toFull.trim();
  if (!from && !to) {
    Alert.alert("Navigation", "Bitte Start oder Ziel eintragen.");
    return;
  }
  const driverId = input.driverId.trim();
  if (!driverId) {
    Alert.alert("Navigation", "Fahrer-Session fehlt.");
    return;
  }

  let driverLat = input.driverPos?.lat;
  let driverLon = input.driverPos?.lon;
  if (
    driverLat == null ||
    driverLon == null ||
    !Number.isFinite(driverLat) ||
    !Number.isFinite(driverLon)
  ) {
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== "granted") {
        Alert.alert("Navigation", "Standortfreigabe nötig für die In-App-Navigation.");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      driverLat = pos.coords.latitude;
      driverLon = pos.coords.longitude;
    } catch {
      Alert.alert("Navigation", "Standort konnte nicht ermittelt werden.");
      return;
    }
  }

  const pickupQuery = from || to;
  const destQuery = to || from;
  const [pickupGeo, destGeo] = await Promise.all([
    geocodeAddressNominatim(pickupQuery),
    pickupQuery === destQuery ? Promise.resolve(null) : geocodeAddressNominatim(destQuery),
  ]);

  if (!pickupGeo) {
    Alert.alert(
      "Navigation",
      `Adresse nicht gefunden: „${pickupQuery}“. Bitte genauer eintragen (Straße, PLZ, Ort).`,
    );
    return;
  }

  const dest = destGeo ?? pickupGeo;
  replaceDriverStackExclusive(
    buildPrivateMemoNavigationHref({
      reminderId: input.reminderId,
      driverId,
      driverLat,
      driverLon,
      pickupLat: pickupGeo.lat,
      pickupLon: pickupGeo.lon,
      pickupName: from || pickupGeo.displayName,
      destLat: dest.lat,
      destLon: dest.lon,
      destName: to || dest.displayName,
    }),
  );
}
