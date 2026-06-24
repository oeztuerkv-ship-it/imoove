/**
 * Sofort / Termin + Datum-Uhrzeit-Räder — gleiches Muster wie `reserve-ride.tsx`.
 */

import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { HOME_SHEET_INNER, HOME_SHEET_RIM } from "@/constants/homeSheetChrome";
import { ONRODA_MARK_RED } from "@/constants/onrodaBrand";
import { useColors } from "@/hooks/useColors";
import { rs } from "@/utils/scale";

export const RESERVATION_LEAD_MS = 60 * 60 * 1000;

const WHEEL_ITEM = 44;
const WHEEL_VISIBLE = 5;
const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const DAY_NAMES = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

export type BookingTiming = "instant" | "scheduled";

function pad2(n: number) {
  return n.toString().padStart(2, "0");
}

export function buildScheduledDate(dayOffset: number, hour: number, minuteIndex: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minuteIndex * 5, 0, 0);
  return d;
}

export function isReservationLeadValid(scheduledAt: Date, nowMs = Date.now()): boolean {
  return scheduledAt.getTime() >= nowMs + RESERVATION_LEAD_MS;
}

/** Sinnvoller Default beim Wechsel auf „Termin“ (≥ 60 Min Vorlauf, 5-Min-Raster). */
export function defaultScheduleWheelIndices(): { dayOffset: number; hour: number; minuteIndex: number } {
  const d = new Date(Date.now() + 75 * 60 * 1000);
  d.setSeconds(0, 0);
  const roundedMin = Math.ceil(d.getMinutes() / 5) * 5;
  if (roundedMin >= 60) {
    d.setHours(d.getHours() + 1, 0, 0, 0);
  } else {
    d.setMinutes(roundedMin, 0, 0);
  }
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfPick = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayOffset = Math.max(0, Math.round((startOfPick.getTime() - startOfToday.getTime()) / 86400000));
  return { dayOffset, hour: d.getHours(), minuteIndex: Math.floor(d.getMinutes() / 5) };
}

function TimeWheel({
  labels,
  selectedIndex,
  onSelectIndex,
  wheelKey,
}: {
  labels: string[];
  selectedIndex: number;
  onSelectIndex: (i: number) => void;
  wheelKey: number;
}) {
  const colors = useColors();
  const scrollRef = useRef<ScrollView>(null);
  const didInitScroll = useRef(false);
  const fade = colors.background;

  useEffect(() => {
    didInitScroll.current = false;
  }, [wheelKey]);

  useEffect(() => {
    if (didInitScroll.current) return;
    didInitScroll.current = true;
    const y = selectedIndex * WHEEL_ITEM;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y, animated: false });
    });
  }, [selectedIndex, wheelKey]);

  const onScrollEnd = useCallback(
    (y: number) => {
      const i = Math.round(y / WHEEL_ITEM);
      const clamped = Math.max(0, Math.min(labels.length - 1, i));
      if (clamped !== selectedIndex) {
        Haptics.selectionAsync();
        onSelectIndex(clamped);
      }
    },
    [labels.length, onSelectIndex, selectedIndex],
  );

  return (
    <View style={styles.wheelWrap} key={wheelKey}>
      <LinearGradient pointerEvents="none" colors={[fade, "transparent"]} style={styles.wheelFadeTop} />
      <ScrollView
        ref={scrollRef}
        style={{ height: WHEEL_ITEM * WHEEL_VISIBLE }}
        contentContainerStyle={{ paddingVertical: WHEEL_ITEM * ((WHEEL_VISIBLE - 1) / 2) }}
        snapToInterval={WHEEL_ITEM}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        onMomentumScrollEnd={(e) => onScrollEnd(e.nativeEvent.contentOffset.y)}
        onScrollEndDrag={(e) => onScrollEnd(e.nativeEvent.contentOffset.y)}
      >
        {labels.map((label, i) => {
          const active = i === selectedIndex;
          return (
            <View key={i} style={styles.wheelItem}>
              <Text
                style={[
                  styles.wheelLabelBase,
                  { color: active ? colors.primary : colors.mutedForeground },
                  active && styles.wheelLabelActiveSize,
                ]}
              >
                {label}
              </Text>
            </View>
          );
        })}
      </ScrollView>
      <LinearGradient pointerEvents="none" colors={["transparent", fade]} style={styles.wheelFadeBottom} />
      <View
        pointerEvents="none"
        style={[
          styles.wheelSelectionBar,
          { borderColor: colors.primary + "55", backgroundColor: colors.primary + "0D" },
        ]}
      />
    </View>
  );
}

export function ReservationSchedulePicker({
  timing,
  onTimingChange,
  dayOffset,
  hour,
  minuteIndex,
  onDayOffsetChange,
  onHourChange,
  onMinuteIndexChange,
  wheelKey,
}: {
  timing: BookingTiming;
  onTimingChange: (t: BookingTiming) => void;
  dayOffset: number;
  hour: number;
  minuteIndex: number;
  onDayOffsetChange: (n: number) => void;
  onHourChange: (n: number) => void;
  onMinuteIndexChange: (n: number) => void;
  wheelKey: number;
}) {
  const colors = useColors();

  const hourLabels = useMemo(() => Array.from({ length: 24 }, (_, i) => pad2(i)), []);
  const minuteLabels = useMemo(() => Array.from({ length: 12 }, (_, i) => pad2(i * 5)), []);

  const dayChips = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      const label =
        i === 0 ? "Heute" : i === 1 ? "Morgen" : `${DAY_NAMES[d.getDay()]} ${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.`;
      return { offset: i, label, sub: `${MONTHS[d.getMonth()]} ${d.getDate()}` };
    });
  }, []);

  const pickedDate = useMemo(
    () => buildScheduledDate(dayOffset, hour, minuteIndex),
    [dayOffset, hour, minuteIndex],
  );

  const scheduleLeadOk = isReservationLeadValid(pickedDate);

  return (
    <View style={[styles.card, { borderColor: HOME_SHEET_RIM, backgroundColor: HOME_SHEET_INNER }]}>
      <Text style={[styles.sectionLabel, { color: colors.foreground }]}>Abholzeit</Text>
      <View style={styles.timingRow}>
        {(["instant", "scheduled"] as const).map((mode) => {
          const active = timing === mode;
          return (
            <Pressable
              key={mode}
              style={[styles.timingChip, active && styles.timingChipActive]}
              onPress={() => {
                Haptics.selectionAsync();
                onTimingChange(mode);
              }}
            >
              <Text style={[styles.timingChipText, active && styles.timingChipTextActive]}>
                {mode === "instant" ? "Sofort" : "Termin"}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {timing === "instant" ? (
        <View style={styles.instantBadge}>
          <Text style={styles.instantBadgeText}>Sofort – Fahrer wird gesucht</Text>
        </View>
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayRow}>
            {dayChips.map((chip) => {
              const active = dayOffset === chip.offset;
              return (
                <Pressable
                  key={chip.offset}
                  onPress={() => {
                    Haptics.selectionAsync();
                    onDayOffsetChange(chip.offset);
                  }}
                  style={[
                    styles.dayChip,
                    { borderColor: HOME_SHEET_RIM, backgroundColor: colors.background },
                    active && styles.dayChipActive,
                  ]}
                >
                  <Text style={[styles.dayChipText, { color: colors.foreground }, active && styles.dayChipTextActive]}>
                    {chip.label}
                  </Text>
                  <Text
                    style={[
                      styles.dayChipSub,
                      { color: colors.mutedForeground },
                      active && styles.dayChipSubActive,
                    ]}
                  >
                    {chip.sub}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <View style={styles.wheelRow}>
            <TimeWheel wheelKey={wheelKey} labels={hourLabels} selectedIndex={hour} onSelectIndex={onHourChange} />
            <Text style={[styles.wheelColon, { color: colors.primary }]}>:</Text>
            <TimeWheel
              wheelKey={wheelKey + 1000}
              labels={minuteLabels}
              selectedIndex={minuteIndex}
              onSelectIndex={onMinuteIndexChange}
            />
          </View>
          <Text style={[styles.summary, { color: colors.foreground }]}>
            {pickedDate.getDate()}. {MONTHS[pickedDate.getMonth()]} {pickedDate.getFullYear()} · {pad2(pickedDate.getHours())}:
            {pad2(pickedDate.getMinutes())} Uhr
          </Text>
          {!scheduleLeadOk ? (
            <Text style={styles.leadWarn}>
              Mindestens 60 Minuten Vorlauf. Bitte späteren Zeitpunkt wählen oder „Sofort“ buchen.
            </Text>
          ) : (
            <Text style={[styles.leadHint, { color: colors.mutedForeground }]}>
              Fahrersuche startet automatisch 30 Minuten vor der Abholzeit.
            </Text>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: rs(12),
    borderRadius: rs(14),
    borderWidth: 1,
    padding: rs(14),
  },
  sectionLabel: { fontFamily: "Inter_600SemiBold", fontSize: 15, marginBottom: rs(10) },
  timingRow: { flexDirection: "row", gap: rs(8), marginBottom: rs(10) },
  timingChip: {
    flex: 1,
    paddingVertical: rs(10),
    borderRadius: rs(10),
    borderWidth: 1,
    borderColor: HOME_SHEET_RIM,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  timingChipActive: { borderColor: ONRODA_MARK_RED, backgroundColor: "#FEE2E2" },
  timingChipText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#374151" },
  timingChipTextActive: { color: ONRODA_MARK_RED },
  instantBadge: {
    backgroundColor: "#DCFCE7",
    borderColor: "#BBF7D0",
    borderWidth: 1,
    borderRadius: rs(10),
    paddingVertical: rs(10),
    paddingHorizontal: rs(12),
    alignItems: "center",
  },
  instantBadgeText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#166534" },
  dayRow: { gap: rs(8), paddingBottom: rs(4) },
  dayChip: {
    paddingVertical: rs(10),
    paddingHorizontal: rs(12),
    borderRadius: rs(10),
    borderWidth: StyleSheet.hairlineWidth,
    minWidth: rs(88),
  },
  dayChipActive: { borderColor: ONRODA_MARK_RED, backgroundColor: ONRODA_MARK_RED, borderWidth: 1.5 },
  dayChipText: { fontSize: 14, fontFamily: "Inter_700Bold" },
  dayChipTextActive: { color: "#fff" },
  dayChipSub: { fontSize: 12, fontFamily: "Inter_500Medium", marginTop: 2 },
  dayChipSubActive: { color: "rgba(255,255,255,0.9)" },
  wheelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: rs(4),
    gap: rs(4),
  },
  wheelWrap: { width: 88, position: "relative" },
  wheelItem: { height: WHEEL_ITEM, justifyContent: "center", alignItems: "center" },
  wheelLabelBase: { fontSize: 22, fontFamily: "Inter_400Regular" },
  wheelLabelActiveSize: { fontSize: 30, fontFamily: "Inter_700Bold" },
  wheelColon: { fontSize: 32, fontFamily: "Inter_700Bold", marginBottom: 8 },
  wheelFadeTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: WHEEL_ITEM * 1.25,
    zIndex: 2,
  },
  wheelFadeBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: WHEEL_ITEM * 1.25,
    zIndex: 2,
  },
  wheelSelectionBar: {
    position: "absolute",
    left: 4,
    right: 4,
    top: WHEEL_ITEM * ((WHEEL_VISIBLE - 1) / 2),
    height: WHEEL_ITEM,
    borderRadius: 10,
    borderWidth: 1,
    zIndex: 1,
  },
  summary: {
    marginTop: rs(8),
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },
  leadWarn: {
    marginTop: rs(8),
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#B91C1C",
    textAlign: "center",
    lineHeight: 18,
  },
  leadHint: {
    marginTop: rs(8),
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 17,
  },
});
