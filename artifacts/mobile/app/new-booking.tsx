import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState, useRef } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { VEHICLES, type VehicleType, type VehicleOption } from "@/context/RideContext";

const NB_CAR_ICON = "#171717";
const NB_WHEELCHAIR_ICON = "#0369A1";
import { useRideRequests } from "@/context/RideRequestContext";
import { useUser } from "@/context/UserContext";
import { useColors } from "@/hooks/useColors";

type GeoResult = { display_name: string; lat: string; lon: string };

// Soft viewbox bias around Esslingen / Stuttgart (but not exclusive)
const VIEWBOX = "8.8,48.6,9.6,48.9";

const QUICK_SUGGESTIONS: { label: string; sub: string; lat: number; lon: number; icon: string }[] = [
  { label: "Stuttgart Flughafen", sub: "Abflug & Ankunft, Terminal 1+3", lat: 48.6899, lon: 9.2219, icon: "wind" },
  { label: "Stuttgart Hauptbahnhof", sub: "Bahnhofsplatz 3, Stuttgart", lat: 48.7836, lon: 9.1817, icon: "navigation" },
  { label: "Messe Stuttgart", sub: "Messepiazza 1, Leinfelden-Echterdingen", lat: 48.6952, lon: 9.2003, icon: "grid" },
];

async function nominatimSearch(query: string): Promise<GeoResult[]> {
  try {
    const params = new URLSearchParams({
      q: query,
      format: "json",
      addressdetails: "1",
      limit: "6",
      countrycodes: "de",
      viewbox: VIEWBOX,
      bounded: "0",
    });
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?${params.toString()}`,
      { headers: { "Accept-Language": "de", "User-Agent": "OnrodaApp/1.0" } }
    );
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

function shortName(display: string) {
  const parts = display.split(",");
  if (parts.length <= 2) return display.trim();
  return parts.slice(0, 2).join(",").trim();
}

function subName(display: string) {
  const parts = display.split(",");
  return parts.slice(2, 4).join(",").trim();
}

type GeoItem = { display_name: string; lat: string; lon: string };

function AddressInput({
  label,
  icon,
  value,
  placeholder,
  onSelect,
  colors,
}: {
  label: string;
  icon: "map-pin" | "flag";
  value: string;
  placeholder: string;
  onSelect: (name: string, fullName: string, lat: number, lon: number) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<GeoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showQuick = focused && query.length === 0;
  const showResults = results.length > 0 && query.length >= 2;

  const handleChange = (text: string) => {
    setQuery(text);
    setResults([]);
    if (debounce.current) clearTimeout(debounce.current);
    if (text.length < 2) return;
    debounce.current = setTimeout(async () => {
      setLoading(true);
      const r = await nominatimSearch(text);
      setResults(r);
      setLoading(false);
    }, 350);
  };

  const handlePick = (name: string, fullName: string, lat: number, lon: number) => {
    setQuery(name);
    setResults([]);
    setFocused(false);
    onSelect(name, fullName, lat, lon);
    Haptics.selectionAsync();
  };

  const handleClear = () => {
    setQuery("");
    setResults([]);
    onSelect("", "", 0, 0);
  };

  return (
    <View>
      <Text style={[styles.inputLabel, { color: colors.foreground }]}>{label}</Text>
      <View style={[styles.inputBox, { backgroundColor: colors.card, borderColor: focused ? "#DC2626" : colors.border }]}>
        <Feather name={icon} size={16} color={focused ? "#DC2626" : colors.mutedForeground} />
        <TextInput
          style={[styles.inputText, { color: colors.foreground }]}
          value={query}
          onChangeText={handleChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 200)}
          placeholder={placeholder}
          placeholderTextColor={colors.mutedForeground}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="words"
        />
        {loading && <ActivityIndicator size="small" color="#DC2626" />}
        {!loading && query.length > 0 && (
          <Pressable hitSlop={8} onPress={handleClear}>
            <Feather name="x" size={15} color={colors.mutedForeground} />
          </Pressable>
        )}
      </View>

      {/* Quick suggestions (shown when focused + empty) */}
      {showQuick && (
        <View style={[styles.suggestionBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.suggestionHeader, { color: colors.mutedForeground }]}>Schnellauswahl</Text>
          {QUICK_SUGGESTIONS.map((s, i) => (
            <Pressable
              key={i}
              style={[styles.suggestionItem, i < QUICK_SUGGESTIONS.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
              onPress={() => handlePick(s.label, `${s.label}, ${s.sub}`, s.lat, s.lon)}
            >
              <View style={[styles.suggestionIconBox, { backgroundColor: "#DC262612" }]}>
                <Feather name={s.icon as any} size={13} color="#DC2626" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.suggestionText, { color: colors.foreground }]}>{s.label}</Text>
                <Text style={[styles.suggestionSub, { color: colors.mutedForeground }]} numberOfLines={1}>{s.sub}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}

      {/* Nominatim results */}
      {showResults && (
        <View style={[styles.suggestionBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {results.map((s, i) => (
            <Pressable
              key={i}
              style={[styles.suggestionItem, i < results.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
              onPress={() => handlePick(shortName(s.display_name), s.display_name, parseFloat(s.lat), parseFloat(s.lon))}
            >
              <View style={[styles.suggestionIconBox, { backgroundColor: colors.muted }]}>
                <Feather name="map-pin" size={13} color={colors.mutedForeground} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.suggestionText, { color: colors.foreground }]} numberOfLines={1}>
                  {shortName(s.display_name)}
                </Text>
                <Text style={[styles.suggestionSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {subName(s.display_name)}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const DAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

function pad(n: number) { return n.toString().padStart(2, "0"); }

const DAY_NAMES = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

function DateTimePicker({
  visible,
  onClose,
  onConfirm,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: (date: Date) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const now = new Date();

  // Build next 5 days
  const days = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    return d;
  });

  const [selIdx, setSelIdx] = useState(0);

  const initH = now.getHours();
  const initM = Math.ceil(now.getMinutes() / 5) * 5 % 60;
  const [hour, setHour] = useState(initH);
  const [minute, setMinute] = useState(initM);

  const stepHour = (dir: 1 | -1) => { setHour(h => (h + dir + 24) % 24); Haptics.selectionAsync(); };
  const stepMinute = (dir: 1 | -1) => { setMinute(m => (m + dir * 5 + 60) % 60); Haptics.selectionAsync(); };

  const handleConfirm = () => {
    const base = days[selIdx];
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate(), hour, minute, 0, 0);
    onConfirm(d);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={[styles.dtModal, { backgroundColor: colors.surface }]} onPress={(e) => e.stopPropagation()}>

          {/* Header */}
          <View style={styles.dtHeader}>
            <Text style={[styles.dtTitle, { color: colors.foreground }]}>Abholzeit wählen</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Feather name="x" size={20} color={colors.mutedForeground} />
            </Pressable>
          </View>

          {/* 5-day selector */}
          <View style={styles.dayChipsRow}>
            {days.map((d, i) => {
              const sel = selIdx === i;
              return (
                <Pressable
                  key={i}
                  style={[
                    styles.dayChip,
                    { borderColor: sel ? "#DC2626" : colors.border, backgroundColor: sel ? "#DC2626" : colors.muted },
                  ]}
                  onPress={() => { setSelIdx(i); Haptics.selectionAsync(); }}
                >
                  <Text style={[styles.dayChipTop, { color: sel ? "#fff" : colors.foreground }]}>
                    {i === 0 ? "Heute" : i === 1 ? "Morgen" : DAY_NAMES[d.getDay()]}
                  </Text>
                  <Text style={[styles.dayChipNum, { color: sel ? "#fff" : colors.foreground }]}>
                    {pad(d.getDate())}
                  </Text>
                  <Text style={[styles.dayChipMonth, { color: sel ? "#ffcccc" : colors.foreground }]}>
                    {MONTHS[d.getMonth()]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Time picker */}
          <View style={[styles.timePillRow, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <View style={styles.timePillUnit}>
              <Pressable onPress={() => stepHour(1)} hitSlop={8} style={styles.timeArrowBtn}>
                <Feather name="chevron-up" size={22} color="#DC2626" />
              </Pressable>
              <Text style={[styles.timePillNum, { color: colors.foreground }]}>{pad(hour)}</Text>
              <Pressable onPress={() => stepHour(-1)} hitSlop={8} style={styles.timeArrowBtn}>
                <Feather name="chevron-down" size={22} color="#DC2626" />
              </Pressable>
              <Text style={[styles.timePillLabel, { color: colors.mutedForeground }]}>Stunde</Text>
            </View>

            <Text style={[styles.timeColonBig, { color: colors.foreground }]}>:</Text>

            <View style={styles.timePillUnit}>
              <Pressable onPress={() => stepMinute(1)} hitSlop={8} style={styles.timeArrowBtn}>
                <Feather name="chevron-up" size={22} color="#DC2626" />
              </Pressable>
              <Text style={[styles.timePillNum, { color: colors.foreground }]}>{pad(minute)}</Text>
              <Pressable onPress={() => stepMinute(-1)} hitSlop={8} style={styles.timeArrowBtn}>
                <Feather name="chevron-down" size={22} color="#DC2626" />
              </Pressable>
              <Text style={[styles.timePillLabel, { color: colors.mutedForeground }]}>Minute</Text>
            </View>
          </View>

          {/* Buttons */}
          <View style={styles.dtBtnRow}>
            <Pressable style={[styles.dtBtnCancel, { borderColor: colors.border }]} onPress={onClose}>
              <Text style={[styles.dtBtnCancelText, { color: colors.foreground }]}>Abbrechen</Text>
            </Pressable>
            <Pressable style={styles.dtBtnConfirm} onPress={handleConfirm}>
              <Feather name="check" size={16} color="#fff" />
              <Text style={styles.dtBtnConfirmText}>Bestätigen</Text>
            </Pressable>
          </View>

        </Pressable>
      </Pressable>
    </Modal>
  );
}

function formatDateTime(d: Date) {
  const day = d.getDate();
  const month = MONTHS[d.getMonth()];
  const year = d.getFullYear();
  return `${pad(day)}. ${month} ${year}, ${pad(d.getHours())}:${pad(d.getMinutes())} Uhr`;
}

export default function NewBookingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;

  const { addRequest, passengerId } = useRideRequests();
  const { profile } = useUser();

  const [from, setFrom] = useState({ name: "", fullName: "", lat: 0, lon: 0 });
  const [to, setTo] = useState({ name: "", fullName: "", lat: 0, lon: 0 });
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  const [showDtPicker, setShowDtPicker] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleType>("standard");
  const [accessCode, setAccessCode] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const formComplete = from.name.length > 0 && to.name.length > 0 && scheduledAt !== null;

  function accessCodeErrorMessage(code: string): string {
    const m: Record<string, string> = {
      access_code_invalid: "Der eingegebene Code ist ungültig oder unbekannt.",
      access_code_inactive: "Dieser Code ist deaktiviert.",
      access_code_expired: "Dieser Code ist noch nicht gültig oder bereits abgelaufen.",
      access_code_exhausted: "Dieser Code wurde bereits vollständig eingelöst.",
      access_code_wrong_company: "Dieser Code passt nicht zu dieser Buchung.",
      request_failed: "Die Buchung konnte nicht gesendet werden.",
    };
    return m[code] ?? "Die Buchung ist fehlgeschlagen. Bitte erneut versuchen.";
  }

  const handleSubmit = async () => {
    if (!formComplete || submitting) return;
    setSubmitting(true);
    const vehicleLabel =
      selectedVehicle === "standard" ? "Standard" :
      selectedVehicle === "xl" ? "XL" :
      selectedVehicle === "onroda" ? "Onroda" :
      "Rollstuhl";
    const customerName = profile?.name
      ? profile.name.split(" ")[0] + " " + (profile.name.split(" ")[1]?.[0] ?? "") + "."
      : "Gast";
    const codeTrim = accessCode.trim();
    try {
      await addRequest({
        from: from.name,
        fromFull: from.fullName || from.name,
        fromLat: from.lat || undefined,
        fromLon: from.lon || undefined,
        to: to.name,
        toFull: to.fullName || to.name,
        toLat: to.lat || undefined,
        toLon: to.lon || undefined,
        distanceKm: 0,
        durationMinutes: 0,
        estimatedFare: 0,
        paymentMethod: "Bar",
        vehicle: vehicleLabel,
        customerName,
        passengerId: passengerId || undefined,
        scheduledAt: scheduledAt,
        ...(codeTrim ? { accessCode: codeTrim } : {}),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/my-rides");
    } catch (e) {
      const code = e instanceof Error ? e.message : "request_failed";
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Buchung", accessCodeErrorMessage(code));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={styles.headerTitle}>Buchung</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {/* Addresses */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <AddressInput
            label="Von"
            icon="map-pin"
            value={from.name}
            placeholder="Abholort eingeben…"
            onSelect={(name, fullName, lat, lon) => setFrom({ name, fullName, lat, lon })}
            colors={colors}
          />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <AddressInput
            label="Ziel"
            icon="flag"
            value={to.name}
            placeholder="Zielort eingeben…"
            onSelect={(name, fullName, lat, lon) => setTo({ name, fullName, lat, lon })}
            colors={colors}
          />
        </View>

        {/* Date / Time */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardLabel, { color: colors.foreground }]}>Abholzeit</Text>
          <Pressable
            style={[styles.dtField, { borderColor: colors.border, backgroundColor: colors.muted }]}
            onPress={() => setShowDtPicker(true)}
          >
            <Feather name="clock" size={16} color={colors.mutedForeground} />
            <Text style={[styles.dtFieldText, { color: scheduledAt ? colors.foreground : colors.mutedForeground }]}>
              {scheduledAt ? formatDateTime(scheduledAt) : "Termin wählen (Pflichtfeld)"}
            </Text>
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          </Pressable>
          <Text style={[styles.dtNote, { color: colors.foreground }]}>
            Alle Zeitangaben basieren auf dem Abholort.
          </Text>
          <Text style={[styles.dtNote, { color: colors.foreground }]}>
            Kostenlose Stornierung bis 1 Stunde vor der Abholung möglich.
          </Text>
        </View>

        {/* Vehicle — only after all fields filled */}
        {formComplete && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.cardLabel, { color: colors.foreground }]}>Fahrzeugwahl</Text>
            <View style={styles.vehicleRow}>
              {VEHICLES.map((v: VehicleOption) => {
                const active = selectedVehicle === v.id;
                return (
                  <Pressable
                    key={v.id}
                    style={[
                      styles.vehicleCard,
                      {
                        borderColor: active ? "#DC2626" : colors.border,
                        backgroundColor: active ? "#DC262610" : colors.muted,
                      },
                    ]}
                    onPress={() => { setSelectedVehicle(v.id as VehicleType); Haptics.selectionAsync(); }}
                  >
                    <View style={[styles.vehicleIcon, { backgroundColor: active ? "#DC262622" : colors.border + "40" }]}>
                      <MaterialCommunityIcons
                        name={v.icon as any}
                        size={22}
                        color={v.id === "wheelchair" ? NB_WHEELCHAIR_ICON : NB_CAR_ICON}
                      />
                    </View>
                    <Text style={[styles.vehicleName, { color: active ? "#DC2626" : colors.foreground }]} numberOfLines={2}>
                      {v.name}
                    </Text>
                    {active && (
                      <View style={styles.vehicleCheck}>
                        <Feather name="check-circle" size={14} color="#DC2626" />
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
            <Text style={[styles.cardLabel, { color: colors.foreground, marginTop: 4 }]}>Freigabe-Code (optional)</Text>
            <Text style={[styles.dtNote, { color: colors.mutedForeground }]}>
              Digitale Kostenübernahme durch Firma, Hotel oder anderen Auftraggeber — wird im System geprüft. Ohne Code: normale Direktbuchung.
            </Text>
            <View style={[styles.inputBox, { borderColor: colors.border, backgroundColor: colors.muted }]}>
              <Feather name="hash" size={16} color={colors.mutedForeground} />
              <TextInput
                style={[styles.inputText, { color: colors.foreground }]}
                value={accessCode}
                onChangeText={setAccessCode}
                placeholder="z. B. HOTEL-STUTTGART-2026"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="characters"
                autoCorrect={false}
              />
            </View>
          </View>
        )}

        {/* Submit button */}
        {formComplete && (
          <Pressable
            style={[styles.submitBtn, { opacity: submitting ? 0.7 : 1 }]}
            disabled={submitting}
            onPress={handleSubmit}
          >
            {submitting
              ? <ActivityIndicator color="#fff" size="small" />
              : <Feather name="check-circle" size={20} color="#fff" />
            }
            <Text style={styles.submitBtnText}>{submitting ? "Wird gesendet…" : "Buchung absenden"}</Text>
          </Pressable>
        )}

        {!formComplete && (
          <View style={[styles.hintBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="info" size={15} color={colors.mutedForeground} />
            <Text style={[styles.hintText, { color: colors.mutedForeground }]}>
              Bitte alle Felder ausfüllen, um die Fahrzeugauswahl zu sehen.
            </Text>
          </View>
        )}
      </ScrollView>

      <DateTimePicker
        visible={showDtPicker}
        onClose={() => setShowDtPicker(false)}
        onConfirm={(d) => { setScheduledAt(d); setShowDtPicker(false); }}
        colors={colors}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 40, height: 40, justifyContent: "center" },
  headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#DC2626" },
  content: { padding: 16, gap: 14, paddingBottom: 40 },

  card: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 14 },
  cardLabel: { fontSize: 14, fontFamily: "Inter_700Bold", textTransform: "uppercase", letterSpacing: 0.5 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 2 },

  inputLabel: { fontSize: 14, fontFamily: "Inter_700Bold", marginBottom: 6 },
  inputBox: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12,
  },
  inputText: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  suggestionBox: { borderRadius: 12, borderWidth: 1, overflow: "hidden", marginTop: 4 },
  suggestionHeader: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4 },
  suggestionItem: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  suggestionIconBox: { width: 30, height: 30, borderRadius: 8, justifyContent: "center", alignItems: "center" },
  suggestionText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  suggestionSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },

  dtField: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 14,
  },
  dtFieldText: { flex: 1, fontSize: 15, fontFamily: "Inter_600SemiBold" },
  dtNote: { fontSize: 12, fontFamily: "Inter_500Medium", lineHeight: 18 },

  vehicleRow: { flexDirection: "row", gap: 10 },
  vehicleCard: {
    flex: 1, alignItems: "center", paddingVertical: 14, paddingHorizontal: 8,
    borderRadius: 14, borderWidth: 1.5, gap: 8, position: "relative",
  },
  vehicleIcon: { width: 50, height: 50, borderRadius: 14, justifyContent: "center", alignItems: "center" },
  vehicleName: { fontSize: 12, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  vehicleCheck: { position: "absolute", top: 6, right: 6 },

  submitBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, backgroundColor: "#DC2626", borderRadius: 14, paddingVertical: 16,
  },
  submitBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },

  hintBox: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderRadius: 12, borderWidth: 1, padding: 14,
  },
  hintText: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },

  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "#00000055" },
  dtModal: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 12 },
  dtHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  dtTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  dtLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 },

  dayChipsRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  dayChip: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 14, borderWidth: 1.5, gap: 2 },
  dayChipTop: { fontSize: 11, fontFamily: "Inter_700Bold", textTransform: "uppercase" },
  dayChipNum: { fontSize: 24, fontFamily: "Inter_700Bold" },
  dayChipMonth: { fontSize: 11, fontFamily: "Inter_600SemiBold" },

  timePillRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    borderRadius: 16, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 24, marginBottom: 4, gap: 16,
  },
  timePillUnit: { alignItems: "center", gap: 2 },
  timeArrowBtn: { padding: 4 },
  timePillNum: { fontSize: 36, fontFamily: "Inter_700Bold", minWidth: 56, textAlign: "center" },
  timePillLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
  timeColonBig: { fontSize: 36, fontFamily: "Inter_700Bold", marginBottom: 16 },

  dtBtnRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  dtBtnCancel: {
    flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1.5,
    alignItems: "center", justifyContent: "center",
  },
  dtBtnCancelText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  dtBtnConfirm: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, backgroundColor: "#DC2626", paddingVertical: 14, borderRadius: 12,
  },
  dtBtnConfirmText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },
});
