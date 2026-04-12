/** Markenzeichen aus `public/favicon.svg` (Build-Base `/partners/`). */
export default function OnrodaMark({ className = "" }) {
  const raw = import.meta.env.BASE_URL || "/";
  const base = raw.endsWith("/") ? raw : `${raw}/`;
  const src = `${base}favicon.svg`;
  return (
    <img
      src={src}
      alt=""
      width={36}
      height={34}
      className={`onroda-mark${className ? ` ${className}` : ""}`}
      decoding="async"
    />
  );
}
