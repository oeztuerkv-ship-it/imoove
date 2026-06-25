/** Kuratierte Icons für Homepage-CMS (Emoji + kurze Labels). */
export const MARKETING_ICON_LIBRARY = [
  { id: "taxi", glyph: "🚕", label: "Taxi" },
  { id: "car", glyph: "🚗", label: "Auto" },
  { id: "van", glyph: "🚐", label: "Van / XL" },
  { id: "plane", glyph: "✈️", label: "Flughafen" },
  { id: "hospital", glyph: "🏥", label: "Krankenfahrt" },
  { id: "hotel", glyph: "🏨", label: "Hotel" },
  { id: "office", glyph: "🏢", label: "Unternehmen" },
  { id: "calendar", glyph: "📅", label: "Termin" },
  { id: "clock", glyph: "⏱", label: "Schnell" },
  { id: "receipt", glyph: "🧾", label: "Quittung" },
  { id: "ticket", glyph: "🎫", label: "Gutschein" },
  { id: "phone", glyph: "📱", label: "App" },
  { id: "target", glyph: "🎯", label: "Ziel / Fokus" },
  { id: "pin", glyph: "📍", label: "Standort" },
  { id: "bolt", glyph: "⚡", label: "Effizienz" },
  { id: "handshake", glyph: "🤝", label: "Partner" },
  { id: "shield", glyph: "🛡", label: "Sicherheit" },
  { id: "check", glyph: "✅", label: "Vorteil" },
  { id: "star", glyph: "⭐", label: "Qualität" },
  { id: "heart", glyph: "❤️", label: "Service" },
];

export function findMarketingIcon(glyph) {
  const g = String(glyph ?? "").trim();
  return MARKETING_ICON_LIBRARY.find((row) => row.glyph === g) ?? null;
}
