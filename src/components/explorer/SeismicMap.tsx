import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Circle, Popup, Tooltip as LeafletTooltip, useMap } from 'react-leaflet';
import type { LatLngExpression, LatLngBoundsExpression } from 'leaflet';

/** Punto (evento o estación) a dibujar en el mapa. */
export interface MapPoint {
  id: string;
  lat: number;
  lon: number;
  label: string;
  sublabel?: string;
  color: string;
  /** Marcador de estación (cuadrado/anillo) en vez de círculo de evento. */
  station?: boolean;
  /** Estación resaltada (registró el evento abierto). */
  highlighted?: boolean;
  /** Etiqueta corta fija junto al marcador (p. ej. la sigla de la estación). */
  badge?: string;
}

/** Área sombreada (zona de origen) con centro, radio en metros y leyenda. */
export interface MapArea {
  lat: number;
  lon: number;
  radiusMeters: number;
  color: string;
  label?: string;
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
  /** Área sombreada opcional (zona de origen de la sismicidad). */
  area?: MapArea | null;
}

/** Reencuadra el mapa cuando cambian el centro/zoom o los límites. */
function MapController({ center, zoom, bounds }: { center: LatLngExpression; zoom: number; bounds?: LatLngBoundsExpression | null }) {
  const map = useMap();
  useEffect(() => {
    let alive = true;

    // Encuadra el mapa. invalidateSize PRIMERO: si el contenedor se monta con
    // tamaño aún sin resolver (p. ej. dentro de una pestaña o un grid que acaba
    // de cambiar de layout), Leaflet cree que mide 0 y las teselas salen
    // cortadas (líneas blancas) y el fitBounds calcula mal. Recalcular el tamaño
    // antes de encuadrar evita ambas cosas.
    const apply = () => {
      if (!alive) return;
      try {
        map.invalidateSize({ animate: false });
        if (bounds) {
          map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12, animate: false });
        } else {
          map.setView(center, zoom, { animate: false });
        }
      } catch { /* mapa en proceso de desmontaje */ }
    };

    apply();
    // Reintentos cuando el layout termina de asentarse (dos frames y un timeout).
    const raf = requestAnimationFrame(() => requestAnimationFrame(apply));
    const t = setTimeout(apply, 250);

    // Reencuadra también si el contenedor cambia de tamaño (responsive, pestañas).
    let ro: ResizeObserver | null = null;
    try {
      const container = map.getContainer();
      if (typeof ResizeObserver !== 'undefined' && container) {
        ro = new ResizeObserver(() => { if (alive) { try { map.invalidateSize({ animate: false }); } catch { /* desmontado */ } } });
        ro.observe(container);
      }
    } catch { /* sin ResizeObserver */ }

    return () => { alive = false; cancelAnimationFrame(raf); clearTimeout(t); ro?.disconnect(); };
  }, [map, center, zoom, bounds]);
  return null;
}

/**
 * Mapa basado en Leaflet + OpenStreetMap. Dibuja:
 *  - un área sombreada opcional (zona de origen de la sismicidad volcánica),
 *  - marcadores de eventos o de estaciones (con resaltado y sigla),
 * y permite seleccionar haciendo clic en un marcador.
 */
export function SeismicMap({ points, selectedId, onSelect, center, zoom, bounds, area }: Props) {
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

      {/* Zona de origen sombreada (p. ej. área de la sismicidad del Galeras). */}
      {area && (
        <Circle
          center={[area.lat, area.lon]}
          radius={area.radiusMeters}
          pathOptions={{ color: area.color, weight: 1.5, fillColor: area.color, fillOpacity: 0.12, dashArray: '4 4' }}
        >
          {area.label && (
            <Popup>
              <div style={{ fontSize: 12 }}>{area.label}</div>
            </Popup>
          )}
        </Circle>
      )}

      {markers.map(p => {
        const isSelected = p.id === selectedId;
        if (p.station) {
          // Estación: anillo con relleno tenue; resaltado si registró el evento.
          const active = p.highlighted || isSelected;
          return (
            <CircleMarker
              key={p.id}
              center={[p.lat, p.lon]}
              radius={active ? 9 : 6}
              pathOptions={{
                color: p.color,
                weight: active ? 3 : 2,
                fillColor: '#ffffff',
                fillOpacity: active ? 0.95 : 0.7,
              }}
              eventHandlers={{ click: () => onSelect?.(p.id) }}
            >
              {p.badge && (
                <LeafletTooltip permanent direction="top" offset={[0, -6]} className="sismo-station-badge">
                  {p.badge}
                </LeafletTooltip>
              )}
              <Popup>
                <div style={{ fontSize: 12 }}>
                  <strong>{p.label}</strong>
                  {p.sublabel && <div style={{ color: '#78716c' }}>{p.sublabel}</div>}
                </div>
              </Popup>
            </CircleMarker>
          );
        }
        // Evento (o cráter): círculo relleno.
        return (
          <CircleMarker
            key={p.id}
            center={[p.lat, p.lon]}
            radius={isSelected ? 11 : 7}
            pathOptions={{
              color: '#ffffff',
              weight: isSelected ? 3 : 1.5,
              fillColor: p.color,
              fillOpacity: isSelected ? 1 : 0.85,
            }}
            eventHandlers={{ click: () => onSelect?.(p.id) }}
          >
            {p.badge && (
              <LeafletTooltip permanent direction="top" offset={[0, -6]} className="sismo-station-badge">
                {p.badge}
              </LeafletTooltip>
            )}
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
