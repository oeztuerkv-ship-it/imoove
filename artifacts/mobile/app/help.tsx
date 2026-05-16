import { Feather } from "@expo/vector-icons";
import * as ExpoClipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  InputAccessoryView,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInput as TextInputType,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  BottomTabBar,
  BOTTOM_TAB_BAR_HOME_OFFSET_Y,
  BOTTOM_TAB_BAR_INNER_HEIGHT,
  tabMainScreenScrollPaddingBottom,
} from "@/components/BottomTabBar";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { accountSheetPrimaryLabel, accountSheetSecondaryLabel } from "@/constants/accountSheetTypography";
import { HOME_SHEET_INNER, HOME_SHEET_PANEL, HOME_SHEET_RIM } from "@/constants/homeSheetChrome";
import { useUser } from "@/context/UserContext";
import { useColors } from "@/hooks/useColors";
import { getApiBaseUrl } from "@/utils/apiBase";
import { rf, rs } from "@/utils/scale";

const SUPPORT_EMAIL = "onroda@mail.de";
const COPY_FEEDBACK_MS = 2600;
const API_BASE = getApiBaseUrl();
const COMPOSE_ACCESSORY_ID = "help-compose-keyboard";

type HelpCategory = "booking" | "account" | "payment" | "app_issue" | "other";

const HELP_CATEGORIES: { id: HelpCategory; label: string }[] = [
  { id: "booking", label: "Buchung" },
  { id: "account", label: "Konto" },
  { id: "payment", label: "Zahlung" },
  { id: "app_issue", label: "App" },
  { id: "other", label: "Sonstiges" },
];

const FAQ = [
  {
    q: "Wie buche ich eine Fahrt?",
    a: "Geben Sie Ihren Startpunkt und Ihr Ziel ein, wählen Sie ein Fahrzeug und tippen Sie auf 'Fahrt anfragen'.",
  },
  {
    q: "Kann ich eine Fahrt im Voraus buchen?",
    a: "Ja! Tippen Sie auf das Kalender-Symbol neben 'Fahrt anfragen' und wählen Sie Datum und Uhrzeit.",
  },
  {
    q: "Welche Zahlungsmethoden gibt es?",
    a: "Sie können bar bezahlen, PayPal nutzen oder mit Kreditkarte zahlen. Die Zahlungsart wählen Sie vor der Buchung.",
  },
  {
    q: "Wie wird der Preis berechnet?",
    a: "Der Preis hängt von Strecke, Fahrzeugtyp und den örtlich gültigen Tarifen ab. Den konkreten Betrag sehen Sie in der App bei der Buchung vor der Bestätigung.",
  },
  {
    q: "Kann ich eine Fahrt stornieren?",
    a: "Ja, auf dem Fahrt-Statusbildschirm können Sie die Fahrt jederzeit stornieren.",
  },
  {
    q: "Wie ändere ich meine persönlichen Daten?",
    a: "Unter Konto → Profil können Sie Ihre Daten bearbeiten.",
  },
  {
    q: "Wie erreiche ich den Support?",
    a: "Unten können Sie uns direkt schreiben — Ihre Anfrage landet in unserem Support-Postfach. Alternativ die E-Mail kopieren.",
  },
];

function FaqItem({ q, a, isLast }: { q: string; a: string; isLast?: boolean }) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  return (
    <Pressable
      style={[
        styles.faqItem,
        !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
      ]}
      onPress={() => {
        Keyboard.dismiss();
        setOpen((v) => !v);
      }}
    >
      <View style={styles.faqRow}>
        <Text style={[accountSheetPrimaryLabel, styles.faqQ, { color: colors.foreground }]}>{q}</Text>
        <Feather name={open ? "chevron-up" : "chevron-down"} size={rs(17)} color={colors.mutedForeground} />
      </View>
      {open ? (
        <View style={[styles.faqAnswerBox, { backgroundColor: HOME_SHEET_INNER, borderColor: HOME_SHEET_RIM }]}>
          <Text style={[styles.faqA, { color: colors.foreground }]}>{a}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function SupportContactCard() {
  const colors = useColors();
  const { profile } = useUser();
  const sessionToken = profile.sessionToken?.trim() || "";
  const isLoggedIn = profile.isLoggedIn && sessionToken.length > 0;

  const [category, setCategory] = useState<HelpCategory>("other");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [ticketSentId, setTicketSentId] = useState<string | null>(null);
  const [emailCopied, setEmailCopied] = useState(false);
  const [composeFocused, setComposeFocused] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageInputRef = useRef<TextInputType>(null);

  const dismissCompose = () => {
    messageInputRef.current?.blur();
    Keyboard.dismiss();
    setComposeFocused(false);
  };

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const copyEmail = async () => {
    try {
      await ExpoClipboard.setStringAsync(SUPPORT_EMAIL);
      if (Platform.OS !== "web") {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      setEmailCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setEmailCopied(false), COPY_FEEDBACK_MS);
    } catch {
      Alert.alert("Kopieren", "Die Adresse konnte nicht in die Zwischenablage kopiert werden.");
    }
  };

  const submitTicket = async () => {
    if (!isLoggedIn) {
      Alert.alert("Anmeldung nötig", "Bitte melden Sie sich an, damit wir Ihre Anfrage zuordnen können.", [
        { text: "Abbrechen", style: "cancel" },
        { text: "Zum Konto", onPress: () => router.replace("/profile") },
      ]);
      return;
    }
    const text = message.trim();
    if (text.length < 5) {
      Alert.alert("Nachricht zu kurz", "Bitte beschreiben Sie Ihr Anliegen in mindestens 5 Zeichen.");
      return;
    }
    if (!API_BASE) {
      Alert.alert("Verbindung", "API ist nicht konfiguriert.");
      return;
    }
    setSubmitting(true);
    setTicketSentId(null);
    try {
      const res = await fetch(`${API_BASE}/customer/v1/help-tickets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          category,
          message: text,
          passengerName: profile.name?.trim() || undefined,
          passengerEmail: profile.email?.trim() || undefined,
          passengerPhone: profile.phone?.trim() || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; ticketId?: string; error?: string };
      if (res.status === 401) {
        Alert.alert("Anmeldung abgelaufen", "Bitte erneut anmelden.");
        return;
      }
      if (!res.ok || !data?.ok || !data.ticketId) {
        Alert.alert("Senden fehlgeschlagen", "Bitte später erneut versuchen.");
        return;
      }
      if (Platform.OS !== "web") {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      setTicketSentId(data.ticketId);
      setMessage("");
      dismissCompose();
    } catch {
      Alert.alert("Netzwerk", "Verbindung fehlgeschlagen. Bitte erneut versuchen.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.supportCard, { backgroundColor: HOME_SHEET_PANEL, borderColor: HOME_SHEET_RIM }]}>
      <View style={styles.supportCardHeader}>
        <View style={[styles.supportIconTile, { backgroundColor: "#111111" }]}>
          <Feather name="message-circle" size={rs(18)} color="#FFFFFF" />
        </View>
        <View style={styles.supportHeaderText}>
          <Text style={[styles.supportTitle, { color: colors.foreground }]}>Nachricht an uns</Text>
          <Text style={[styles.supportHint, { color: colors.mutedForeground }]}>
            Wir antworten per E-Mail — Ihre Anfrage erscheint im Support-Postfach.
          </Text>
        </View>
      </View>

      {ticketSentId ? (
        <View style={[styles.successBanner, { backgroundColor: "#ECFDF5", borderColor: "#86EFAC" }]}>
          <Feather name="check-circle" size={rs(18)} color="#16A34A" />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.successTitle, { color: "#166534" }]}>Anfrage eingegangen</Text>
            <Text style={[styles.successSub, { color: "#15803D" }]}>
              Referenz: {ticketSentId.slice(0, 12)}… — wir melden uns schnellstmöglich.
            </Text>
          </View>
        </View>
      ) : null}

      {!isLoggedIn ? (
        <Pressable
          onPress={() => router.replace("/profile")}
          style={[styles.loginHint, { backgroundColor: HOME_SHEET_INNER, borderColor: HOME_SHEET_RIM }]}
        >
          <Feather name="user" size={rs(16)} color={colors.foreground} />
          <Text style={[styles.loginHintText, { color: colors.foreground }]}>
            Zum Senden bitte anmelden (Konto-Tab)
          </Text>
          <Feather name="chevron-right" size={rs(16)} color={colors.mutedForeground} />
        </Pressable>
      ) : (
        <>
          {composeFocused ? (
            <View style={[styles.composeToolbar, { borderColor: HOME_SHEET_RIM, backgroundColor: HOME_SHEET_INNER }]}>
              <Pressable
                hitSlop={8}
                onPress={() => {
                  setMessage("");
                  dismissCompose();
                }}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
              >
                <Text style={[styles.composeToolbarAction, { color: colors.mutedForeground }]}>Abbrechen</Text>
              </Pressable>
              <Pressable
                hitSlop={8}
                onPress={dismissCompose}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
              >
                <Text style={[styles.composeToolbarAction, { color: colors.foreground }]}>Fertig</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.categoryRow}>
            {HELP_CATEGORIES.map((c) => {
              const on = category === c.id;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => setCategory(c.id)}
                  style={[
                    styles.categoryChip,
                    {
                      borderColor: on ? "#111111" : HOME_SHEET_RIM,
                      backgroundColor: on ? "#111111" : HOME_SHEET_INNER,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.categoryChipText,
                      { color: on ? "#FFFFFF" : colors.mutedForeground },
                    ]}
                  >
                    {c.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <TextInput
            ref={messageInputRef}
            value={message}
            onChangeText={setMessage}
            placeholder="Beschreiben Sie Ihr Anliegen …"
            placeholderTextColor={colors.mutedForeground}
            multiline
            textAlignVertical="top"
            editable={!submitting}
            returnKeyType="default"
            blurOnSubmit
            onFocus={() => setComposeFocused(true)}
            onBlur={() => setComposeFocused(false)}
            inputAccessoryViewID={Platform.OS === "ios" ? COMPOSE_ACCESSORY_ID : undefined}
            style={[
              styles.messageInput,
              composeFocused && styles.messageInputFocused,
              {
                color: colors.foreground,
                backgroundColor: HOME_SHEET_INNER,
                borderColor: composeFocused ? "#111111" : HOME_SHEET_RIM,
              },
            ]}
          />

          <Pressable
            onPress={() => void submitTicket()}
            disabled={submitting}
            style={({ pressed }) => [
              styles.sendBtn,
              { backgroundColor: "#111111", opacity: submitting || pressed ? 0.75 : 1 },
            ]}
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Feather name="send" size={rs(16)} color="#FFFFFF" />
            )}
            <Text style={styles.sendBtnText}>{submitting ? "Wird gesendet …" : "Anfrage absenden"}</Text>
          </Pressable>
        </>
      )}

      <View style={styles.orRow}>
        <View style={[styles.orLine, { backgroundColor: colors.border }]} />
        <Text style={[styles.orLabel, { color: colors.mutedForeground }]}>oder E-Mail</Text>
        <View style={[styles.orLine, { backgroundColor: colors.border }]} />
      </View>

      <Pressable
        onPress={() => void copyEmail()}
        accessibilityRole="button"
        accessibilityLabel={emailCopied ? "E-Mail kopiert" : "E-Mail-Adresse kopieren"}
        style={[
          styles.emailCopyRow,
          {
            backgroundColor: emailCopied ? "#ECFDF5" : HOME_SHEET_INNER,
            borderColor: emailCopied ? "#86EFAC" : HOME_SHEET_RIM,
          },
        ]}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.emailLabel, { color: colors.mutedForeground }]}>Support-E-Mail</Text>
          <Text
            style={[
              accountSheetPrimaryLabel,
              { color: emailCopied ? "#166534" : colors.foreground },
            ]}
            selectable
            numberOfLines={1}
          >
            {SUPPORT_EMAIL}
          </Text>
        </View>
        <View
          style={[
            styles.copyFeedbackPill,
            {
              backgroundColor: emailCopied ? "#16A34A" : colors.background,
              borderColor: emailCopied ? "#16A34A" : HOME_SHEET_RIM,
            },
          ]}
        >
          <Feather
            name={emailCopied ? "check" : "copy"}
            size={rs(14)}
            color={emailCopied ? "#FFFFFF" : colors.foreground}
          />
          <Text
            style={[
              styles.copyFeedbackText,
              { color: emailCopied ? "#FFFFFF" : colors.foreground },
            ]}
          >
            {emailCopied ? "Kopiert!" : "Kopieren"}
          </Text>
        </View>
      </Pressable>

      <ComposeKeyboardAccessory onDone={dismissCompose} />
    </View>
  );
}

function ComposeKeyboardAccessory({ onDone }: { onDone: () => void }) {
  if (Platform.OS !== "ios") return null;
  return (
    <InputAccessoryView nativeID={COMPOSE_ACCESSORY_ID}>
      <View style={styles.accessoryBar}>
        <View style={{ flex: 1 }} />
        <Pressable onPress={onDone} hitSlop={10} style={styles.accessoryDoneBtn}>
          <Text style={styles.accessoryDoneText}>Fertig</Text>
        </Pressable>
      </View>
    </InputAccessoryView>
  );
}

export default function HelpScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 44 : insets.top;
  const keyboardBottomOffset = BOTTOM_TAB_BAR_INNER_HEIGHT + insets.bottom + rs(12);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: topPad + 8,
            borderBottomColor: HOME_SHEET_RIM,
            backgroundColor: HOME_SHEET_PANEL,
          },
        ]}
      >
        <View style={{ width: 36 }} />
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Hilfe</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAwareScrollViewCompat
        showsVerticalScrollIndicator={false}
        bottomOffset={keyboardBottomOffset}
        extraKeyboardSpace={rs(24)}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={Keyboard.dismiss}
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: tabMainScreenScrollPaddingBottom(insets.bottom) + rs(40) },
        ]}
      >
        <View
          style={[
            styles.faqCard,
            { backgroundColor: HOME_SHEET_PANEL, borderColor: HOME_SHEET_RIM, borderWidth: 1 },
          ]}
        >
          {FAQ.map((item, i) => (
            <FaqItem key={i} q={item.q} a={item.a} isLast={i === FAQ.length - 1} />
          ))}
        </View>

        <SupportContactCard />
      </KeyboardAwareScrollViewCompat>

      <BottomTabBar active="orte" offsetY={BOTTOM_TAB_BAR_HOME_OFFSET_Y} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: rs(8),
    paddingBottom: rs(12),
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: rf(17), fontFamily: "Inter_600SemiBold" },
  scroll: { paddingHorizontal: rs(8), paddingTop: rs(24), gap: rs(16), paddingBottom: rs(16) },

  composeToolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: rs(12),
    paddingVertical: rs(8),
    borderRadius: rs(10),
    borderWidth: StyleSheet.hairlineWidth,
  },
  composeToolbarAction: { fontSize: rf(14), fontFamily: "Inter_600SemiBold" },

  accessoryBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: rs(12),
    paddingVertical: rs(8),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: HOME_SHEET_RIM,
    backgroundColor: HOME_SHEET_PANEL,
  },
  accessoryDoneBtn: { paddingHorizontal: rs(8), paddingVertical: rs(4) },
  accessoryDoneText: { fontSize: rf(16), fontFamily: "Inter_600SemiBold", color: "#007AFF" },

  faqCard: { borderRadius: rs(16), overflow: "hidden" },
  faqItem: { padding: rs(16), gap: rs(8) },
  faqRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: rs(10) },
  faqQ: { flex: 1 },
  faqAnswerBox: {
    borderRadius: rs(10),
    paddingVertical: rs(10),
    paddingHorizontal: rs(12),
    borderWidth: StyleSheet.hairlineWidth,
  },
  faqA: accountSheetSecondaryLabel,

  supportCard: {
    borderRadius: rs(16),
    borderWidth: 1,
    padding: rs(16),
    gap: rs(14),
  },
  supportCardHeader: { flexDirection: "row", alignItems: "flex-start", gap: rs(12) },
  supportIconTile: {
    width: rs(44),
    height: rs(44),
    borderRadius: rs(14),
    justifyContent: "center",
    alignItems: "center",
  },
  supportHeaderText: { flex: 1, minWidth: 0, gap: rs(4) },
  supportTitle: { fontSize: rf(16), fontFamily: "Inter_600SemiBold" },
  supportHint: { fontSize: rf(13), fontFamily: "Inter_400Regular", lineHeight: rf(19) },

  successBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: rs(10),
    padding: rs(12),
    borderRadius: rs(12),
    borderWidth: 1,
  },
  successTitle: { fontSize: rf(14), fontFamily: "Inter_600SemiBold" },
  successSub: { fontSize: rf(12), fontFamily: "Inter_400Regular", lineHeight: rf(17), marginTop: rs(2) },

  loginHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(10),
    padding: rs(12),
    borderRadius: rs(12),
    borderWidth: StyleSheet.hairlineWidth,
  },
  loginHintText: { flex: 1, fontSize: rf(14), fontFamily: "Inter_500Medium" },

  categoryRow: { flexDirection: "row", flexWrap: "wrap", gap: rs(8) },
  categoryChip: {
    paddingVertical: rs(7),
    paddingHorizontal: rs(12),
    borderRadius: rs(20),
    borderWidth: StyleSheet.hairlineWidth,
  },
  categoryChipText: { fontSize: rf(12), fontFamily: "Inter_600SemiBold" },

  messageInput: {
    minHeight: rs(120),
    maxHeight: rs(200),
    borderRadius: rs(12),
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: rs(12),
    paddingVertical: rs(12),
    fontSize: rf(15),
    fontFamily: "Inter_400Regular",
    lineHeight: rf(21),
  },
  messageInputFocused: {
    borderWidth: 1.5,
  },

  sendBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: rs(8),
    paddingVertical: rs(14),
    borderRadius: rs(14),
  },
  sendBtnText: { fontSize: rf(15), fontFamily: "Inter_600SemiBold", color: "#FFFFFF" },

  orRow: { flexDirection: "row", alignItems: "center", gap: rs(10) },
  orLine: { flex: 1, height: StyleSheet.hairlineWidth },
  orLabel: { fontSize: rf(11), fontFamily: "Inter_500Medium", letterSpacing: 0.3 },

  emailCopyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(12),
    padding: rs(14),
    borderRadius: rs(14),
    borderWidth: StyleSheet.hairlineWidth,
  },
  emailLabel: { fontSize: rf(11), fontFamily: "Inter_500Medium", marginBottom: rs(4) },
  copyFeedbackPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(6),
    paddingVertical: rs(9),
    paddingHorizontal: rs(12),
    borderRadius: rs(12),
    borderWidth: StyleSheet.hairlineWidth,
  },
  copyFeedbackText: { fontSize: rf(12), fontFamily: "Inter_600SemiBold" },
});
