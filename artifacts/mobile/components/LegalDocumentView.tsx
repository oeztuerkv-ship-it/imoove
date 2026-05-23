import React from "react";
import { Linking, ScrollView, StyleSheet, Text, View } from "react-native";

import { ONRODA_MARK_RED } from "@/constants/onrodaBrand";
import { useColors } from "@/hooks/useColors";
import type { LegalBlock, LegalInlinePart, OnrodaLegalDocument } from "@/src/content/onrodaLegal";

function LegalInlineText({ parts }: { parts: LegalInlinePart[] }) {
  const colors = useColors();

  return (
    <Text style={[styles.body, { color: colors.foreground }]}>
      {parts.map((part, index) => {
        if (part.href) {
          return (
            <Text
              key={`${part.text}-${index}`}
              style={{ color: ONRODA_MARK_RED, fontFamily: "Inter_600SemiBold" }}
              onPress={() => {
                void Linking.openURL(part.href!).catch(() => undefined);
              }}
            >
              {part.text}
            </Text>
          );
        }
        return part.text;
      })}
    </Text>
  );
}

function LegalBlockView({ block }: { block: LegalBlock }) {
  const colors = useColors();

  if (block.kind === "subtitle") {
    return (
      <Text style={[styles.subtitle, { color: colors.foreground }]}>
        {block.text}
      </Text>
    );
  }

  if (block.kind === "bullets") {
    return (
      <View style={styles.bulletList}>
        {block.items.map((item) => (
          <View key={item} style={styles.bulletRow}>
            <Text style={[styles.bulletDot, { color: colors.mutedForeground }]}>•</Text>
            <Text style={[styles.body, styles.bulletText, { color: colors.foreground }]}>{item}</Text>
          </View>
        ))}
      </View>
    );
  }

  return <LegalInlineText parts={block.parts} />;
}

type LegalDocumentViewProps = {
  document: OnrodaLegalDocument;
  bottomPad?: number;
};

export function LegalDocumentView({ document, bottomPad = 24 }: LegalDocumentViewProps) {
  const colors = useColors();

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
    >
      <Text style={[styles.headline, { color: colors.foreground }]}>{document.headline}</Text>
      <Text style={[styles.stand, { color: colors.mutedForeground }]}>Stand: {document.stand}</Text>

      {document.sections.map((section, index) => (
        <View
          key={section.title}
          style={[
            styles.section,
            index > 0 ? { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth } : null,
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>{section.title}</Text>
          <View style={styles.sectionBody}>
            {section.blocks.map((block, blockIndex) => (
              <LegalBlockView key={`${section.title}-${blockIndex}`} block={block} />
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 4,
  },
  headline: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    lineHeight: 26,
    letterSpacing: -0.3,
  },
  stand: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginBottom: 8,
  },
  section: {
    paddingTop: 16,
    paddingBottom: 4,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 21,
  },
  sectionBody: {
    gap: 8,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 20,
    marginTop: 2,
  },
  body: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 21,
  },
  bulletList: {
    gap: 6,
    paddingLeft: 2,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  bulletDot: {
    fontSize: 14,
    lineHeight: 21,
    width: 10,
  },
  bulletText: {
    flex: 1,
  },
});
