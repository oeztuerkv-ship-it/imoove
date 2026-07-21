import { useEffect, useRef, useState } from "react";
import { Easing } from "react-native";
import { AnimatedRegion } from "react-native-maps";

import {
  LIVE_DRIVER_MIN_MOVE_M,
  LIVE_DRIVER_SNAP_DISTANCE_M,
  bearingDegrees,
  haversineMeters,
  liveDriverTweenDurationMs,
  normalizeHeadingDegrees,
} from "@/utils/liveDriverMarkerMotion";

export type LiveDriverMarkerTarget = {
  lat: number;
  lon: number;
  /** Optional explicit heading (°). If omitted, derived from last two fixes. */
  heading?: number;
} | null | undefined;

function isValidCoord(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180 &&
    !(Math.abs(lat) < 1e-5 && Math.abs(lon) < 1e-5)
  );
}

/**
 * Interpolates marker position between GPS fixes and derives bearing for icon rotation.
 * Camera follow should use `cameraTarget` (latest fix), not every Animated tick.
 */
export function useSmoothedDriverMarker(target: LiveDriverMarkerTarget): {
  animatedCoordinate: AnimatedRegion | null;
  rotation: number;
  cameraTarget: { latitude: number; longitude: number } | null;
  tweenDurationMs: number;
} {
  const animatedRef = useRef<AnimatedRegion | null>(null);
  const [animatedCoordinate, setAnimatedCoordinate] = useState<AnimatedRegion | null>(null);
  const [rotation, setRotation] = useState(0);
  const [cameraTarget, setCameraTarget] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [tweenDurationMs, setTweenDurationMs] = useState(0);

  const displayRef = useRef<{ lat: number; lon: number } | null>(null);
  const lastFixAtRef = useRef<number | null>(null);
  const rotationRef = useRef(0);

  useEffect(() => {
    if (!target || !isValidCoord(target.lat, target.lon)) {
      animatedRef.current = null;
      displayRef.current = null;
      lastFixAtRef.current = null;
      setAnimatedCoordinate(null);
      setCameraTarget(null);
      setTweenDurationMs(0);
      return;
    }

    const next = { lat: target.lat, lon: target.lon };
    const now = Date.now();
    const from = displayRef.current;

    if (!animatedRef.current || !from) {
      const region = new AnimatedRegion({
        latitude: next.lat,
        longitude: next.lon,
        latitudeDelta: 0,
        longitudeDelta: 0,
      });
      animatedRef.current = region;
      displayRef.current = next;
      lastFixAtRef.current = now;
      setAnimatedCoordinate(region);
      setCameraTarget({ latitude: next.lat, longitude: next.lon });
      setTweenDurationMs(0);
      if (target.heading != null && Number.isFinite(target.heading)) {
        const h = normalizeHeadingDegrees(target.heading);
        rotationRef.current = h;
        setRotation(h);
      }
      return;
    }

    const dist = haversineMeters(from.lat, from.lon, next.lat, next.lon);
    if (dist < LIVE_DRIVER_MIN_MOVE_M) {
      if (target.heading != null && Number.isFinite(target.heading)) {
        const h = normalizeHeadingDegrees(target.heading);
        if (Math.abs(h - rotationRef.current) > 2) {
          rotationRef.current = h;
          setRotation(h);
        }
      }
      return;
    }

    const elapsed =
      lastFixAtRef.current != null ? now - lastFixAtRef.current : undefined;
    lastFixAtRef.current = now;

    if (target.heading != null && Number.isFinite(target.heading)) {
      const h = normalizeHeadingDegrees(target.heading);
      rotationRef.current = h;
      setRotation(h);
    } else {
      const bearing = bearingDegrees(from.lat, from.lon, next.lat, next.lon);
      rotationRef.current = bearing;
      setRotation(bearing);
    }

    const duration = liveDriverTweenDurationMs(dist, elapsed);
    setTweenDurationMs(duration);
    setCameraTarget({ latitude: next.lat, longitude: next.lon });

    const region = animatedRef.current;
    region.stopAnimation(() => {});

    if (duration === 0 || dist >= LIVE_DRIVER_SNAP_DISTANCE_M) {
      region.setValue({
        latitude: next.lat,
        longitude: next.lon,
        latitudeDelta: 0,
        longitudeDelta: 0,
      });
      displayRef.current = next;
      return;
    }

    // AnimatedRegion.timing maps latitude/longitude → toValue at runtime; RN typings still require toValue.
    region
      .timing({
        latitude: next.lat,
        longitude: next.lon,
        latitudeDelta: 0,
        longitudeDelta: 0,
        duration,
        easing: Easing.linear,
        useNativeDriver: false,
        toValue: 0,
      } as Parameters<AnimatedRegion["timing"]>[0])
      .start(({ finished }) => {
        if (finished) {
          displayRef.current = next;
        }
      });
  }, [target?.lat, target?.lon, target?.heading]);

  return { animatedCoordinate, rotation, cameraTarget, tweenDurationMs };
}
