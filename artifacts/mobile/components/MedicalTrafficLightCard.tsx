import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type {
  MedicalDateLogicResultDto,
  MedicalInsuranceProfileId,
  MedicalInsuranceRuleResult,
  MedicalScanExtracted,
  MedicalScanWarning,
  MedicalTrafficLight,
} from "@/utils/medicalScanApi";

const TRAFFIC_CONFIG: Record<
  MedicalTrafficLight,
  { title: string; subtitle: string; bg: string; border: string; accent: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }
> = {
  green: {
    title: "Grün — Scan in Ordnung",
    subtitle: "Keine relevanten Warnungen erkannt.",
    bg: "#ECFDF5",
    border: "#86EFAC",
    accent: "#15803D",
    icon: "check-circle",
  },
  yellow: {
    title: "Gelb — Hinweise beachten",
    subtitle: "Unsicherheiten erkannt. Weiterfahrt mit Vorsicht möglich.",
    bg: "#FFFBEB",
    border: "#FCD34D",
    accent: "#B45309",
    icon: "alert-circle-outline",
  },
  red: {
    title: "Rot — Ablehnen empfohlen",
    subtitle: "Schwerwiegende Abweichungen. Fahrt nur nach Prüfung fortsetzen.",
    bg: "#FEF2F2",
    border: "#FCA5A5",
    accent: "#B91C1C",
    icon: "close-circle-outline",
  },
};

function formatDeDate(iso: string | null | undefined): string | null {
  if (!iso?.trim()) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  return iso.trim();
}

function behandlungsArtDe(v: string | undefined): string | null {
  if (!v?.trim()) return null;
  if (v === "stationaer") return "Stationär";
  if (v === "ambulant") return "Ambulant";
  return null;
}

function profileLabel(profile: MedicalInsuranceProfileId): string {
  switch (profile) {
    case "AOK_BW":
      return "AOK BW (Basisprofil)";
    case "VDEK_STANDARD":
      return "GKV / vdek-Standard (Basisprofil)";
    case "PRIVATE":
      return "Privat / PKV (Basisprofil)";
    default:
      return "Unbekannt";
  }
}

type Props = {
  trafficLight: MedicalTrafficLight;
  warnings: MedicalScanWarning[];
  insuranceName?: string;
  transportDate?: string | null;
  extracted?: Partial<MedicalScanExtracted>;
  dateLogic?: MedicalDateLogicResultDto | null;
  insuranceRules?: MedicalInsuranceRuleResult | null;
  testDisclaimer?: string;
  onPrimaryAction: () => void;
  primaryBusy?: boolean;
  /** fleet = vollständige Fahrer-Ansicht; customer = vereinfachte Kunden-Ansicht */
  scanApi?: "fleet" | "customer";
  /** Krankenfahrt-Buchung: Gelb mit Fahrer-Hinweis, Rot ohne Buchung */
  bookingFlow?: boolean;
  /** API primaryReasonDe wenn keine Warnungen im Test-Scan-Format vorliegen */
  customerReasonOverride?: string | null;
};

const CUSTOMER_TRAFFIC_CONFIG: Record<
  MedicalTrafficLight,
  {
    title: string;
    subtitle: string;
    bg: string;
    border: string;
    accent: string;
    icon: keyof typeof MaterialCommunityIcons.glyphMap;
    primaryLabel: string;
  }
> = {
  green: {
    title: "Ihr Transportschein ist gültig",
    subtitle: "Sie können die Fahrt buchen",
    bg: "#ECFDF5",
    border: "#86EFAC",
    accent: "#15803D",
    icon: "check-circle",
    primaryLabel: "Schließen",
  },
  yellow: {
    title: "Bitte beim Fahrer vorzeigen",
    subtitle: "Prüfung empfohlen",
    bg: "#FFFBEB",
    border: "#FCD34D",
    accent: "#B45309",
    icon: "alert-circle-outline",
    primaryLabel: "Verstanden",
  },
  red: {
    title: "Transportschein ungültig",
    subtitle: "",
    bg: "#FEF2F2",
    border: "#FCA5A5",
    accent: "#B91C1C",
    icon: "close-circle-outline",
    primaryLabel: "Schließen",
  },
};

function pickPrimaryCustomerReason(
  trafficLight: MedicalTrafficLight,
  warnings: MedicalScanWarning[],
  insuranceRules?: MedicalInsuranceRuleResult | null,
): string | null {
  const visible = warnings.filter((w) => w.severity !== "info" && (w.message?.trim() || w.code));
  const fromWarning = visible.find((w) => w.severity === "block_recommended") ?? visible[0];
  if (fromWarning?.message?.trim()) return fromWarning.message.trim();
  const fromRules = insuranceRules?.warnings.find((w) => w.trim());
  if (fromRules?.trim()) return fromRules.trim();
  const summary = insuranceRules?.summary?.trim();
  if (summary) return summary;
  if (trafficLight === "yellow") return "Der Schein konnte nicht vollständig geprüft werden.";
  if (trafficLight === "red") return "Der Schein erfüllt die Anforderungen nicht.";
  return null;
}

export function MedicalTrafficLightCard({
  trafficLight,
  warnings,
  insuranceName,
  transportDate,
  extracted,
  dateLogic,
  insuranceRules,
  testDisclaimer,
  onPrimaryAction,
  primaryBusy = false,
  scanApi = "fleet",
  bookingFlow = false,
  customerReasonOverride,
}: Props) {
  if (scanApi === "customer") {
    const cfg = CUSTOMER_TRAFFIC_CONFIG[trafficLight];
    const reason =
      customerReasonOverride?.trim() ||
      pickPrimaryCustomerReason(trafficLight, warnings, insuranceRules);
    let subtitle =
      trafficLight === "red" || trafficLight === "yellow"
        ? reason ?? cfg.subtitle
        : cfg.subtitle;
    if (bookingFlow && trafficLight === "yellow" && subtitle) {
      subtitle = `${subtitle}\n\nWeiter möglich — letzte Entscheidung liegt beim Fahrer.`;
    }
    const primaryLabel =
      bookingFlow && trafficLight === "yellow" ? "Weiter buchen" : cfg.primaryLabel;

    return (
      <View style={[styles.customerCard, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
        <MaterialCommunityIcons name={cfg.icon} size={56} color={cfg.accent} />
        <Text style={[styles.customerTitle, { color: cfg.accent }]}>{cfg.title}</Text>
        {subtitle ? <Text style={styles.customerSubtitle}>{subtitle}</Text> : null}
        <Pressable
          onPress={onPrimaryAction}
          disabled={primaryBusy}
          style={({ pressed }) => [
            styles.primaryBtn,
            styles.customerPrimaryBtn,
            {
              backgroundColor: trafficLight === "yellow" ? "#F59E0B" : trafficLight === "red" ? "#64748B" : "#16A34A",
              opacity: pressed ? 0.9 : primaryBusy ? 0.55 : 1,
            },
          ]}
        >
          <Text style={styles.primaryBtnText}>{primaryBusy ? "Bitte warten…" : primaryLabel}</Text>
        </Pressable>
      </View>
    );
  }

  const cfg = TRAFFIC_CONFIG[trafficLight];
  const visibleWarnings = warnings.filter((w) => w.severity !== "info");
  const kkName = insuranceName?.trim() || extracted?.insuranceName?.trim() || "";
  const kkIk = extracted?.insuranceIk?.trim() || "";
  const fahrtDatum = formatDeDate(transportDate ?? extracted?.transportDate ?? null);
  const gueltigVon = formatDeDate(extracted?.validFrom ?? null);
  const gueltigBis = formatDeDate(extracted?.validUntil ?? null);
  const genehmigung = extracted?.genehmigungsnummer?.trim() || "";
  const versichertenNr = extracted?.patientReference?.trim() || "";
  const behandlung = behandlungsArtDe(extracted?.behandlungsArt);
  const verificationRows = [
    kkName ? { label: "Krankenkasse", value: kkName } : null,
    kkIk ? { label: "KK-IK", value: kkIk } : null,
    versichertenNr ? { label: "Versicherten-Nr.", value: versichertenNr } : null,
    fahrtDatum ? { label: "Fahrtdatum", value: fahrtDatum } : null,
    gueltigVon ? { label: "Gültig ab", value: gueltigVon } : null,
    gueltigBis ? { label: "Gültig bis", value: gueltigBis } : null,
    genehmigung ? { label: "Genehmigung", value: genehmigung } : null,
    behandlung ? { label: "Behandlungsart", value: behandlung } : null,
    dateLogic
      ? {
          label: "Datumsprüfung",
          value: dateLogic.passed ? "Bestanden" : "Abweichung — bitte prüfen",
        }
      : null,
  ].filter(Boolean) as { label: string; value: string }[];
  const primaryLabel = testDisclaimer?.trim()
    ? "Schließen"
    : trafficLight === "yellow"
      ? "Trotzdem fortfahren"
      : trafficLight === "red"
        ? "Schließen"
        : "Weiter";

  return (
    <View style={[styles.card, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
      <View style={styles.headerRow}>
        <MaterialCommunityIcons name={cfg.icon} size={28} color={cfg.accent} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: cfg.accent }]}>{cfg.title}</Text>
          <Text style={styles.subtitle}>{cfg.subtitle}</Text>
        </View>
      </View>

      {testDisclaimer?.trim() ? (
        <View style={styles.testBanner}>
          <Text style={styles.testBannerText}>{testDisclaimer.trim()}</Text>
        </View>
      ) : null}

      {verificationRows.length > 0 ? (
        <View style={styles.metaBox}>
          <Text style={styles.verifyHeading}>Geprüfte Fahrtdetails</Text>
          {verificationRows.map((row) => (
            <Text key={row.label} style={styles.metaLine}>
              <Text style={styles.metaLabel}>{row.label}: </Text>
              {row.value}
            </Text>
          ))}
        </View>
      ) : null}

      {insuranceRules ? (
        <View style={styles.insuranceBox}>
          <Text style={styles.insuranceHeading}>Krankenkasse prüfen</Text>
          <Text style={styles.insuranceDisclaimer}>
            ONRODA-Vorprüfung — keine Diagnose, keine Zahlungsgarantie durch die Krankenkasse.
          </Text>
          <Text style={styles.metaLine}>
            <Text style={styles.metaLabel}>Erkannte Krankenkasse: </Text>
            {insuranceRules.detectedInsuranceName.trim() || "—"}
            {insuranceRules.detectedInsuranceIk.trim()
              ? ` (IK ${insuranceRules.detectedInsuranceIk.trim()})`
              : ""}
          </Text>
          <Text style={styles.metaLine}>
            <Text style={styles.metaLabel}>Erkanntes Profil: </Text>
            {profileLabel(insuranceRules.profile)}
          </Text>
          {insuranceRules.summary.trim() ? (
            <Text style={styles.insuranceSummary}>{insuranceRules.summary}</Text>
          ) : null}
          {insuranceRules.requiredFields.length > 0 ? (
            <Text style={styles.insuranceRequired}>
              Erwartete Pflichtfelder: {insuranceRules.requiredFields.join(" · ")}
            </Text>
          ) : null}
          {insuranceRules.warnings.length > 0 ? (
            <View style={{ gap: 6, marginTop: 4 }}>
              {insuranceRules.warnings.map((w) => (
                <View key={w} style={styles.warnRow}>
                  <Feather name="alert-triangle" size={14} color="#B45309" />
                  <Text style={styles.warnText}>{w}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {insuranceRules.manualReviewRequired ? (
            <View style={styles.manualReviewBox}>
              <Text style={styles.manualReviewTitle}>Manuelle Prüfung empfohlen</Text>
              <Text style={styles.manualReviewText}>
                {insuranceRules.profile === "UNKNOWN"
                  ? "Profilzuordnung unsicher — bitte Transportschein und Abrechnungsdaten manuell gegenprüfen."
                  : "Basisprofil ohne finale Kassenregeln — bitte vor Abrechnung manuell freigeben."}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {visibleWarnings.length > 0 ? (
        <View style={styles.warnBox}>
          <Text style={styles.warnHeading}>Warnungen</Text>
          {visibleWarnings.map((w) => (
            <View key={`${w.code}-${w.message}`} style={styles.warnRow}>
              <Feather
                name={w.severity === "block_recommended" ? "alert-octagon" : "alert-triangle"}
                size={14}
                color={w.severity === "block_recommended" ? "#B91C1C" : "#B45309"}
              />
              <Text style={styles.warnText}>{w.message || w.code}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {trafficLight === "red" ? (
        <View style={styles.redHint}>
          <Text style={styles.redHintText}>Ablehnen empfohlen — kein automatischer Stopp der Fahrt.</Text>
        </View>
      ) : null}

      <Pressable
        onPress={onPrimaryAction}
        disabled={primaryBusy}
        style={({ pressed }) => [
          styles.primaryBtn,
          {
            backgroundColor: trafficLight === "yellow" ? "#F59E0B" : trafficLight === "red" ? "#64748B" : "#16A34A",
            opacity: pressed ? 0.9 : primaryBusy ? 0.55 : 1,
          },
        ]}
      >
        <Text style={styles.primaryBtnText}>{primaryBusy ? "Bitte warten…" : primaryLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  title: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#475569",
    lineHeight: 18,
  },
  testBanner: {
    backgroundColor: "#FFFBEB",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  testBannerText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#92400E",
    lineHeight: 17,
  },
  metaBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    padding: 10,
    gap: 4,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  verifyHeading: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  metaLine: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#0F172A",
  },
  metaLabel: {
    fontFamily: "Inter_600SemiBold",
    color: "#64748B",
  },
  insuranceBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    padding: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: "#CBD5E1",
  },
  insuranceHeading: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    color: "#1E40AF",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  insuranceDisclaimer: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: "#64748B",
    lineHeight: 16,
  },
  insuranceSummary: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#334155",
    lineHeight: 18,
  },
  insuranceRequired: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: "#475569",
    lineHeight: 16,
  },
  manualReviewBox: {
    marginTop: 4,
    backgroundColor: "#FEF3C7",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 4,
  },
  manualReviewTitle: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    color: "#92400E",
  },
  manualReviewText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: "#78350F",
    lineHeight: 17,
  },
  warnBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    padding: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  warnHeading: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    color: "#334155",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  warnRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  warnText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#1E293B",
    lineHeight: 18,
  },
  redHint: {
    backgroundColor: "#FEE2E2",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  redHintText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#991B1B",
    textAlign: "center",
  },
  primaryBtn: {
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
  },
  primaryBtnText: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
  },
  customerCard: {
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: "center",
    gap: 12,
  },
  customerTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    lineHeight: 26,
  },
  customerSubtitle: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: "#475569",
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 320,
  },
  customerPrimaryBtn: {
    alignSelf: "stretch",
    marginTop: 8,
  },
});
