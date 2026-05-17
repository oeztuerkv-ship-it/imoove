import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { useKeepAwake } from "expo-keep-awake";
import { router } from "expo-router";
import { connectToRide, disconnectSocket, sendDriverLocation as socketSendDriver } from "@/utils/socket";
import { readFleetJwtForWsJoin } from "@/utils/wsJoinAuth";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import { CameraView, useCameraPermissions } from "expo-camera";
import SignatureScreen from "react-native-signature-canvas";
import {
  ActivityIndicator,
  Alert,
  Animated,
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

import { RealMapView } from "@/components/RealMapView";
import MapView from "react-native-maps";
import { type DriverProfile, useDriver } from "@/context/DriverContext";
import { useOnrodaAppConfig } from "@/context/AppConfigContext";
import { useRide } from "@/context/RideContext";
import { type RideRequest, useRideRequests } from "@/context/RideRequestContext";
import { useColors } from "@/hooks/useColors";
import { MESSAGE_ADDRESS_PICK_SUGGESTION_DE, userFacingBookingErrorMessage, validateServiceAreaForBooking } from "@/lib/appOperationalConfig";
import { getApiBaseUrl } from "@/utils/apiBase";
import { formatEuro } from "@/utils/fareCalculator";
import { requestNotificationPermissions, sendNewRideNotification, stopRideSound } from "@/utils/notifications";
import { parseMedicalQrPayload } from "@/utils/medicalQrPayload";

/** Krankenkassen-/Eigenanteil-Fahrten (vom Kunden gebucht). */
function isKrankenkasseRide(paymentMethod: string) {
  return paymentMethod.startsWith("Krankenkasse");
}

function accessCodeErrorMessage(code: string): string {
  const m: Record<string, string> = {
    pickup_coordinates_required: MESSAGE_ADDRESS_PICK_SUGGESTION_DE,
    ride_coordinates_required: MESSAGE_ADDRESS_PICK_SUGGESTION_DE,
    address_house_number_required:
      "Bitte gib eine vollständige Adresse mit Hausnummer ein oder wähle einen eindeutigen Vorschlag aus.",
    accessibility_options_required_for_wheelchair: "Für Rollstuhl-Fahrten sind Details erforderlich.",
    accessibility_options_invalid: "Rollstuhl-Details sind ungültig.",
    access_code_invalid: "Der eingegebene Code ist ungueltig oder unbekannt.",
    access_code_inactive: "Dieser Code ist deaktiviert.",
    access_code_not_yet_valid: "Dieser Code ist noch nicht gueltig (Startdatum/Zeit der Freigabe).",
    access_code_expired: "Dieser Code ist abgelaufen.",
    access_code_exhausted: "Dieser Code wurde bereits vollstaendig eingeloest.",
    access_code_wrong_company: "Dieser Code passt nicht zu diesem Unternehmen.",
    access_code_verify_required: "Bitte den Code zuerst verifizieren.",
    request_failed: "Die Fahrt konnte nicht erstellt werden.",
  };
  return m[code] ?? "Die Fahrt konnte nicht erstellt werden.";
}

function accessCodeTypeDe(t: string): string {
  const m: Record<string, string> = {
    voucher: "Gutschein",
    hotel: "Hotel",
    company: "Firma",
    general: "Fahrcode",
  };
  return m[t] ?? "Code";
}

/** Kurzinfo für Fahrer: kein Klartext-Code, nur Label + Typ. */
function accessCodeRideLine(req: RideRequest): string | null {
  if (req.authorizationSource !== "access_code") return null;
  const s = req.accessCodeSummary;
  if (s?.label) return `Freigabe · ${s.label} (${accessCodeTypeDe(s.codeType)})`;
  return "Freigabe · Zugangscode (gültig)";
}

function isWheelchairVehicleLabel(vehicle: string | undefined): boolean {
  const v = (vehicle ?? "").toLowerCase();
  return v === "wheelchair" || v.includes("rollstuhl");
}

function wheelchairInfoLine(req: RideRequest): string | null {
  if (!isWheelchairVehicleLabel(req.vehicle)) return null;
  const ao = (req as RideRequest & { accessibilityOptions?: any }).accessibilityOptions;
  if (!ao || typeof ao !== "object") return "Rollstuhl-Fahrt";
  const assistanceMap: Record<string, string> = {
    boarding: "Hilfe beim Einsteigen",
    to_door: "Hilfe bis Haustür",
    to_apartment: "Hilfe bis Wohnung",
    none: "Keine Hilfe",
  };
  const companionMap: Record<number, string> = {
    0: "keine Begleitperson",
    1: "1 Begleitperson",
    2: "2 Begleitpersonen",
  };
  const flags: string[] = [];
  if (ao.rampRequired) flags.push("Rampe");
  if (ao.carryChairRequired) flags.push("Tragestuhl");
  if (ao.stairsPresent) flags.push("Treppen");
  if (ao.elevatorAvailable) flags.push("Aufzug");
  const parts = [
    "Rollstuhl",
    assistanceMap[String(ao.assistanceLevel)] || "Hilfe-Info",
    ao.canTransfer === true ? "kann umsteigen" : "bleibt im Rollstuhl",
    companionMap[Number(ao.companionCount)] || "Begleitperson unklar",
    ...(flags.length ? [flags.join(", ")] : []),
  ];
  if (typeof ao.driverNote === "string" && ao.driverNote.trim()) parts.push(`Hinweis: ${ao.driverNote.trim()}`);
  return parts.join(" · ");
}

function customerDriverNoteLine(req: RideRequest): string | null {
  const accessibilityNote = req.accessibilityOptions?.driverNote;
  if (typeof accessibilityNote === "string" && accessibilityNote.trim()) {
    return accessibilityNote.trim();
  }

  const meta = (req as RideRequest & { partnerBookingMeta?: unknown }).partnerBookingMeta;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const note = (meta as Record<string, unknown>).customer_driver_note;
  if (typeof note !== "string") return null;
  const trimmed = note.trim();
  return trimmed.length > 0 ? trimmed : null;
}

type MedicalStep = { label: string; done: boolean };

function approvalStatusDe(v: string): string {
  const map: Record<string, string> = {
    missing: "Genehmigung fehlt",
    pending: "Genehmigung in Prüfung",
    approved: "Genehmigt",
    rejected: "Abgelehnt",
  };
  return map[v] ?? v;
}

function transportDocumentStatusDe(v: string): string {
  const map: Record<string, string> = {
    missing: "Transportschein fehlt",
    uploaded: "Transportschein hochgeladen",
    verified: "Transportschein geprüft",
    rejected: "Transportschein abgelehnt",
  };
  return map[v] ?? v;
}

function medicalSteps(req: RideRequest): MedicalStep[] | null {
  const metaRaw = (req as RideRequest & { partnerBookingMeta?: any }).partnerBookingMeta;
  if (!metaRaw || typeof metaRaw !== "object") return null;
  if (metaRaw.medical_ride !== true) return null;
  const approval = typeof metaRaw.approval_status === "string" ? metaRaw.approval_status.toLowerCase() : "pending";
  const doc = typeof metaRaw.transport_document_status === "string" ? metaRaw.transport_document_status.toLowerCase() : "missing";
  const hasInsurance = typeof metaRaw.insurance_name === "string" && metaRaw.insurance_name.trim().length > 0;
  const hasCostCenter = typeof metaRaw.cost_center === "string" && metaRaw.cost_center.trim().length > 0;
  const signatureRequired = metaRaw.signature_required === true;
  const signatureDone = metaRaw.signature_done === true;
  const qrRequired = metaRaw.qr_required !== false;
  const qrDone = metaRaw.qr_done === true;
  return [
    { label: `QR (${!qrRequired ? "nicht erforderlich" : qrDone ? "erledigt" : "erforderlich"})`, done: !qrRequired || qrDone },
    {
      label: `Unterschrift (${!signatureRequired ? "nicht erforderlich" : signatureDone ? "erledigt" : "erforderlich"})`,
      done: !signatureRequired || signatureDone,
    },
    { label: transportDocumentStatusDe(doc), done: doc === "uploaded" || doc === "verified" || doc === "provided" },
    { label: approvalStatusDe(approval), done: approval === "approved" },
    { label: "Kasse/Kostenstelle", done: hasInsurance && hasCostCenter },
  ];
}

function parseEuroDriverInput(text: string): number | null {
  const n = parseFloat(text.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// MOCK_RIDES entfernt - nur echte Fahrten aus RideContext
type RideEntry = { id: string; date: string; time: string; from: string; to: string; km: number; duration: number; amount: number; payment: string; };

const API_BASE = getApiBaseUrl();
const DRIVER_MARKET_STATUSES = new Set<RideRequest["status"]>([
  "pending",
  "requested",
  "searching_driver",
  "offered",
]);

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

type Tab = "uebersicht" | "auftraege" | "fahrten" | "geldbeutel" | "profil";
type ActivePhase = "pickup" | "driving";

/* ─── Helpers ─── */
function fmt(d: Date) {
  const dd = d.getDate().toString().padStart(2, "0");
  const mm = (d.getMonth() + 1).toString().padStart(2, "0");
  const yy = d.getFullYear();
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return { date: `${dd}.${mm}.${yy}`, time: `${h}:${m}` };
}

function minutesUntil(d: Date) {
  return Math.round((d.getTime() - Date.now()) / 60000);
}

/** Aktivierung nur im Fenster 0–45 Minuten vor Abholzeit (nicht nach Abholzeit). */
function canActivate(scheduledAt: Date) {
  const m = minutesUntil(scheduledAt);
  return m >= 0 && m <= 45;
}

/* ─── Pulsing dot ─── */
function PulsingDot({ color = "#22C55E" }: { color?: string }) {
  const anim = useRef(new Animated.Value(1)).current;
  React.useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(anim, { toValue: 1.6, duration: 700, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 1, duration: 700, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);
  return (
    <View style={{ width: 16, height: 16, justifyContent: "center", alignItems: "center" }}>
      <Animated.View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color, transform: [{ scale: anim }], opacity: 0.5, position: "absolute" }} />
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
    </View>
  );
}

function rideTypeBadge(req: RideRequest): { label: string; bg: string; color: string } {
  if (req.authorizationSource === "access_code") {
    return { label: "Freigabe", bg: "#DCFCE7", color: "#166534" };
  }
  if (req.rideKind === "medical" || isKrankenkasseRide(req.paymentMethod)) {
    return { label: "Krankenfahrt", bg: "#DBEAFE", color: "#1D4ED8" };
  }
  if (req.rideKind === "company" || req.payerKind === "company") {
    return { label: "Firmenfahrt", bg: "#FEF3C7", color: "#92400E" };
  }
  if (req.rideKind === "voucher" || req.payerKind === "voucher") {
    return { label: "Gutscheinfahrt", bg: "#EDE9FE", color: "#5B21B6" };
  }
  return { label: "Taxifahrt", bg: "#F1F5F9", color: "#334155" };
}

function hasTaxiEstimateBadge(req: RideRequest): boolean {
  const vehicle = (req.vehicle ?? "").toLowerCase().trim();
  return vehicle.includes("onroda");
}

/* ─── Sofortfahrt-Karte (hell, Google-ähnlich) — ohne Preis / Taxameter ─── */
function InstantCard({ req, onAccept, onReject, driverPos }: { req: RideRequest; onAccept: () => void; onReject: () => void; driverPos?: { lat: number; lon: number } | null }) {
  const distToPickupM =
    driverPos && req.fromLat != null && req.fromLon != null
      ? haversineDistance(driverPos.lat, driverPos.lon, req.fromLat, req.fromLon)
      : null;
  const distPickupLabel =
    distToPickupM != null
      ? distToPickupM < 1000
        ? `${Math.round(distToPickupM)} m entfernt`
        : `${(distToPickupM / 1000).toFixed(1)} km entfernt`
      : null;
  const { date, time } = fmt(req.createdAt);
  const codeLine = accessCodeRideLine(req);
  const wheelchairLine = wheelchairInfoLine(req);
  const customerNoteLine = customerDriverNoteLine(req);
  const medicalChecklist = medicalSteps(req);
  const payLabel = isKrankenkasseRide(req.paymentMethod) ? "Krankenkasse" : req.paymentMethod || "Bar";
  const modeBadge = rideTypeBadge(req);
  const hasTaxiEstimate = hasTaxiEstimateBadge(req);

  const pillGray = {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#F1F5F9",
  } as const;
  const pillRed = {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#FEE2E2",
  } as const;

  return (
    <View
      style={{
        marginHorizontal: 14,
        marginBottom: 14,
        borderRadius: 16,
        borderWidth: 2,
        borderColor: "#22C55E",
        backgroundColor: "#fff",
        overflow: "hidden",
        shadowColor: "#000",
        shadowOpacity: 0.12,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 6 },
        elevation: 10,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 16,
          paddingVertical: 12,
          backgroundColor: "#F0FDF4",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#22C55E" }} />
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: "#0F172A" }}>Sofortfahrt</Text>
        </View>
        <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: "#64748B" }}>
          {date} · {time} Uhr
        </Text>
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 }}>
        {distPickupLabel ? (
          <View style={pillRed}>
            <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: "#B91C1C" }}>{distPickupLabel}</Text>
          </View>
        ) : null}
        <View style={pillGray}>
          <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#475569" }}>
            {req.distanceKm.toFixed(1)} km
          </Text>
        </View>
        <View style={pillGray}>
          <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#475569" }}>{req.vehicle}</Text>
        </View>
        <View style={[pillGray, { backgroundColor: modeBadge.bg }]}>
          <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: modeBadge.color }}>
            {modeBadge.label}
          </Text>
        </View>
        {hasTaxiEstimate ? (
          <View style={[pillGray, { backgroundColor: "#FEE2E2", flexDirection: "row", alignItems: "center", gap: 6 }]}>
            <MaterialCommunityIcons name="shield-check-outline" size={13} color="#B91C1C" />
            <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: "#B91C1C" }}>
              Taxi-Schätzpreis
            </Text>
          </View>
        ) : null}
      </View>

      <View style={{ paddingHorizontal: 16, paddingBottom: 12, gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#22C55E", marginTop: 4 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#64748B", letterSpacing: 0.5 }}>VON</Text>
            <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#0F172A" }} numberOfLines={2}>
              {req.fromFull}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#DC2626", marginTop: 4 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#64748B", letterSpacing: 0.5 }}>BIS</Text>
            <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#0F172A" }} numberOfLines={2}>
              {req.toFull}
            </Text>
          </View>
        </View>
      </View>

      {codeLine ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingBottom: 8 }}>
          <Feather name="shield" size={14} color="#16A34A" />
          <Text style={{ flex: 1, fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#15803D" }} numberOfLines={2}>
            {codeLine}
          </Text>
        </View>
      ) : null}
      {wheelchairLine ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingBottom: 8 }}>
          <MaterialCommunityIcons name="wheelchair-accessibility" size={14} color="#0EA5E9" />
          <Text style={{ flex: 1, fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#0369A1" }} numberOfLines={3}>
            {wheelchairLine}
          </Text>
        </View>
      ) : null}
      {customerNoteLine ? (
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, paddingHorizontal: 16, paddingBottom: 8 }}>
          <Feather name="message-square" size={14} color="#0F766E" style={{ marginTop: 1 }} />
          <Text style={{ flex: 1, fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#115E59" }} numberOfLines={4}>
            Hinweis Kunde: {customerNoteLine}
          </Text>
        </View>
      ) : null}
      {medicalChecklist ? (
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <MaterialCommunityIcons name="hospital-box-outline" size={14} color="#2563EB" />
            <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: "#1D4ED8" }}>Krankenfahrt-Check</Text>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {medicalChecklist.map((step) => (
              <View
                key={step.label}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 5,
                  borderRadius: 999,
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  backgroundColor: step.done ? "#DCFCE7" : "#FEE2E2",
                }}
              >
                <Feather name={step.done ? "check-circle" : "alert-circle"} size={12} color={step.done ? "#166534" : "#B91C1C"} />
                <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: step.done ? "#166534" : "#B91C1C" }}>
                  {step.label}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingBottom: 14 }}>
        <Feather name="user" size={15} color="#334155" />
        <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: "#334155", flexShrink: 1 }}>
          {req.customerName}
        </Text>
        <Text style={{ color: "#CBD5E1" }}>·</Text>
        <MaterialCommunityIcons name="cash" size={18} color="#64748B" />
        <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: "#475569" }}>{payLabel}</Text>
      </View>

      <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 14, paddingBottom: 16 }}>
        <Pressable
          onPress={onReject}
          style={({ pressed }) => ({
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            borderRadius: 14,
            paddingVertical: 10,
            borderWidth: 2,
            borderColor: "#DC2626",
            backgroundColor: pressed ? "#FEF2F2" : "#fff",
          })}
        >
          <Feather name="x" size={18} color="#DC2626" />
          <Text style={{ color: "#DC2626", fontFamily: "Inter_700Bold", fontSize: 15 }}>Ablehnen</Text>
        </Pressable>
        <Pressable
          onPress={onAccept}
          style={({ pressed }) => ({
            flex: 2,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            borderRadius: 14,
            paddingVertical: 10,
            backgroundColor: pressed ? "#15803D" : "#16A34A",
          })}
        >
          <Feather name="check" size={20} color="#fff" />
          <Text style={{ color: "#fff", fontFamily: "Inter_700Bold", fontSize: 16 }}>Annehmen</Text>
        </Pressable>
      </View>
    </View>
  );
}

/* ─── Scheduled Request Card ─── */
function ScheduledCard({ req, onAccept, onReject, onActivate, onCancelAssigned, driverPos }: { req: RideRequest; onAccept: () => void; onReject: () => void; onActivate: () => void; onCancelAssigned: () => void; driverPos?: { lat: number; lon: number } | null }) {
  const isAssignedUpcoming = req.status === "scheduled_assigned";
  const { date, time } = fmt(new Date(req.scheduledAt!));
  const [activationTick, setActivationTick] = useState(0);
  useEffect(() => {
    if (!isAssignedUpcoming || !req.scheduledAt) return;
    const t = setInterval(() => setActivationTick((n: number) => n + 1), 30000);
    return () => clearInterval(t);
  }, [isAssignedUpcoming, req.scheduledAt]);
  const scheduledAtDate = new Date(req.scheduledAt!);
  const minsLeft = useMemo(() => minutesUntil(scheduledAtDate), [req.scheduledAt, activationTick]);
  const activatable = isAssignedUpcoming && canActivate(scheduledAtDate);

  const splitAddress = (value?: string | null) => {
    const parts = String(value || "").split(",").map((part) => part.trim()).filter(Boolean);
    return {
      place: parts[0] || "Adresse folgt",
      address: parts.slice(1).join(", ") || "",
    };
  };

  const fromAddress = splitAddress(req.fromFull);
  const toAddress = splitAddress(req.toFull);
  const customerNoteLine = customerDriverNoteLine(req);

  return (
    <View style={[styles.reqCard, styles.reqCardScheduled, { borderRadius: 22, padding: 18 }]}>
      <View style={{ flexDirection: "row" }}>
        <View style={{ width: 48, alignItems: "center", marginRight: 14 }}>
          <View style={{ width: 48, height: 38, borderRadius: 24, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E5E7EB", alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 25 }}>📍</Text>
          </View>

          <View style={{ width: 1, height: 42, borderStyle: "dashed", borderWidth: 1, borderColor: "#D1D5DB", marginVertical: 2 }} />

          <View style={{ width: 48, height: 38, borderRadius: 24, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E5E7EB", alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 23 }}>🏁</Text>
          </View>
        </View>

        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: "#111827", marginBottom: 5 }} numberOfLines={1}>
                {fromAddress.place}
              </Text>
              <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: "#6B7280", lineHeight: 19 }} numberOfLines={2}>
                {fromAddress.address}
              </Text>
            </View>

            <View style={{ alignItems: "flex-end", marginLeft: 10 }}>
              <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: "#111827" }}>
                {date}
              </Text>
              <Text style={{ fontSize: 25, fontFamily: "Inter_900Black", color: "#E11D2E", marginTop: 4 }}>
                {time}
              </Text>
            </View>
          </View>

          <View style={{ marginTop: 38 }}>
            <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: "#111827", marginBottom: 5 }} numberOfLines={1}>
              {toAddress.place}
            </Text>
            <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: "#6B7280", lineHeight: 19 }} numberOfLines={2}>
              {toAddress.address}
            </Text>
          </View>
        </View>
      </View>

      {customerNoteLine ? (
        <View style={{
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 8,
          marginTop: 16,
          padding: 12,
          borderRadius: 14,
          backgroundColor: "#ECFDF5",
          borderWidth: 1,
          borderColor: "#99F6E4",
        }}>
          <Feather name="message-square" size={16} color="#0F766E" style={{ marginTop: 1 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: "#0F766E", marginBottom: 3 }}>
              Hinweis Kunde
            </Text>
            <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#115E59", lineHeight: 18 }} numberOfLines={5}>
              {customerNoteLine}
            </Text>
          </View>
        </View>
      ) : null}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
        <View style={{ backgroundColor: "#F3F4F6", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 }}>
          <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: "#374151" }}>
            {req.distanceKm.toFixed(1)} km
          </Text>
        </View>

        <View style={{ backgroundColor: "#F3F4F6", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 }}>
          <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: "#374151" }}>
            {req.rideKind === "medical"
              ? "Krankenfahrt"
              : req.voucherCode || req.accessCodeSummary
                ? "Gutschein/Code"
                : req.paymentMethod === "cash"
                  ? "Barzahlung"
                  : "App-Zahlung"}
          </Text>
        </View>

        <View style={{ backgroundColor: "#FFF1F1", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 }}>
          <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: "#E11D2E" }}>
            ca. {req.estimatedFare.toFixed(2)} €
          </Text>
        </View>
      </View>

      {!isAssignedUpcoming ? (
        <View style={{ flexDirection: "row", gap: 8, marginTop: 24 }}>
          <Pressable style={[styles.rejectBtn, { flex: 1, borderColor: "#B91C1C", backgroundColor: "#FEF2F2", paddingVertical: 10, borderRadius: 14 }]} onPress={onReject}>
            <Text style={[styles.rejectText, { color: "#B91C1C" }]}>Ablehnen</Text>
          </Pressable>
          <Pressable style={[styles.acceptBtn, { flex: 2, backgroundColor: "#DC2626", paddingVertical: 15, borderRadius: 14 }]} onPress={onAccept}>
            <Text style={styles.acceptText}>Annehmen</Text>
          </Pressable>
        </View>
      ) : (
        <View style={{ flexDirection: "row", gap: 8, marginTop: 24 }}>
          <Pressable
            style={[styles.rejectBtn, { flex: 1, borderColor: "#FEE2E2", backgroundColor: "#FFF1F1", paddingVertical: 15, borderRadius: 14 }]}
            onPress={onCancelAssigned}
          >
            <Text style={[styles.rejectText, { color: "#E11D2E", fontSize: 17 }]}>Stornieren</Text>
          </Pressable>
          {activatable ? (
            <Pressable style={[styles.acceptBtn, { flex: 2, backgroundColor: "#16A34A", paddingVertical: 15, borderRadius: 14 }]} onPress={onActivate}>
              <Text style={styles.acceptText}>Aktivieren</Text>
            </Pressable>
          ) : (
            <View style={{ flex: 2, justifyContent: "center", paddingHorizontal: 8 }}>
              <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: "#6B7280", textAlign: "center" }}>
                {minsLeft > 45
                  ? "Aktivierung ab 45 Min. vor Abholung"
                  : minsLeft < 0
                    ? "Abholzeit liegt in der Vergangenheit — bitte bei der Zentrale nachfragen."
                    : "Aktivierung derzeit nicht möglich."}
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

/* ─── Tab: Übersicht — Live-Karte mit Fahrerstandort + Auftrag-Popup ─── */
function TabUebersicht({ pendingRequests, onAccept, onReject, driverPos, isAvailable, marketLoading }: {
  pendingRequests: RideRequest[];
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  driverPos?: { lat: number; lon: number } | null;
  isAvailable: boolean;
  marketLoading?: boolean;
}) {
  const slideAnim = useRef(new Animated.Value(300)).current;
  const prevCountRef = useRef(0);
  const instantReqs = pendingRequests.filter(
    (r) =>
      r.status !== "scheduled" &&
      !(r.scheduledAt && new Date(r.scheduledAt).getTime() > Date.now() + 60 * 60 * 1000),
  );
  const firstReq = instantReqs[0] ?? null;

  // Slide in the card when a new request appears
  useEffect(() => {
    if (instantReqs.length > prevCountRef.current && firstReq) {
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 60, friction: 10 }).start();
    }
    if (instantReqs.length === 0) {
      slideAnim.setValue(300);
    }
    prevCountRef.current = instantReqs.length;
  }, [instantReqs.length, firstReq]);

  useEffect(() => {
    if (!isAvailable || !firstReq) {
      slideAnim.setValue(300);
      return;
    }
    slideAnim.setValue(0);
  }, [isAvailable, firstReq?.id, instantReqs.length]);

  const mapLat = driverPos?.lat ?? 48.7394;
  const mapLon = driverPos?.lon ?? 9.3114;

  if (Platform.OS === "web") {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 16, padding: 32 }}>
        <MaterialCommunityIcons name="taxi" size={56} color="#DC2626" />
        <Text style={{ fontSize: 17, fontFamily: "Inter_700Bold", color: "#111" }}>
          {isAvailable ? "Warte auf Aufträge..." : "Offline"}
        </Text>
        {firstReq && isAvailable && !marketLoading && (
          <InstantCard req={firstReq} driverPos={driverPos}
            onAccept={() => onAccept(firstReq.id)}
            onReject={() => onReject(firstReq.id)} />
        )}
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {/* Full-screen live map */}
      <MapView
        style={StyleSheet.absoluteFillObject}
        provider={"google" as any}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        initialRegion={{ latitude: mapLat, longitude: mapLon, latitudeDelta: 0.04, longitudeDelta: 0.04 }}
        region={driverPos ? { latitude: driverPos.lat, longitude: driverPos.lon, latitudeDelta: 0.04, longitudeDelta: 0.04 } : undefined}
      />

      {/* Status chip top-center */}
      <View style={styles.mapStatusChip}>
        <View style={[styles.mapStatusDot, { backgroundColor: isAvailable ? "#22C55E" : "#6B7280" }]} />
        <Text style={styles.mapStatusText}>
          {isAvailable
            ? marketLoading
              ? "Markt wird geladen…"
              : firstReq
                ? `${instantReqs.length} ${instantReqs.length > 1 ? "Aufträge" : "Auftrag"} wartend`
                : "Bereit für Aufträge"
            : "Offline — Keine Aufträge"}
        </Text>
      </View>

      {/* Ride request popup — slides up from bottom (nur wenn ONLINE) */}
      {firstReq && isAvailable && !marketLoading && (
        <Animated.View style={[styles.mapReqOverlay, { transform: [{ translateY: slideAnim }] }]}>
          <InstantCard
            req={firstReq}
            driverPos={driverPos}
            onAccept={() => onAccept(firstReq.id)}
            onReject={() => onReject(firstReq.id)}
          />
          {instantReqs.length > 1 && (
            <Text style={styles.mapMoreReqs}>+{instantReqs.length - 1} weitere Anfrage{instantReqs.length > 2 ? "n" : ""}</Text>
          )}
        </Animated.View>
      )}
    </View>
  );
}

/* ─── Tab: Bestellungen (Vorbestellungen) ─── */
function TabBestellungen({ scheduledPool, onAccept, onReject, driverPos }: {
  scheduledPool: RideRequest[];
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  driverPos?: { lat: number; lon: number } | null;
}) {
  const colors = useColors();
  const scheduled = scheduledPool;
  if (scheduled.length === 0) {
    return (
      <View style={styles.emptyCenter}>
        <Feather name="calendar" size={56} color={colors.mutedForeground} />
        <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Keine Bestellungen</Text>
        <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>Noch keine Vorbestellungen eingegangen</Text>
      </View>
    );
  }
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.tabScroll}>
      {/* Sort by scheduled time ascending */}
      {[...scheduled].sort((a, b) =>
        new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime()
      ).map((req) => (
        <ScheduledCard key={req.id} req={req} driverPos={driverPos}
          onAccept={() => onAccept(req.id)}
          onReject={() => onReject(req.id)}
          onActivate={() => onAccept(req.id)}
          onCancelAssigned={() => onReject(req.id)} />
      ))}
    </ScrollView>
  );
}

/* ─── Tab: Karte ─── */
function TabKarte({ pendingRequests }: { pendingRequests: RideRequest[] }) {
  const colors = useColors();
  const activeReq = pendingRequests[0] ?? null;
  const origin = activeReq?.fromLat
    ? { lat: activeReq.fromLat, lon: activeReq.fromLon!, displayName: activeReq.fromFull }
    : { lat: 48.7394, lon: 9.3114, displayName: "Esslingen am Neckar" };
  const destination = activeReq?.toLat
    ? { lat: activeReq.toLat, lon: activeReq.toLon!, displayName: activeReq.toFull }
    : null;

  return (
    <View style={styles.mapTabContainer}>
      <RealMapView origin={origin} destination={destination ?? undefined} style={StyleSheet.absoluteFillObject} />
      <View style={styles.mapOverlay}>
        <View style={[styles.mapCard, { backgroundColor: colors.surface }]}>
          {activeReq ? (
            <>
              <View style={styles.mapCardRow}>
                <PulsingDot />
                <Text style={styles.mapCardTitle}>Abholpunkt</Text>
              </View>
              <Text style={styles.mapCardAddr} numberOfLines={2}>{activeReq.fromFull}</Text>
              <View style={styles.mapCardDivider} />
              <View style={styles.mapCardStats}>
                <View style={styles.mapStatItem}>
                  <Text style={styles.mapStatValue}>{activeReq.distanceKm.toFixed(1)} km</Text>
                  <Text style={styles.mapStatLabel}>Entfernung</Text>
                </View>
                <View style={styles.mapStatDivider} />
                <View style={styles.mapStatItem}>
                  <Text style={[styles.mapStatValue, { color: "#0F172A" }]}>
                    {Math.max(1, Math.round(activeReq.durationMinutes || 0))} Min
                  </Text>
                  <Text style={styles.mapStatLabel}>Fahrtzeit (ca.)</Text>
                </View>
              </View>
            </>
          ) : (
            <>
              <Text style={[styles.mapCardTitle, { color: "#6B7280" }]}>Keine aktive Anfrage</Text>
              <Text style={{ fontSize: 13, color: "#9CA3AF", marginTop: 4 }}>Warte auf Fahrtanfragen...</Text>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

/* ─── Tab: Fahrten ─── */
function TabFahrten({ allRides }: { allRides: RideEntry[] }) {
  const colors = useColors();
  const [activeFilter, setActiveFilter] = useState<"heute" | "woche" | "alle">("alle");
  const todayStr = fmt(new Date()).date;
  const displayed = activeFilter === "heute"
    ? allRides.filter((r) => r.date === todayStr)
    : activeFilter === "woche" ? allRides.slice(0, 12) : allRides;

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.tabScroll}>
      <View style={[styles.filterRow, { backgroundColor: colors.muted }]}>
        {(["heute", "woche", "alle"] as const).map((f) => (
          <Pressable
            key={f}
            style={[styles.filterBtn, activeFilter === f && [styles.filterBtnActive, { backgroundColor: colors.surface }]]}
            onPress={() => setActiveFilter(f)}
          >
            <Text style={[styles.filterText, { color: activeFilter === f ? "#EF1D26" : "#8E8E93", fontFamily: activeFilter === f ? "Inter_700Bold" : "Inter_500Medium", fontSize: 14 }]}>
              {f === "heute" ? "Heute" : f === "woche" ? "Woche" : "Alle"}
            </Text>
          </Pressable>
        ))}
      </View>
      {displayed.length === 0 ? (
        <View style={styles.emptyCenter}>
          <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>Keine Fahrten in diesem Zeitraum</Text>
        </View>
      ) : displayed.map((ride) => (
        <View key={ride.id} style={[styles.rideCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.rideTop}>
            <Text style={[styles.rideId, { color: colors.mutedForeground }]}>#{ride.id} · {ride.date} {ride.time}</Text>
            <Text style={[styles.rideAmount, { color: "#22C55E" }]}>{formatEuro(ride.amount)}</Text>
          </View>
          <View style={styles.rideRouteBlock}>
            <View style={styles.rideRouteRow}>
              <View style={[styles.rideDot, { backgroundColor: "#22C55E" }]} />
              <Text style={[styles.rideAddr, { color: colors.foreground }]} numberOfLines={1}>{ride.from}</Text>
            </View>
            <View style={[styles.rideVLine, { backgroundColor: colors.border }]} />
            <View style={styles.rideRouteRow}>
              <View style={[styles.rideDot, { backgroundColor: "#DC2626" }]} />
              <Text style={[styles.rideAddr, { color: colors.foreground }]} numberOfLines={1}>{ride.to}</Text>
            </View>
          </View>
          <View style={[styles.rideMeta, { borderTopColor: colors.border }]}>
            <View style={styles.rideMetaItem}><Feather name="map-pin" size={11} color={colors.mutedForeground} /><Text style={[styles.rideMetaText, { color: colors.mutedForeground }]}>{ride.km.toFixed(1)} km</Text></View>
            <View style={styles.rideMetaItem}><Feather name="clock" size={11} color={colors.mutedForeground} /><Text style={[styles.rideMetaText, { color: colors.mutedForeground }]}>{ride.duration} Min.</Text></View>
            <View style={styles.rideMetaItem}><Feather name="credit-card" size={11} color={colors.mutedForeground} /><Text style={[styles.rideMetaText, { color: colors.mutedForeground }]}>{ride.payment}</Text></View>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

/* ─── Tab: Geldbeutel ─── */
function TabGeldbeutel({ allRides, driverRating }: { allRides: RideEntry[]; driverRating: number }) {
  const colors = useColors();
  const [hidden, setHidden] = useState(false);
  const todayStr = fmt(new Date()).date;
  const todayRides = allRides.filter((r) => r.date === todayStr);
  const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const weekRides = allRides.filter((r) => {
    const [dd, mm, yy] = r.date.split(".");
    return new Date(`${yy}-${mm}-${dd}`) >= sevenDaysAgo;
  });
  const todayTotal = todayRides.reduce((s, r) => s + r.amount, 0);
  const weekTotal = weekRides.reduce((s, r) => s + r.amount, 0);
  const allTotal = allRides.reduce((s, r) => s + r.amount, 0);
  const allKm = allRides.reduce((s, r) => s + r.km, 0);
  const avgFare = allRides.length > 0 ? allTotal / allRides.length : 0;

  const mask = "***,** €";
  const show = (v: string) => hidden ? mask : v;

  const totalOffers = 42;
  const accepted = 38;
  const acceptanceRate = Math.round((accepted / totalOffers) * 100);
  const rejectionRate = 100 - acceptanceRate;

  const items = [
    { label: "Heute", value: show(formatEuro(todayTotal)), sub: `${todayRides.length} Fahrten`, icon: "sun" as const, color: "#F59E0B" },
    { label: "Diese Woche", value: show(formatEuro(weekTotal)), sub: `${weekRides.length} Fahrten`, icon: "calendar" as const, color: "#3B82F6" },
    { label: "Gesamt", value: show(formatEuro(allTotal)), sub: `${allRides.length} Fahrten`, icon: "trending-up" as const, color: "#22C55E" },
    { label: "Ø pro Fahrt", value: show(formatEuro(avgFare)), sub: "Durchschnitt", icon: "bar-chart-2" as const, color: "#8B5CF6" },
    { label: "Gesamt km", value: `${allKm.toFixed(0)} km`, sub: "Gefahren", icon: "map" as const, color: "#6B7280" },
    { label: "Bewertung", value: `★ ${driverRating.toFixed(1)}`, sub: "Kundenbewertung", icon: "star" as const, color: "#F59E0B" },
  ];

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.tabScroll}>
      {/* Privacy header */}
      <View style={[styles.privacyHeader, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View>
          <Text style={[styles.privacyTitle, { color: colors.foreground }]}>Einnahmen</Text>
          <Text style={[styles.privacySub, { color: colors.mutedForeground }]}>Tippe auf das Auge für Datenschutz</Text>
        </View>
        <Pressable
          onPress={() => { setHidden((h) => !h); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          style={[styles.eyeBtn, { backgroundColor: hidden ? "#FEE2E2" : "#F3F4F6" }]}
        >
          <Feather name={hidden ? "eye-off" : "eye"} size={20} color={hidden ? "#DC2626" : "#6B7280"} />
        </Pressable>
      </View>

      {/* Earnings cards */}
      <View style={styles.earningsGrid}>
        {items.map((item) => (
          <View key={item.label} style={[styles.earnCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.earnIconBg, { backgroundColor: item.color + "20" }]}>
              <Feather name={item.icon} size={20} color={item.color} />
            </View>
            <Text style={[styles.earnValue, { color: colors.foreground }]}>{item.value}</Text>
            <Text style={[styles.earnLabel, { color: colors.mutedForeground }]}>{item.label}</Text>
            <Text style={[styles.earnSub, { color: item.color }]}>{item.sub}</Text>
          </View>
        ))}
      </View>

      {/* Performance stats */}
      <View style={[styles.perfCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.perfTitle, { color: colors.foreground }]}>Performance-Monitor</Text>
        <View style={styles.perfRow}>
          <View style={styles.perfItem}>
            <Text style={[styles.perfValue, { color: "#F59E0B" }]}>★ {driverRating.toFixed(1)}</Text>
            <Text style={[styles.perfLabel, { color: colors.mutedForeground }]}>Sterne</Text>
          </View>
          <View style={[styles.perfDivider, { backgroundColor: colors.border }]} />
          <View style={styles.perfItem}>
            <Text style={[styles.perfValue, { color: "#22C55E" }]}>{acceptanceRate} %</Text>
            <Text style={[styles.perfLabel, { color: colors.mutedForeground }]}>Akzeptanzrate</Text>
          </View>
          <View style={[styles.perfDivider, { backgroundColor: colors.border }]} />
          <View style={styles.perfItem}>
            <Text style={[styles.perfValue, { color: "#DC2626" }]}>{rejectionRate} %</Text>
            <Text style={[styles.perfLabel, { color: colors.mutedForeground }]}>Ablehnungsrate</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

/* ─── Tab: Profil ─── */
function TabProfil({
  driver,
  onLogout,
  offersTeaserTitle,
  offersTeaserBody,
  onOpenVehiclePicker,
}: {
  driver: DriverProfile;
  onLogout: () => void;
  offersTeaserTitle: string;
  offersTeaserBody: string;
  onOpenVehiclePicker: () => void;
}) {
  const colors = useColors();
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.tabScroll, { paddingTop: 8 }]}>
      {/* Driver info header */}
      <View style={{ alignItems: "center", paddingVertical: 24, gap: 6 }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: "#EF1D26", alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: "#fff", fontSize: 28, fontFamily: "Inter_700Bold" }}>{driver.name?.[0] ?? "F"}</Text>
        </View>
        <Text style={{ color: "#000", fontSize: 20, fontFamily: "Inter_700Bold", marginTop: 8 }}>{driver.name}</Text>
        <Text style={{ color: "#8E8E93", fontSize: 13, fontFamily: "Inter_400Regular" }}>{driver.plate}</Text>
      </View>
      {/* Vehicle info */}
      <View style={[styles.profilCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.profilSectionTitle, { color: colors.mutedForeground }]}>FAHRZEUG</Text>
        <Pressable style={styles.profilRow} onPress={onOpenVehiclePicker}>
          <View style={[styles.profilIconBg, { backgroundColor: "#F3F4F6" }]}>
            <MaterialCommunityIcons name="car" size={20} color="#374151" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.profilRowLabel, { color: colors.foreground }]}>{driver.car}</Text>
            <Text style={[styles.profilRowSub, { color: colors.mutedForeground }]}>Fahrzeug waehlen</Text>
          </View>
          <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
        </Pressable>
        <View style={[styles.profilDivider, { backgroundColor: colors.border }]} />
        <Pressable style={styles.profilRow} onPress={onOpenVehiclePicker}>
          <View style={[styles.profilIconBg, { backgroundColor: "#F3F4F6" }]}>
            <Feather name="credit-card" size={18} color="#374151" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.profilRowLabel, { color: colors.foreground }]}>{driver.plate}</Text>
            <Text style={[styles.profilRowSub, { color: colors.mutedForeground }]}>Kennzeichen</Text>
          </View>
          <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
        </Pressable>
        {!driver.einsatzbereit && driver.driverBlockKind === "vehicle" ? (
          <View
            style={{
              marginTop: 10,
              borderRadius: 10,
              paddingHorizontal: 10,
              paddingVertical: 9,
              backgroundColor: "#FEF2F2",
              borderWidth: 1,
              borderColor: "#FECACA",
            }}
          >
            <Text style={{ color: "#B91C1C", fontSize: 12, fontFamily: "Inter_500Medium" }}>
              Bitte aktives Fahrzeug wählen, um online zu gehen.
            </Text>
          </View>
        ) : null}
      </View>

      <Pressable
        style={[styles.profilCard, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={() => router.push("/sponsors")}
      >
        <Text style={[styles.profilSectionTitle, { color: colors.mutedForeground }]}>EXKLUSIVE ANGEBOTE</Text>
        <Text style={[styles.profilName, { color: colors.foreground, textAlign: "left", marginTop: 6 }]}>
          {offersTeaserTitle}
        </Text>
        <Text style={[styles.profilRowSub, { color: colors.mutedForeground, marginTop: 6 }]}>{offersTeaserBody}</Text>
        <View style={{ marginTop: 10, flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={{ color: "#DC2626", fontFamily: "Inter_600SemiBold", fontSize: 13 }}>Jetzt ansehen</Text>
          <Feather name="chevron-right" size={16} color="#DC2626" />
        </View>
      </Pressable>

      {/* Logout */}
      <Pressable
        style={({ pressed }) => [styles.profilLogoutBtn, { opacity: pressed ? 0.75 : 1 }]}
        onPress={onLogout}
      >
        <Feather name="log-out" size={18} color="#DC2626" />
        <Text style={styles.profilLogoutText}>Abmelden</Text>
      </Pressable>
    </ScrollView>
  );
}

function MedicalRideProofActions({
  req,
  fleetAuthToken,
  onUpdated,
}: {
  req: RideRequest;
  fleetAuthToken: string;
  onUpdated: () => void | Promise<void>;
}) {
  const meta = (req as RideRequest & { partnerBookingMeta?: Record<string, unknown> }).partnerBookingMeta;
  const [camOpen, setCamOpen] = useState(false);
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [perm, requestPerm] = useCameraPermissions();
  const scannedRef = useRef(false);

  useEffect(() => {
    if (camOpen) scannedRef.current = false;
  }, [camOpen]);

  if (!meta || meta.medical_ride !== true) return null;
  const signatureDone = meta.signature_done === true;

  async function postVerifyToken(token: string, rideId: string) {
    const res = await fetch(`${API_BASE}/rides/${encodeURIComponent(rideId)}/medical/verify-qr`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${fleetAuthToken}`,
      },
      body: JSON.stringify({ token }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      throw new Error(typeof data.error === "string" ? data.error : `HTTP ${res.status}`);
    }
  }

  async function handleBarCode(data: string) {
    if (busy || scannedRef.current) return;
    const parsed = parseMedicalQrPayload(data);
    if (!parsed) {
      Alert.alert("QR-Code", "Ungültiger oder unbekannter QR-Code.");
      return;
    }
    if (parsed.rideId !== req.id) {
      Alert.alert("QR-Code", "Dieser QR gehört zu einer anderen Fahrt.");
      return;
    }
    scannedRef.current = true;
    setBusy(true);
    try {
      await postVerifyToken(parsed.token, req.id);
      setCamOpen(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await onUpdated();
      Alert.alert("QR", "Nachweis gespeichert.");
    } catch (e) {
      scannedRef.current = false;
      Alert.alert("QR", e instanceof Error ? e.message : "Fehler");
    } finally {
      setBusy(false);
    }
  }

  async function onPressScan() {
    if (Platform.OS === "web") {
      Alert.alert("QR scannen", "Bitte in der nativen App (iOS/Android) scannen.");
      return;
    }
    const p = perm?.granted ? perm : await requestPerm();
    if (!p?.granted) {
      Alert.alert("Kamera", "Kamerazugriff wird benötigt.");
      return;
    }
    setCamOpen(true);
  }

  async function onPressTransportPhoto() {
    const p = await ImagePicker.requestCameraPermissionsAsync();
    if (!p.granted) {
      Alert.alert("Kamera", "Kamerazugriff wird benötigt.");
      return;
    }
    const r = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      base64: true,
    });
    if (r.canceled || !r.assets?.[0]?.base64) return;
    const mime = r.assets[0].mimeType ?? "image/jpeg";
    const b64url = `data:${mime};base64,${r.assets[0].base64}`;
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/rides/${encodeURIComponent(req.id)}/medical/transport-document`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${fleetAuthToken}`,
        },
        body: JSON.stringify({ imageBase64: b64url }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(typeof data.error === "string" ? data.error : `HTTP ${res.status}`);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await onUpdated();
      Alert.alert("Transportschein", "Foto übermittelt.");
    } catch (e) {
      Alert.alert("Upload", e instanceof Error ? e.message : "Fehler");
    } finally {
      setBusy(false);
    }
  }

  async function saveSignature(imageBase64: string) {
    const res = await fetch(`${API_BASE}/rides/${encodeURIComponent(req.id)}/medical/signature`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${fleetAuthToken}`,
      },
      body: JSON.stringify({ imageBase64 }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      throw new Error(typeof data.error === "string" ? data.error : `HTTP ${res.status}`);
    }
  }

  async function onSignatureOk(sigBase64: string) {
    if (!sigBase64 || busy || signatureDone) return;
    setBusy(true);
    try {
      const dataUrl = sigBase64.startsWith("data:image/") ? sigBase64 : `data:image/png;base64,${sigBase64}`;
      await saveSignature(dataUrl);
      setSignatureOpen(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await onUpdated();
      Alert.alert("Unterschrift", "Unterschrift gespeichert.");
    } catch (e) {
      Alert.alert("Unterschrift", e instanceof Error ? e.message : "Fehler");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <View style={{ paddingHorizontal: 16, marginBottom: 10 }}>
        <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#1D4ED8", marginBottom: 6 }}>
          Nachweise (Krankenfahrt)
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Pressable
            onPress={() => void onPressScan()}
            disabled={busy}
            style={({ pressed }) => ({
              backgroundColor: "#DBEAFE",
              paddingVertical: 10,
              paddingHorizontal: 14,
              borderRadius: 10,
              opacity: pressed ? 0.9 : busy ? 0.55 : 1,
            })}
          >
            <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: "#1E40AF" }}>QR scannen</Text>
          </Pressable>
          <Pressable
            onPress={() => void onPressTransportPhoto()}
            disabled={busy}
            style={({ pressed }) => ({
              backgroundColor: "#DBEAFE",
              paddingVertical: 10,
              paddingHorizontal: 14,
              borderRadius: 10,
              opacity: pressed ? 0.9 : busy ? 0.55 : 1,
            })}
          >
            <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: "#1E40AF" }}>Transportschein fotografieren</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              if (signatureDone) {
                Alert.alert("Unterschrift", "Unterschrift ist bereits erledigt.");
                return;
              }
              setSignatureOpen(true);
            }}
            disabled={busy}
            style={({ pressed }) => ({
              backgroundColor: signatureDone ? "#DCFCE7" : "#E2E8F0",
              paddingVertical: 10,
              paddingHorizontal: 14,
              borderRadius: 10,
              opacity: pressed ? 0.9 : busy ? 0.55 : 1,
            })}
          >
            <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: signatureDone ? "#166534" : "#475569" }}>
              {signatureDone ? "Unterschrift erledigt" : "Unterschrift holen"}
            </Text>
          </Pressable>
        </View>
      </View>
      <Modal visible={camOpen} animationType="slide" onRequestClose={() => setCamOpen(false)}>
        <View style={{ flex: 1, backgroundColor: "#000" }}>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={({ data }) => {
              void handleBarCode(data);
            }}
          />
          <Pressable
            onPress={() => setCamOpen(false)}
            style={{
              position: "absolute",
              bottom: 48,
              alignSelf: "center",
              backgroundColor: "#fff",
              paddingVertical: 12,
              paddingHorizontal: 14,
              borderRadius: 12,
            }}
          >
            <Text style={{ fontFamily: "Inter_700Bold", color: "#111" }}>Schließen</Text>
          </Pressable>
        </View>
      </Modal>
      <Modal visible={signatureOpen} animationType="slide" onRequestClose={() => setSignatureOpen(false)}>
        <View style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
          <View style={{ paddingTop: 18, paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#CBD5E1" }}>
            <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: "#0F172A" }}>Unterschrift holen</Text>
            <Text style={{ marginTop: 4, fontSize: 12, color: "#475569", fontFamily: "Inter_500Medium" }}>
              Fahrgast unterschreibt auf dem Display (nur Nachweis, keine medizinischen Inhalte).
            </Text>
          </View>
          <View style={{ flex: 1, margin: 12, borderRadius: 12, overflow: "hidden", backgroundColor: "#fff", borderWidth: 1, borderColor: "#CBD5E1" }}>
            <SignatureScreen
              onOK={(sig) => {
                void onSignatureOk(sig);
              }}
              onEmpty={() => Alert.alert("Unterschrift", "Bitte zuerst unterschreiben.")}
              webStyle={`
                .m-signature-pad { box-shadow: none; border: none; }
                .m-signature-pad--body { border: none; }
                .m-signature-pad--footer { display: flex; gap: 8px; padding: 10px; }
                button { background: #e2e8f0; color: #0f172a; border: none; border-radius: 8px; font-size: 13px; }
                button.save { background: #16a34a; color: #fff; }
              `}
              descriptionText=""
              clearText="Löschen"
              confirmText="Speichern"
              autoClear={true}
              imageType="image/png"
            />
          </View>
          <Pressable
            onPress={() => setSignatureOpen(false)}
            style={{
              margin: 12,
              backgroundColor: "#fff",
              paddingVertical: 12,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: "#CBD5E1",
              alignItems: "center",
            }}
          >
            <Text style={{ fontFamily: "Inter_700Bold", color: "#0F172A" }}>Schließen</Text>
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

/* ─── Active Ride Screen (with final price modal) ─── */
function ActiveRideScreen({
  req,
  onComplete,
  onCancel,
  driverId,
  fleetAuthToken,
}: {
  req: RideRequest;
  onComplete: (finalFare: number) => void;
  onCancel: () => void;
  driverId: string;
  fleetAuthToken: string;
}) {
  const colors = useColors();
  const { startDriving, arriveAtCustomer, markDriverArriving, refreshRequests } = useRideRequests();
  const [phase, setPhase] = useState<ActivePhase>(
    req.status === "in_progress" || req.status === "passenger_onboard" ? "driving" : "pickup",
  );
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [finalPriceInput, setFinalPriceInput] = useState(req.estimatedFare.toFixed(2).replace(".", ","));
  const isKK = isKrankenkasseRide(req.paymentMethod);
  const codeLine = accessCodeRideLine(req);
  const wheelchairLine = wheelchairInfoLine(req);
  const customerNoteLine = customerDriverNoteLine(req);
  const medicalChecklist = medicalSteps(req);
  const [kkEigenOpen, setKkEigenOpen] = useState(false);
  const [driverEigenanteil, setDriverEigenanteil] = useState(() =>
    req.estimatedFare.toFixed(2).replace(".", ","),
  );
  const [now, setNow] = useState(() => Date.now());
  const [driverCoords, setDriverCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [distanceToCustomer, setDistanceToCustomer] = useState<number | null>(null);
  const [customerLiveMarker, setCustomerLiveMarker] = useState<{ lat: number; lon: number } | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const navAutoStarted = useRef(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setDriverEigenanteil(req.estimatedFare.toFixed(2).replace(".", ","));
    setKkEigenOpen(false);
  }, [req.id, req.estimatedFare]);

  // WebSocket — connect to ride room and receive customer live GPS
  useEffect(() => {
    connectToRide(
      req.id,
      (msg) => {
        if (msg.type === "location:customer:update") {
          setCustomerLiveMarker({ lat: msg.lat as number, lon: msg.lon as number });
        }
      },
      readFleetJwtForWsJoin,
    );
    // HTTP fallback polling for customer location
    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/rides/${req.id}/customer-location`, {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${fleetAuthToken}`,
          },
        });
        if (res.ok) {
          const loc = await res.json() as { lat: number; lon: number };
          setCustomerLiveMarker({ lat: loc.lat, lon: loc.lon });
        }
      } catch { /* ignore */ }
    };
    const interval = setInterval(poll, 5000);
    return () => { clearInterval(interval); disconnectSocket(); };
  }, [req.id]);

  // GPS tracking — send driver position via WebSocket + HTTP every ~5s
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      // Get initial position immediately so navigation can start right away
      const initial = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setDriverCoords({ lat: initial.coords.latitude, lon: initial.coords.longitude });
      if (phase === "pickup" && req.fromLat != null && req.fromLon != null) {
        setDistanceToCustomer(haversineDistance(initial.coords.latitude, initial.coords.longitude, req.fromLat, req.fromLon));
      }
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 10 },
        (loc) => {
          const { latitude, longitude } = loc.coords;
          setDriverCoords({ lat: latitude, lon: longitude });
          if (phase === "pickup" && req.fromLat != null && req.fromLon != null) {
            setDistanceToCustomer(haversineDistance(latitude, longitude, req.fromLat, req.fromLon));
          }
          socketSendDriver(latitude, longitude);
          fetch(`${API_BASE}/rides/${req.id}/driver-location`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${fleetAuthToken}`,
            },
            body: JSON.stringify({ lat: latitude, lon: longitude }),
          }).catch(() => {});
        },
      );
    })();
    return () => { sub?.remove(); };
  }, [phase, req.id, req.fromLat, req.fromLon]);

  // Auto-start navigation to customer as soon as GPS is available (pickup phase only)
  useEffect(() => {
    if (phase !== "pickup") return;
    if (!driverCoords || req.fromLat == null || req.fromLon == null) return;
    if (navAutoStarted.current) return;
    navAutoStarted.current = true;
    if (req.status === "accepted" || req.status === "ready_for_dispatch") {
      void markDriverArriving(req.id);
    }
    router.push({
      pathname: "/driver/navigation" as "/driver/navigation",
      params: {
        rideId: req.id,
        phase: "pickup",
        fromLat: String(driverCoords.lat),
        fromLon: String(driverCoords.lon),
        fromName: "Ihr Standort",
        toLat: String(req.fromLat),
        toLon: String(req.fromLon),
        toName: req.fromFull,
        customerName: req.customerName,
        pickupLat: String(req.fromLat),
        pickupLon: String(req.fromLon),
        pickupName: req.fromFull,
        destLat: String(req.toLat ?? req.fromLat),
        destLon: String(req.toLon ?? req.fromLon),
        destName: req.toFull ?? req.fromFull,
        estimatedFare: String(req.estimatedFare),
        paymentMethod: req.paymentMethod,
        driverId,
      },
    });
  }, [driverCoords, phase, req, markDriverArriving]);

  // Open in-app navigation screen manually
  // Phase "pickup": Fahrerstandort → Abholort des Kunden
  // Phase "driving": Abholort → Zieladresse
  const openNavigation = useCallback(() => {
    if (phase === "pickup") {
      if (driverCoords == null || req.fromLat == null || req.fromLon == null) {
        Alert.alert("Navigation", "GPS oder Abholkoordinaten fehlen. Bitte Ortungsdienste aktivieren oder warten, bis die Fahrt Koordinaten hat.");
        return;
      }
      const dLat = driverCoords.lat;
      const dLon = driverCoords.lon;
      if (req.status === "accepted" || req.status === "ready_for_dispatch") {
        void markDriverArriving(req.id);
      }
      const destLat = req.toLat ?? req.fromLat;
      const destLon = req.toLon ?? req.fromLon;
      router.push({
        pathname: "/driver/navigation" as "/driver/navigation",
        params: {
          rideId: req.id,
          phase: "pickup",
          fromLat: String(dLat),
          fromLon: String(dLon),
          fromName: "Ihr Standort",
          toLat: String(req.fromLat),
          toLon: String(req.fromLon),
          toName: req.fromFull,
          customerName: req.customerName,
          pickupLat: String(req.fromLat),
          pickupLon: String(req.fromLon),
          pickupName: req.fromFull,
          destLat: String(destLat),
          destLon: String(destLon),
          destName: req.toFull ?? req.fromFull,
          estimatedFare: String(req.estimatedFare),
          paymentMethod: req.paymentMethod,
          driverId,
        },
      });
    } else {
      if (req.fromLat == null || req.fromLon == null) {
        Alert.alert("Navigation", "Für diese Fahrt fehlen Koordinaten zum Zielbereich.");
        return;
      }
      const destLat = req.toLat ?? req.fromLat;
      const destLon = req.toLon ?? req.fromLon;
      router.push({
        pathname: "/driver/navigation" as "/driver/navigation",
        params: {
          rideId: req.id,
          phase: "driving",
          fromLat: String(req.fromLat),
          fromLon: String(req.fromLon),
          fromName: req.fromFull,
          toLat: String(destLat),
          toLon: String(destLon),
          toName: req.toFull ?? req.fromFull,
          customerName: req.customerName,
          pickupLat: String(req.fromLat),
          pickupLon: String(req.fromLon),
          pickupName: req.fromFull,
          destLat: String(destLat),
          destLon: String(destLon),
          destName: req.toFull ?? req.fromFull,
          estimatedFare: String(req.estimatedFare),
          paymentMethod: req.paymentMethod,
          driverId,
        },
      });
    }
  }, [phase, req, driverCoords, markDriverArriving]);

  const canStart = !req.scheduledAt || (new Date(req.scheduledAt).getTime() - now) <= 60 * 60 * 1000;
  const minutesUntilUnlock = req.scheduledAt
    ? Math.max(0, Math.ceil((new Date(req.scheduledAt).getTime() - now - 60 * 60 * 1000) / 60000))
    : 0;
  const isNearCustomer = distanceToCustomer != null && distanceToCustomer < 300;

  React.useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.08, duration: 900, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);

  const { date, time } = fmt(req.createdAt);

  const mapOrigin = phase === "pickup"
    ? { lat: driverCoords?.lat ?? 48.7394, lon: driverCoords?.lon ?? 9.3114, displayName: "Ihr Standort" }
    : { lat: req.fromLat ?? 48.6741, lon: req.fromLon ?? 9.38, displayName: req.fromFull };
  const mapDest = phase === "pickup"
    ? { lat: req.fromLat ?? 48.6741, lon: req.fromLon ?? 9.38, displayName: req.fromFull }
    : { lat: req.toLat ?? 48.69, lon: req.toLon ?? 9.2216, displayName: req.toFull };

  const handleFinishTap = () => {
    if (isKK) {
      const parsed = parseEuroDriverInput(driverEigenanteil);
      const euro = parsed ?? req.estimatedFare;
      setFinalPriceInput(euro.toFixed(2).replace(".", ","));
    } else {
      setFinalPriceInput(req.estimatedFare.toFixed(2).replace(".", ","));
    }
    setShowPriceModal(true);
  };

  const handleConfirmFare = () => {
    const parsed = parseFloat(finalPriceInput.replace(",", "."));
    const fare = isNaN(parsed) ? req.estimatedFare : parsed;
    setShowPriceModal(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onComplete(fare);
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <RealMapView
          origin={mapOrigin}
          destination={mapDest}
          style={StyleSheet.absoluteFillObject}
          edgePaddingBottom={100}
          customerLiveMarker={phase === "pickup" ? customerLiveMarker : null}
        />
        <View style={activeStyles.headerBanner}>
          <View style={activeStyles.headerBannerInner}>
            <View style={activeStyles.headerBannerDot} />
            <Text style={activeStyles.headerBannerText}>
              {phase === "pickup" ? "Zum Kunden unterwegs" : "Fahrt läuft"}
            </Text>
          </View>
          <Text style={activeStyles.headerBannerSub}>{time} · {date}</Text>
        </View>
      </View>

      <View style={[activeStyles.sheet, { backgroundColor: colors.card }]}>
        {/* Scheduled pickup banner — only for pre-booked rides */}
        {req.scheduledAt && (() => {
          const s = fmt(new Date(req.scheduledAt!));
          return (
            <View style={activeStyles.schedInfoBanner}>
              <View style={activeStyles.schedInfoLeft}>
                <Feather name="calendar" size={18} color="#D97706" />
                <View>
                  <Text style={activeStyles.schedInfoLabel}>Vorbestellung — Abholung um</Text>
                  <Text style={activeStyles.schedInfoTime}>{s.time} Uhr · {s.date}</Text>
                </View>
              </View>
              <View style={activeStyles.schedInfoBadge}>
                <Text style={activeStyles.schedInfoBadgeText}>Termin</Text>
              </View>
            </View>
          );
        })()}

        {/* Customer row */}
        <View style={activeStyles.customerRow}>
          <View style={activeStyles.customerAvatar}>
            <Text style={activeStyles.customerAvatarText}>{req.customerName[0]}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[activeStyles.customerName, { color: colors.foreground }]}>{req.customerName}</Text>
            <Text style={[activeStyles.customerSub, { color: colors.mutedForeground }]} numberOfLines={4}>
              {codeLine ? `${codeLine}\n` : ""}
              {wheelchairLine ? `${wheelchairLine}\n` : ""}
              {customerNoteLine ? `Hinweis Kunde: ${customerNoteLine}\n` : ""}
              {medicalChecklist ? "Krankenfahrt-Check aktiv\n" : ""}
              {req.vehicle} · {isKK ? "Krankenkasse" : req.paymentMethod}
            </Text>
          </View>
        {medicalChecklist ? (
          <View style={{ marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {medicalChecklist.map((step) => (
              <View
                key={step.label}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 5,
                  borderRadius: 999,
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  backgroundColor: step.done ? "#DCFCE7" : "#FEE2E2",
                }}
              >
                <Feather name={step.done ? "check-circle" : "alert-circle"} size={12} color={step.done ? "#166534" : "#B91C1C"} />
                <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: step.done ? "#166534" : "#B91C1C" }}>
                  {step.label}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
          <View style={activeStyles.fareBox}>
            <Text style={activeStyles.fareLabel}>ca. Preis (brutto)</Text>
            <Text style={activeStyles.fareValue}>{formatEuro(req.estimatedFare)}</Text>
            <Text style={activeStyles.fareBruttoHint}>inkl. MwSt.</Text>
          </View>
        </View>

        {fleetAuthToken && (req.rideKind === "medical" || !!medicalChecklist) ? (
          <MedicalRideProofActions
            req={req}
            fleetAuthToken={fleetAuthToken}
            onUpdated={() => void refreshRequests()}
          />
        ) : null}

        {/* Route */}
        <View style={[activeStyles.routeCard, { backgroundColor: colors.muted }]}>
          <View style={activeStyles.routeRow}>
            <View style={[activeStyles.routeDot, { backgroundColor: "#22C55E" }]} />
            <View style={{ flex: 1 }}>
              <Text style={[activeStyles.routeLabel, { color: colors.mutedForeground }]}>
                {phase === "pickup" ? "Von (Dein Standort)" : "Von (Abholpunkt)"}
              </Text>
              <Text style={[activeStyles.routeAddr, { color: colors.foreground }]} numberOfLines={1}>
                {phase === "pickup" ? "Aktueller Standort" : req.fromFull}
              </Text>
            </View>
          </View>
          <View style={[activeStyles.routeLine, { backgroundColor: colors.border }]} />
          <View style={activeStyles.routeRow}>
            <View style={[activeStyles.routeDot, { backgroundColor: "#DC2626" }]} />
            <View style={{ flex: 1 }}>
              <Text style={[activeStyles.routeLabel, { color: colors.mutedForeground }]}>
                {phase === "pickup" ? "Bis (Abholpunkt)" : "Bis (Ziel)"}
              </Text>
              <Text style={[activeStyles.routeAddr, { color: colors.foreground }]} numberOfLines={1}>
                {phase === "pickup" ? req.fromFull : req.toFull}
              </Text>
            </View>
          </View>
        </View>

        {/* Stats */}
        <View style={activeStyles.statsRow}>
          <View style={activeStyles.statItem}>
            <Feather name="map-pin" size={14} color={colors.mutedForeground} />
            <Text style={[activeStyles.statValue, { color: colors.foreground }]}>{req.distanceKm.toFixed(1)} km</Text>
            <Text style={[activeStyles.statLabel, { color: colors.mutedForeground }]}>Strecke</Text>
          </View>
          <View style={[activeStyles.statDiv, { backgroundColor: colors.border }]} />
          {isKK ? (
            <Pressable
              style={({ pressed }) => [
                activeStyles.statItem,
                kkEigenOpen && { backgroundColor: colors.muted, borderRadius: 12 },
                pressed && { opacity: 0.92 },
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setKkEigenOpen((o) => !o);
              }}
              accessibilityRole="button"
              accessibilityLabel="Krankenkasse, Eigenanteil bearbeiten"
            >
              <MaterialCommunityIcons name="ticket-percent-outline" size={14} color="#2563EB" />
              <Text style={[activeStyles.statValue, { color: "#2563EB" }]}>
                {`${formatEuro(parseEuroDriverInput(driverEigenanteil) ?? req.estimatedFare)} kassieren`}
              </Text>
              <Text style={[activeStyles.statLabel, { color: "#2563EB" }]}>Krankenkasse</Text>
              <Text style={{ fontSize: 10, fontFamily: "Inter_500Medium", color: "#3B82F6", marginTop: 2 }}>
                {kkEigenOpen ? "Zum Schließen antippen" : "Antippen · Eigenanteil"}
              </Text>
            </Pressable>
          ) : (
            <View style={activeStyles.statItem}>
              <Feather name="credit-card" size={14} color={colors.mutedForeground} />
              <Text style={[activeStyles.statValue, { color: colors.foreground }]}>{req.paymentMethod}</Text>
              <Text style={[activeStyles.statLabel, { color: colors.mutedForeground }]}>Zahlungsart</Text>
            </View>
          )}
        </View>

        {isKK && kkEigenOpen && (
          <View
            style={{
              backgroundColor: colors.card,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 12,
              gap: 10,
            }}
          >
            <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>Eigenanteil</Text>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 10,
                paddingHorizontal: 12,
                backgroundColor: colors.muted,
              }}
            >
              <Text style={{ fontSize: 18, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, marginRight: 6 }}>€</Text>
              <TextInput
                style={{
                  flex: 1,
                  fontSize: 18,
                  fontFamily: "Inter_700Bold",
                  color: colors.foreground,
                  paddingVertical: 10,
                }}
                value={driverEigenanteil}
                onChangeText={setDriverEigenanteil}
                keyboardType="decimal-pad"
                placeholder="0,00"
                placeholderTextColor={colors.mutedForeground}
                selectTextOnFocus
              />
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  setDriverEigenanteil("0,00");
                }}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderRadius: 10,
                  backgroundColor: colors.muted,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>Befreit (0 €)</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  setDriverEigenanteil(req.estimatedFare.toFixed(2).replace(".", ","));
                }}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderRadius: 10,
                  backgroundColor: colors.muted,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>Wie gebucht</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Krankenkasse hint */}
        {isKK && (
          <View style={{ backgroundColor: "#EFF6FF", borderRadius: 12, borderWidth: 1, borderColor: "#93C5FD", padding: 12, flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
            <MaterialCommunityIcons name="ticket-percent-outline" size={18} color="#2563EB" style={{ marginTop: 1 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: "#1D4ED8" }}>Krankenkassen-Fahrt</Text>
              <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: "#2563EB", marginTop: 2, lineHeight: 17 }}>
                {req.paymentMethod.includes("Befreit")
                  ? "Kunde ist befreit — nichts kassieren (0,00 €)."
                  : `Nur den Eigenanteil bei Krankenkasse kassieren. Unterlagen / Nachweis der Krankenkasse bereithalten.`}
              </Text>
            </View>
          </View>
        )}

        {/* Action button */}
        {phase === "pickup" ? (
          <>
            {req.scheduledAt && (
              <View style={{ backgroundColor: !canStart ? "#FFF7ED" : "#F0FDF4", borderRadius: 12, borderWidth: 1, borderColor: !canStart ? "#FDE68A" : "#86EFAC", padding: 12, flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
                <Feather name={!canStart ? "clock" : "check-circle"} size={16} color={!canStart ? "#D97706" : "#16A34A"} style={{ marginTop: 1 }} />
                <View style={{ flex: 1 }}>
                  {!canStart ? (
                    <>
                      <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: "#B45309" }}>Fahrt noch nicht aktivierbar</Text>
                      <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: "#D97706", marginTop: 2 }}>
                        Aktivierung möglich ab 1 Std. vor Abholung (noch {minutesUntilUnlock} Min.)
                      </Text>
                      <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#B45309", marginTop: 6 }}>
                        Bitte rechtzeitig losfahren!
                      </Text>
                    </>
                  ) : (
                    <>
                      <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: "#15803D" }}>Fahrt jetzt aktivierbar</Text>
                      <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: "#16A34A", marginTop: 2 }}>
                        Bitte jetzt zum Kunden losfahren
                      </Text>
                    </>
                  )}
                </View>
              </View>
            )}

            {/* Navigation to pickup */}
            <Pressable style={activeStyles.navBtn} onPress={openNavigation}>
              <MaterialCommunityIcons name="navigation" size={20} color="#fff" />
              <Text style={activeStyles.navBtnText}>Navigation starten</Text>
            </Pressable>

            {/* Angekommen — gesperrt bis < 300 m (Geofencing) */}
            <Pressable
              style={[activeStyles.binDaBtn, !isNearCustomer && { backgroundColor: "#D1D5DB" }]}
              onPress={isNearCustomer ? () => arriveAtCustomer(req.id) : undefined}
              disabled={!isNearCustomer}
            >
              <Feather name="map-pin" size={20} color={isNearCustomer ? "#fff" : "#9CA3AF"} />
              <Text style={[activeStyles.binDaBtnText, !isNearCustomer && { color: "#9CA3AF" }]}>
                {isNearCustomer
                  ? "Angekommen — Bin da!"
                  : distanceToCustomer != null
                    ? distanceToCustomer >= 1000
                      ? `${(distanceToCustomer / 1000).toFixed(1)} km bis Abholort`
                      : `${Math.round(distanceToCustomer)} m bis Abholort`
                    : "Zum Abholort fahren"}
              </Text>
            </Pressable>

            {/* Fahrt beginnen — startet + wechselt Navi auf Zieladresse */}
            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
              <Pressable
                style={activeStyles.startDrivingBtn}
                onPress={() => {
                  startDriving(req.id);
                  setPhase("driving");
                  if (req.toLat != null && req.toLon != null) {
                    router.push({
                      pathname: "/driver/navigation" as "/driver/navigation",
                      params: {
                        rideId: req.id,
                        phase: "driving",
                        fromLat: String(req.fromLat),
                        fromLon: String(req.fromLon),
                        fromName: req.fromFull,
                        toLat: String(req.toLat),
                        toLon: String(req.toLon),
                        toName: req.toFull,
                        customerName: req.customerName,
                        pickupLat: String(req.fromLat),
                        pickupLon: String(req.fromLon),
                        pickupName: req.fromFull,
                        destLat: String(req.toLat),
                        destLon: String(req.toLon),
                        destName: req.toFull ?? req.fromFull,
                        estimatedFare: String(req.estimatedFare),
                        paymentMethod: req.paymentMethod,
                        driverId,
                      },
                    });
                  }
                }}
              >
                <MaterialCommunityIcons name="car-arrow-right" size={22} color="#fff" />
                <Text style={activeStyles.startDrivingBtnText}>Fahrt beginnen</Text>
              </Pressable>
            </Animated.View>
          </>
        ) : (
          <>
            <Pressable style={activeStyles.navBtn} onPress={openNavigation}>
              <MaterialCommunityIcons name="navigation" size={20} color="#fff" />
              <Text style={activeStyles.navBtnText}>Navigation zum Ziel</Text>
            </Pressable>
            <Pressable style={activeStyles.completeBtn} onPress={handleFinishTap}>
              <Feather name="flag" size={20} color="#fff" />
              <Text style={activeStyles.completeBtnText}>Zielort erreicht — Fahrt beenden</Text>
            </Pressable>
          </>
        )}

        {/* Storno */}
        <Pressable
          style={activeStyles.stornoBtn}
          onPress={() => {
            Alert.alert(
              "Auftrag abbrechen?",
              "Möchtest du diesen Auftrag wirklich stornieren?",
              [
                { text: "Nein, weiter", style: "cancel" },
                { text: "Ja, stornieren", style: "destructive", onPress: onCancel },
              ]
            );
          }}
        >
          <Feather name="x-circle" size={15} color="#DC2626" />
          <Text style={activeStyles.stornoBtnText}>Fahrt stornieren</Text>
        </Pressable>
      </View>

      {/* ─── Final price modal ─── */}
      <Modal visible={showPriceModal} transparent animationType="slide" onRequestClose={() => setShowPriceModal(false)}>
        <KeyboardAvoidingView style={activeStyles.modalOverlay} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <Pressable style={{ flex: 1 }} onPress={() => setShowPriceModal(false)} />
          <View style={activeStyles.priceModal}>
            <View style={activeStyles.priceModalHandle} />
            <Text style={activeStyles.priceModalTitle}>Fahrtpreis eingeben</Text>
            <Text style={activeStyles.priceModalSub}>
              Der Endpreis wird dem Kunden übermittelt
            </Text>

            {/* Route summary */}
            <View style={activeStyles.priceModalRoute}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View style={[activeStyles.routeDotSm, { backgroundColor: "#22C55E" }]} />
                <Text style={activeStyles.priceModalRouteText} numberOfLines={1}>{req.from}</Text>
              </View>
              <View style={activeStyles.priceModalRouteLine} />
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View style={[activeStyles.routeDotSm, { backgroundColor: "#DC2626" }]} />
                <Text style={activeStyles.priceModalRouteText} numberOfLines={1}>{req.to}</Text>
              </View>
            </View>

            {/* Estimated vs final */}
            <View style={activeStyles.priceRow}>
              <Text style={activeStyles.priceEstLabel}>Schätzpreis:</Text>
              <Text style={activeStyles.priceEstValue}>{formatEuro(req.estimatedFare)}</Text>
            </View>

            {/* Input */}
            <View style={activeStyles.priceInputWrapper}>
              <Text style={activeStyles.priceInputCurrency}>€</Text>
              <TextInput
                style={activeStyles.priceInput}
                value={finalPriceInput}
                onChangeText={setFinalPriceInput}
                keyboardType="decimal-pad"
                selectTextOnFocus
                autoFocus
              />
            </View>
            <Text style={activeStyles.priceInputHint}>Betrag in Euro (z.B. 63,80)</Text>

            {/* Buttons */}
            <View style={activeStyles.priceModalBtns}>
              <Pressable style={activeStyles.priceCancelBtn} onPress={() => setShowPriceModal(false)}>
                <Text style={activeStyles.priceCancelText}>Abbrechen</Text>
              </Pressable>
              <Pressable style={activeStyles.priceConfirmBtn} onPress={handleConfirmFare}>
                <Feather name="send" size={16} color="#fff" />
                <Text style={activeStyles.priceConfirmText}>Fahrt abschließen</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

/* ─── Main Dashboard ─── */
export default function DriverDashboard() {
  // Keep screen awake while driver app is open — never goes dark during shift
  useKeepAwake();

  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;
  const bottomPad = isWeb ? 34 : insets.bottom;

  const { driver, logout, setAvailable, isBlocked, blockedUntilDate, blockDriver48h, refreshEinsatzbereit } = useDriver();
  const { config: appPlatformConfig } = useOnrodaAppConfig();
  const allowDriverApp = (appPlatformConfig.system as { allowDriverApp?: boolean } | undefined)?.allowDriverApp !== false;
  const offersTeaserTitle =
    typeof (appPlatformConfig.messages as { sponsorsTeaserTitleDriverDe?: unknown } | undefined)?.sponsorsTeaserTitleDriverDe ===
    "string"
      ? String((appPlatformConfig.messages as { sponsorsTeaserTitleDriverDe?: unknown }).sponsorsTeaserTitleDriverDe).trim() ||
        "Exklusive Angebote für Fahrer"
      : "Exklusive Angebote für Fahrer";
  const offersTeaserBody =
    typeof (appPlatformConfig.messages as { sponsorsTeaserBodyDriverDe?: unknown } | undefined)?.sponsorsTeaserBodyDriverDe ===
    "string"
      ? String((appPlatformConfig.messages as { sponsorsTeaserBodyDriverDe?: unknown }).sponsorsTeaserBodyDriverDe).trim() ||
        "Rabatte, Partneraktionen und exklusive Vorteile für deinen Alltag."
      : "Rabatte, Partneraktionen und exklusive Vorteile für deinen Alltag.";
  const { history } = useRide();
  const {
    requests,
    scheduledPoolRequests,
    pendingRequests: allPending,
    acceptedRequest,
    addRequest,
    acceptRequest,
    rejectByDriver,
    driverCancelRequest,
    cancelRequest,
    completeRequest,
    refreshRequests,
    refreshDriverMarketHard,
    markDriverArriving,
    activateForDispatch,
    isConnected,
  } = useRideRequests();
  const [activeTab, setActiveTab] = useState<Tab>("uebersicht");
  const [ordersView, setOrdersView] = useState<"anfragen" | "angenommen" | "code">("anfragen");
  const [showCodeRideModal, setShowCodeRideModal] = useState(false);
  const [showVehiclePicker, setShowVehiclePicker] = useState(false);
  const [vehiclePickerLoading, setVehiclePickerLoading] = useState(false);
  const [vehiclePickerSaving, setVehiclePickerSaving] = useState(false);
  const [vehicleOptions, setVehicleOptions] = useState<
    Array<{
      id: string;
      licensePlate: string;
      model: string;
      selected: boolean;
      isActive: boolean;
      approvalStatus: string;
      selectable: boolean;
    }>
  >([]);
  const [codeRideFrom, setCodeRideFrom] = useState("");
  const [codeRideTo, setCodeRideTo] = useState("");
  const [codeRideAccessCode, setCodeRideAccessCode] = useState("");
  const [codeRideVerifyToken, setCodeRideVerifyToken] = useState("");
  const [codeRideCustomer, setCodeRideCustomer] = useState("");
  const [codeRideVerified, setCodeRideVerified] = useState(false);
  const [codeRideSubmitting, setCodeRideSubmitting] = useState(false);
  const [driverPos, setDriverPos] = useState<{ lat: number; lon: number } | null>(null);
  const loadVehicleOptions = useCallback(async () => {
    if (!driver?.authToken) return;
    setVehiclePickerLoading(true);
    try {
      const res = await fetch(`${API_BASE}/fleet-driver/v1/vehicles`, {
        headers: { Authorization: `Bearer ${driver.authToken}` },
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        vehicles?: Array<{
          id: string;
          licensePlate?: string;
          plate?: string;
          license_plate?: string;
          model: string;
          selected: boolean;
          isActive?: boolean;
          approvalStatus?: string;
          selectable?: boolean;
        }>;
      };
      if (!res.ok || !data?.ok || !Array.isArray(data.vehicles)) {
        setVehicleOptions([]);
        return;
      }
      setVehicleOptions(
        data.vehicles.map((v) => ({
          id: v.id,
          licensePlate:
            typeof v.licensePlate === "string" && v.licensePlate.trim()
              ? v.licensePlate.trim()
              : typeof v.plate === "string" && v.plate.trim()
                ? v.plate.trim()
                : typeof v.license_plate === "string" && v.license_plate.trim()
                  ? v.license_plate.trim()
                  : "—",
          model: v.model,
          selected: Boolean(v.selected),
          isActive: Boolean(v.isActive),
          approvalStatus: typeof v.approvalStatus === "string" ? v.approvalStatus : "pending",
          selectable: Boolean(v.selectable),
        })),
      );
    } catch {
      setVehicleOptions([]);
    } finally {
      setVehiclePickerLoading(false);
    }
  }, [driver?.authToken]);

  const openVehiclePicker = useCallback(() => {
    setShowVehiclePicker(true);
    void loadVehicleOptions();
  }, [loadVehicleOptions]);

  const selectVehicle = useCallback(
    async (vehicleId: string) => {
      if (!driver?.authToken || !vehicleId) return;
      setVehiclePickerSaving(true);
      try {
        const res = await fetch(`${API_BASE}/fleet-driver/v1/select-vehicle`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${driver.authToken}`,
          },
          body: JSON.stringify({ vehicleId }),
        });
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !data?.ok) {
          Alert.alert("Fahrzeugwechsel fehlgeschlagen", data?.error || "Bitte erneut versuchen.");
          return;
        }
        await refreshEinsatzbereit();
        await loadVehicleOptions();
        setShowVehiclePicker(false);
      } catch {
        Alert.alert("Fahrzeugwechsel fehlgeschlagen", "Netzwerkfehler.");
      } finally {
        setVehiclePickerSaving(false);
      }
    },
    [driver?.authToken, loadVehicleOptions, refreshEinsatzbereit],
  );

  const prevPendingIds = useRef<Set<string>>(new Set());
  const firstRender = useRef(true);
  const prevDriverOnline = useRef(false);
  const audioPrimedRef = useRef(false);
  const [marketPanelKey, setMarketPanelKey] = useState(0);
  const [marketRefreshing, setMarketRefreshing] = useState(false);

  // In-app notification banner
  const [bannerRide, setBannerRide] = useState<RideRequest | null>(null);
  const bannerAnim = useRef(new Animated.Value(-140)).current;
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showBanner = useCallback((req: RideRequest) => {
    setBannerRide(req);
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    Animated.spring(bannerAnim, { toValue: 0, useNativeDriver: true, tension: 60, friction: 10 }).start();
    bannerTimer.current = setTimeout(() => {
      stopRideSound().catch(() => {});
      Animated.timing(bannerAnim, { toValue: -140, useNativeDriver: true, duration: 300 }).start(() => setBannerRide(null));
    }, 8000);
  }, [bannerAnim]);

  useEffect(() => {
    if (driver?.einsatzbereit && driver?.isAvailable && !audioPrimedRef.current) {
      audioPrimedRef.current = true;
      void requestNotificationPermissions();
    }
  }, [driver?.einsatzbereit, driver?.isAvailable]);

  // Fire notification + vibration only for truly new instant ride requests while driver is already online
  useEffect(() => {
    const currentIds = new Set(allPending.map((r) => r.id));
    const driverOnline = Boolean(driver?.einsatzbereit && driver?.isAvailable);

    /* Erster Mount: oft online + leere Liste, solange der erste Markt-Fetch läuft (isConnected noch false).
     * Wenn wir firstRender hier beenden, gelten alle IDs nach dem Fetch als „neu“ → falscher Auftragston. */
    if (firstRender.current && driverOnline && currentIds.size === 0 && !isConnected) {
      prevPendingIds.current = currentIds;
      prevDriverOnline.current = driverOnline;
      return;
    }

    /* Nach erstem Fetch: Markt wirklich leer → Baseline setzen, ohne Ton. */
    if (firstRender.current && driverOnline && currentIds.size === 0 && isConnected) {
      prevPendingIds.current = currentIds;
      firstRender.current = false;
      prevDriverOnline.current = driverOnline;
      return;
    }

    if (
      firstRender.current ||
      !driverOnline ||
      (!prevDriverOnline.current && driverOnline)
    ) {
      // First render/offline->online sync: silently record existing rides
      prevPendingIds.current = currentIds;
      firstRender.current = false;
      prevDriverOnline.current = driverOnline;
      return;
    }

    prevDriverOnline.current = driverOnline;

    const newReqs = allPending.filter(
      (r) =>
        DRIVER_MARKET_STATUSES.has(r.status) &&
        !r.driverId &&
        r.status !== "scheduled" &&
        !(r.scheduledAt && new Date(r.scheduledAt).getTime() > Date.now() + 60 * 60 * 1000) &&
        !prevPendingIds.current.has(r.id),
    );
    if (newReqs.length > 0) {
      const req = newReqs[0];
      const distKm = (driverPos && req.fromLat != null && req.fromLon != null)
        ? haversineDistance(driverPos.lat, driverPos.lon, req.fromLat, req.fromLon) / 1000
        : null;
      showBanner(req);
      void sendNewRideNotification({
        customerName: req.customerName || "Kunde",
        fromAddress: req.fromFull || req.from || "—",
        distanceKm: distKm,
        estimatedFare: Number.isFinite(req.estimatedFare) ? req.estimatedFare : 0,
      });
    }
    prevPendingIds.current = currentIds;
  }, [allPending, driver?.einsatzbereit, driver?.isAvailable, driverPos, showBanner, isConnected]);

  // GPS für Distanzanzeige auf Auftragskarten (vor Annahme)
  useEffect(() => {
    if (Platform.OS === "web") return;
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setDriverPos({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 10000, distanceInterval: 50 },
        (loc) => setDriverPos({ lat: loc.coords.latitude, lon: loc.coords.longitude }),
      );
    })();
    return () => { sub?.remove(); };
  }, []);

  /** Nur echte Fleet-Driver-ID — E-Mail als driver_id bricht API-/Statuslogik. */
  const driverId = driver?.id ?? "";

  const pendingRequests = allPending.filter((r) => {
    if (!DRIVER_MARKET_STATUSES.has(r.status)) return false;
    if (r.driverId) return false;
    if ((r.rejectedBy ?? []).includes(driverId)) return false;
    const createdMs = new Date(r.createdAt as any).getTime();
    if (!Number.isFinite(createdMs)) return true;
    const ageHours = (Date.now() - createdMs) / (1000 * 60 * 60);
    // Alte, nie angenommene Pools nicht erneut beim Fahrer anzeigen.
    return ageHours <= 8;
  });
  const scheduledPool = scheduledPoolRequests.filter((r) => {
    if (r.status !== "scheduled" && r.status !== "scheduled_assigned") return false;
    const assignedDriverId = typeof r.driverId === "string" ? r.driverId.trim() : "";
    if (r.status === "scheduled_assigned" && assignedDriverId !== driverId) return false;
    if (r.status === "scheduled" && assignedDriverId) return false;
    if ((r.rejectedBy ?? []).includes(driverId)) return false;
    return true;
  });
  const activeDriverRequest =
    requests.find(
      (r) =>
        (r.status === "accepted" ||
          r.status === "ready_for_dispatch" ||
          r.status === "driver_arriving" ||
          r.status === "driver_waiting" ||
          r.status === "passenger_onboard" ||
          r.status === "arrived" ||
          r.status === "in_progress") &&
        r.driverId === driverId,
    ) ??
    (acceptedRequest && acceptedRequest.driverId === driverId ? acceptedRequest : null);
  const cancelNoticeShownRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!driverId) return;
    const myCancelled = requests.find(
      (r) => r.driverId === driverId && r.status === "cancelled_by_customer",
    );
    if (!myCancelled) return;
    if (cancelNoticeShownRef.current.has(myCancelled.id)) return;
    cancelNoticeShownRef.current.add(myCancelled.id);
    Alert.alert(
      "Kunde hat storniert",
      myCancelled.cancelReason
        ? `Grund: ${myCancelled.cancelReason}`
        : "Die Fahrt wurde vom Kunden storniert.",
    );
    setActiveTab("uebersicht");
  }, [requests, driverId]);

  const appRides = history.filter((r) => r.status === "completed");
  const [serverRides, setServerRides] = useState<RideEntry[]>([]);

  useEffect(() => {
    if (!driver?.authToken || !API_BASE) return;
    fetch(`${API_BASE}/fleet-driver/v1/completed-rides`, {
      headers: { Authorization: `Bearer ${driver.authToken}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (!Array.isArray(data.rides)) return;
        const mapped: RideEntry[] = data.rides.map((r: any, i: number) => {
          const d = r.createdAt ? new Date(r.createdAt) : new Date();
          return {
            id: r.id ?? `S-${i + 1}`,
            date: fmt(d).date,
            time: fmt(d).time,
            from: r.from ?? r.fromFull ?? "Start",
            to: r.to ?? r.toFull ?? "Ziel",
            km: r.distanceKm ?? 0,
            duration:
              typeof r.actualDurationMinutes === "number" && r.actualDurationMinutes > 0
                ? r.actualDurationMinutes
                : r.durationMinutes ?? 0,
            amount: r.finalFare ?? r.estimatedFare ?? 0,
            payment:
              r.paymentMethod === "cash" ? "Bar" :
              r.paymentMethod === "paypal" ? "PayPal" :
              r.paymentMethod === "card" ? "Kreditkarte" :
              r.paymentMethod ?? "Bar",
          };
        });
        setServerRides(mapped);
      })
      .catch(() => {});
  }, [driver?.authToken, activeTab]);

  const allRides = serverRides.length > 0 ? serverRides : appRides.map((r, i) => {
    const d = r.createdAt ? new Date(r.createdAt) : new Date();
    return {
      id: r.id ?? `A-${i + 1}`,
      date: fmt(d).date,
      time: fmt(d).time,
      from: typeof r.origin === "string" ? r.origin.split(",")[0] : (r.origin as any)?.displayName?.split(",")[0] ?? "Start",
      to: typeof r.destination === "string" ? r.destination.split(",")[0] : (r.destination as any)?.displayName?.split(",")[0] ?? "Ziel",
      km: (r as any).route?.distanceKm ?? r.distanceKm ?? 0,
      duration: (r as any).route?.durationMinutes ?? 0,
      amount: (r as any).fareBreakdown?.total ?? r.totalFare ?? 0,
      payment:
        r.paymentMethod === "cash" ? "Bar" :
        r.paymentMethod === "paypal" ? "PayPal" :
        r.paymentMethod === "card" ? "Kreditkarte" :
        r.paymentMethod,
    };
  });

  const handleAccept = async (id: string) => {
    if (!driver) return;
    if (!driverId.trim()) {
      Alert.alert("Annahme nicht möglich", "Bitte erneut als Fahrer anmelden (keine Fahrer-ID in der Sitzung).");
      return;
    }
    if (!driver.einsatzbereit) {
      Alert.alert(
        driver.blockBannerTitle || "Einschränkung aktiv",
        driver.notFreigegebenMessage ||
          "Sie sind noch nicht für den Auftragsmarkt freigegeben. Bitte wenden Sie sich an Ihr Unternehmen.",
      );
      return;
    }
    if (!driver.isAvailable) {
      Alert.alert("Offline", "Schalten Sie auf ONLINE, um Aufträge anzunehmen.");
      return;
    }
    try {
      stopRideSound().catch(() => {});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await acceptRequest(id, driverId);
      setActiveTab("uebersicht");
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const code = e instanceof Error ? e.message.trim() : "";
      if (code === "driver_not_einsatzbereit") {
        await refreshEinsatzbereit?.();
        Alert.alert(
          "Annahme nicht möglich",
          driver.notFreigegebenMessage ||
            "Sie sind derzeit nicht einsatzbereit. Bitte wenden Sie sich an Ihr Unternehmen.",
        );
        return;
      }
      if (code === "driver_market_offline") {
        Alert.alert("Offline", "Sie sind am Auftragsmarkt offline. Bitte ONLINE schalten.");
        return;
      }
      if (code === "no_matching_vehicle_available") {
        await refreshRequests?.();
        Alert.alert(
          "Annahme nicht möglich",
          "Für diese Buchung ist aktuell kein passendes Taxi-Fahrzeug (Klasse) zugewiesen. Bitte Fahrzeug/Rechtsart im Partner-Panel prüfen. Der Auftrag wird für dich ausgeblendet.",
        );
        return;
      }
      const detail =
        code === "status_transition_invalid"
          ? "Für diesen Auftrag ist „Annehmen“ gerade nicht erlaubt (Status). Bitte runterziehen zum Aktualisieren oder kurz warten."
          : code
            ? `Technisch: ${code}`
            : "Der Auftrag konnte nicht angenommen werden. Bitte aktualisieren und erneut versuchen.";
      Alert.alert("Annahme fehlgeschlagen", detail);
    }
  };
  const handleReject = async (id: string) => {
    stopRideSound().catch(() => {});
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    await rejectByDriver(id, driverId);
    prevPendingIds.current.add(id);
  };
  const handleComplete = async (id: string, finalFare: number) => {
    await completeRequest(id, finalFare);
    await refreshRequests();
    setActiveTab("fahrten");
  };
  const handleCancel = async (id: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    const req = activeDriverRequest;
    try {
      await driverCancelRequest(id, driverId);
      if (req?.scheduledAt) {
        const pickupMs = new Date(req.scheduledAt).getTime();
        const diffMin = (pickupMs - Date.now()) / 60000;
        if (diffMin >= 0 && diffMin < 60) {
          await blockDriver48h();
        }
      }
      setActiveTab("uebersicht");
      await refreshRequests();
    } catch (e) {
      const code = e instanceof Error ? e.message.trim() : "";
      if (code === "reservation_storno_locked") {
        Alert.alert(
          "Storno nicht möglich",
          "Bei Vorbestellungen ist ein Storno nur bis 60 Minuten vor der geplanten Abholzeit möglich. Bitte wenden Sie sich bei Bedarf an die Zentrale.",
        );
        return;
      }
      Alert.alert("Storno fehlgeschlagen", code ? `Technisch: ${code}` : "Bitte erneut versuchen.");
    }
  };

  const handleCancelScheduled = async (req: RideRequest) => {
    const diffMin = req.scheduledAt ? (new Date(req.scheduledAt).getTime() - Date.now()) / 60000 : null;
    const nearPickup = diffMin != null && diffMin >= 0 && diffMin < 60;

    Alert.alert(
      "Reservierung stornieren?",
      nearPickup
        ? "Diese Fahrt beginnt in weniger als 60 Minuten. Das kann zu einer vorübergehenden Einschränkung führen. Möchtest du wirklich stornieren?"
        : "Möchtest du diese angenommene Reservierung wirklich stornieren?",
      [
        { text: "Abbrechen", style: "cancel" },
        {
          text: "Stornieren",
          style: "destructive",
          onPress: async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            try {
              await driverCancelRequest(req.id, driverId);
              if (nearPickup) {
                await blockDriver48h();
              }
              await refreshRequests?.();
            } catch (e) {
              const code = e instanceof Error ? e.message.trim() : "";
              if (code === "reservation_storno_locked") {
                Alert.alert(
                  "Storno nicht möglich",
                  "Bei Vorbestellungen ist ein Storno nur bis 60 Minuten vor der geplanten Abholzeit möglich. Bitte wenden Sie sich bei Bedarf an die Zentrale.",
                );
                return;
              }
              Alert.alert("Storno fehlgeschlagen", code ? `Technisch: ${code}` : "Bitte erneut versuchen.");
            }
          },
        },
      ],
    );
  };

  const handleActivateScheduled = async (id: string) => {
    try {
      await activateForDispatch(id);
      await refreshRequests?.();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setActiveTab("uebersicht");
    } catch (e) {
      const code = e instanceof Error ? e.message : String(e);
      Alert.alert(
        "Aktivierung fehlgeschlagen",
        code === "status_update_failed" || !code
          ? "Status konnte nicht geändert werden. Bitte Verbindung prüfen und erneut versuchen."
          : code,
      );
    }
  };
  const handleLogout = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await logout();
    router.replace("/");
  };

  const resetCodeRideForm = useCallback(() => {
    setCodeRideFrom("");
    setCodeRideTo("");
    setCodeRideAccessCode("");
    setCodeRideVerifyToken("");
    setCodeRideCustomer("");
    setCodeRideVerified(false);
  }, []);

  useEffect(() => {
    if (!codeRideVerified) return;
    setCodeRideVerified(false);
    setCodeRideVerifyToken("");
  }, [codeRideAccessCode]);

  const handleVerifyCodeRide = useCallback(() => {
    const accessCode = codeRideAccessCode.trim();
    if (!accessCode) {
      Alert.alert("Codefahrt", "Bitte zuerst den Gutschein-/Freigabe-Code eingeben.");
      return;
    }
    if (!driverId.trim()) {
      Alert.alert("Codefahrt", "Fahrer-ID fehlt. Bitte neu anmelden.");
      return;
    }
    setCodeRideSubmitting(true);
    void (async () => {
      try {
        const res = await fetch(`${API_BASE}/rides/access-code/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessCode, driverId }),
        });
        const data = await res.json().catch(() => ({} as { error?: string; verifyToken?: string }));
        if (!res.ok || !data?.verifyToken) {
          const code = typeof data?.error === "string" ? data.error : "request_failed";
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          Alert.alert("Codefahrt", accessCodeErrorMessage(code));
          return;
        }
        setCodeRideVerifyToken(data.verifyToken);
        setCodeRideVerified(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("Codefahrt", "Fahrt genehmigt. Jetzt bitte Start und Ziel eintragen.");
      } catch {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert("Codefahrt", "Code-Prüfung aktuell nicht möglich. Bitte erneut versuchen.");
      } finally {
        setCodeRideSubmitting(false);
      }
    })();
  }, [codeRideAccessCode, driverId]);

  const handleCreateCodeRide = useCallback(async () => {
    const from = codeRideFrom.trim();
    const to = codeRideTo.trim();
    const accessCode = codeRideAccessCode.trim();
    if (!accessCode) {
      Alert.alert("Codefahrt", "Bitte zuerst einen Gutschein-/Freigabe-Code eingeben.");
      return;
    }
    if (!codeRideVerified) {
      Alert.alert("Codefahrt", "Bitte zuerst auf „Code prüfen“ tippen.");
      return;
    }
    if (!from || !to) {
      Alert.alert("Codefahrt", "Bitte Start und Ziel eingeben.");
      return;
    }
    if (!driver) return;
    setCodeRideSubmitting(true);
    try {
      const area = await validateServiceAreaForBooking(from, to);
      if (!area.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert("Codefahrt", area.message);
        return;
      }
      await addRequest({
        from,
        fromFull: from,
        to,
        toFull: to,
        distanceKm: 0,
        durationMinutes: 0,
        estimatedFare: 0,
        paymentMethod: "Code",
        vehicle: driver.car || "Taxi",
        customerName: codeRideCustomer.trim() || "Laufkunde",
        driverId,
        accessCode,
        accessCodeVerifyToken: codeRideVerifyToken,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowCodeRideModal(false);
      resetCodeRideForm();
      setActiveTab("auftraege");
      Alert.alert("Codefahrt", "Code akzeptiert. Die Fahrt wurde erstellt.");
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Codefahrt", userFacingBookingErrorMessage(e, accessCodeErrorMessage));
    } finally {
      setCodeRideSubmitting(false);
    }
  }, [addRequest, codeRideAccessCode, codeRideCustomer, codeRideFrom, codeRideTo, codeRideVerified, codeRideVerifyToken, driver, driverId, resetCodeRideForm]);

  if (!driver) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color="#DC2626" />
      </View>
    );
  }

  if (!allowDriverApp) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: "center", padding: 24, paddingTop: topPad }}>
        <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", textAlign: "center", color: colors.foreground, lineHeight: 24 }}>
          Die Fahrer-App ist in den Plattform-Einstellungen deaktiviert. Bitte später erneut versuchen.
        </Text>
      </View>
    );
  }

  if (isBlocked && blockedUntilDate) {
    const unblockStr = blockedUntilDate.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: "center", alignItems: "center", paddingTop: topPad, paddingHorizontal: 32 }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: "#FEE2E2", justifyContent: "center", alignItems: "center", marginBottom: 20 }}>
          <Feather name="slash" size={36} color="#DC2626" />
        </View>
        <Text style={{ fontSize: 17, fontFamily: "Inter_700Bold", color: colors.foreground, textAlign: "center", marginBottom: 10 }}>
          Account gesperrt
        </Text>
        <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center", lineHeight: 22, marginBottom: 24 }}>
          Du hast eine Vorbestellungsfahrt weniger als 60 Minuten vor der Abholzeit storniert.{"\n\n"}Dein Account ist für 48 Stunden für neue Aufträge gesperrt.
        </Text>
        <View style={{ backgroundColor: "#FEF2F2", borderRadius: 14, borderWidth: 1.5, borderColor: "#FECACA", padding: 16, width: "100%", alignItems: "center", marginBottom: 28 }}>
          <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: "#DC2626", marginBottom: 4 }}>Sperre endet am</Text>
          <Text style={{ fontSize: 17, fontFamily: "Inter_700Bold", color: "#DC2626" }}>{unblockStr} Uhr</Text>
        </View>
        <Pressable
          style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, paddingHorizontal: 24, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border }}
          onPress={handleLogout}
        >
          <Feather name="log-out" size={16} color="#DC2626" />
          <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#DC2626" }}>Abmelden</Text>
        </Pressable>
      </View>
    );
  }

  const scheduledOpenRequests = scheduledPool.filter((r) => r.status === "scheduled");
  const scheduledAssignedRequests = scheduledPool.filter((r) => r.status === "scheduled_assigned");
  const sofortCount = pendingRequests.length;
  const vorbestellungCount = scheduledPool.length;
  const totalPending = sofortCount + vorbestellungCount;

  const tabs: { id: Tab; label: string; icon: string; badge?: number }[] = [
    { id: "uebersicht", label: "Übersicht", icon: "map", badge: sofortCount > 0 ? sofortCount : undefined },
    { id: "auftraege", label: "Aufträge", icon: "radio", badge: totalPending > 0 ? totalPending : undefined },
    { id: "fahrten", label: "Meine Fahrten", icon: "list" },
    { id: "geldbeutel", label: "Geldbeutel", icon: "pocket" },
    { id: "profil", label: "Profil", icon: "user" },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Modern driver header */}
      <View
        style={[
          styles.modernDriverHeader,
          { top: topPad, backgroundColor: colors.background, borderBottomColor: colors.border },
        ]}
      >
        <View style={styles.driverIdentity}>
          <View style={styles.driverTextBlock}>
            <Text style={styles.driverNameModern} numberOfLines={1}>{driver.name}</Text>
            <Text style={styles.driverPlateModern} numberOfLines={1}>{driver.plate}</Text>
          </View>
        </View>
        <View style={[styles.headerDivider, { backgroundColor: colors.border }]} />

        <Pressable
          onPress={() => {
            void (async () => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

              if (!driver.einsatzbereit) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                void refreshEinsatzbereit();
                Alert.alert(
                  driver.blockBannerTitle || "Einschränkung aktiv",
                  driver.notFreigegebenMessage ||
                    "Auftragsmarkt gesperrt, bis alle Voraussetzungen erfüllt sind. Bitte Ihr Unternehmen kontaktieren.",
                );
                return;
              }

              const goingOnline = !driver.isAvailable;
              setMarketRefreshing(true);
              try {
                if (goingOnline) {
                  prevPendingIds.current = new Set();
                  firstRender.current = true;
                  prevDriverOnline.current = false;
                  setBannerRide(null);
                  bannerAnim.setValue(-140);
                  await refreshDriverMarketHard();
                  await setAvailable(true);
                  await refreshDriverMarketHard();
                  setMarketPanelKey((k) => k + 1);
                } else {
                  await setAvailable(false);
                  await refreshDriverMarketHard();
                }
              } finally {
                setMarketRefreshing(false);
              }
            })();
          }}
          style={[
            styles.segmentSwitch,
            { opacity: driver.einsatzbereit ? 1 : 0.7, backgroundColor: colors.muted },
          ]}
        >
          <View
            style={[
              styles.segmentActive,
              driver.einsatzbereit && driver.isAvailable ? styles.segmentOnline : styles.segmentOffline,
            ]}
          >
            <View style={styles.segmentDotActive} />
            <Text style={styles.segmentActiveText}>
              {!driver.einsatzbereit ? "Gesperrt" : driver.isAvailable ? "Online" : "Offline"}
            </Text>
          </View>

          <View style={styles.segmentInactive}>
            <View style={styles.segmentDotInactive} />
            <Text style={styles.segmentInactiveText}>
              {driver.isAvailable ? "Offline" : "Online"}
            </Text>
          </View>
        </Pressable>
      </View>

      {!driver.einsatzbereit && (
        <View
          style={{
            backgroundColor: "#1E293B",
            borderBottomWidth: 1,
            borderBottomColor: "#F59E0B55",
            paddingHorizontal: 16,
            paddingVertical: 12,
          }}
        >
          <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#FBBF24", marginBottom: 4 }}>
            {driver.blockBannerTitle || "Auftragsmarkt gesperrt"}
          </Text>
          <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: "#E2E8F0", lineHeight: 19 }}>
            {driver.notFreigegebenMessage}
          </Text>
        </View>
      )}

      {/* Content */}
      <View style={{ flex: 1, paddingTop: topPad + 75 }}>
        {activeDriverRequest ? (
          <ActiveRideScreen
            req={activeDriverRequest}
            onComplete={(fare) => handleComplete(activeDriverRequest.id, fare)}
            onCancel={() => handleCancel(activeDriverRequest.id)}
            driverId={driverId}
            fleetAuthToken={driver.authToken}
          />
        ) : (
          <>
            {activeTab === "uebersicht" && (
              <TabUebersicht
                key={marketPanelKey}
                pendingRequests={pendingRequests}
                onAccept={handleAccept}
                onReject={handleReject}
                driverPos={driverPos}
                isAvailable={driver.einsatzbereit && driver.isAvailable}
                marketLoading={marketRefreshing}
              />
            )}
            {activeTab === "auftraege" && (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.tabScroll}>
                <View style={{ flexDirection: "row", marginBottom: 18, backgroundColor: colors.muted, borderRadius: 12, padding: 3 }}>
                  <Pressable
                    onPress={() => setOrdersView("anfragen")}
                    style={{
                      flex: 1,
                      borderRadius: 10,
                      paddingVertical: 10,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: ordersView === "anfragen" ? colors.surface : "transparent",
                      shadowColor: "#000",
                      shadowOpacity: ordersView === "anfragen" ? 0.08 : 0,
                      shadowRadius: 4,
                      elevation: ordersView === "anfragen" ? 2 : 0,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: ordersView === "anfragen" ? "Inter_700Bold" : "Inter_500Medium",
                        color: ordersView === "anfragen" ? "#EF1D26" : "#6B7280",
                        fontSize: 14,
                      }}
                    >
                      Anfragen{pendingRequests.length + scheduledOpenRequests.length > 0 ? ` (${pendingRequests.length + scheduledOpenRequests.length})` : ""}
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => setOrdersView("angenommen")}
                    style={{
                      flex: 1,
                      borderRadius: 10,
                      paddingVertical: 10,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: ordersView === "angenommen" ? colors.surface : "transparent",
                      shadowColor: "#000",
                      shadowOpacity: ordersView === "angenommen" ? 0.08 : 0,
                      shadowRadius: 4,
                      elevation: ordersView === "angenommen" ? 2 : 0,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: ordersView === "angenommen" ? "Inter_700Bold" : "Inter_500Medium",
                        color: ordersView === "angenommen" ? "#EF1D26" : "#6B7280",
                        fontSize: 14,
                      }}
                    >
                      Angenommene{scheduledAssignedRequests.length > 0 ? ` (${scheduledAssignedRequests.length})` : ""}
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => {
                      setOrdersView("code");
                      console.log("CODE_RIDE_MODAL_OPEN");
                      setShowCodeRideModal(true);
                    }}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: ordersView === "code" ? colors.surface : "transparent",
                      borderRadius: 9,
                      flexDirection: "row",
                      gap: 4,
                    }}
                  >
                    <Feather name="plus" size={13} color={ordersView === "code" ? "#EF1D26" : "#8E8E93"} />
                    <Text
                      style={{
                        fontFamily: ordersView === "code" ? "Inter_700Bold" : "Inter_500Medium",
                        color: ordersView === "code" ? "#EF1D26" : "#8E8E93",
                        fontSize: 14,
                      }}
                    >
                      Code
                    </Text>
                  </Pressable>
                </View>

                {ordersView === "anfragen" ? (
                  pendingRequests.length === 0 && scheduledOpenRequests.length === 0 ? (
                    <View style={styles.emptyCenter}>
                      <MaterialCommunityIcons name="taxi" size={56} color="#9CA3AF" />
                      <Text style={[styles.emptyTitle, { color: "#111" }]}>Keine Anfragen</Text>
                      <Text style={[styles.emptySub, { color: "#6B7280", textAlign: "center" }]}>
                        {!driver.einsatzbereit
                          ? "Markt gesperrt, bis Sie einsatzbereit sind. Nutzen Sie die Meldung oben oder fragen Sie Ihr Unternehmen."
                          : "Warte auf neue Anfragen…"}
                      </Text>
                    </View>
                  ) : (
                    <>
                      {pendingRequests.map((req) => (
                        <InstantCard
                          key={req.id}
                          req={req}
                          driverPos={driverPos}
                          onAccept={() => handleAccept(req.id)}
                          onReject={() => handleReject(req.id)}
                        />
                      ))}
                      {[...scheduledOpenRequests]
                        .sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime())
                        .map((req) => (
                          <ScheduledCard
                            key={req.id}
                            req={req}
                            driverPos={driverPos}
                            onAccept={() => handleAccept(req.id)}
                            onReject={() => handleReject(req.id)}
                            onActivate={() => handleActivateScheduled(req.id)}
                            onCancelAssigned={() => handleCancelScheduled(req)}
                          />
                        ))}
                    </>
                  )
                ) : (
                  scheduledAssignedRequests.length === 0 ? (
                    <View style={styles.emptyCenter}>
                      <MaterialCommunityIcons name="calendar-check" size={56} color="#9CA3AF" />
                      <Text style={[styles.emptyTitle, { color: "#111" }]}>Keine angenommenen Fahrten</Text>
                      <Text style={[styles.emptySub, { color: "#6B7280", textAlign: "center" }]}>
                        Angenommene Reservierungen erscheinen hier.
                      </Text>
                    </View>
                  ) : (
                    <>
                      <Text style={{ color: "#6B7280", fontSize: 12, marginBottom: 10 }}>
                        Meine angenommenen Fahrten
                      </Text>
                      {[...scheduledAssignedRequests]
                        .sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime())
                        .map((req) => (
                          <ScheduledCard
                            key={req.id}
                            req={req}
                            driverPos={driverPos}
                            onAccept={() => handleAccept(req.id)}
                            onReject={() => handleReject(req.id)}
                            onActivate={() => handleActivateScheduled(req.id)}
                            onCancelAssigned={() => handleCancelScheduled(req)}
                          />
                        ))}
                    </>
                  )
                )}
              </ScrollView>
            )}
            {activeTab === "fahrten" && <TabFahrten allRides={allRides} />}
            {activeTab === "geldbeutel" && <TabGeldbeutel allRides={allRides} driverRating={driver.rating} />}
            {activeTab === "profil" && (
              <TabProfil
                driver={driver}
                onLogout={handleLogout}
                offersTeaserTitle={offersTeaserTitle}
                offersTeaserBody={offersTeaserBody}
                onOpenVehiclePicker={openVehiclePicker}
              />
            )}
          </>
        )}
      </View>

      {/* ── In-App Notification Banner ── */}
      {bannerRide && (
        <Animated.View
          style={{
            position: "absolute",
            top: topPad + 70,
            left: 12,
            right: 12,
            transform: [{ translateY: bannerAnim }],
            zIndex: 9999,
            backgroundColor: "#1C1C1E",
            borderRadius: 16,
            padding: 16,
            shadowColor: "#000",
            shadowOpacity: 0.4,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 6 },
            elevation: 12,
            flexDirection: "row",
            alignItems: "center",
            gap: 14,
            borderWidth: 1.5,
            borderColor: "#DC2626",
          }}
        >
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "#DC2626", justifyContent: "center", alignItems: "center" }}>
            <MaterialCommunityIcons name="taxi" size={24} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: "#fff", fontFamily: "Inter_700Bold", fontSize: 15 }}>
              Neuer Auftrag
            </Text>
          </View>
          <Pressable
            onPress={() => {
              if (bannerTimer.current) clearTimeout(bannerTimer.current);
              stopRideSound().catch(() => {});
              Animated.timing(bannerAnim, { toValue: -140, useNativeDriver: true, duration: 200 }).start(() => setBannerRide(null));
            }}
            hitSlop={12}
          >
            <Feather name="x" size={20} color="#9CA3AF" />
          </Pressable>
        </Animated.View>
      )}

      {/* Bottom Tab Bar */}
      <View style={[styles.tabBar, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: bottomPad }]}>
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <Pressable key={tab.id} style={styles.tabBtn}
              onPress={() => { setActiveTab(tab.id); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}>
              <View style={styles.tabIconWrap}>
                <Feather name={tab.icon as any} size={22} color={active ? "#DC2626" : colors.mutedForeground} />
                {tab.badge && tab.badge > 0 ? (
                  <View style={styles.badge}><Text style={styles.badgeText}>{tab.badge}</Text></View>
                ) : null}
              </View>
              <Text style={[styles.tabLabel, { color: active ? "#DC2626" : colors.mutedForeground, fontFamily: active ? "Inter_700Bold" : "Inter_400Regular" }]}>
                {tab.label}
              </Text>
              {active && <View style={styles.tabActiveBar} />}
            </Pressable>
          );
        })}
      </View>

      <Modal
        visible={showCodeRideModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (codeRideSubmitting) return;
          setShowCodeRideModal(false);
          resetCodeRideForm();
        }}
      >
        <KeyboardAvoidingView style={activeStyles.modalOverlay} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <Pressable
            style={{ flex: 1 }}
            onPress={() => {
              if (codeRideSubmitting) return;
              setShowCodeRideModal(false);
              resetCodeRideForm();
            }}
          />
          <View style={activeStyles.priceModal}>
            <View style={activeStyles.priceModalHandle} />
            <Text style={activeStyles.priceModalTitle}>Codefahrt anlegen</Text>
            <Text style={activeStyles.priceModalSub}>
              Schritt 1: Code pruefen. Schritt 2: Start und Ziel eintragen.
            </Text>
            <View style={styles.codeRideField}>
              <Text style={styles.codeRideLabel}>Gutschein-/Freigabe-Code</Text>
              <TextInput
                style={styles.codeRideInput}
                value={codeRideAccessCode}
                onChangeText={setCodeRideAccessCode}
                autoCapitalize="characters"
                autoCorrect={false}
                placeholder="z. B. HOTEL-STUTTGART-2026"
                placeholderTextColor="#9CA3AF"
              />
            </View>
            <Pressable
              style={[styles.codeRideVerifyBtn, codeRideVerified && styles.codeRideVerifyBtnOk]}
              onPress={handleVerifyCodeRide}
              disabled={codeRideSubmitting}
            >
              <Feather name={codeRideVerified ? "check-circle" : "shield"} size={16} color="#fff" />
              <Text style={styles.codeRideVerifyText}>
                {codeRideVerified ? "Fahrt genehmigt" : "Code pruefen"}
              </Text>
            </Pressable>
            {codeRideVerified ? (
              <View style={styles.codeRideApprovedHint}>
                <Text style={styles.codeRideApprovedHintText}>
                  Code erfolgreich geprueft. Jetzt Von und Ziel eingeben.
                </Text>
              </View>
            ) : null}
            <View style={styles.codeRideField}>
              <Text style={styles.codeRideLabel}>Von</Text>
              <TextInput
                style={[styles.codeRideInput, !codeRideVerified && styles.codeRideInputDisabled]}
                value={codeRideFrom}
                onChangeText={setCodeRideFrom}
                placeholder="z. B. Hotel am Bahnhof"
                placeholderTextColor="#9CA3AF"
                editable={codeRideVerified}
              />
            </View>
            <View style={styles.codeRideField}>
              <Text style={styles.codeRideLabel}>Ziel</Text>
              <TextInput
                style={[styles.codeRideInput, !codeRideVerified && styles.codeRideInputDisabled]}
                value={codeRideTo}
                onChangeText={setCodeRideTo}
                placeholder="z. B. Flughafen Stuttgart"
                placeholderTextColor="#9CA3AF"
                editable={codeRideVerified}
              />
            </View>
            <View style={styles.codeRideField}>
              <Text style={styles.codeRideLabel}>Kundenname (optional)</Text>
              <TextInput
                style={[styles.codeRideInput, !codeRideVerified && styles.codeRideInputDisabled]}
                value={codeRideCustomer}
                onChangeText={setCodeRideCustomer}
                placeholder="Laufkunde"
                placeholderTextColor="#9CA3AF"
                editable={codeRideVerified}
              />
            </View>
            <View style={activeStyles.priceModalBtns}>
              <Pressable
                style={activeStyles.priceCancelBtn}
                onPress={() => {
                  if (codeRideSubmitting) return;
                  setShowCodeRideModal(false);
                  resetCodeRideForm();
                }}
              >
                <Text style={activeStyles.priceCancelText}>Abbrechen</Text>
              </Pressable>
              <Pressable
                style={activeStyles.priceConfirmBtn}
                onPress={() => {
                  void handleCreateCodeRide();
                }}
                disabled={codeRideSubmitting || !codeRideVerified}
              >
                {codeRideSubmitting ? (
                  <Text style={activeStyles.priceConfirmText}>Erstelle...</Text>
                ) : (
                  <>
                    <Feather name="check" size={16} color="#fff" />
                    <Text style={activeStyles.priceConfirmText}>Fahrt erstellen</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={showVehiclePicker}
        transparent={false}
        animationType="slide"
        onRequestClose={() => {
          if (vehiclePickerSaving) return;
          setShowVehiclePicker(false);
        }}
      >
        <View style={[activeStyles.sheetScreen, { backgroundColor: colors.background, paddingTop: topPad + 6 }]}>
          <View style={[activeStyles.sheetHeader, { paddingHorizontal: 14 }]}>
            <Text style={[activeStyles.sheetTitle, { color: colors.foreground }]}>Fahrzeug waehlen</Text>
            <Pressable
              disabled={vehiclePickerSaving}
              onPress={() => setShowVehiclePicker(false)}
              style={[activeStyles.sheetCloseBtn, { backgroundColor: colors.card }]}
            >
              <Feather name="x" size={18} color={colors.mutedForeground} />
            </Pressable>
          </View>
          <Text style={[activeStyles.sheetSubtitle, { color: colors.mutedForeground, paddingHorizontal: 14 }]}>
            Bitte ein aktives Kennzeichen aus Ihrem Unternehmen auswaehlen.
          </Text>
          <View style={[activeStyles.sheetCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {vehiclePickerLoading ? (
              <View style={{ paddingVertical: 20 }}>
                <ActivityIndicator color="#DC2626" />
              </View>
            ) : vehicleOptions.length === 0 ? (
              <Text style={{ color: colors.mutedForeground, fontSize: 13, fontFamily: "Inter_400Regular" }}>
                Keine Firmenfahrzeuge gefunden.
              </Text>
            ) : (
              <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                {vehicleOptions.map((v) => (
                  <Pressable
                    key={v.id}
                    style={[
                      activeStyles.sheetItemRow,
                      {
                        borderColor: v.selected ? "#FCA5A5" : colors.border,
                        backgroundColor: v.selected ? "#FEF2F2" : colors.background,
                        opacity: vehiclePickerSaving || !v.selectable ? 0.55 : 1,
                      },
                    ]}
                    disabled={vehiclePickerSaving || !v.selectable}
                    onPress={() => void selectVehicle(v.id)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 14 }}>
                        {v.licensePlate}
                      </Text>
                      {v.model ? (
                        <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 }}>
                          {v.model}
                        </Text>
                      ) : null}
                      <View style={activeStyles.sheetStatusRow}>
                        <Text
                          style={[
                            activeStyles.sheetStatusPill,
                            {
                              color: v.isActive ? "#166534" : "#9A3412",
                              backgroundColor: v.isActive ? "#DCFCE7" : "#FFEDD5",
                            },
                          ]}
                        >
                          {v.isActive ? "Kennzeichen aktiv" : "Kennzeichen nicht aktiv"}
                        </Text>
                        <Text
                          style={[
                            activeStyles.sheetStatusPill,
                            {
                              color: v.approvalStatus === "approved" ? "#1D4ED8" : "#92400E",
                              backgroundColor: v.approvalStatus === "approved" ? "#DBEAFE" : "#FEF3C7",
                            },
                          ]}
                        >
                          {v.approvalStatus === "approved" ? "Fahrzeug aktiv" : "Freigabe ausstehend"}
                        </Text>
                      </View>
                    </View>
                    {v.selected ? (
                      <Feather name="check-circle" size={18} color="#DC2626" />
                    ) : v.selectable ? (
                      <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                    ) : (
                      <Feather name="slash" size={14} color="#9CA3AF" />
                    )}
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* ─── Styles ─── */
const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 14 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatarBg: { width: 50, height: 50, borderRadius: 25, backgroundColor: "#EF2323", justifyContent: "center", alignItems: "center", shadowColor: "#EF2323", shadowOpacity: 0.16, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 5 },
  avatarText: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#fff" },
  headerName: { fontSize: 17, fontFamily: "Inter_700Bold", color: "#111827" },
  headerSub: { fontSize: 12, fontFamily: "Inter_500Medium", color: "#6B7280", marginTop: 1 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },

  modernDriverHeader: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 20,
    minHeight: 72,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 0.5,
  },
  driverIdentity: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
  },
  avatarWrap: { width: 58, height: 58, marginRight: 14 },
  avatarCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#EF1D26",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: { color: "#FFFFFF", fontSize: 21, fontFamily: "Inter_700Bold" },
  avatarStatusDot: {
    position: "absolute",
    right: -1,
    bottom: 3,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 3,
    borderColor: "#151A1F",
  },
  driverTextBlock: { flexShrink: 1, minWidth: 0 },
  driverNameModern: {
    color: "#000000",
    fontSize: 22,
    fontFamily: "Inter_400Regular",
    letterSpacing: -0.5,
  },
  driverPlateModern: {
    color: "#6B6B6B",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    letterSpacing: 0.3,
  },
  headerDivider: {
    width: 1,
    height: 38,
    marginHorizontal: 10,
  },
  segmentSwitch: {
    height: 38,
    borderRadius: 24,
    padding: 3,
    flexDirection: "row",
    alignItems: "center",
    minWidth: 160,
    flexShrink: 0,
  },
  segmentActive: {
    flex: 1,
    height: 32,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  segmentOnline: { backgroundColor: "#22C55E" },
  segmentOffline: { backgroundColor: "#6B7280" },
  segmentInactive: {
    flex: 1,
    height: 32,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  segmentDotActive: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FFFFFF",
    marginRight: 5,
  },
  segmentDotInactive: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#9CA3AF",
    marginRight: 5,
  },
  segmentActiveText: { color: "#FFFFFF", fontSize: 15, fontFamily: "Inter_700Bold", paddingHorizontal: 4 },
  segmentInactiveText: { color: "#8E8E93", fontSize: 13, fontFamily: "Inter_700Bold", paddingHorizontal: 4 },
  availToggle: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 9 },
  availDot: { width: 8, height: 8, borderRadius: 4 },
  availLabel: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#111827" },
  availSub: { fontSize: 11, fontFamily: "Inter_500Medium", color: "#6B7280" },
  availSegment: { borderRadius: 999, paddingHorizontal: 18, paddingVertical: 9, alignItems: "center", justifyContent: "center" },
  availSegmentText: { fontSize: 13, fontFamily: "Inter_700Bold", letterSpacing: 0.2 },
  logoutBtn: { width: 32, height: 32, justifyContent: "center", alignItems: "center" },

  tabBar: { flexDirection: "row", borderTopWidth: 1, paddingTop: 6 },
  tabBtn: { flex: 1, alignItems: "center", paddingVertical: 6, gap: 3, position: "relative" },
  tabIconWrap: { position: "relative" },
  tabLabel: { fontSize: 10 },
  tabActiveBar: { position: "absolute", bottom: -6, left: "20%", right: "20%", height: 2, backgroundColor: "#DC2626", borderRadius: 1 },
  badge: { position: "absolute", top: -5, right: -8, backgroundColor: "#DC2626", borderRadius: 8, minWidth: 16, height: 16, justifyContent: "center", alignItems: "center", paddingHorizontal: 3 },
  badgeText: { fontSize: 9, fontFamily: "Inter_700Bold", color: "#fff" },

  tabScroll: { padding: 16, gap: 14, paddingBottom: 32 },
  emptyCenter: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12, paddingTop: 80 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 13, fontFamily: "Inter_400Regular" },
  ordersHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  ordersHeaderTitle: { fontSize: 13, fontFamily: "Inter_700Bold" },
  ordersPlusBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#2563EB",
  },
  ordersPlusText: { color: "#fff", fontSize: 13, fontFamily: "Inter_700Bold" },
  codeRideField: { gap: 6 },
  codeRideLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#374151" },
  codeRideInput: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: "#111827",
    backgroundColor: "#EDE6DE",
  },
  codeRideInputDisabled: {
    opacity: 0.55,
  },
  codeRideVerifyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    backgroundColor: "#1D4ED8",
    paddingVertical: 11,
  },
  codeRideVerifyBtnOk: {
    backgroundColor: "#16A34A",
  },
  codeRideVerifyText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  codeRideApprovedHint: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#86EFAC",
    backgroundColor: "#F0FDF4",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  codeRideApprovedHintText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#166534",
  },

  /* Instant card */
  reqCard: {
    backgroundColor: "#fff", borderRadius: 16, borderWidth: 2, borderColor: "#22C55E",
    overflow: "hidden",
    shadowColor: "#22C55E", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.18, shadowRadius: 16, elevation: 8,
  },
  reqCardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#F0FDF4", paddingHorizontal: 16, paddingVertical: 12 },
  reqTopLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  reqNewLabel: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#15803D" },
  reqDateTime: { fontSize: 11, fontFamily: "Inter_400Regular", color: "#6B7280" },
  reqPriceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14 },
  reqPriceLabel: { fontSize: 11, color: "#9CA3AF", fontFamily: "Inter_400Regular" },
  reqPrice: { fontSize: 30, fontFamily: "Inter_700Bold", color: "#111" },
  reqBadges: { gap: 5, alignItems: "flex-end" },
  reqBadge: { backgroundColor: "#F3F4F6", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  reqBadgeText: { fontSize: 12, fontFamily: "Inter_500Medium", color: "#374151" },
  reqRoute: { paddingHorizontal: 16, paddingBottom: 12, gap: 2 },
  reqRouteRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  reqRouteLine: { width: 2, height: 18, backgroundColor: "#E5E7EB", marginLeft: 5, marginVertical: 2 },
  dotGreen: { width: 12, height: 12, borderRadius: 6, backgroundColor: "#22C55E", marginTop: 4 },
  dotRed: { width: 12, height: 12, borderRadius: 6, backgroundColor: "#DC2626", marginTop: 4 },
  reqRouteLabel: { fontSize: 10, fontFamily: "Inter_500Medium", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 0.5 },
  reqRouteAddr: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#111", marginTop: 1 },
  reqMeta: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12, gap: 6 },
  reqMetaText: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#6B7280" },
  metaSep: { width: 1, height: 12, backgroundColor: "#E5E7EB", marginHorizontal: 4 },
  reqActions: { flexDirection: "row", gap: 10, padding: 14 },
  rejectBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 14, paddingVertical: 13, borderWidth: 1.5, borderColor: "#DC2626", backgroundColor: "#FEF2F2" },
  rejectText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#DC2626" },
  acceptBtn: { flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 14, paddingVertical: 10, backgroundColor: "#22C55E" },
  acceptBtnLocked: { backgroundColor: "#9CA3AF" },
  acceptText: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff", flexShrink: 1 },

  /* Scheduled card extras */
  reqCardScheduled: { borderColor: "#F59E0B", shadowColor: "#F59E0B" },
  schedPill: { borderRadius: 16, paddingHorizontal: 10, paddingVertical: 4 },
  schedPillText: { fontSize: 11, fontFamily: "Inter_700Bold", color: "#fff" },
  schedTimeBlock: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, backgroundColor: "#FFFBEB" },
  schedTimeRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  schedTimeValue: { fontSize: 28, fontFamily: "Inter_700Bold", color: "#92400E" },
  schedDateValue: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#B45309", marginTop: 4 },
  schedRoute: { paddingHorizontal: 16, paddingBottom: 8, paddingTop: 12, gap: 2 },
  schedRouteRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  schedStats: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 10, gap: 8 },
  schedStatItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  schedStatText: { fontSize: 12, fontFamily: "Inter_500Medium", color: "#6B7280" },
  schedStatDivider: { width: 1, height: 14, backgroundColor: "#E5E7EB" },

  /* Übersicht map tab */
  mapStatusChip: {
    position: "absolute", top: 16, alignSelf: "center",
    flexDirection: "row", alignItems: "center", gap: 7,
    backgroundColor: "rgba(0,0,0,0.75)", borderRadius: 16,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  mapStatusDot: { width: 9, height: 9, borderRadius: 5 },
  mapStatusText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fff" },
  mapReqOverlay: {
    position: "absolute", bottom: 12, left: 12, right: 12,
  },
  mapMoreReqs: {
    textAlign: "center", marginTop: 8,
    fontSize: 13, fontFamily: "Inter_500Medium", color: "#fff",
    backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 12,
    paddingVertical: 5, paddingHorizontal: 12, alignSelf: "center",
  },

  /* Map tab (old) */
  mapTabContainer: { flex: 1 },
  mapOverlay: { position: "absolute", bottom: 16, left: 16, right: 16 },
  mapCard: { backgroundColor: "#fff", borderRadius: 16, padding: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12, elevation: 8 },
  mapCardRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  mapCardTitle: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#15803D" },
  mapCardAddr: { fontSize: 13, fontFamily: "Inter_500Medium", color: "#111", marginBottom: 12 },
  mapCardDivider: { height: 1, backgroundColor: "#F3F4F6", marginBottom: 12 },
  mapCardStats: { flexDirection: "row", justifyContent: "space-around", alignItems: "center" },
  mapStatItem: { alignItems: "center", gap: 2 },
  mapStatValue: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#111" },
  mapStatLabel: { fontSize: 11, fontFamily: "Inter_400Regular", color: "#9CA3AF" },
  mapStatDivider: { width: 1, height: 28, backgroundColor: "#E5E7EB" },

  /* Fahrten tab */
  filterRow: { flexDirection: "row", borderRadius: 12, padding: 3, marginBottom: 18, marginHorizontal: 0 },
  filterBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center" },
  filterBtnActive: { borderRadius: 9 },
  filterText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  rideCard: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 10 },
  rideTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  rideId: { fontSize: 11, fontFamily: "Inter_400Regular" },
  rideAmount: { fontSize: 17, fontFamily: "Inter_700Bold" },
  rideRouteBlock: { gap: 3 },
  rideRouteRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  rideDot: { width: 8, height: 8, borderRadius: 4 },
  rideVLine: { width: 2, height: 14, marginLeft: 3 },
  rideAddr: { fontSize: 13, fontFamily: "Inter_500Medium", flex: 1 },
  rideMeta: { flexDirection: "row", justifyContent: "space-between", paddingTop: 10, borderTopWidth: 1 },
  rideMetaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  rideMetaText: { fontSize: 11, fontFamily: "Inter_400Regular" },

  /* Einnahmen / Geldbeutel tab */
  earningsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  earnCard: { width: "47%", borderRadius: 16, borderWidth: 1, padding: 16, gap: 4 },
  earnIconBg: { width: 40, height: 32, borderRadius: 12, justifyContent: "center", alignItems: "center", marginBottom: 6 },
  earnValue: { fontSize: 20, fontFamily: "Inter_700Bold" },
  earnLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  earnSub: { fontSize: 11, fontFamily: "Inter_500Medium", marginTop: 2 },

  /* Privacy / eye */
  privacyHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderRadius: 16, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 10, marginBottom: 4 },
  privacyTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  privacySub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  eyeBtn: { width: 44, height: 44, borderRadius: 22, justifyContent: "center", alignItems: "center" },

  /* Performance stats */
  perfCard: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 12, marginTop: 4 },
  perfTitle: { fontSize: 14, fontFamily: "Inter_700Bold" },
  perfRow: { flexDirection: "row", justifyContent: "space-around", alignItems: "center" },
  perfItem: { alignItems: "center", gap: 4, flex: 1 },
  perfDivider: { width: 1, height: 36 },
  perfValue: { fontSize: 18, fontFamily: "Inter_700Bold" },
  perfLabel: { fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "center" },

  /* Profil tab */
  profilCard: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 0, marginBottom: 12, alignItems: "center" },
  profilAvatarWrap: { position: "relative", marginBottom: 12 },
  profilAvatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: "#DC2626", justifyContent: "center", alignItems: "center" },
  profilAvatarText: { fontSize: 34, fontFamily: "Inter_700Bold", color: "#fff" },
  profilAvatarBadge: { position: "absolute", bottom: 0, right: 0, width: 24, height: 24, borderRadius: 12, backgroundColor: "#22C55E", justifyContent: "center", alignItems: "center", borderWidth: 2, borderColor: "#fff" },
  profilName: { fontSize: 20, fontFamily: "Inter_700Bold", marginBottom: 4 },
  profilEmail: { fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 8 },
  profilRatingRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  profilRatingText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  profilSectionTitle: { fontSize: 11, fontFamily: "Inter_700Bold", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12, alignSelf: "flex-start" },
  profilRow: { flexDirection: "row", alignItems: "center", gap: 12, width: "100%", paddingVertical: 4 },
  profilIconBg: { width: 40, height: 32, borderRadius: 12, justifyContent: "center", alignItems: "center" },
  profilRowLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  profilRowSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  profilDivider: { height: 1, marginVertical: 8, width: "100%" },
  profilLogoutBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 16, paddingVertical: 15, borderWidth: 1.5, borderColor: "#DC2626", backgroundColor: "#FEF2F2", marginTop: 4 },
  profilLogoutText: { fontSize: 12, fontFamily: "Inter_700Bold", color: "#DC2626" },
});

const activeStyles = StyleSheet.create({
  headerBanner: {
    position: "absolute", top: 12, left: 12, right: 12,
    backgroundColor: "rgba(17,17,17,0.88)", borderRadius: 16,
    paddingHorizontal: 16, paddingVertical: 12,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
  },
  headerBannerInner: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerBannerDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#22C55E" },
  headerBannerText: { fontSize: 12, fontFamily: "Inter_700Bold", color: "#fff" },
  headerBannerSub: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.6)" },

  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 14, shadowColor: "#000", shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 16, elevation: 16 },
  customerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  customerAvatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: "#DC2626", justifyContent: "center", alignItems: "center" },
  customerAvatarText: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#fff" },
  customerName: { fontSize: 13, fontFamily: "Inter_700Bold" },
  customerSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  fareBox: { alignItems: "flex-end" },
  fareLabel: { fontSize: 10, fontFamily: "Inter_400Regular", color: "#9CA3AF", textTransform: "uppercase" },
  fareValue: { fontSize: 17, fontFamily: "Inter_700Bold", color: "#22C55E" },
  fareBruttoHint: { fontSize: 10, fontFamily: "Inter_400Regular", color: "#16A34A" },

  routeCard: { borderRadius: 14, padding: 14, gap: 4 },
  routeRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  routeDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  routeLine: { width: 2, height: 16, marginLeft: 4, marginVertical: 2 },
  routeLabel: { fontSize: 10, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.4 },
  routeAddr: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginTop: 2 },

  statsRow: { flexDirection: "row", justifyContent: "space-around", alignItems: "center", paddingVertical: 4 },
  statItem: { alignItems: "center", gap: 3 },
  statValue: { fontSize: 14, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  statDiv: { width: 1, height: 32 },

  schedInfoBanner: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: "#FFFBEB", borderRadius: 14, padding: 14,
    borderWidth: 1.5, borderColor: "#FDE68A",
  },
  schedInfoLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  schedInfoLabel: { fontSize: 11, fontFamily: "Inter_400Regular", color: "#B45309", textTransform: "uppercase", letterSpacing: 0.5 },
  schedInfoTime: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#92400E", marginTop: 2 },
  schedInfoBadge: { backgroundColor: "#F59E0B", borderRadius: 16, paddingHorizontal: 10, paddingVertical: 4 },
  schedInfoBadgeText: { fontSize: 11, fontFamily: "Inter_700Bold", color: "#fff" },

  stornoBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12 },
  stornoBtnText: { fontSize: 13, fontFamily: "Inter_500Medium", color: "#DC2626" },

  pickupBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "#22C55E", borderRadius: 16, paddingVertical: 16 },
  pickupBtnText: { fontSize: 12, fontFamily: "Inter_700Bold", color: "#fff" },
  navBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "#2563EB", borderRadius: 16, paddingVertical: 10, marginBottom: 8 },
  navBtnText: { fontSize: 12, fontFamily: "Inter_700Bold", color: "#fff" },
  binDaBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "#22C55E", borderRadius: 16, paddingVertical: 16 },
  binDaBtnText: { fontSize: 12, fontFamily: "Inter_700Bold", color: "#fff" },
  startDrivingBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "#16A34A", borderRadius: 16, paddingVertical: 16 },
  startDrivingBtnText: { fontSize: 12, fontFamily: "Inter_700Bold", color: "#fff" },
  completeBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "#DC2626", borderRadius: 16, paddingVertical: 16 },
  completeBtnText: { fontSize: 12, fontFamily: "Inter_700Bold", color: "#fff" },

  /* Price modal */
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.28)" },
  priceModal: {
    backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: 40, gap: 16,
    shadowColor: "#000", shadowOffset: { width: 0, height: -8 }, shadowOpacity: 0.15, shadowRadius: 20,
  },
  priceModalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#E5E7EB", alignSelf: "center", marginBottom: 4 },
  priceModalTitle: { fontSize: 17, fontFamily: "Inter_700Bold", color: "#111", textAlign: "center" },
  priceModalSub: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#6B7280", textAlign: "center", marginTop: -8 },
  priceModalRoute: { backgroundColor: "#F9FAFB", borderRadius: 14, padding: 14, gap: 6 },
  priceModalRouteLine: { width: 2, height: 16, backgroundColor: "#E5E7EB", marginLeft: 5 },
  priceModalRouteText: { fontSize: 13, fontFamily: "Inter_500Medium", color: "#374151", flex: 1 },
  routeDotSm: { width: 10, height: 10, borderRadius: 5 },
  priceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 4 },
  priceEstLabel: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#9CA3AF" },
  priceEstValue: { fontSize: 13, fontFamily: "Inter_500Medium", color: "#9CA3AF" },
  priceInputWrapper: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 2, borderColor: "#22C55E", borderRadius: 16,
    paddingHorizontal: 14, paddingVertical: 10, gap: 8,
    backgroundColor: "#F0FDF4",
  },
  priceInputCurrency: { fontSize: 28, fontFamily: "Inter_700Bold", color: "#15803D" },
  priceInput: { flex: 1, fontSize: 36, fontFamily: "Inter_700Bold", color: "#111" },
  priceInputHint: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#9CA3AF", textAlign: "center", marginTop: -8 },
  priceModalBtns: { flexDirection: "row", gap: 12 },
  priceCancelBtn: { flex: 1, paddingVertical: 10, borderRadius: 14, alignItems: "center", borderWidth: 1.5, borderColor: "#E5E7EB" },
  priceCancelText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#6B7280" },
  priceConfirmBtn: { flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 10, borderRadius: 14, backgroundColor: "#22C55E" },
  priceConfirmText: { fontSize: 12, fontFamily: "Inter_700Bold", color: "#fff" },
  sheetScreen: {
    flex: 1,
    paddingBottom: 10,
  },
  sheetCard: {
    borderRadius: 16,
    marginHorizontal: 12,
    marginTop: 10,
    borderWidth: 1,
    padding: 16,
    paddingBottom: 14,
    flex: 1,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  sheetTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  sheetSubtitle: { fontSize: 12, fontFamily: "Inter_400Regular" },
  sheetCloseBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetItemRow: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sheetStatusRow: {
    marginTop: 7,
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
  },
  sheetStatusPill: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden",
  },
});
