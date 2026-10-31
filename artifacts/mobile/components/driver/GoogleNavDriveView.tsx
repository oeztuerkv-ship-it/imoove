/** Native Google navigation owner. Load only behind the native capability gate. */
import React from "react";
import { StyleSheet, View } from "react-native";
import {
  AudioGuidance, CameraPerspective, NavigationProvider, NavigationView,
  NavigationSessionStatus, RouteStatus, useNavigation,
  type NavigationViewController, type Location, type TimeAndDistance,
} from "@googlemaps/react-native-navigation-sdk";
import { getBackgroundPermissionsSafe, requestForegroundPermissionsSafe } from "@/utils/safeExpoLocation";
import { createGoogleNavWorkQueue, googleRoutePoints, validGoogleNavPoint, type GoogleNavPoint } from "@/utils/googleNavSession";

export type GoogleNavFix = { lat: number; lon: number; headingDeg: number | null; speedMps: number | null; accuracyM: number | null; atMs: number };
export type GoogleNavRemaining = { distM: number; etaMin: number };
export type GoogleNavDestination = { lat: number; lon: number; label?: string };
export type GoogleNavDriveViewProps = {
  destination: GoogleNavDestination;
  routeIdentity: string;
  active?: boolean;
  soundEnabled?: boolean;
  bottomInset?: number;
  initialPosition?: GoogleNavPoint;
  onFix?: (fix: GoogleNavFix) => void;
  onRemainingChanged?: (remaining: GoogleNavRemaining) => void;
  onRouteChanged?: (points: GoogleNavPoint[], remaining: GoogleNavRemaining) => void;
  onRerouting?: () => void;
  onSessionError?: (reason: string) => void;
};

function GoogleNavDriveViewInner(props: GoogleNavDriveViewProps) {
  const api = useNavigation();
  const { navigationController: controller } = api;
  const current = React.useRef(props); current.current = props;
  const mounted = React.useRef(false);
  const initialized = React.useRef(false);
  const guidanceReady = React.useRef(false);
  const routeRevision = React.useRef(0);
  const destinationPending = React.useRef(true);
  const lifecycleTail = React.useRef<Promise<void>>(Promise.resolve());
  const snapshotRevision = React.useRef(0);
  const queue = React.useRef(createGoogleNavWorkQueue());
  const view = React.useRef<NavigationViewController | null>(null);
  const mapReady = React.useRef(false);
  const pendingFollow = React.useRef(true);

  const follow = React.useCallback(async () => {
    if (!mounted.current || !initialized.current || !guidanceReady.current || !mapReady.current || !view.current || !pendingFollow.current) return;
    await view.current.setFollowingPerspective(CameraPerspective.TILTED);
    pendingFollow.current = false;
  }, []);

  const reportError = React.useCallback((reason: string) => {
    if (!mounted.current) return;
    guidanceReady.current = false;
    current.current.onSessionError?.(reason);
  }, []);

  const publishSnapshot = React.useCallback(async () => {
    const route = routeRevision.current;
    const own = ++snapshotRevision.current;
    if (!mounted.current || !guidanceReady.current) return;
    try {
      const [segments, time] = await Promise.all([controller.getRouteSegments(), controller.getCurrentTimeAndDistance()]);
      if (!mounted.current || !guidanceReady.current || route !== routeRevision.current || own !== snapshotRevision.current) return;
      if (!Number.isFinite(time.meters) || !Number.isFinite(time.seconds)) return;
      const remaining = { distM: Math.max(0, time.meters), etaMin: Math.max(0, time.seconds / 60) };
      current.current.onRemainingChanged?.(remaining);
      const points = googleRoutePoints(segments);
      if (points.length >= 2) current.current.onRouteChanged?.(points, remaining);
    } catch {
      // A missing route snapshot must not terminate working native guidance.
    }
  }, [controller]);

  React.useEffect(() => {
    api.setOnLocationChanged((loc: Location) => {
      if (!mounted.current || !validGoogleNavPoint(loc.lat, loc.lng)) return;
      const age = Date.now() - loc.time;
      if (!Number.isFinite(loc.time) || age > 30_000 || age < -5_000) return;
      current.current.onFix?.({ lat: loc.lat, lon: loc.lng,
        headingDeg: Number.isFinite(loc.bearing) ? loc.bearing! : null,
        speedMps: Number.isFinite(loc.speed) ? loc.speed : null,
        accuracyM: Number.isFinite(loc.accuracy) ? loc.accuracy! : null, atMs: loc.time });
    });
    api.setOnRemainingTimeOrDistanceChanged((time: TimeAndDistance) => {
      if (!mounted.current || !guidanceReady.current || !Number.isFinite(time.meters) || !Number.isFinite(time.seconds)) return;
      current.current.onRemainingChanged?.({ distM: Math.max(0, time.meters), etaMin: Math.max(0, time.seconds / 60) });
    });
    api.setOnReroutingRequestedByOffRoute(() => {
      if (!mounted.current) return;
      guidanceReady.current = false;
      routeRevision.current++;
      current.current.onRerouting?.();
    });
    api.setOnRouteChanged(() => {
      if (!mounted.current || !initialized.current || !(current.current.active ?? true)) return;
      if (destinationPending.current) return;
      guidanceReady.current = true;
      void publishSnapshot();
    });
    return () => {
      api.setOnLocationChanged(null); api.setOnRemainingTimeOrDistanceChanged(null);
      api.setOnRouteChanged(null); api.setOnReroutingRequestedByOffRoute(null);
    };
  }, [api.setOnLocationChanged, api.setOnRemainingTimeOrDistanceChanged, api.setOnRouteChanged, api.setOnReroutingRequestedByOffRoute, controller, publishSnapshot]);

  const applyLatestDestination = React.useCallback(() => {
    if (!initialized.current) return;
    const intent = current.current;
    destinationPending.current = true;
    guidanceReady.current = false;
    routeRevision.current++;
    let workCurrent = () => false;
    void queue.current.run(async (isCurrent) => {
      workCurrent = isCurrent;
      await controller.stopGuidance();
      if (!mounted.current || !isCurrent() || !(intent.active ?? true)) return;
      if (!validGoogleNavPoint(intent.destination.lat, intent.destination.lon)) { reportError("invalid_destination"); return; }
      const status = await controller.setDestination({ position: { lat: intent.destination.lat, lng: intent.destination.lon }, title: intent.destination.label });
      if (!mounted.current || !isCurrent()) return;
      if (status !== RouteStatus.OK) { reportError(`route_${status}`); return; }
      await controller.startGuidance();
      if (!mounted.current || !isCurrent()) return;
      destinationPending.current = false;
      guidanceReady.current = true;
      pendingFollow.current = true;
      await follow();
      await publishSnapshot();
    }).catch(() => { if (workCurrent()) reportError("guidance_failed"); });
  }, [controller, follow, publishSnapshot, reportError]);
  const applyLatest = React.useRef(applyLatestDestination); applyLatest.current = applyLatestDestination;

  React.useEffect(() => {
    mounted.current = true;
    const ownQueue = createGoogleNavWorkQueue();
    queue.current = ownQueue;
    const previousCleanup = lifecycleTail.current;
    let cancelled = false;
    const init = (async () => {
      try {
        await previousCleanup;
        if (cancelled) return;
        const permission = await requestForegroundPermissionsSafe();
        if (cancelled) return;
        if (permission?.status !== "granted") { reportError("location_permission"); return; }
        if (!(await controller.areTermsAccepted())) {
          const accepted = await controller.showTermsAndConditionsDialog();
          if (cancelled) return;
          if (!accepted) { reportError("terms_not_accepted"); return; }
        }
        if (cancelled) return;
        const status = await controller.init();
        if (cancelled) return;
        if (status !== NavigationSessionStatus.OK) { reportError(`init_${status}`); return; }
        controller.startUpdatingLocation();
        const background = await getBackgroundPermissionsSafe();
        if (cancelled) return;
        controller.setBackgroundLocationUpdatesEnabled(background?.status === "granted");
        controller.setAudioGuidanceType(current.current.soundEnabled === false ? AudioGuidance.SILENT : AudioGuidance.VOICE_ALERTS_AND_GUIDANCE | AudioGuidance.BLUETOOTH_AUDIO);
        initialized.current = true;
        applyLatest.current();
      } catch { if (!cancelled) reportError("initialization_failed"); }
    })();
    return () => {
      cancelled = true; mounted.current = false; initialized.current = false;
      guidanceReady.current = false; ownQueue.dispose(); routeRevision.current++;
      lifecycleTail.current = init.then(() => ownQueue.idle()).then(() => controller.cleanup()).catch(() => {});
    };
  }, [controller, reportError]);

  React.useEffect(() => { applyLatestDestination(); }, [props.routeIdentity, props.destination.lat, props.destination.lon, props.active, applyLatestDestination]);
  React.useEffect(() => {
    if (initialized.current) controller.setAudioGuidanceType(props.soundEnabled === false ? AudioGuidance.SILENT : AudioGuidance.VOICE_ALERTS_AND_GUIDANCE | AudioGuidance.BLUETOOTH_AUDIO);
  }, [props.soundEnabled, controller]);

  const initial = React.useRef(props.initialPosition);
  return <NavigationView style={StyleSheet.absoluteFillObject}
    initialCameraPosition={initial.current && validGoogleNavPoint(initial.current.lat, initial.current.lon) ? { target: { lat: initial.current.lat, lng: initial.current.lon }, tilt: 60, zoom: 16 } : undefined}
    headerEnabled footerEnabled={false} recenterButtonEnabled speedometerEnabled={false}
    tripProgressBarEnabled={false} reportIncidentButtonEnabled={false}
    trafficPromptsEnabled={false} trafficIncidentCardsEnabled={false}
    mapPadding={{ top: 0, left: 0, right: 0, bottom: props.bottomInset ?? 240 }}
    onNavigationViewControllerCreated={(controller) => { view.current = controller; void follow().catch(() => reportError("camera_failed")); }}
    onMapReady={() => { mapReady.current = true; void follow().catch(() => reportError("camera_failed")); }} />;
}

const GOOGLE_NAV_TERMS = { title: "ONRODA Navigation", companyName: "ONRODA" };

export function GoogleNavDriveView(props: GoogleNavDriveViewProps) {
  return <NavigationProvider termsAndConditionsDialogOptions={GOOGLE_NAV_TERMS}>
    <View style={StyleSheet.absoluteFillObject}><GoogleNavDriveViewInner {...props} /></View>
  </NavigationProvider>;
}
export default GoogleNavDriveView;
