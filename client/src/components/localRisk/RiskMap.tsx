import { useEffect } from "react";
import { Circle, CircleMarker, MapContainer, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import type { RiskItem } from "../../../../shared/types";
import { LEVEL_COLOR, LEVEL_LABEL } from "./format";

interface Props {
  center: { lat: number; lng: number };
  radiusMeters: number;
  items: RiskItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const ZOOM_FOR_RADIUS: Record<number, number> = { 402: 16, 805: 15, 1609: 14 };

// Keeps the view in sync with the radius and the selected item.
function ViewController({ center, radiusMeters, selected }: { center: Props["center"]; radiusMeters: number; selected: RiskItem | null }) {
  const map = useMap();
  useEffect(() => {
    map.setView([center.lat, center.lng], ZOOM_FOR_RADIUS[radiusMeters] ?? 15);
  }, [map, center.lat, center.lng, radiusMeters]);
  useEffect(() => {
    if (selected) map.panTo([selected.lat, selected.lng]);
  }, [map, selected]);
  return null;
}

export default function RiskMap({ center, radiusMeters, items, selectedId, onSelect }: Props) {
  const selected = items.find((i) => i.id === selectedId) ?? null;
  // Draw low first so higher levels sit on top.
  const ordered = [...items].sort((a, b) => rank(b) - rank(a));

  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={ZOOM_FOR_RADIUS[radiusMeters] ?? 15}
      preferCanvas
      scrollWheelZoom={false}
      className="h-full w-full"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ViewController center={center} radiusMeters={radiusMeters} selected={selected} />
      <Circle
        center={[center.lat, center.lng]}
        radius={radiusMeters}
        pathOptions={{ color: "#1e40af", weight: 1.5, dashArray: "6 6", fillOpacity: 0.04 }}
        interactive={false}
      />
      {ordered.map((item) => {
        const isSelected = item.id === selectedId;
        return (
          <CircleMarker
            key={item.id}
            center={[item.lat, item.lng]}
            radius={isSelected ? 10 : item.riskLevel === "low" ? 5 : 7}
            pathOptions={{
              color: isSelected ? "#0f172a" : "#ffffff",
              weight: isSelected ? 3 : 1,
              fillColor: LEVEL_COLOR[item.riskLevel],
              fillOpacity: 0.9,
            }}
            eventHandlers={{ click: () => onSelect(item.id) }}
          >
            <Tooltip>
              {LEVEL_LABEL[item.riskLevel]}: {item.title}
            </Tooltip>
          </CircleMarker>
        );
      })}
      <CircleMarker
        center={[center.lat, center.lng]}
        radius={9}
        pathOptions={{ color: "#ffffff", weight: 3, fillColor: "#1d4ed8", fillOpacity: 1 }}
      >
        <Popup>Your business</Popup>
        <Tooltip>Your business</Tooltip>
      </CircleMarker>
    </MapContainer>
  );
}

function rank(i: RiskItem): number {
  return i.riskLevel === "high" ? 0 : i.riskLevel === "medium" ? 1 : 2;
}
