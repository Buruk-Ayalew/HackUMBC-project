import { CircleMarker, MapContainer, TileLayer } from "react-leaflet";

// Small map showing one point. CircleMarker avoids Leaflet's default icon
// image paths, which break under bundlers.
export default function MiniMap({ lat, lng, height = 200 }: { lat: number; lng: number; height?: number }) {
  return (
    <MapContainer
      key={`${lat},${lng}`}
      center={[lat, lng]}
      zoom={15}
      scrollWheelZoom={false}
      style={{ height, width: "100%" }}
      className="rounded-lg border border-slate-200"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <CircleMarker center={[lat, lng]} radius={9} pathOptions={{ color: "#1d4ed8", fillOpacity: 0.6 }} />
    </MapContainer>
  );
}
