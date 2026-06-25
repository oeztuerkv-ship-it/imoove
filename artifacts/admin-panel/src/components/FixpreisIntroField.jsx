function bodySizeRem(key) {
  if (key === "sm") return "0.95rem";
  if (key === "lg") return "1.15rem";
  return "1.05rem";
}

export default function FixpreisIntroField({
  value,
  onChange,
  bodyFontSize = "md",
  bodyColor = "",
  textAlign = "center",
}) {
  const text = value ?? "";
  const chars = text.length;
  const lineCount = text.trim() ? text.split("\n").length : 0;

  const previewStyle = {
    fontSize: bodySizeRem(bodyFontSize),
    color: bodyColor?.trim() || "#475569",
    textAlign: textAlign || "center",
    whiteSpace: "pre-line",
  };

  return (
    <div className="admin-cms-intro-editor">
      <div className="admin-cms-intro-editor__compose">
        <div className="admin-cms-intro-editor__head">
          <span className="admin-cms-intro-editor__title">Einleitung (kurz)</span>
          <span className="admin-cms-intro-editor__meta">
            {chars} Zeichen{lineCount > 1 ? ` · ${lineCount} Zeilen` : ""}
          </span>
        </div>
        <p className="admin-cms-intro-editor__hint">
          1–3 Sätze direkt unter der Überschrift. Längere Inhalte bitte in die Bereiche unten pflegen.
        </p>
        <textarea
          className="admin-cms-intro-editor__input"
          rows={4}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Kurzer Teaser-Text für die Fixpreise-Seite …"
          spellCheck
        />
      </div>
      <div className="admin-cms-intro-editor__preview-wrap" aria-live="polite">
        <span className="admin-cms-intro-editor__preview-label">So wirkt es auf /fixpreise/</span>
        <div className="admin-cms-intro-editor__preview-card" style={{ textAlign: previewStyle.textAlign }}>
          <p className="admin-cms-intro-editor__preview-text" style={previewStyle}>
            {text.trim() ? text : "Hier erscheint Ihr Einleitungstext unter der Überschrift."}
          </p>
        </div>
      </div>
    </div>
  );
}
