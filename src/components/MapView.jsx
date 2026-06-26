import React, { useEffect, useMemo, useRef } from "react";
import L from "leaflet";

const QINGDAO_CENTER = [36.0671, 120.3826];

function markerHtml(item) {
  const isRequest = item.kind === "request";
  const active = item.status === "chatting";
  const color = isRequest ? "#2563eb" : "#16a34a";
  const light = isRequest ? "#bfdbfe" : "#bbf7d0";
  return `
    <div class="pin ${active ? "pin-active" : ""}" style="--pin:${color}; --pin-light:${light}">
      <span>${isRequest ? "需" : "师"}</span>
    </div>
  `;
}

export default function MapView({ items, selectedId, onSelect, picker, onPick }) {
  const mapRef = useRef(null);
  const nodeRef = useRef(null);
  const markerLayer = useRef(null);
  const pickMarker = useRef(null);

  const normalizedItems = useMemo(() => items.filter((item) => item.latitude && item.longitude), [items]);

  useEffect(() => {
    if (mapRef.current || !nodeRef.current) return;
    const map = L.map(nodeRef.current, { zoomControl: true }).setView(QINGDAO_CENTER, 10);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
    markerLayer.current = L.layerGroup().addTo(map);
    mapRef.current = map;
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !picker) return;
    const handler = (event) => {
      const latlng = event.latlng;
      if (!pickMarker.current) {
        pickMarker.current = L.marker(latlng, { draggable: true }).addTo(map);
        pickMarker.current.on("dragend", () => {
          const next = pickMarker.current.getLatLng();
          onPick?.({ latitude: next.lat, longitude: next.lng });
        });
      } else {
        pickMarker.current.setLatLng(latlng);
      }
      onPick?.({ latitude: latlng.lat, longitude: latlng.lng });
    };
    map.on("click", handler);
    return () => map.off("click", handler);
  }, [picker, onPick]);

  useEffect(() => {
    const layer = markerLayer.current;
    if (!layer) return;
    layer.clearLayers();
    normalizedItems.forEach((item) => {
      const icon = L.divIcon({
        html: markerHtml(item),
        className: "marker-shell",
        iconSize: [38, 38],
        iconAnchor: [19, 19]
      });
      const marker = L.marker([item.latitude, item.longitude], { icon }).addTo(layer);
      marker.on("click", () => onSelect?.(item));
      marker.bindPopup(`
        <strong>${item.kind === "request" ? item.subject : item.name}</strong><br/>
        ${item.area || item.address || "青岛市"}<br/>
        ${item.kind === "request" ? `${item.budgetMin}-${item.budgetMax} 元/小时` : `${item.expectedPrice} 元/小时`}
      `);
    });
  }, [normalizedItems, onSelect]);

  useEffect(() => {
    const selected = normalizedItems.find((item) => item.id === selectedId);
    if (selected && mapRef.current) {
      mapRef.current.setView([selected.latitude, selected.longitude], Math.max(mapRef.current.getZoom(), 12), { animate: true });
    }
  }, [selectedId, normalizedItems]);

  return <div className="map" ref={nodeRef} aria-label="青岛市家教信息地图" />;
}