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

export default function SatellitesMap({ satellites = [] }) {
  const activeSats = satellites.filter(s => s.status === 1);
  const inactiveSats = satellites.filter(s => s.status === 0);

  const visibleSats = satellites.filter((s) => {
    const lat = s?.location?.lat;
    const lon = s?.location?.lon;
    return (
      s?.status === 1 &&
      Number.isFinite(lat) &&
      Number.isFinite(lon) &&
      lat >= -90 && lat <= 90 &&
      lon >= -180 && lon <= 180
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
        <div style={{marginLeft: "auto"}}>
          <h1>45-60 Satellites Planned</h1>
        </div>
      </header>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <MapContainer
            center={[20, 0]}
            zoom={2}
            minZoom={2}
            style={{ height: "100%", width: "100%" }}
            worldCopyJump
          >
            <TileLayer
              url="https://cartodb-basemaps-a.global.ssl.fastly.net/light_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>'
            />

{visibleSats.map((s) => {
  const { lat, lon } = s.location;
  const hist = Array.isArray(s.history) ? s.history : [];

  const trail = hist.slice().reverse().map(p => [p.lat, p.lon]);

  return (
    <React.Fragment key={s.id}>
      {trail.length >= 2 && (
        <Polyline positions={trail} pathOptions={{ color: "blue", weight: 2, opacity: 0.9 }} />
      )}

      {hist.map((p, i) => (
        <CircleMarker
          key={`${s.id}-h-${i}`}
          center={[p.lat, p.lon]}
          radius={3}
          pathOptions={{ color: "white", fillColor: "blue", fillOpacity: 0.9, opacity: 0.9 }}
        />
      ))}

      <Circle 
        center={[lat, lon]}
        radius={1000000}
        pathOptions={{color: "gray", fillColor:"gray", fillOpacity:0.3}}
        />

      <Marker position={[lat, lon]} icon={makeSatIcon(`${base}sat.png`, 28)} />
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
          
          {activeSats.map(s => (
            <div>
              <span>
                {s.satname}
              </span>
              <span style={{color: "green"}}> Running </span>
            </div>
          ))}
        <h2> Inactive Satellites</h2>
        {inactiveSats.map(s => (
          <div>
            <span>
              {s.satname}
            </span>
            <span style={{color: "red"}}> Decayed </span>
          </div>
        ))}

        <p style={{marginTop: "50px"}}>
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
            verticalAlign: "middle"
          }}
          />
          is approximate.
        </p>

        </aside>
      </div>
    </div>
  );
}
