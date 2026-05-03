/** Markenlogo aus `public/onroda-logo.png` (Build-Base `/partners/`). */
export default function OnrodaMark({ className = "" }) {
  const raw = import.meta.env.BASE_URL || "/";
  const base = raw.endsWith("/") ? raw : `${raw}/`;
  const src = `${base}onroda-logo.png`;
  return (
    <img
      src={src}
      alt="ONRODA"
      className={`onroda-mark${className ? ` ${className}` : ""}`}
      decoding="async"
    />
  );
}
