/**
 * SVG-Karte für GPS-Ping-Verlauf (Admin-Nachverfolgung ohne externe Map-Library).
 */
export default function RideGpsTrackMap({ points, fromLat, fromLon, toLat, toLon }) {
  const width = 640;
  const height = 320;
  const pad = 24;

  if (!Array.isArray(points) || points.length === 0) {
    return (
      <p className="admin-muted" style={{ margin: 0 }}>
        Keine GPS-Pings für diese Fahrt gespeichert (Historie startet mit Migration 114 bzw. nach Deploy).
      </p>
    );
  }

  const lats = points.map((p) => Number(p.lat)).filter(Number.isFinite);
  const lons = points.map((p) => Number(p.lon)).filter(Number.isFinite);
  if (fromLat != null && fromLon != null) {
    lats.push(Number(fromLat));
    lons.push(Number(fromLon));
  }
  if (toLat != null && toLon != null) {
    lats.push(Number(toLat));
    lons.push(Number(toLon));
  }

  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const latSpan = Math.max(maxLat - minLat, 0.0005);
  const lonSpan = Math.max(maxLon - minLon, 0.0005);

  const project = (lat, lon) => {
    const x = pad + ((lon - minLon) / lonSpan) * (width - pad * 2);
    const y = height - pad - ((lat - minLat) / latSpan) * (height - pad * 2);
    return { x, y };
  };

  const linePoints = points
    .filter((p) => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lon)))
    .map((p) => {
      const { x, y } = project(Number(p.lat), Number(p.lon));
      return `${x},${y}`;
    })
    .join(" ");

  const start = points[0] ? project(Number(points[0].lat), Number(points[0].lon)) : null;
  const end = points[points.length - 1]
    ? project(Number(points[points.length - 1].lat), Number(points[points.length - 1].lon))
    : null;

  return (
    <div className="admin-gps-track-map">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="GPS-Route der Fahrt"
        style={{ width: "100%", maxWidth: width, height: "auto", display: "block", borderRadius: 12, background: "#f1f5f9" }}
      >
        {linePoints ? (
          <polyline
            points={linePoints}
            fill="none"
            stroke="#0ea5e9"
            strokeWidth="3"
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity="0.9"
          />
        ) : null}
        {points.map((p, i) => {
          const lat = Number(p.lat);
          const lon = Number(p.lon);
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
          const { x, y } = project(lat, lon);
          if (i > 0 && i < points.length - 1) {
            return <circle key={`${p.recordedAt}-${i}`} cx={x} cy={y} r="2" fill="#64748b" opacity="0.55" />;
          }
          return null;
        })}
        {start ? <circle cx={start.x} cy={start.y} r="7" fill="#22c55e" stroke="#fff" strokeWidth="2" /> : null}
        {end ? <circle cx={end.x} cy={end.y} r="7" fill="#ef4444" stroke="#fff" strokeWidth="2" /> : null}
        {fromLat != null && fromLon != null ? (
          (() => {
            const { x, y } = project(Number(fromLat), Number(fromLon));
            return <rect x={x - 5} y={y - 5} width="10" height="10" fill="#16a34a" stroke="#fff" strokeWidth="1.5" rx="1" />;
          })()
        ) : null}
        {toLat != null && toLon != null ? (
          (() => {
            const { x, y } = project(Number(toLat), Number(toLon));
            return <rect x={x - 5} y={y - 5} width="10" height="10" fill="#dc2626" stroke="#fff" strokeWidth="1.5" rx="1" />;
          })()
        ) : null}
      </svg>
      <p className="admin-muted" style={{ margin: "8px 0 0", fontSize: "0.85rem" }}>
        Grün = erster Ping · Rot = letzter Ping · Quadrate = gebuchte Abholung/Ziel · Linie = gefilterter Verlauf (
        {points.length} Punkte)
      </p>
    </div>
  );
}
