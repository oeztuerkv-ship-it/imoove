import logoTransparent from "../assets/onroda-logo-transparent.png";

/** Marken-Logo (PNG wie Mobile-Partner-Header / Admin-Konsole), kein Schriftzug. */
export default function OnrodaMark({ className = "" }) {
  return (
    <img
      src={logoTransparent}
      alt="ONRODA"
      className={`panel-brand-logo${className ? ` ${className}` : ""}`}
      width={160}
      height={60}
      decoding="async"
    />
  );
}
