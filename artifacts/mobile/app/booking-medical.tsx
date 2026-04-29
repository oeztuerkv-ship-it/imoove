import { Feather } from "@expo/vector-icons";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
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

import { BottomTabBar, mainTabScrollPaddingBottom } from "@/components/BottomTabBar";
import { useRideRequests, type RideAccessibilityOptions } from "@/context/RideRequestContext";
import { useUser } from "@/context/UserContext";
import { useColors } from "@/hooks/useColors";
import { rf, rs } from "@/utils/scale";

type WeekdayKey = "mo" | "tu" | "we" | "th" | "fr" | "sa" | "su";
type PickerTarget =
  | "appointmentDate"
  | "appointmentTime"
  | "returnTime"
  | "seriesFrom"
  | "seriesTo";
type RecognitionStatus = "pending_recognition" | "recognized" | "unclear" | "rejected";
type ApprovalProofMode = "uploaded" | "show_to_driver" | "later";

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

function formatDateIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateDe(d: Date): string {
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatTimeHHmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function joinAddress(street: string, house: string, postal: string, city: string): string {
  const line1 = `${street.trim()} ${house.trim()}`.trim();
  const line2 = `${postal.trim()} ${city.trim()}`.trim();
  return `${line1}, ${line2}`.trim();
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
  const [pickupStreet, setPickupStreet] = useState("");
  const [pickupHouseNumber, setPickupHouseNumber] = useState("");
  const [pickupPostalCode, setPickupPostalCode] = useState("");
  const [pickupCity, setPickupCity] = useState("");
  const [destinationStreet, setDestinationStreet] = useState("");
  const [destinationHouseNumber, setDestinationHouseNumber] = useState("");
  const [destinationPostalCode, setDestinationPostalCode] = useState("");
  const [destinationCity, setDestinationCity] = useState("");

  const [appointmentDate, setAppointmentDate] = useState(new Date());
  const [appointmentTime, setAppointmentTime] = useState("08:00");
  const [returnRide, setReturnRide] = useState(false);
  const [returnTime, setReturnTime] = useState("12:00");
  const [insuranceName, setInsuranceName] = useState("");
  const [costCenter, setCostCenter] = useState("");
  const [authorizationReference, setAuthorizationReference] = useState("");
  const [approvalPresent, setApprovalPresent] = useState<boolean | null>(null);
  const [approvalProofMode, setApprovalProofMode] = useState<ApprovalProofMode>("later");
  const [transportDocUri, setTransportDocUri] = useState<string | null>(null);
  const [driverNote, setDriverNote] = useState("");

  const [needsAssistance, setNeedsAssistance] = useState(false);
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

  const [seriesFrom, setSeriesFrom] = useState(new Date());
  const [seriesTo, setSeriesTo] = useState(new Date(Date.now() + 21 * 86400000));
  const [seriesWeekdays, setSeriesWeekdays] = useState<WeekdayKey[]>(["mo", "we", "fr"]);
  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);
  const [pickerMode, setPickerMode] = useState<"date" | "time">("date");
  const [pickerDraftValue, setPickerDraftValue] = useState<Date | null>(null);

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

  const pickupAddress = useMemo(
    () => joinAddress(pickupStreet, pickupHouseNumber, pickupPostalCode, pickupCity),
    [pickupStreet, pickupHouseNumber, pickupPostalCode, pickupCity],
  );
  const destinationAddress = useMemo(
    () => joinAddress(destinationStreet, destinationHouseNumber, destinationPostalCode, destinationCity),
    [destinationStreet, destinationHouseNumber, destinationPostalCode, destinationCity],
  );

  function openPicker(target: PickerTarget, mode: "date" | "time") {
    setPickerTarget(target);
    setPickerMode(mode);
    setPickerDraftValue(pickerValueForTarget(target));
  }

  function pickerValueForTarget(target: PickerTarget | null): Date {
    switch (target) {
      case "appointmentDate":
        return appointmentDate;
      case "seriesFrom":
        return seriesFrom;
      case "seriesTo":
        return seriesTo;
      case "returnTime": {
        const [hh, mm] = returnTime.split(":").map((x) => Number(x));
        const d = new Date();
        d.setHours(Number.isFinite(hh) ? hh : 12, Number.isFinite(mm) ? mm : 0, 0, 0);
        return d;
      }
      case "appointmentTime":
      default: {
        const [hh, mm] = appointmentTime.split(":").map((x) => Number(x));
        const d = new Date();
        d.setHours(Number.isFinite(hh) ? hh : 8, Number.isFinite(mm) ? mm : 0, 0, 0);
        return d;
      }
    }
  }

  function onPickerChange(event: DateTimePickerEvent, value?: Date) {
    if (event.type === "dismissed" || !value || !pickerTarget) return;
    setPickerDraftValue(value);
  }

  function cancelPicker() {
    setPickerTarget(null);
    setPickerDraftValue(null);
  }

  function confirmPicker() {
    if (!pickerTarget || !pickerDraftValue) {
      cancelPicker();
      return;
    }
    if (pickerMode === "date") {
      if (pickerTarget === "appointmentDate") setAppointmentDate(pickerDraftValue);
      if (pickerTarget === "seriesFrom") setSeriesFrom(pickerDraftValue);
      if (pickerTarget === "seriesTo") setSeriesTo(pickerDraftValue);
    } else {
      const hhmm = formatTimeHHmm(pickerDraftValue);
      if (pickerTarget === "appointmentTime") setAppointmentTime(hhmm);
      if (pickerTarget === "returnTime") setReturnTime(hhmm);
    }
    cancelPicker();
  }

  async function pickTransportDocumentFrom(source: "camera" | "library") {
    if (source === "camera") {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (perm.status !== "granted") {
        Alert.alert("Berechtigung fehlt", "Bitte Kamera erlauben.");
        return;
      }
      const res = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.7,
      });
      if (!res.canceled && res.assets?.[0]?.uri) setTransportDocUri(res.assets[0].uri);
      return;
    }
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
    if (!res.canceled && res.assets?.[0]?.uri) setTransportDocUri(res.assets[0].uri);
  }

  async function pickTransportDocument() {
    Alert.alert("Transportschein", "Bildquelle wählen", [
      { text: "Kamera", onPress: () => void pickTransportDocumentFrom("camera") },
      { text: "Galerie", onPress: () => void pickTransportDocumentFrom("library") },
      { text: "Abbrechen", style: "cancel" },
    ]);
  }

  function validateRequired(): string | null {
    if (!patientName.trim()) return "Bitte Patient/Fahrgast angeben.";
    if (!pickupStreet.trim() || !pickupHouseNumber.trim() || !pickupCity.trim() || !pickupPostalCode.trim()) {
      return "Bitte Abholadresse vollständig ausfüllen (Straße, Hausnummer, PLZ, Stadt).";
    }
    if (!destinationStreet.trim() || !destinationHouseNumber.trim() || !destinationCity.trim() || !destinationPostalCode.trim()) {
      return "Bitte Zieladresse vollständig ausfüllen (Straße, Hausnummer, PLZ, Stadt).";
    }
    if (approvalPresent == null) return "Bitte Genehmigung vorhanden: ja/nein auswählen.";
    if (approvalPresent === true && approvalProofMode === "uploaded" && !transportDocUri) {
      return "Bitte Genehmigung jetzt hochladen oder andere Nachweis-Option wählen.";
    }
    if (needsAssistance && (assistanceLevel == null || canTransfer == null || companionCount == null)) {
      return "Bitte Hilfe, Umsteigen (ja/nein) und Begleitperson auswählen.";
    }
    if (needsAssistance && wheelchairType == null) return "Bitte Rollstuhl-Typ auswählen.";
    if (seriesMode) {
      if (seriesFrom > seriesTo) return "Bitte Serien-Zeitraum prüfen (Start <= Ende).";
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

    const accessibilityOptions: RideAccessibilityOptions | null = needsAssistance
      ? {
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
        }
      : null;

    if (needsAssistance && wheelchairDetailMode === "save_default" && accessibilityOptions) {
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

    const recognitionStatus: RecognitionStatus | null = transportDocUri ? "pending_recognition" : null;
    const transportDocumentStatus =
      approvalPresent === true
        ? approvalProofMode
        : transportDocUri
          ? "uploaded"
          : "missing";
    const medicalMeta: Record<string, unknown> = {
      medical_ride: true,
      approval_status:
        approvalPresent === true ? "approved" : approvalPresent === false ? "missing_info" : "pending",
      payer_kind: "insurance",
      insurance_name: insuranceName.trim() || "",
      cost_center: costCenter.trim() || "",
      authorization_reference: authorizationReference.trim() || "",
      approval_proof_mode: approvalPresent === true ? approvalProofMode : "none",
      transport_document_status: transportDocumentStatus,
      transport_document_processing_status: recognitionStatus ?? "missing",
      transport_document_recognition_status: recognitionStatus,
      transport_document_recognition_result: null,
      transport_document_recognition_next_states: ["recognized", "unclear", "rejected"],
      signature_required: true,
      qr_required: true,
      billing_ready: false,
      copayment_required: "unknown",
      copayment_amount_estimated: 0,
      copayment_collected_status: "open",
      copayment_collection_method: "unknown",
      onroda_commission_rate: 0.07,
      onroda_commission_amount: 0,
      gross_ride_amount: 0,
      partner_payout_amount: 0,
      return_ride: returnRide,
      return_time: returnRide ? returnTime : null,
      transport_document_uri: transportDocUri ?? null,
    };

    const createOne = async (dateObj: Date) => {
      await addRequest({
        from: `${pickupStreet.trim()} ${pickupHouseNumber.trim()}`.trim(),
        fromFull: pickupAddress.trim(),
        to: `${destinationStreet.trim()} ${destinationHouseNumber.trim()}`.trim(),
        toFull: destinationAddress.trim(),
        distanceKm: 0,
        durationMinutes: 0,
        estimatedFare: 0,
        paymentMethod: "Krankenkasse",
        vehicle: needsAssistance ? "Rollstuhl" : "Krankenfahrt",
        customerName: patientName.trim(),
        scheduledAt: dateObj,
        rideKind: "medical",
        payerKind: "insurance",
        billingReference: costCenter.trim() || authorizationReference.trim() || null,
        partnerBookingMeta: medicalMeta,
        ...(accessibilityOptions ? { accessibilityOptions } : {}),
      });
      if (returnRide) {
        await addRequest({
          from: `${destinationStreet.trim()} ${destinationHouseNumber.trim()}`.trim(),
          fromFull: destinationAddress.trim(),
          to: `${pickupStreet.trim()} ${pickupHouseNumber.trim()}`.trim(),
          toFull: pickupAddress.trim(),
          distanceKm: 0,
          durationMinutes: 0,
          estimatedFare: 0,
          paymentMethod: "Krankenkasse",
          vehicle: needsAssistance ? "Rollstuhl" : "Krankenfahrt",
          customerName: patientName.trim(),
          scheduledAt: mergeDateAndTime(new Date(dateObj), returnTime),
          rideKind: "medical",
          payerKind: "insurance",
          billingReference: costCenter.trim() || authorizationReference.trim() || null,
          partnerBookingMeta: { ...medicalMeta, return_leg: true },
          ...(accessibilityOptions ? { accessibilityOptions } : {}),
        });
      }
    };

    if (seriesMode) {
      const dates = createSeriesDates(formatDateIso(seriesFrom), formatDateIso(seriesTo), seriesWeekdays).map((d) =>
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
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: rs(16),
          gap: rs(12),
          paddingBottom: mainTabScrollPaddingBottom(insets.bottom, rs(120)),
        }}
      >
        <Field label="Patient / Fahrgast" value={patientName} onChangeText={setPatientName} onFocus={focusIntoView} />
        <AddressCard
          title="Abholung"
          street={pickupStreet}
          houseNumber={pickupHouseNumber}
          postalCode={pickupPostalCode}
          city={pickupCity}
          onStreetChange={setPickupStreet}
          onHouseNumberChange={setPickupHouseNumber}
          onPostalCodeChange={setPickupPostalCode}
          onCityChange={setPickupCity}
          onFocus={focusIntoView}
        />
        <AddressCard
          title="Ziel"
          street={destinationStreet}
          houseNumber={destinationHouseNumber}
          postalCode={destinationPostalCode}
          city={destinationCity}
          onStreetChange={setDestinationStreet}
          onHouseNumberChange={setDestinationHouseNumber}
          onPostalCodeChange={setDestinationPostalCode}
          onCityChange={setDestinationCity}
          onFocus={focusIntoView}
        />
        <View style={styles.row}>
          <PickerField
            label="Datum"
            value={formatDateDe(appointmentDate)}
            onPress={() => openPicker("appointmentDate", "date")}
            style={{ flex: 1 }}
          />
          <PickerField
            label="Uhrzeit"
            value={appointmentTime}
            onPress={() => openPicker("appointmentTime", "time")}
            style={{ flex: 1 }}
          />
        </View>
        <Toggle label="Hin- und Rückfahrt" value={returnRide} onPress={() => setReturnRide((v) => !v)} />
        {returnRide ? (
          <PickerField
            label="Uhrzeit Rückfahrt"
            value={returnTime}
            onPress={() => openPicker("returnTime", "time")}
          />
        ) : null}

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
          {approvalPresent === true ? (
            <>
              <ChoiceTitle text="Nachweis-Option" />
              <ChoiceRow
                choices={[
                  {
                    id: "approval-upload",
                    label: "Jetzt hochladen",
                    active: approvalProofMode === "uploaded",
                    onPress: () => setApprovalProofMode("uploaded"),
                  },
                  {
                    id: "approval-show-driver",
                    label: "Vor Ort beim Fahrer zeigen",
                    active: approvalProofMode === "show_to_driver",
                    onPress: () => setApprovalProofMode("show_to_driver"),
                  },
                  {
                    id: "approval-later",
                    label: "Später nachreichen",
                    active: approvalProofMode === "later",
                    onPress: () => setApprovalProofMode("later"),
                  },
                ]}
              />
            </>
          ) : null}
        </View>

        <Pressable style={styles.uploadBtn} onPress={pickTransportDocument}>
          <Feather name="upload" size={16} color="#fff" />
          <Text style={styles.uploadText}>
            {transportDocUri ? "Transportschein hochgeladen (Erkennung ausstehend)" : "Transportschein hochladen/fotografieren"}
          </Text>
        </Pressable>
        <Text style={styles.profileHint}>
          Eventuelle gesetzliche Zuzahlung wird nach geltenden Regeln berechnet.
        </Text>

        <View style={styles.box}>
          <Text style={styles.boxTitle}>Rollstuhl / besondere Hilfe benötigt</Text>
          <Toggle label="Rollstuhl / besondere Hilfe benötigt" value={needsAssistance} onPress={() => setNeedsAssistance((v) => !v)} />
          {!needsAssistance ? (
            <Text style={styles.profileHint}>
              Krankenfahrt ohne Rollstuhl ist möglich. Zusätzliche Hilfefragen bleiben optional ausgeblendet.
            </Text>
          ) : null}
          {needsAssistance ? (
            <>
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
            </>
          ) : null}
        </View>

        {seriesMode ? (
          <View style={styles.box}>
            <Text style={styles.boxTitle}>Serienfahrt</Text>
            <View style={styles.row}>
              <PickerField
                label="Zeitraum von"
                value={formatDateDe(seriesFrom)}
                onPress={() => openPicker("seriesFrom", "date")}
                style={{ flex: 1 }}
              />
              <PickerField
                label="bis"
                value={formatDateDe(seriesTo)}
                onPress={() => openPicker("seriesTo", "date")}
                style={{ flex: 1 }}
              />
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
            <View style={styles.row}>
              <PickerField
                label="Uhrzeit Hinfahrt"
                value={appointmentTime}
                onPress={() => openPicker("appointmentTime", "time")}
                style={{ flex: 1 }}
              />
              <PickerField
                label="Uhrzeit Rückfahrt (optional)"
                value={returnTime}
                onPress={() => openPicker("returnTime", "time")}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        ) : null}

        <Pressable style={styles.submitBtn} onPress={() => void submitMedical()}>
          <Feather name="check" size={18} color="#fff" />
          <Text style={styles.submitText}>{seriesMode ? "Serienfahrt erstellen" : "Krankenfahrt speichern"}</Text>
        </Pressable>
      </ScrollView>
      <Modal visible={pickerTarget != null} transparent animationType="fade" onRequestClose={cancelPicker}>
        <View style={styles.pickerModalBackdrop}>
          <View style={styles.pickerModalCard}>
            <Text style={styles.boxTitle}>{pickerMode === "date" ? "Datum wählen" : "Uhrzeit wählen"}</Text>
            <DateTimePicker
              value={pickerDraftValue ?? pickerValueForTarget(pickerTarget)}
              mode={pickerMode}
              display={"spinner"}
              is24Hour
              onChange={onPickerChange}
            />
            <View style={[styles.row, { justifyContent: "flex-end", marginTop: rs(8) }]}>
              <Pressable style={styles.modalGhostBtn} onPress={cancelPicker}>
                <Text style={styles.modalGhostBtnText}>Abbrechen</Text>
              </Pressable>
              <Pressable style={styles.modalPrimaryBtn} onPress={confirmPicker}>
                <Text style={styles.modalPrimaryBtnText}>OK</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <BottomTabBar active="buchen" />
    </KeyboardAvoidingView>
  );
}

function AddressCard({
  title,
  street,
  houseNumber,
  postalCode,
  city,
  onStreetChange,
  onHouseNumberChange,
  onPostalCodeChange,
  onCityChange,
  onFocus,
}: {
  title: string;
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  onStreetChange: (v: string) => void;
  onHouseNumberChange: (v: string) => void;
  onPostalCodeChange: (v: string) => void;
  onCityChange: (v: string) => void;
  onFocus?: (e: any) => void;
}) {
  return (
    <View style={styles.addressBox}>
      <Text style={styles.boxTitle}>{title}</Text>
      <View style={styles.row}>
        <Field label="Straße" value={street} onChangeText={onStreetChange} onFocus={onFocus} style={{ flex: 3 }} />
        <Field
          label="Hausnummer"
          value={houseNumber}
          onChangeText={onHouseNumberChange}
          onFocus={onFocus}
          style={{ flex: 1.4 }}
        />
      </View>
      <View style={styles.row}>
        <Field label="PLZ" value={postalCode} onChangeText={onPostalCodeChange} onFocus={onFocus} style={{ flex: 1 }} />
        <Field label="Stadt" value={city} onChangeText={onCityChange} onFocus={onFocus} style={{ flex: 2 }} />
      </View>
    </View>
  );
}

function PickerField({
  label,
  value,
  onPress,
  style,
}: {
  label: string;
  value: string;
  onPress: () => void;
  style?: any;
}) {
  return (
    <View style={style}>
      <Text style={{ fontSize: rf(12), fontFamily: "Inter_600SemiBold", marginBottom: rs(6) }}>{label}</Text>
      <Pressable onPress={onPress} style={styles.pickerField}>
        <Text style={styles.pickerFieldValue}>{value}</Text>
        <Feather name="calendar" size={15} color="#475569" />
      </Pressable>
    </View>
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
  addressBox: { backgroundColor: "#F8FAFC", borderWidth: 1, borderColor: "#E2E8F0", borderRadius: rs(12), padding: rs(10), gap: rs(8) },
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
  pickerField: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#fff",
    borderRadius: rs(10),
    paddingHorizontal: rs(10),
    paddingVertical: rs(11),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pickerFieldValue: {
    fontSize: rf(14),
    fontFamily: "Inter_500Medium",
    color: "#0F172A",
  },
  pickerModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.35)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: rs(20),
  },
  pickerModalCard: {
    width: "100%",
    maxWidth: rs(360),
    borderRadius: rs(14),
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: rs(12),
  },
  modalGhostBtn: {
    paddingVertical: rs(9),
    paddingHorizontal: rs(12),
    borderRadius: rs(10),
    backgroundColor: "#E2E8F0",
  },
  modalGhostBtnText: {
    fontSize: rf(13),
    fontFamily: "Inter_700Bold",
    color: "#334155",
  },
  modalPrimaryBtn: {
    paddingVertical: rs(9),
    paddingHorizontal: rs(14),
    borderRadius: rs(10),
    backgroundColor: "#16A34A",
  },
  modalPrimaryBtnText: {
    fontSize: rf(13),
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
});

