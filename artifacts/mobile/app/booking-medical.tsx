import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BottomTabBar } from "@/components/BottomTabBar";
import { useRideRequests, type RideAccessibilityOptions } from "@/context/RideRequestContext";
import { useUser } from "@/context/UserContext";
import { useColors } from "@/hooks/useColors";
import { rf, rs } from "@/utils/scale";

type WeekdayKey = "mo" | "tu" | "we" | "th" | "fr" | "sa" | "su";

const WEEKDAYS: { key: WeekdayKey; label: string; idx: number }[] = [
  { key: "mo", label: "Mo", idx: 1 },
  { key: "tu", label: "Di", idx: 2 },
  { key: "we", label: "Mi", idx: 3 },
  { key: "th", label: "Do", idx: 4 },
  { key: "fr", label: "Fr", idx: 5 },
  { key: "sa", label: "Sa", idx: 6 },
  { key: "su", label: "So", idx: 0 },
];

function createSeriesDates(fromIso: string, toIso: string, activeDays: WeekdayKey[]): Date[] {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from > to) return [];
  const idxSet = new Set(activeDays.map((k) => WEEKDAYS.find((d) => d.key === k)?.idx).filter((v): v is number => v != null));
  const out: Date[] = [];
  const cur = new Date(from);
  cur.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(23, 59, 59, 999);
  while (cur <= end) {
    if (idxSet.has(cur.getDay())) out.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function mergeDateAndTime(baseDate: Date, timeHHmm: string): Date {
  const [hh, mm] = timeHHmm.split(":").map((x) => Number(x));
  const out = new Date(baseDate);
  out.setHours(Number.isFinite(hh) ? hh : 8, Number.isFinite(mm) ? mm : 0, 0, 0);
  return out;
}

export default function BookingMedicalScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = (typeof window !== "undefined" ? 67 : insets.top) + 10;
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const seriesMode = String(mode ?? "") === "series";
  const { addRequest } = useRideRequests();
  const { profile, updateProfile } = useUser();
  const formScrollRef = useRef<ScrollView>(null);

  const [patientName, setPatientName] = useState("");
  const [pickupAddress, setPickupAddress] = useState("");
  const [destinationAddress, setDestinationAddress] = useState("");
  const [appointmentDate, setAppointmentDate] = useState(new Date().toISOString().slice(0, 10));
  const [appointmentTime, setAppointmentTime] = useState("08:00");
  const [returnRide, setReturnRide] = useState(false);
  const [returnTime, setReturnTime] = useState("12:00");
  const [insuranceName, setInsuranceName] = useState("");
  const [costCenter, setCostCenter] = useState("");
  const [authorizationReference, setAuthorizationReference] = useState("");
  const [approvalPresent, setApprovalPresent] = useState<boolean | null>(null);
  const [transportDocUri, setTransportDocUri] = useState<string | null>(null);
  const [driverNote, setDriverNote] = useState("");

  const [assistanceLevel, setAssistanceLevel] = useState<RideAccessibilityOptions["assistanceLevel"] | null>(null);
  const [canTransfer, setCanTransfer] = useState<boolean | null>(null);
  const [wheelchairType, setWheelchairType] = useState<RideAccessibilityOptions["wheelchairType"] | null>(null);
  const [companionCount, setCompanionCount] = useState<RideAccessibilityOptions["companionCount"] | null>(null);
  const [rampRequired, setRampRequired] = useState(false);
  const [stairsPresent, setStairsPresent] = useState(false);
  const [elevatorAvailable, setElevatorAvailable] = useState(false);
  const [carryChairRequired, setCarryChairRequired] = useState(false);
  const [wheelchairDetailMode, setWheelchairDetailMode] = useState<"profile" | "trip" | "save_default">(
    profile.wheelchairDefaults ? "profile" : "trip",
  );

  const [seriesFrom, setSeriesFrom] = useState(new Date().toISOString().slice(0, 10));
  const [seriesTo, setSeriesTo] = useState(new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10));
  const [seriesWeekdays, setSeriesWeekdays] = useState<WeekdayKey[]>(["mo", "we", "fr"]);

  function focusIntoView(e: any) {
    const target = e.target;
    if (!target || !formScrollRef.current) return;
    formScrollRef.current.scrollResponderScrollNativeHandleToKeyboard(target, 130, true);
  }

  useEffect(() => {
    if (wheelchairDetailMode !== "profile") return;
    const d = profile.wheelchairDefaults;
    if (!d) return;
    setWheelchairType(d.wheelchairType);
    setAssistanceLevel(d.assistanceLevel);
    setCanTransfer(d.canTransfer);
    setCompanionCount(d.companionCount);
    setRampRequired(d.rampRequired);
    setCarryChairRequired(d.carryChairRequired);
    setElevatorAvailable(d.elevatorAvailable);
    setStairsPresent(d.stairsPresent);
    setDriverNote(typeof d.driverNote === "string" ? d.driverNote : "");
  }, [wheelchairDetailMode, profile.wheelchairDefaults]);

  const selectedDaysLabel = useMemo(
    () => WEEKDAYS.filter((d) => seriesWeekdays.includes(d.key)).map((d) => d.label).join(", "),
    [seriesWeekdays],
  );

  async function pickTransportDocument() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== "granted") {
      Alert.alert("Berechtigung fehlt", "Bitte Fotobibliothek erlauben.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.7,
    });
    if (!res.canceled && res.assets?.[0]?.uri) {
      setTransportDocUri(res.assets[0].uri);
    }
  }

  function validateRequired(): string | null {
    if (!patientName.trim()) return "Bitte Patient/Fahrgast angeben.";
    if (!pickupAddress.trim() || !destinationAddress.trim()) return "Bitte Abhol- und Zieladresse ausfüllen.";
    if (!appointmentDate.trim() || !appointmentTime.trim()) return "Bitte Datum und Uhrzeit angeben.";
    if (approvalPresent == null) return "Bitte Genehmigung vorhanden: ja/nein auswählen.";
    if (assistanceLevel == null || canTransfer == null || companionCount == null) {
      return "Bitte Hilfe, Umsteigen (ja/nein) und Begleitperson auswählen.";
    }
    if (wheelchairType == null) return "Bitte Rollstuhl-Typ auswählen.";
    if (seriesMode) {
      if (!seriesFrom || !seriesTo) return "Bitte Serien-Zeitraum ausfüllen.";
      if (seriesWeekdays.length === 0) return "Bitte mindestens einen Wochentag wählen.";
    }
    return null;
  }

  async function submitMedical() {
    const err = validateRequired();
    if (err) {
      Alert.alert("Angaben prüfen", err);
      return;
    }

    const accessibilityOptions: RideAccessibilityOptions = {
      assistanceLevel: assistanceLevel as RideAccessibilityOptions["assistanceLevel"],
      wheelchairType: wheelchairType as RideAccessibilityOptions["wheelchairType"],
      wheelchairStaysOccupied: canTransfer === false,
      canTransfer: canTransfer as boolean,
      companionCount: companionCount as 0 | 1 | 2,
      rampRequired,
      carryChairRequired,
      elevatorAvailable,
      stairsPresent,
      driverNote: driverNote.trim() || null,
    };

    if (wheelchairDetailMode === "save_default") {
      updateProfile({
        wheelchairDefaults: {
          wheelchairType: accessibilityOptions.wheelchairType,
          assistanceLevel: accessibilityOptions.assistanceLevel,
          canTransfer: accessibilityOptions.canTransfer,
          companionCount: accessibilityOptions.companionCount,
          rampRequired: accessibilityOptions.rampRequired,
          carryChairRequired: accessibilityOptions.carryChairRequired,
          elevatorAvailable: accessibilityOptions.elevatorAvailable,
          stairsPresent: accessibilityOptions.stairsPresent,
          driverNote: accessibilityOptions.driverNote ?? null,
        },
      });
    }

    const medicalMeta: Record<string, unknown> = {
      medical_ride: true,
      approval_status:
        approvalPresent === true ? "approved" : approvalPresent === false ? "missing_info" : "pending",
      payer_kind: "insurance",
      insurance_name: insuranceName.trim() || "",
      cost_center: costCenter.trim() || "",
      authorization_reference: authorizationReference.trim() || "",
      transport_document_status: transportDocUri ? "uploaded" : "missing",
      signature_required: true,
      qr_required: true,
      billing_ready: false,
      return_ride: returnRide,
      return_time: returnRide ? returnTime : null,
      transport_document_uri: transportDocUri ?? null,
    };

    const createOne = async (dateObj: Date) => {
      await addRequest({
        from: pickupAddress.split(",")[0].trim() || pickupAddress.trim(),
        fromFull: pickupAddress.trim(),
        to: destinationAddress.split(",")[0].trim() || destinationAddress.trim(),
        toFull: destinationAddress.trim(),
        distanceKm: 0,
        durationMinutes: 0,
        estimatedFare: 0,
        paymentMethod: "Krankenkasse",
        vehicle: "Rollstuhl",
        customerName: patientName.trim(),
        scheduledAt: dateObj,
        rideKind: "medical",
        payerKind: "insurance",
        billingReference: costCenter.trim() || authorizationReference.trim() || null,
        partnerBookingMeta: medicalMeta,
        accessibilityOptions,
      });
      if (returnRide) {
        await addRequest({
          from: destinationAddress.split(",")[0].trim() || destinationAddress.trim(),
          fromFull: destinationAddress.trim(),
          to: pickupAddress.split(",")[0].trim() || pickupAddress.trim(),
          toFull: pickupAddress.trim(),
          distanceKm: 0,
          durationMinutes: 0,
          estimatedFare: 0,
          paymentMethod: "Krankenkasse",
          vehicle: "Rollstuhl",
          customerName: patientName.trim(),
          scheduledAt: mergeDateAndTime(new Date(dateObj), returnTime),
          rideKind: "medical",
          payerKind: "insurance",
          billingReference: costCenter.trim() || authorizationReference.trim() || null,
          partnerBookingMeta: { ...medicalMeta, return_leg: true },
          accessibilityOptions,
        });
      }
    };

    if (seriesMode) {
      const dates = createSeriesDates(seriesFrom, seriesTo, seriesWeekdays).map((d) =>
        mergeDateAndTime(d, appointmentTime),
      );
      if (dates.length === 0) {
        Alert.alert("Serienfahrt", "Keine Termine im gewählten Zeitraum gefunden.");
        return;
      }
      for (const d of dates) {
        await createOne(d);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Serienfahrt angelegt", `${dates.length}${returnRide ? " + Rückfahrten" : ""} Termine wurden erstellt.`);
    } else {
      await createOne(mergeDateAndTime(new Date(appointmentDate), appointmentTime));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Krankenfahrt angelegt", "Die Buchung wurde gespeichert.");
    }
    router.replace("/my-rides");
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? topPad + 8 : 0}
    >
      <View style={[styles.header, { paddingTop: topPad, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            {seriesMode ? "Serienfahrt Krankenfahrt" : "Krankenfahrt"}
          </Text>
          <Text style={[styles.sub, { color: colors.mutedForeground }]}>
            Nur fahrtrelevante Daten, keine Diagnosefelder.
          </Text>
        </View>
      </View>
      <ScrollView
        ref={formScrollRef}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: rs(16), gap: rs(12), paddingBottom: rs(120) }}
      >
        <Field label="Patient / Fahrgast" value={patientName} onChangeText={setPatientName} onFocus={focusIntoView} />
        <Field label="Abholadresse" value={pickupAddress} onChangeText={setPickupAddress} onFocus={focusIntoView} />
        <Field label="Zieladresse" value={destinationAddress} onChangeText={setDestinationAddress} onFocus={focusIntoView} />
        <View style={styles.row}>
          <Field label="Datum" value={appointmentDate} onChangeText={setAppointmentDate} style={{ flex: 1 }} onFocus={focusIntoView} />
          <Field label="Uhrzeit" value={appointmentTime} onChangeText={setAppointmentTime} style={{ flex: 1 }} onFocus={focusIntoView} />
        </View>
        <Toggle label="Hin- und Rückfahrt" value={returnRide} onPress={() => setReturnRide((v) => !v)} />
        {returnRide ? <Field label="Uhrzeit Rückfahrt" value={returnTime} onChangeText={setReturnTime} onFocus={focusIntoView} /> : null}

        <Field label="Krankenkasse" value={insuranceName} onChangeText={setInsuranceName} onFocus={focusIntoView} />
        <Field label="Kostenstelle / Vorgangsnummer" value={costCenter} onChangeText={setCostCenter} onFocus={focusIntoView} />
        <Field label="Genehmigungs-Referenz" value={authorizationReference} onChangeText={setAuthorizationReference} onFocus={focusIntoView} />

        <View style={styles.box}>
          <Text style={styles.boxTitle}>Genehmigung vorhanden?</Text>
          <ChoiceRow
            choices={[
              { id: "ja", label: "Ja", active: approvalPresent === true, onPress: () => setApprovalPresent(true) },
              { id: "nein", label: "Nein", active: approvalPresent === false, onPress: () => setApprovalPresent(false) },
            ]}
          />
        </View>

        <Pressable style={styles.uploadBtn} onPress={pickTransportDocument}>
          <Feather name="upload" size={16} color="#fff" />
          <Text style={styles.uploadText}>
            {transportDocUri ? "Transportschein-Foto gewählt" : "Transportschein Foto hochladen"}
          </Text>
        </Pressable>

        <View style={styles.box}>
          <Text style={styles.boxTitle}>Rollstuhl / Hilfe / Begleitperson</Text>
          <ChoiceTitle text="Verwendung der Rollstuhl-Details" />
          <ChoiceRow
            choices={[
              {
                id: "profile",
                label: "Aus Patientenprofil übernehmen",
                active: wheelchairDetailMode === "profile",
                onPress: () => setWheelchairDetailMode("profile"),
              },
              {
                id: "trip",
                label: "Nur für diese Fahrt verwenden",
                active: wheelchairDetailMode === "trip",
                onPress: () => setWheelchairDetailMode("trip"),
              },
              {
                id: "save_default",
                label: "Als Standard speichern",
                active: wheelchairDetailMode === "save_default",
                onPress: () => setWheelchairDetailMode("save_default"),
              },
            ]}
          />
          {wheelchairDetailMode === "profile" && !profile.wheelchairDefaults ? (
            <Text style={styles.profileHint}>Kein gespeicherter Standard vorhanden. Bitte Details einmal erfassen.</Text>
          ) : null}
          {wheelchairDetailMode === "save_default" ? (
            <Text style={styles.profileHint}>
              Es werden nur fahrtrelevante Rollstuhl-Angaben gespeichert (keine Diagnose-/Behandlungsdaten).
            </Text>
          ) : null}
          <ChoiceTitle text="Hilfe benötigt" />
          <ChoiceRow
            choices={[
              { id: "boarding", label: "Einsteigen", active: assistanceLevel === "boarding", onPress: () => setAssistanceLevel("boarding") },
              { id: "door", label: "Bis Haustür", active: assistanceLevel === "to_door", onPress: () => setAssistanceLevel("to_door") },
              { id: "apt", label: "Bis Wohnung", active: assistanceLevel === "to_apartment", onPress: () => setAssistanceLevel("to_apartment") },
              { id: "none", label: "Keine Hilfe", active: assistanceLevel === "none", onPress: () => setAssistanceLevel("none") },
            ]}
          />
          <ChoiceTitle text="Rollstuhl-Typ" />
          <ChoiceRow
            choices={[
              { id: "fold", label: "faltbar", active: wheelchairType === "foldable", onPress: () => setWheelchairType("foldable") },
              { id: "electric", label: "elektrisch", active: wheelchairType === "electric", onPress: () => setWheelchairType("electric") },
            ]}
          />
          <ChoiceTitle text="Kann umsteigen?" />
          <ChoiceRow
            choices={[
              { id: "yes", label: "Ja", active: canTransfer === true, onPress: () => setCanTransfer(true) },
              { id: "no", label: "Nein", active: canTransfer === false, onPress: () => setCanTransfer(false) },
            ]}
          />
          <ChoiceTitle text="Begleitperson" />
          <ChoiceRow
            choices={[
              { id: "c0", label: "0", active: companionCount === 0, onPress: () => setCompanionCount(0) },
              { id: "c1", label: "1", active: companionCount === 1, onPress: () => setCompanionCount(1) },
              { id: "c2", label: "2", active: companionCount === 2, onPress: () => setCompanionCount(2) },
            ]}
          />
          <ChoiceTitle text="Besonderheiten" />
          <Toggle label="Rampe erforderlich" value={rampRequired} onPress={() => setRampRequired((v) => !v)} />
          <Toggle label="Tragestuhl erforderlich" value={carryChairRequired} onPress={() => setCarryChairRequired((v) => !v)} />
          <Toggle label="Aufzug vorhanden" value={elevatorAvailable} onPress={() => setElevatorAvailable((v) => !v)} />
          <Toggle label="Treppen vorhanden" value={stairsPresent} onPress={() => setStairsPresent((v) => !v)} />
          <Field
            label="Hinweis für Fahrer"
            value={driverNote}
            onChangeText={setDriverNote}
            multiline
            onFocus={focusIntoView}
          />
        </View>

        {seriesMode ? (
          <View style={styles.box}>
            <Text style={styles.boxTitle}>Serienfahrt</Text>
            <View style={styles.row}>
              <Field label="Zeitraum von" value={seriesFrom} onChangeText={setSeriesFrom} style={{ flex: 1 }} onFocus={focusIntoView} />
              <Field label="bis" value={seriesTo} onChangeText={setSeriesTo} style={{ flex: 1 }} onFocus={focusIntoView} />
            </View>
            <ChoiceTitle text={`Wochentage: ${selectedDaysLabel || "keine"}`} />
            <ChoiceRow
              choices={WEEKDAYS.map((d) => ({
                id: d.key,
                label: d.label,
                active: seriesWeekdays.includes(d.key),
                onPress: () =>
                  setSeriesWeekdays((prev) =>
                    prev.includes(d.key) ? prev.filter((x) => x !== d.key) : [...prev, d.key],
                  ),
              }))}
            />
          </View>
        ) : null}

        <Pressable style={styles.submitBtn} onPress={() => void submitMedical()}>
          <Feather name="check" size={18} color="#fff" />
          <Text style={styles.submitText}>{seriesMode ? "Serienfahrt erstellen" : "Krankenfahrt speichern"}</Text>
        </Pressable>
      </ScrollView>
      <BottomTabBar active="buchen" />
    </KeyboardAvoidingView>
  );
}

function ChoiceTitle({ text }: { text: string }) {
  return <Text style={{ fontSize: rf(12), fontFamily: "Inter_600SemiBold", marginTop: rs(4), marginBottom: rs(4) }}>{text}</Text>;
}

function ChoiceRow({ choices }: { choices: { id: string; label: string; active: boolean; onPress: () => void }[] }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: rs(8) }}>
      {choices.map((c) => (
        <Pressable key={c.id} onPress={c.onPress} style={{ paddingVertical: rs(7), paddingHorizontal: rs(10), borderRadius: rs(10), backgroundColor: c.active ? "#16A34A" : "#E5E7EB" }}>
          <Text style={{ color: c.active ? "#fff" : "#0F172A", fontFamily: "Inter_600SemiBold", fontSize: rf(12) }}>{c.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Toggle({ label, value, onPress }: { label: string; value: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ flexDirection: "row", alignItems: "center", gap: rs(8), paddingVertical: rs(4) }}>
      <Feather name={value ? "check-square" : "square"} size={16} color={value ? "#16A34A" : "#6B7280"} />
      <Text style={{ fontSize: rf(13), fontFamily: "Inter_500Medium" }}>{label}</Text>
    </Pressable>
  );
}

function Field({
  label,
  value,
  onChangeText,
  onFocus,
  multiline,
  style,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  onFocus?: (e: any) => void;
  multiline?: boolean;
  style?: any;
}) {
  return (
    <View style={style}>
      <Text style={{ fontSize: rf(12), fontFamily: "Inter_600SemiBold", marginBottom: rs(6) }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={onFocus}
        multiline={multiline}
        style={{
          borderWidth: 1,
          borderColor: "#CBD5E1",
          backgroundColor: "#fff",
          borderRadius: rs(10),
          paddingHorizontal: rs(10),
          paddingVertical: rs(9),
          minHeight: multiline ? rs(82) : undefined,
          textAlignVertical: multiline ? "top" : "center",
          fontSize: rf(14),
          fontFamily: "Inter_400Regular",
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(10),
    paddingHorizontal: rs(16),
    paddingBottom: rs(12),
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: rs(34), height: rs(34), borderRadius: rs(17), alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },
  title: { fontSize: rf(19), fontFamily: "Inter_700Bold" },
  sub: { fontSize: rf(12), fontFamily: "Inter_400Regular", marginTop: rs(2) },
  row: { flexDirection: "row", gap: rs(8) },
  box: { backgroundColor: "#F8FAFC", borderWidth: 1, borderColor: "#E2E8F0", borderRadius: rs(12), padding: rs(10), gap: rs(4) },
  boxTitle: { fontSize: rf(13), fontFamily: "Inter_700Bold", marginBottom: rs(4) },
  uploadBtn: {
    backgroundColor: "#0EA5E9",
    borderRadius: rs(11),
    paddingVertical: rs(11),
    paddingHorizontal: rs(12),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: rs(8),
  },
  uploadText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: rf(13) },
  submitBtn: {
    marginTop: rs(8),
    backgroundColor: "#16A34A",
    borderRadius: rs(12),
    paddingVertical: rs(13),
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: rs(8),
  },
  submitText: { color: "#fff", fontSize: rf(14), fontFamily: "Inter_700Bold" },
  profileHint: { fontSize: rf(12), fontFamily: "Inter_500Medium", color: "#475569", marginBottom: rs(4) },
});

