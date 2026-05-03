/** Schriftzug „onroda“ — kein Bild-Logo im Unternehmens-Panel (Header/Login/Navigation). */
export default function OnrodaLogo({ className = "", style }) {
  return (
    <span
      className={`onroda-ui-wordmark${className ? ` ${className}` : ""}`.trim()}
      style={style}
      aria-label="onroda"
    >
      <span className="onroda-ui-wordmark__on">on</span>
      <span className="onroda-ui-wordmark__rest">roda</span>
    </span>
  );
}
