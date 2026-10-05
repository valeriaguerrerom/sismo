#!/usr/bin/env python3
"""
Pobla eventos tectónicos de la red CM en seismic_events con datos MiniSEED.

Lee los archivos JSON de public/data/cm/ y crea/actualiza los eventos
correspondientes en Supabase. Cada evento CM tiene múltiples estaciones.

Uso:
    python populate_cm_events.py
"""
import json
import os
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
# Usar SERVICE_ROLE_KEY para escribir directamente sin RLS
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY", "")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: Faltan variables de entorno SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY/SUPABASE_ANON_KEY")
    print("Configúralas en backend/.env")
    exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# Ruta a los archivos JSON procesados
CM_DIR = Path(__file__).parent.parent / "public" / "data" / "cm"


def main():
    print("=" * 70)
    print("Población de eventos tectónicos de la red CM con datos MiniSEED")
    print("=" * 70)
    
    if not CM_DIR.exists():
        print(f"ERROR: Directorio no encontrado: {CM_DIR}")
        exit(1)
    
    # Leer index.json
    index_path = CM_DIR / "index.json"
    if not index_path.exists():
        print(f"ERROR: index.json no encontrado en {CM_DIR}")
        exit(1)
    
    with open(index_path, "r", encoding="utf-8") as f:
        index = json.load(f)
    
    events = index.get("events", [])
    print(f"\nEncontrados {len(events)} eventos en index.json\n")
    
    inserted = 0
    updated = 0
    errors = 0
    
    for ev in events:
        event_id = ev["id"]
        magnitude = ev.get("magnitude", 0)
        event_date = ev.get("date")
        event_time = ev.get("time")
        
        if not event_date or not event_time:
            print(f"WARNING {event_id}: falta fecha o hora, saltando")
            errors += 1
            continue
        
        # Ubicación y coordenadas (de seismic_events existentes o valores por defecto)
        # Los eventos CM no tienen coordenadas en el index.json, se deben tomar de
        # la tabla seismic_events si ya existen, o usar valores por defecto de Nariño
        lat = 1.2136  # Pasto por defecto
        lon = -77.2811
        depth_km = 15.0  # Profundidad típica corteza
        location_name = "Nariño, Colombia"
        
        # Listar estaciones disponibles (solo códigos)
        stations = ev.get("stations", [])
        station_codes = [st["station"] for st in stations]
        
        # Elegir la primera estación como "principal" para mseed_station
        # (en realidad hay múltiples, pero el campo es singular por ahora)
        main_station = station_codes[0] if station_codes else "unknown"
        
        # File path: cada estación tiene su propio JSON en la carpeta del evento
        file_path = f"data/cm/{event_id}"  # Es una carpeta, no un archivo único
        
        # Buscar si el evento ya existe en seismic_events
        try:
            result = supabase.table("seismic_events").select("event_id, latitude, longitude, location_name").eq("event_date", event_date).eq("event_time", event_time).execute()
            existing = result.data and len(result.data) > 0
            if existing:
                # Usar coordenadas y ubicación existentes
                lat = result.data[0].get("latitude", lat)
                lon = result.data[0].get("longitude", lon)
                location_name = result.data[0].get("location_name", location_name)
        except Exception as e:
            print(f"WARNING {event_id}: error consultando Supabase: {e}")
            errors += 1
            continue
        
        if existing:
            # Actualizar evento existente
            try:
                supabase.table("seismic_events").update({
                    "mseed_available": True,
                    "mseed_file_path": file_path,
                    "mseed_station": main_station,  # Primera estación
                    "mseed_data_source": "cm",
                    "notes": f"Red CM. Estaciones: {', '.join(station_codes[:5])}{'...' if len(station_codes) > 5 else ''}",
                }).eq("event_date", event_date).eq("event_time", event_time).execute()
                print(f"OK {event_id}: actualizado ({event_date} {event_time}, M{magnitude})")
                updated += 1
            except Exception as e:
                print(f"ERROR {event_id}: error actualizando: {e}")
                errors += 1
        else:
            # Insertar nuevo evento
            try:
                supabase.table("seismic_events").insert({
                    "event_date": event_date,
                    "event_time": event_time,
                    "location_name": location_name,
                    "magnitude": magnitude,
                    "depth_km": depth_km,
                    "latitude": lat,
                    "longitude": lon,
                    "event_type": "tectonic",
                    "source": "SGC (Red CM)",
                    "mseed_available": True,
                    "mseed_file_path": file_path,
                    "mseed_station": main_station,
                    "mseed_data_source": "cm",
                    "notes": f"Red CM. Estaciones: {', '.join(station_codes[:5])}{'...' if len(station_codes) > 5 else ''}",
                }).execute()
                print(f"OK {event_id}: insertado ({event_date} {event_time}, M{magnitude})")
                inserted += 1
            except Exception as e:
                print(f"ERROR {event_id}: error insertando: {e}")
                errors += 1
    
    print("\n" + "=" * 70)
    print(f"Resumen:")
    print(f"  Insertados: {inserted}")
    print(f"  Actualizados: {updated}")
    print(f"  Errores: {errors}")
    print("=" * 70)


if __name__ == "__main__":
    main()
