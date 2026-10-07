/**
 * GoogleNavDriveView — echte Fahrt ueber das Google Navigation SDK
 * (@googlemaps/react-native-navigation-sdk@0.16.3).
 *
 * WICHTIG — Ladereihenfolge:
 *   Diese Datei importiert das SDK statisch (oben, normaler ES-`import`). Das ist nur
 *   sicher, weil NICHTS diese Datei selbst statisch importiert. `app/driver/navigation.tsx`
 *   laedt sie ausschliesslich ueber ein zur Laufzeit gated `require(...)`, abhaengig von
 *   `EXPO_PUBLIC_ENABLE_GOOGLE_NAV`. Ein normaler Build (Flag aus) evaluiert dieses Modul
 *   nie und fasst damit auch nie `TurboModuleRegistry.getEnforcing('NavModule')` an
 *   (siehe node_modules/@googlemaps/react-native-navigation-sdk/src/native/NativeNavModule.ts),
 *   das sonst ohne verlinktes natives Modul sofort wirft.
 *
 *   => Diese Datei NIEMALS mit einem statischen `import` aus einer Datei einbinden, die in
 *      jedem Build geladen wird (insb. nicht aus navigation.tsx). Nur per `require()`
 *      hinter dem Flag-Check laden.
 *
 * Geltungsbereich: Diese Komponente ersetzt NUR Kamera/Heading/Route/Rerouting/Turn-by-Turn
 * (die Google-NavigationView zeichnet Karte, Fahrzeug-Puck, Route und eigenes
 * Abbiege-/ETA-Header/Footer). Sie kennt nichts von ONRODA-Geschaeftslogik (Status, Fahrpreis,
 * Chat, PIN) — das bleibt vollstaendig in navigation.tsx. Diese Komponente meldet nach aussen
 * nur rohe Navigationsdaten (Position, Restdistanz/-zeit, Ankunft, Routen-Events) ueber Props.
 *
 * Alle hier verwendeten SDK-Methoden/Typen sind 1:1 aus der installierten Paketversion
 * 0.16.3 uebernommen (useNavigation, NavigationProvider, NavigationView, NavigationController,
 * Waypoint, RouteStatus, NavigationSessionStatus, TimeAndDistance, ArrivalEvent) — keine
 * erfundenen Methoden.
 */
import React from "react";
import { StyleSheet, View } from "react-native";
import {
  NavigationProvider,
  NavigationView,
  useNavigation,
  NavigationSessionStatus,
  RouteStatus,
  type Waypoint,
  type Location as NavSdkLocation,
  type TimeAndDistance,
  type ArrivalEvent,
} from "@googlemaps/react-native-navigation-sdk";

export type GoogleNavFix = {
  lat: number;
  lon: number;
  headingDeg: number | null;
  speedMps: number | null;
  accuracyM: number | null;
  atMs: number;
};

export type GoogleNavRemaining = {
  distM: number;
  etaMin: number;
};

export type GoogleNavDestination = {
  lat: number;
  lon: number;
  label?: string;
};

export type GoogleNavDriveViewProps = {
  destination: GoogleNavDestination;
  /** Deaktiviert bei Private-Memo-Fahrten o.ae. ohne Google Nav zu beenden (hier ungenutzt, nur Vollstaendigkeit). */
  active?: boolean;
  onFix?: (fix: GoogleNavFix) => void;
  onRemainingChanged?: (remaining: GoogleNavRemaining) => void;
  onArrival?: (event: ArrivalEvent) => void;
  onRouteChanged?: () => void;
  onRerouting?: () => void;
  /** Session konnte nicht initialisiert oder Route nicht berechnet werden — Aufrufer sollte auf Alt-Navigation zurueckfallen. */
  onSessionError?: (reason: string) => void;
  onMapReady?: () => void;
};

function GoogleNavDriveViewInner(props: GoogleNavDriveViewProps): React.JSX.Element {
  const {
    destination,
    onFix,
    onRemainingChanged,
    onArrival,
    onRouteChanged,
    onRerouting,
    onSessionError,
    onMapReady,
  } = props;

  const {
    navigationController,
    setOnLocationChanged,
    setOnRemainingTimeOrDistanceChanged,
    setOnArrival,
    setOnRouteChanged,
    setOnReroutingRequestedByOffRoute,
  } = useNavigation();

  const mountedRef = React.useRef(true);
  const initializedRef = React.useRef(false);
  const lastDestKeyRef = React.useRef<string>("");

  // Callback-Refs: Listener einmal registrieren, aber immer die aktuelle Prop-Funktion aufrufen
  // (vermeidet staendiges Re-Registrieren der nativen Listener bei jedem Render).
  const onFixRef = React.useRef(onFix);
  onFixRef.current = onFix;
  const onRemainingChangedRef = React.useRef(onRemainingChanged);
  onRemainingChangedRef.current = onRemainingChanged;
  const onArrivalRef = React.useRef(onArrival);
  onArrivalRef.current = onArrival;
  const onRouteChangedRef = React.useRef(onRouteChanged);
  onRouteChangedRef.current = onRouteChanged;
  const onReroutingRef = React.useRef(onRerouting);
  onReroutingRef.current = onRerouting;
  const onSessionErrorRef = React.useRef(onSessionError);
  onSessionErrorRef.current = onSessionError;

  React.useEffect(() => {
    setOnLocationChanged((location: NavSdkLocation) => {
      onFixRef.current?.({
        lat: location.lat,
        lon: location.lng,
        headingDeg: typeof location.bearing === "number" ? location.bearing : null,
        speedMps: typeof location.speed === "number" ? location.speed : null,
        accuracyM: typeof location.accuracy === "number" ? location.accuracy : null,
        atMs: location.time,
      });
    });
    setOnRemainingTimeOrDistanceChanged((timeAndDistance: TimeAndDistance) => {
      onRemainingChangedRef.current?.({
        distM: timeAndDistance.meters,
        etaMin: timeAndDistance.seconds / 60,
      });
    });
    setOnArrival((event: ArrivalEvent) => {
      onArrivalRef.current?.(event);
    });
    setOnRouteChanged(() => {
      onRouteChangedRef.current?.();
    });
    setOnReroutingRequestedByOffRoute(() => {
      onReroutingRef.current?.();
    });
    return () => {
      setOnLocationChanged(null);
      setOnRemainingTimeOrDistanceChanged(null);
      setOnArrival(null);
      setOnRouteChanged(null);
      setOnReroutingRequestedByOffRoute(null);
    };
  }, [
    setOnLocationChanged,
    setOnRemainingTimeOrDistanceChanged,
    setOnArrival,
    setOnRouteChanged,
    setOnReroutingRequestedByOffRoute,
  ]);

  const applyDestination = React.useCallback(async () => {
    if (!mountedRef.current || !initializedRef.current) return;
    const key = `${destination.lat.toFixed(6)},${destination.lon.toFixed(6)}`;
    if (lastDestKeyRef.current === key) return;
    lastDestKeyRef.current = key;
    const waypoint: Waypoint = {
      position: { lat: destination.lat, lng: destination.lon },
      ...(destination.label ? { title: destination.label } : {}),
    };
    try {
      const status = await navigationController.setDestination(waypoint);
      if (!mountedRef.current) return;
      if (status !== RouteStatus.OK) {
        onSessionErrorRef.current?.(`route_status_${status}`);
        return;
      }
      await navigationController.startGuidance();
    } catch (e) {
      if (!mountedRef.current) return;
      onSessionErrorRef.current?.(e instanceof Error ? e.message : "set_destination_failed");
    }
  }, [destination.lat, destination.lon, destination.label, navigationController]);

  // Init einmal pro Mount (ein Navigator-Objekt pro Bildschirm-Lebensdauer).
  React.useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const accepted = await navigationController.areTermsAccepted();
        if (!accepted) {
          const ok = await navigationController.showTermsAndConditionsDialog();
          if (cancelled) return;
          if (!ok) {
            onSessionErrorRef.current?.("terms_not_accepted");
            return;
          }
        }
        const status = await navigationController.init();
        if (cancelled) return;
        if (status !== NavigationSessionStatus.OK) {
          onSessionErrorRef.current?.(`init_${status}`);
          return;
        }
        initializedRef.current = true;
        await applyDestination();
      } catch (e) {
        if (cancelled) return;
        onSessionErrorRef.current?.(e instanceof Error ? e.message : "init_failed");
      }
    })();
    return () => {
      cancelled = true;
      mountedRef.current = false;
      initializedRef.current = false;
      void navigationController.cleanup();
    };
    // Nur bei Mount/Unmount initialisieren — ein laufender Guidance-Session bleibt bei
    // Ziel-Aenderungen (Abholung -> Ziel) erhalten, siehe applyDestination()-Effekt unten.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigationController]);

  React.useEffect(() => {
    void applyDestination();
  }, [applyDestination]);

  return (
    <NavigationView
      style={StyleSheet.absoluteFillObject}
      headerEnabled
      footerEnabled
      speedometerEnabled={false}
      tripProgressBarEnabled={false}
      trafficPromptsEnabled={false}
      trafficIncidentCardsEnabled={false}
      recenterButtonEnabled
      reportIncidentButtonEnabled={false}
      onMapReady={onMapReady}
    />
  );
}

/**
 * Oeffentliche Komponente: NavigationProvider-Kontext + innerer View. Wird von
 * navigation.tsx ausschliesslich per gated `require()` geladen (siehe Datei-Kopfkommentar).
 */
export function GoogleNavDriveView(props: GoogleNavDriveViewProps): React.JSX.Element {
  return (
    <NavigationProvider
      termsAndConditionsDialogOptions={{
        title: "ONRODA Navigation",
        companyName: "ONRODA",
      }}
    >
      <View style={StyleSheet.absoluteFillObject}>
        <GoogleNavDriveViewInner {...props} />
      </View>
    </NavigationProvider>
  );
}

export default GoogleNavDriveView;
