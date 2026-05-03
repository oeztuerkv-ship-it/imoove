/** Markenlogo aus `public/onroda-logo.png` (Partner-Panel, kein /partners/-Prefix). */
export default function OnrodaLogo({ className = "", height = 40, alt = "ONRODA" }) {
  return (
    <img
      src="/onroda-logo.png"
      alt={alt}
      height={height}
      className={className}
      style={{ width: "auto", maxWidth: 220, height, objectFit: "contain", display: "block" }}
      decoding="async"
    />
  );
}
