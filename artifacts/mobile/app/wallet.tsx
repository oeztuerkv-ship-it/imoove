import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import { BottomTabBar } from "@/components/BottomTabBar";
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

import { useColors } from "@/hooks/useColors";
import { useUser } from "@/context/UserContext";
import { rs, rf } from "@/utils/scale";

const isWeb = Platform.OS === "web";

/* ── Section label ── */
function SectionLabel({ text }: { text: string }) {
  const colors = useColors();
  return <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>{text}</Text>;
}

/* ── Card wrapper ── */
function Card({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {children}
    </View>
  );
}

/* ── List row ── */
function ListRow({
  icon,
  iconBg,
  label,
  sublabel,
  badge,
  isActive,
  onPress,
  isLast = false,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  sublabel?: string;
  badge?: string;
  isActive?: boolean;
  onPress: () => void;
  isLast?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      style={({ pressed }) => [
        styles.payRow,
        !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
        { backgroundColor: pressed ? colors.muted : "transparent" },
      ]}
      onPress={onPress}
    >
      <View style={[styles.payIcon, { backgroundColor: iconBg }]}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.payLabel, { color: colors.foreground }]}>{label}</Text>
        {sublabel ? <Text style={[styles.paySub, { color: colors.mutedForeground }]} numberOfLines={1}>{sublabel}</Text> : null}
      </View>
      {badge ? (
        <View style={styles.payBadge}>
          <Text style={styles.payBadgeText}>{badge}</Text>
        </View>
      ) : null}
      {isActive ? (
        <Feather name="check-circle" size={18} color="#22C55E" />
      ) : (
        <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
      )}
    </Pressable>
  );
}

/* ── Billing Address Modal ── */
function BillingModal({
  visible,
  onClose,
  initialName,
}: {
  visible: boolean;
  onClose: (data: { name: string; strasse: string; hausnr: string; plz: string; ort: string } | null) => void;
  initialName: string;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(initialName);
  const [strasse, setStrasse] = useState("");
  const [hausnr, setHausnr] = useState("");
  const [plz, setPlz] = useState("");
  const [ort, setOrt] = useState("");

  const handleSave = () => {
    if (!name.trim() || !strasse.trim() || !plz.trim() || !ort.trim()) {
      Alert.alert("Fehlende Angaben", "Bitte fülle Name, Straße, PLZ und Ort aus.");
      return;
    }
    onClose({ name, strasse, hausnr, plz, ort });
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => onClose(null)}>
      <View style={[styles.modalRoot, { backgroundColor: colors.background }]}>
        {/* Modal Header */}
        <View style={[styles.modalHeader, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
          <Pressable hitSlop={12} onPress={() => onClose(null)} style={styles.modalClose}>
            <Feather name="x" size={20} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>Rechnungsadresse</Text>
          <View style={{ width: 36 }} />
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={[styles.modalScroll, { paddingBottom: insets.bottom + 32 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Form Card */}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 16 }]}>
              {/* Name */}
              <View style={[styles.formRow, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
                <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>Name / Firma</Text>
                <TextInput
                  style={[styles.formInput, { color: colors.foreground }]}
                  value={name}
                  onChangeText={setName}
                  placeholder="Max Mustermann"
                  placeholderTextColor={colors.mutedForeground}
                  returnKeyType="next"
                />
              </View>

              {/* Straße + Nr */}
              <View style={[styles.rowDouble, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
                <View style={{ flex: 3 }}>
                  <Text style={[styles.formLabel, { color: colors.mutedForeground, paddingHorizontal: 16, paddingTop: 12 }]}>Straße</Text>
                  <TextInput
                    style={[styles.formInputInner, { color: colors.foreground }]}
                    value={strasse}
                    onChangeText={setStrasse}
                    placeholder="Musterstraße"
                    placeholderTextColor={colors.mutedForeground}
                    returnKeyType="next"
                  />
                </View>
                <View style={[styles.dividerV, { backgroundColor: colors.border }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.formLabel, { color: colors.mutedForeground, paddingHorizontal: 16, paddingTop: 12 }]}>Nr.</Text>
                  <TextInput
                    style={[styles.formInputInner, { color: colors.foreground }]}
                    value={hausnr}
                    onChangeText={setHausnr}
                    placeholder="12"
                    placeholderTextColor={colors.mutedForeground}
                    returnKeyType="next"
                  />
                </View>
              </View>

              {/* PLZ + Ort */}
              <View style={styles.rowDouble}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.formLabel, { color: colors.mutedForeground, paddingHorizontal: 16, paddingTop: 12 }]}>PLZ</Text>
                  <TextInput
                    style={[styles.formInputInner, { color: colors.foreground }]}
                    value={plz}
                    onChangeText={setPlz}
                    placeholder="73728"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="numeric"
                    returnKeyType="next"
                  />
                </View>
                <View style={[styles.dividerV, { backgroundColor: colors.border }]} />
                <View style={{ flex: 2 }}>
                  <Text style={[styles.formLabel, { color: colors.mutedForeground, paddingHorizontal: 16, paddingTop: 12 }]}>Ort</Text>
                  <TextInput
                    style={[styles.formInputInner, { color: colors.foreground }]}
                    value={ort}
                    onChangeText={setOrt}
                    placeholder="Esslingen am Neckar"
                    placeholderTextColor={colors.mutedForeground}
                    returnKeyType="done"
                  />
                </View>
              </View>
            </View>

            {/* Save Button */}
            <Pressable
              style={({ pressed }) => [styles.saveBtn, { opacity: pressed ? 0.8 : 1 }]}
              onPress={handleSave}
            >
              <Feather name="save" size={16} color="#fff" />
              <Text style={styles.saveBtnText}>Speichern</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

/* ══════════════════════════════════════════ */
export default function WalletScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = isWeb ? 44 : insets.top;
  const bottomPad = isWeb ? 20 : insets.bottom;

  const { profile } = useUser();

  const [billingOpen, setBillingOpen] = useState(false);
  const [billing, setBilling] = useState<{ name: string; strasse: string; hausnr: string; plz: string; ort: string } | null>(null);

  const billingSublabel = billing
    ? `${billing.strasse} ${billing.hausnr}, ${billing.plz} ${billing.ort}`
    : "Noch keine Adresse hinterlegt";

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: topPad + 8, borderBottomColor: colors.border, backgroundColor: colors.card }]}>
        <View style={{ width: 36 }} />
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Geldbörse</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: bottomPad + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Zahlungsmethoden ── */}
        <View style={styles.section}>
          <SectionLabel text="ZAHLUNGSMETHODEN" />
          <Card>
            <ListRow
              icon={<Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: "#16A34A" }}>€</Text>}
              iconBg="#F0FDF4"
              label="Bar"
              sublabel="Bezahlung direkt beim Fahrer"
              isActive
              onPress={() => Alert.alert("Bar", "Barzahlung ist immer verfügbar.")}
            />
            <ListRow
              icon={<Text style={{ fontSize: 15, fontWeight: "700", color: "#1565C0" }}>P</Text>}
              iconBg="#EFF6FF"
              label="PayPal"
              sublabel="Verknüpftes Konto: —"
              badge="Bald"
              onPress={() => Alert.alert("PayPal", "PayPal-Integration folgt in Kürze.")}
            />
            <ListRow
              icon={<Feather name="credit-card" size={17} color="#7C3AED" />}
              iconBg="#F5F3FF"
              label="Kreditkarte"
              sublabel="Visa, Mastercard, Amex"
              badge="Bald"
              onPress={() => Alert.alert("Kreditkarte", "Kartenzahlung via Stripe folgt in Kürze.")}
            />
            <ListRow
              icon={<MaterialCommunityIcons name="ticket-percent-outline" size={17} color="#2563EB" />}
              iconBg="#EFF6FF"
              label="Transportschein"
              sublabel="Krankenkasse / Sozialamt"
              isLast
              onPress={() => Alert.alert("Transportschein", "Bitte Transportschein beim Fahrer vorzeigen.")}
            />
          </Card>
        </View>

        {/* ── Rechnungsadresse ── */}
        <View style={styles.section}>
          <SectionLabel text="RECHNUNGSADRESSE" />
          <Card>
            <ListRow
              icon={<Feather name="file-text" size={17} color="#D97706" />}
              iconBg="#FFFBEB"
              label="Rechnungsadresse"
              sublabel={billingSublabel}
              isLast
              onPress={() => setBillingOpen(true)}
            />
          </Card>
        </View>

        {/* ── Sicherheit ── */}
        <View style={styles.section}>
          <SectionLabel text="SICHERHEIT & ZAHLUNG" />
          <Card>
            <View style={styles.infoBox}>
              <View style={[styles.infoIcon, { backgroundColor: "#F0FDF4" }]}>
                <Feather name="shield" size={20} color="#16A34A" />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={[styles.infoTitle, { color: colors.foreground }]}>Sichere Zahlungen</Text>
                <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
                  Online-Zahlungen werden über Stripe abgewickelt — verschlüsselt und PCI-DSS-zertifiziert. Kartendaten werden nie auf unseren Servern gespeichert.
                </Text>
              </View>
            </View>
          </Card>
        </View>
      </ScrollView>

      {/* ── Modal ── */}
      <BillingModal
        visible={billingOpen}
        initialName={profile.name || ""}
        onClose={(data) => {
          if (data) {
            setBilling(data);
            Alert.alert("Gespeichert", "Rechnungsadresse wurde gespeichert.");
          }
          setBillingOpen(false);
        }}
      />
      <BottomTabBar active="geldborse" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: rs(16),
    paddingBottom: rs(12),
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: rs(36), height: rs(36), justifyContent: "center" },
  headerTitle: { fontSize: rf(17), fontFamily: "Inter_600SemiBold" },

  scroll: { paddingHorizontal: rs(16), paddingTop: rs(20), gap: rs(4) },
  section: { gap: rs(8), marginBottom: rs(16) },
  sectionLabel: { fontSize: rf(12), fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, marginLeft: rs(4) },

  card: { borderRadius: rs(16), borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },

  payRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: rs(16),
    paddingVertical: rs(14),
    gap: rs(14),
  },
  payIcon: { width: rs(38), height: rs(38), borderRadius: rs(11), justifyContent: "center", alignItems: "center" },
  payLabel: { fontSize: rf(15), fontFamily: "Inter_500Medium" },
  paySub: { fontSize: rf(12), fontFamily: "Inter_400Regular", marginTop: 1 },
  payBadge: { backgroundColor: "#FEF3C7", borderRadius: rs(8), paddingHorizontal: rs(8), paddingVertical: rs(3) },
  payBadgeText: { fontSize: rf(11), fontFamily: "Inter_600SemiBold", color: "#D97706" },

  infoBox: { flexDirection: "row", gap: rs(14), padding: rs(16), alignItems: "flex-start" },
  infoIcon: { width: rs(40), height: rs(40), borderRadius: rs(12), justifyContent: "center", alignItems: "center" },
  infoTitle: { fontSize: rf(14), fontFamily: "Inter_600SemiBold" },
  infoText: { fontSize: rf(13), fontFamily: "Inter_400Regular", lineHeight: rf(19) },

  /* Modal */
  modalRoot: { flex: 1 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: rs(16),
    paddingTop: rs(16),
    paddingBottom: rs(12),
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalClose: { width: rs(36), height: rs(36), justifyContent: "center", alignItems: "center" },
  modalTitle: { fontSize: rf(17), fontFamily: "Inter_600SemiBold" },
  modalScroll: { paddingHorizontal: rs(16), paddingTop: rs(24) },

  /* Form */
  formRow: { paddingHorizontal: rs(16), paddingVertical: rs(12) },
  formLabel: { fontSize: rf(11), fontFamily: "Inter_500Medium", letterSpacing: 0.3, marginBottom: rs(4) },
  formInput: { fontSize: rf(15), fontFamily: "Inter_400Regular" },
  formInputInner: { fontSize: rf(15), fontFamily: "Inter_400Regular", paddingHorizontal: rs(16), paddingBottom: rs(12) },
  rowDouble: { flexDirection: "row" },
  dividerV: { width: StyleSheet.hairlineWidth },

  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: rs(8),
    backgroundColor: "#DC2626",
    borderRadius: rs(14),
    paddingVertical: rs(14),
  },
  saveBtnText: { fontSize: rf(15), fontFamily: "Inter_600SemiBold", color: "#fff" },
});
