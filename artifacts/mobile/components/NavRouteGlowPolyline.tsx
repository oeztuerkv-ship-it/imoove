import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Polyline } from "react-native-maps";
import {
  Easing,
  runOnJS,
  useAnimatedReaction,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import {
  buildCumulativeDistances,
  buildRouteEnergyPulse,
  type RouteEnergyPulse,
  type RoutePoint,
} from "@/utils/navRouteGlow";

/** Dauer Start→Ziel, dann Wiederholung (Uber-ähnlich). */
const PULSE_DURATION_MS = 4200;
const PULSE_UPDATE_MS = 32;

type Props = {
  coordinates: RoutePoint[];
};

const EMPTY_PULSE: RouteEnergyPulse = { trail: [], core: [], spark: [] };

/**
 * Variante 2 – Uber-ähnlich:
 * Statische Route + heller Energie-Impuls läuft fortlaufend vom Start zum Ziel.
 */
export function NavRouteGlowPolyline({ coordinates }: Props) {
  const cumDist = useMemo(() => buildCumulativeDistances(coordinates), [coordinates]);
  const totalLength = cumDist[cumDist.length - 1] ?? 0;
  const progress = useSharedValue(0);
  const lastTickRef = useRef(0);
  const [pulse, setPulse] = useState<RouteEnergyPulse>(EMPTY_PULSE);

  const updatePulse = useCallback(
    (p: number) => {
      const now = Date.now();
      if (now - lastTickRef.current < PULSE_UPDATE_MS) return;
      lastTickRef.current = now;
      setPulse(buildRouteEnergyPulse(coordinates, cumDist, p));
    },
    [coordinates, cumDist],
  );

  useEffect(() => {
    setPulse(EMPTY_PULSE);
    progress.value = 0;
    if (coordinates.length < 2 || totalLength <= 0) return;
    progress.value = withRepeat(
      withTiming(1, { duration: PULSE_DURATION_MS, easing: Easing.linear }),
      -1,
      false,
    );
  }, [coordinates, totalLength, progress]);

  useAnimatedReaction(
    () => progress.value,
    (p) => {
      runOnJS(updatePulse)(p);
    },
  );

  if (coordinates.length < 2) return null;

  return (
    <>
      {/* Route — bleibt dauerhaft sichtbar */}
      <Polyline
        coordinates={coordinates}
        strokeColor="#4285F4"
        strokeWidth={6}
        lineCap="round"
        lineJoin="round"
      />

      {/* Animierter Lichtimpuls Start → Ziel */}
      {pulse.trail.length > 1 ? (
        <Polyline
          coordinates={pulse.trail}
          strokeColor="#FFFFFF40"
          strokeWidth={11}
          lineCap="round"
          lineJoin="round"
        />
      ) : null}
      {pulse.core.length > 1 ? (
        <Polyline
          coordinates={pulse.core}
          strokeColor="#FFFFFFB3"
          strokeWidth={7}
          lineCap="round"
          lineJoin="round"
        />
      ) : null}
      {pulse.spark.length > 1 ? (
        <Polyline
          coordinates={pulse.spark}
          strokeColor="#FFFFFF"
          strokeWidth={4.5}
          lineCap="round"
          lineJoin="round"
        />
      ) : null}
    </>
  );
}
