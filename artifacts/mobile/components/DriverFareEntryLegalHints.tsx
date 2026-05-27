import { Feather } from "@expo/vector-icons";
import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useOnrodaAppConfig } from "@/context/AppConfigContext";
import { driverFareEntryLegalHints, type DriverFareLegalHintContext } from "@/utils/driverFareEntryLegal";

type Props = {
  vehicle?: string | null;
  mayBillPositive: boolean;
  /** Optional: Faktor aus `tariff_snapshot` dieser Fahrt (Buchungs-Engine). */
  snapshotVehicleClassMultiplier?: number | null;
};

function HintBody({ body, highlight }: { body: string; highlight?: string }) {
  if (!highlight || !body.includes(highlight)) {
    return <Text style={styles.text}>{body}</Text>;
  }
  const [before, after] = body.split(highlight);
  return (
    <Text style={styles.text}>
      {before}
      <Text style={styles.emphasis}>{highlight}</Text>
      {after}
    </Text>
  );
}

export function DriverFareEntryLegalHints({
  vehicle,
  mayBillPositive,
  snapshotVehicleClassMultiplier,
}: Props) {
  const { config } = useOnrodaAppConfig();
  const hints = useMemo(() => {
    const ctx: DriverFareLegalHintContext = {
      vehicle,
      mayBillPositive,
      tariffs: config.tariffs as Record<string, unknown>,
      snapshotVehicleClassMultiplier,
    };
    return driverFareEntryLegalHints(ctx);
  }, [vehicle, mayBillPositive, config.tariffs, snapshotVehicleClassMultiplier]);

  if (!hints.length) return null;

  return (
    <View style={styles.wrap}>
      {hints.map((hint) => (
        <View
          key={hint.id}
          style={[styles.box, hint.kind === "mandatory" ? styles.boxMandatory : styles.boxSurcharge]}
        >
          <Feather
            name={hint.kind === "mandatory" ? "alert-circle" : "info"}
            size={16}
            color={hint.kind === "mandatory" ? "#B45309" : "#0369A1"}
            style={styles.icon}
          />
          <HintBody body={hint.body} highlight={hint.highlight} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  box: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  boxMandatory: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FCD34D",
  },
  boxSurcharge: {
    backgroundColor: "#F0F9FF",
    borderColor: "#BAE6FD",
  },
  icon: { marginTop: 2 },
  text: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#374151",
    lineHeight: 18,
  },
  emphasis: {
    fontFamily: "Inter_700Bold",
    color: "#111827",
  },
});
