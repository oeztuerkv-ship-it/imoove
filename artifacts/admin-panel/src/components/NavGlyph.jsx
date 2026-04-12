/** Schlichte Linien-Icons — konsistent mit dem Admin-UI, ohne Emoji. */
export default function NavGlyph({ name, active }) {
  const c = "admin-nav-glyph" + (active ? " admin-nav-glyph--active" : "");
  const stroke = "currentColor";
  const sw = 1.65;
  const common = { fill: "none", stroke, strokeWidth: sw, strokeLinecap: "round", strokeLinejoin: "round" };

  switch (name) {
    case "pulse":
      return (
        <svg className={c} viewBox="0 0 24 24" width={20} height={20} aria-hidden>
          <path {...common} d="M4 12h3l2-7 4 14 2-7h5" />
        </svg>
      );
    case "rides":
      return (
        <svg className={c} viewBox="0 0 24 24" width={20} height={20} aria-hidden>
          <path {...common} d="M5 17h12l1-4H4l1.5-6h12" />
          <circle {...common} cx="7.5" cy="17" r="1.8" />
          <circle {...common} cx="16.5" cy="17" r="1.8" />
        </svg>
      );
    case "building":
      return (
        <svg className={c} viewBox="0 0 24 24" width={20} height={20} aria-hidden>
          <path {...common} d="M4 20V8l8-4v16M12 8h8v12M9 12h.01M9 16h.01M15 14h2M15 18h2" />
        </svg>
      );
    case "people":
      return (
        <svg className={c} viewBox="0 0 24 24" width={20} height={20} aria-hidden>
          <circle {...common} cx="9" cy="8" r="3" />
          <path {...common} d="M3 20v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1" />
          <circle {...common} cx="17" cy="9" r="2.5" />
          <path {...common} d="M21 20v-.5a3.5 3.5 0 0 0-3.5-3.5" />
        </svg>
      );
    case "map":
      return (
        <svg className={c} viewBox="0 0 24 24" width={20} height={20} aria-hidden>
          <path {...common} d="M9 4L3 7v13l6-3 6 3 6-3V4l-6 3-6-3z" />
          <path {...common} d="M9 4v13M15 7v13" />
        </svg>
      );
    case "key":
      return (
        <svg className={c} viewBox="0 0 24 24" width={20} height={20} aria-hidden>
          <circle {...common} cx="7.5" cy="15.5" r="3.5" />
          <path {...common} d="M10.5 12.5L20 3M20 3h-3.5M20 3v3.5" />
        </svg>
      );
    default:
      return (
        <svg className={c} viewBox="0 0 24 24" width={20} height={20} aria-hidden>
          <circle {...common} cx="12" cy="12" r="3" />
        </svg>
      );
  }
}
