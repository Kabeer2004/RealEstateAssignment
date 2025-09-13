"use client";
import { MapContainer, TileLayer, Marker, Circle } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

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
}

export default function Map({ lat, lon }: MapProps) {
  // Prevent rendering on the server
  if (typeof window === "undefined") {
    return null;
  }

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
