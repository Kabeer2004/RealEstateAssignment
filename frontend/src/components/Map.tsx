"use client";
import {
  MapContainer,
  TileLayer,
  Marker,
  GeoJSON,
  Circle,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useMap } from "react-leaflet";
import L from "leaflet";
import { useEffect } from "react";

// Fix for default marker icon not loading (common SSR/dynamic issue)
const defaultIcon = L.icon({
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
  shadowAnchor: [12, 41],
});

interface MapProps {
  lat: number;
  lon: number;
  geoType: "tract" | "zip" | "county";
  geometry?: any;
}

function FitBounds({ geometry }: { geometry: any }) {
  const map = useMap();
  useEffect(() => {
    if (
      (geometry && geometry.type === "MultiPolygon") ||
      geometry.type === "Polygon"
    ) {
      try {
        const geoJsonLayer = L.geoJSON(geometry);
        const bounds = geoJsonLayer.getBounds();
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [10, 10], maxZoom: 16 });
          // Add highlight on hover (optional enhancement)
          geoJsonLayer.on("mouseover", () =>
            geoJsonLayer.setStyle({ fillOpacity: 0.4, weight: 3 })
          );
          geoJsonLayer.on("mouseout", () =>
            geoJsonLayer.setStyle({ fillOpacity: 0.2, weight: 2 })
          );
          geoJsonLayer.addTo(map);
        }
      } catch (e) {
        console.error("Invalid geometry:", e, geometry);
      }
    }
  }, [geometry, map]);

  return null;
}

export default function Map({ lat, lon, geoType, geometry }: MapProps) {
  // Prevent rendering on the server
  if (typeof window === "undefined") {
    return null;
  }

  // Enhanced style for tract highlighting (blue outline, semi-transparent fill)
  const geoJsonStyle = (feature?: any) => ({
    color: "#3388ff",
    weight: 2,
    opacity: 0.8,
    fillColor: "#3388ff",
    fillOpacity: 0.3,
    dashArray: "",
    fillRule: "evenodd",
  });

  return (
    <MapContainer
      center={[lat, lon]}
      zoom={13}
      scrollWheelZoom={true}
      style={{ height: "200px", width: "100%", borderRadius: "0.5rem" }}
      // Ensure proper attribution and tile loading
      attributionControl={true}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      {/* Custom marker with fixed icon */}
      <Marker position={[lat, lon]} icon={defaultIcon} />
      {/* Circle Rendering */}
      <Circle center={[lat, lon]} radius={1609.34} fillOpacity={0.1} />
    </MapContainer>
  );
}
