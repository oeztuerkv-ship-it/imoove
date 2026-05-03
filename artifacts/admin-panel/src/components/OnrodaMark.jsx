/** Schriftzug „onroda“ — kein Bild-Logo in der Operator-Konsole. */
export default function OnrodaMark({ className = "" }) {
  return (
    <span
      className={`onroda-ui-wordmark${className ? ` ${className}` : ""}`}
      aria-label="onroda"
    >
      <span className="onroda-ui-wordmark__on">on</span>
      <span className="onroda-ui-wordmark__rest">roda</span>
    </span>
  );
}
