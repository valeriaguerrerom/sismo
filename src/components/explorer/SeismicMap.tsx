import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import type { LatLngExpression, LatLngBoundsExpression } from 'leaflet';

/** Punto de evento a dibujar en el mapa. */
export interface MapPoint {
  id: string;
  lat: number;
  lon: number;
  label: string;
  sublabel?: string;
  color: string;
}

interface Props {
  points: MapPoint[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** Centro y zoom inicial según la vista activa. */
  center: LatLngExpression;
  zoom: number;
  /** Límites opcionales para encuadrar todos los puntos. */
  bounds?: LatLngBoundsExpression | null;
}

/** Reencuadra el mapa cuando cambian el centro/zoom o los límites. */
function MapController({ center, zoom, bounds }: { center: LatLngExpression; zoom: number; bounds?: LatLngBoundsExpression | null }) {
  const map = useMap();
  useEffect(() => {
    let alive = true;
    // Reencuadre sin animación: una animación en curso puede seguir tras el
    // desmontaje y tocar nodos internos ya destruidos (_leaflet_pos → crash).
    try {
      if (bounds) {
        map.fitBounds(bounds, { padding: [30, 30], maxZoom: 11, animate: false });
      } else {
        map.setView(center, zoom, { animate: false });
      }
    } catch { /* mapa en proceso de desmontaje */ }

    // Leaflet necesita recalcular tamaño cuando el contenedor cambia de layout.
    // Se cancela al desmontar para no operar sobre un mapa ya destruido.
    const t = setTimeout(() => {
      if (!alive) return;
      try { map.invalidateSize(); } catch { /* ya desmontado */ }
    }, 200);

    return () => { alive = false; clearTimeout(t); };
  }, [map, center, zoom, bounds]);
  return null;
}

/**
 * Mapa de epicentros basado en Leaflet + OpenStreetMap.
 * Dibuja un CircleMarker por evento, resalta el seleccionado y permite
 * seleccionar haciendo clic en el marcador.
 */
export function SeismicMap({ points, selectedId, onSelect, center, zoom, bounds }: Props) {
  // Evita re-render innecesario de los marcadores
  const markers = useMemo(() => points, [points]);

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      scrollWheelZoom
      style={{ height: '100%', width: '100%', borderRadius: '0.75rem' }}
      attributionControl={false}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; OpenStreetMap'
      />
      <MapController center={center} zoom={zoom} bounds={bounds} />

      {markers.map(p => {
        const isSelected = p.id === selectedId;
        return (
          <CircleMarker
            key={p.id}
            center={[p.lat, p.lon]}
            radius={isSelected ? 11 : 7}
            pathOptions={{
              color: '#ffffff',
              weight: isSelected ? 3 : 1.5,
              fillColor: p.color,
              fillOpacity: isSelected ? 1 : 0.75,
            }}
            eventHandlers={{ click: () => onSelect?.(p.id) }}
          >
            <Popup>
              <div style={{ fontSize: 12 }}>
                <strong>{p.label}</strong>
                {p.sublabel && <div style={{ color: '#78716c' }}>{p.sublabel}</div>}
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
