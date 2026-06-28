import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
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

import { appendSearchFavorite, MAX_FAVORITES_STORED, type SearchFavorite } from "@/utils/searchFavorites";
import { searchLocation, type GeoLocation } from "@/utils/routing";
import { rs } from "@/utils/scale";

type AddSearchFavoriteModalProps = {
  visible: boolean;
  onClose: () => void;
  onSaved: (favorites: SearchFavorite[]) => void;
  foregroundColor: string;
  mutedColor: string;
  surfaceColor: string;
  borderColor: string;
  primaryColor: string;
  successColor: string;
};

export function AddSearchFavoriteModal({
  visible,
  onClose,
  onSaved,
  foregroundColor,
  mutedColor,
  surfaceColor,
  borderColor,
  primaryColor,
  successColor,
}: AddSearchFavoriteModalProps) {
  const [favLabel, setFavLabel] = useState("");
  const [favStreet, setFavStreet] = useState("");
  const [favHouse, setFavHouse] = useState("");
  const [favPostal, setFavPostal] = useState("");
  const [favCity, setFavCity] = useState("");
  const [favLookupResults, setFavLookupResults] = useState<GeoLocation[]>([]);
  const [favPick, setFavPick] = useState<GeoLocation | null>(null);
  const [favLookupLoading, setFavLookupLoading] = useState(false);

  const resetForm = useCallback(() => {
    setFavLabel("");
    setFavStreet("");
    setFavHouse("");
    setFavPostal("");
    setFavCity("");
    setFavLookupResults([]);
    setFavPick(null);
    setFavLookupLoading(false);
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [onClose, resetForm]);

  const runFavoriteAddressLookup = useCallback(async () => {
    const street = favStreet.trim();
    const house = favHouse.trim();
    const city = favCity.trim();
    if (!street || !house || !city) {
      Alert.alert("Angaben fehlen", "Bitte Straße, Hausnummer und Stadt ausfüllen (PLZ empfohlen).");
      return;
    }
    const q = `${street} ${house}, ${favPostal.trim() ? `${favPostal.trim()} ` : ""}${city}`;
    setFavLookupLoading(true);
    setFavPick(null);
    try {
      const locs = await searchLocation(q);
      setFavLookupResults(locs.slice(0, 8));
      if (locs.length === 0) {
        Alert.alert("Nicht gefunden", "Bitte Schreibweise prüfen oder PLZ ergänzen.");
      }
    } catch {
      setFavLookupResults([]);
      Alert.alert("Suche fehlgeschlagen", "Bitte später erneut versuchen.");
    } finally {
      setFavLookupLoading(false);
    }
  }, [favStreet, favHouse, favPostal, favCity]);

  const confirmAddFavorite = useCallback(async () => {
    if (!favPick) {
      Alert.alert("Adresse wählen", "Bitte zuerst „Adresse suchen“ und dann einen Treffer antippen.");
      return;
    }
    const label = favLabel.trim() || `${favStreet.trim()} ${favHouse.trim()}`;
    const outcome = await appendSearchFavorite({ label, location: favPick });
    if (!outcome.ok) {
      Alert.alert(
        "Limit erreicht",
        `Es sind höchstens ${MAX_FAVORITES_STORED} Favoriten möglich. Bitte zuerst einen Eintrag löschen.`,
      );
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSaved(outcome.favorites);
    handleClose();
  }, [favPick, favLabel, favStreet, favHouse, onSaved, handleClose]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <Pressable style={styles.overlay} onPress={handleClose}>
          <Pressable style={[styles.card, { backgroundColor: surfaceColor, borderColor }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.titleRow}>
              <Feather name="bookmark" size={18} color={primaryColor} />
              <Text style={[styles.title, { color: foregroundColor }]}>Favorit hinzufügen</Text>
              <Pressable onPress={handleClose} hitSlop={10} style={styles.closeBtn}>
                <Feather name="x" size={20} color={mutedColor} />
              </Pressable>
            </View>
            <Text style={[styles.hint, { color: mutedColor }]}>
              Bezeichnung optional. Pflicht: Straße, Hausnummer und Stadt (PLZ verbessert die Treffer).
            </Text>
            <TextInput
              placeholder="Bezeichnung (z. B. Zuhause, Praxis)"
              placeholderTextColor={mutedColor}
              style={[styles.input, { color: foregroundColor, borderColor }]}
              value={favLabel}
              onChangeText={setFavLabel}
              autoCorrect={false}
            />
            <TextInput
              placeholder="Straße"
              placeholderTextColor={mutedColor}
              style={[styles.input, { color: foregroundColor, borderColor }]}
              value={favStreet}
              onChangeText={setFavStreet}
              autoCorrect={false}
            />
            <View style={styles.row}>
              <TextInput
                placeholder="Nr."
                placeholderTextColor={mutedColor}
                style={[styles.inputHalf, { color: foregroundColor, borderColor }]}
                value={favHouse}
                onChangeText={setFavHouse}
                autoCorrect={false}
              />
              <TextInput
                placeholder="PLZ"
                placeholderTextColor={mutedColor}
                style={[styles.inputHalf, { color: foregroundColor, borderColor }]}
                value={favPostal}
                onChangeText={setFavPostal}
                keyboardType="number-pad"
              />
            </View>
            <TextInput
              placeholder="Stadt"
              placeholderTextColor={mutedColor}
              style={[styles.input, { color: foregroundColor, borderColor }]}
              value={favCity}
              onChangeText={setFavCity}
              autoCorrect={false}
            />
            <Pressable
              style={[styles.searchBtn, { borderColor }]}
              onPress={() => void runFavoriteAddressLookup()}
              disabled={favLookupLoading}
            >
              {favLookupLoading ? (
                <ActivityIndicator size="small" color={primaryColor} />
              ) : (
                <Feather name="search" size={16} color={primaryColor} />
              )}
              <Text style={{ color: primaryColor, fontFamily: "Inter_600SemiBold" }}>
                {favLookupLoading ? "Suche läuft…" : "Adresse suchen"}
              </Text>
            </Pressable>
            {favLookupResults.length > 0 ? (
              <ScrollView style={{ maxHeight: 200, marginTop: rs(8) }} keyboardShouldPersistTaps="handled">
                <Text style={[styles.resultsLabel, { color: mutedColor }]}>TREFFER ANTIPPEN</Text>
                {favLookupResults.map((loc, idx) => {
                  const picked =
                    favPick?.displayName === loc.displayName && favPick.lat === loc.lat && favPick.lon === loc.lon;
                  return (
                    <Pressable
                      key={`${loc.displayName}-${idx}`}
                      style={[styles.resultRow, { borderColor }, picked && { backgroundColor: "#FEF2F2" }]}
                      onPress={() => setFavPick(loc)}
                    >
                      <Feather name="map-pin" size={14} color={picked ? primaryColor : mutedColor} />
                      <Text
                        style={[
                          styles.resultText,
                          { color: picked ? primaryColor : foregroundColor },
                          picked && { fontFamily: "Inter_600SemiBold" },
                        ]}
                        numberOfLines={2}
                      >
                        {loc.displayName}
                      </Text>
                      {picked ? <Feather name="check" size={16} color={primaryColor} /> : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : null}
            <Pressable
              style={[styles.saveBtn, { backgroundColor: favPick ? successColor : mutedColor }]}
              disabled={!favPick}
              onPress={() => void confirmAddFavorite()}
            >
              <Feather name="check" size={16} color="#fff" />
              <Text style={styles.saveBtnText}>Speichern</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  card: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: rs(20),
    paddingBottom: rs(28),
    gap: rs(10),
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: rs(8) },
  title: { flex: 1, fontSize: 17, fontFamily: "Inter_700Bold" },
  closeBtn: { padding: rs(4) },
  hint: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  input: {
    borderWidth: 1,
    borderRadius: rs(10),
    paddingHorizontal: rs(12),
    paddingVertical: rs(10),
    fontFamily: "Inter_400Regular",
    fontSize: 15,
  },
  row: { flexDirection: "row", gap: rs(8) },
  inputHalf: {
    flex: 1,
    borderWidth: 1,
    borderRadius: rs(10),
    paddingHorizontal: rs(12),
    paddingVertical: rs(10),
    fontFamily: "Inter_400Regular",
    fontSize: 15,
  },
  searchBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: rs(8),
    borderWidth: 1,
    borderRadius: rs(12),
    paddingVertical: rs(12),
    marginTop: rs(4),
  },
  resultsLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
    marginBottom: rs(6),
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(8),
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: rs(10),
    padding: rs(10),
    marginBottom: rs(6),
  },
  resultText: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: rs(8),
    borderRadius: rs(14),
    paddingVertical: rs(14),
    marginTop: rs(4),
  },
  saveBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 16 },
});
