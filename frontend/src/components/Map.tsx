'use client';

import { MapContainer, TileLayer, Marker, Circle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

interface MapProps {
  lat: number;
  lon: number;
}

export default function Map({ lat, lon }: MapProps) {
  return (
    <MapContainer center={[lat, lon]} zoom={12} style={{ height: '200px', width: '100%', borderRadius: '0.5rem' }}>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      <Marker position={[lat, lon]} />
      <Circle center={[lat, lon]} radius={8046.72} /> {/* 5 miles */}
    </MapContainer>
  );
}