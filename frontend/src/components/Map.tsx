"use client";

import {
	MapContainer,
	TileLayer,
	Marker,
	Circle,
	Tooltip,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";

interface MapProps {
	lat: number;
	lon: number;
	geoType: "tract" | "zip" | "county";
}

export default function Map({ lat, lon, geoType }: MapProps) {
	const radiusMeters = {
		tract: 1609.34, // 1 mile
		zip: 3218.69, // 2 miles
		county: 8046.72, // 5 miles
	};
	const radiusMiles = {
		tract: 1,
		zip: 2,
		county: 5,
	};

	const radius = radiusMeters[geoType] || radiusMeters.county;
	const radiusText = `${
		radiusMiles[geoType] || radiusMiles.county
	} mile radius`;

	return (
		<MapContainer
			center={[lat, lon]}
			zoom={12}
			style={{ height: "200px", width: "100%", borderRadius: "0.5rem" }}
		>
			<TileLayer
				url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
				attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
			/>
			<Marker position={[lat, lon]} />
			<Circle center={[lat, lon]} radius={radius}>
				<Tooltip>{radiusText}</Tooltip>
			</Circle>
		</MapContainer>
	);
}
