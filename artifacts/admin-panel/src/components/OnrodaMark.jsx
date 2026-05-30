import logoTransparent from "../assets/onroda-logo-transparent.png";

/** Marken-Logo (PNG wie Partner-App-Header), kein Schriftzug „onroda“. */
export default function OnrodaMark({ className = "" }) {
  return (
    <img
      src={logoTransparent}
      alt="ONRODA"
      className={`admin-brand-logo${className ? ` ${className}` : ""}`}
      width={160}
      height={60}
      decoding="async"
    />
  );
}
