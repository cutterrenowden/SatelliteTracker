import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, Circle } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import React from "react";

const base = import.meta.env.BASE_URL;

const makeSatIcon = (imgUrl = `${base}sat.png`, size = 28) =>
  L.divIcon({
    className: "satellite-icon",
    html: `<img src="${imgUrl}" alt="sat" style="width:${size}px;height:${size}px;" />`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });


const normalizeLon = (lon) => {
  let x = ((lon + 180) % 360 + 360) % 360 - 180;
  if (x === -180) x = 180;
  return x;
};


const buildTrailSegments = (hist) => {
  if (!Array.isArray(hist) || hist.length < 2) return [];

  const pts = hist
    .slice()
    .reverse()
    .map(p => ({ lat: p.lat, lon: normalizeLon(p.lon) }));

  const segments = [];
  let seg = [[pts[0].lat, pts[0].lon]];

  for (let i = 1; i < pts.length; i++) {
    const p1 = pts[i - 1];
    const p2 = pts[i];


    let lon2u = p2.lon;
    if (lon2u - p1.lon > 180) lon2u -= 360;
    else if (lon2u - p1.lon < -180) lon2u += 360;

    const dLon = lon2u - p1.lon;

    const crossesPos = (p1.lon <= 180 && lon2u > 180);
    const crossesNeg = (p1.lon >= -180 && lon2u < -180);

    if (crossesPos || crossesNeg) {
      const boundary = crossesPos ? 180 : -180;


      const t = (boundary - p1.lon) / dLon; // 0..1
      const latAtBoundary = p1.lat + t * (p2.lat - p1.lat);

      seg.push([latAtBoundary, boundary]);
      segments.push(seg);


      const opposite = -boundary; 
      seg = [[latAtBoundary, opposite]];


      const finalLon = normalizeLon(lon2u - Math.sign(boundary) * 360); 
      seg.push([p2.lat, finalLon]);
    } else {

      seg.push([p2.lat, normalizeLon(lon2u)]);
    }
  }

  if (seg.length > 1) segments.push(seg);
  return segments;
};


const trailColors = [
  "#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd",
  "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf",
  "#8F4639", "#9106CD", "#CD06A4", "#CD0642", "#42CD06",
  "#06CD91"
];

const getTrailColor = (idOrIndex) => {

  if (typeof idOrIndex === "number") {
    return trailColors[idOrIndex % trailColors.length];
  }

  let hash = 0;
  for (let i = 0; i < idOrIndex.length; i++) {
    hash = (hash * 31 + idOrIndex.charCodeAt(i)) >>> 0;
  }
  return trailColors[hash % trailColors.length];
};

export default function SatellitesMap({ satellites = [] }) {
  const activeSats = satellites.filter((s) => s.status === 1);
  const inactiveSats = satellites.filter((s) => s.status === 0);

  const visibleSats = satellites.filter((s) => {
    const lat = s?.location?.lat;
    const lon = s?.location?.lon;
    return (
      s?.status === 1 &&
      Number.isFinite(lat) &&
      Number.isFinite(lon) &&
      lat >= -90 &&
      lat <= 90 &&
      lon >= -180 &&
      lon <= 180
    );
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", width: "100vw" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          backgroundColor: "#1e293b",
          color: "white",
          padding: "8px 16px",
          flexShrink: 0,
        }}
      >
        <img src={`${base}asts_png.png`} alt="logo" style={{ height: 40 }} />
        <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 700 }}>Satellite Tracker.</h1>
        <div style={{ marginLeft: "auto" }}>
          <h1>45-60 Satellites Planned</h1>
        </div>
      </header>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <MapContainer center={[20, 0]} zoom={2} minZoom={2} style={{ height: "100%", width: "100%" }} worldCopyJump>
            <TileLayer
              url="https://cartodb-basemaps-a.global.ssl.fastly.net/light_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>'
            />

            {visibleSats.map((s, idx) => {
              const { lat, lon } = s.location;
              const hist = Array.isArray(s.history) ? s.history : [];
              const segments = buildTrailSegments(hist);
              const color = getTrailColor(s.id ?? idx);

              return (
                <React.Fragment key={s.id}>
                  {segments.map((seg, segIdx) => (
                    <Polyline
                      key={`${s.id}-seg-${segIdx}`}
                      positions={seg}
                      pathOptions={{ color, weight: 2, opacity: 0.9 }}
                    />
                  ))}

                  {hist.map((p, i) => (
                    <CircleMarker
                      key={`${s.id}-h-${i}`}
                      center={[p.lat, normalizeLon(p.lon)]}
                      radius={3}
                      pathOptions={{ color, fillColor: color, fillOpacity: 0.9, opacity: 0.9 }}
                    />
                  ))}

                  <Circle
                    center={[lat, lon]}
                    radius={1000000}
                    pathOptions={{ color: "gray", fillColor: "gray", fillOpacity: 0.3 }}
                  />

                  <Marker position={[lat, lon]} icon={makeSatIcon()}>
                    <Popup>
                      <b>{s.satname ?? s.id}</b>
                      <div>lat: {lat.toFixed(4)}</div>
                      <div>lon: {lon.toFixed(4)}</div>
                    </Popup>
                  </Marker>
                </React.Fragment>
              );
            })}
          </MapContainer>
        </div>

        <aside
          style={{
            width: 280,
            backgroundColor: "#f1f5f9",
            borderLeft: "1px solid #cbd5e1",
            padding: 16,
            overflowY: "auto",
            flexShrink: 0,
          }}
        >
          <h2> Active Satellites</h2>
          {activeSats.map((s) => (
            <div key={`a-${s.id ?? s.satname}`}>
              <span>{s.satname}</span>
              <span style={{ color: "green" }}> Running </span>
            </div>
          ))}
          <h2> Inactive Satellites</h2>
          {inactiveSats.map((s) => (
            <div key={`i-${s.id ?? s.satname}`}>
              <span>{s.satname}</span>
              <span style={{ color: "red" }}> Decayed </span>
            </div>
          ))}

          <p style={{ marginTop: "50px" }}>
            Connection area
            <span
              style={{
                display: "inline-block",
                width: "12px",
                height: "12px",
                borderRadius: "50%",
                backgroundColor: "#ccc",
                border: "2px solid #999",
                margin: "0 4px",
                verticalAlign: "middle",
              }}
            />
            is approximate.
          </p>
        </aside>
      </div>
    </div>
  );
}
