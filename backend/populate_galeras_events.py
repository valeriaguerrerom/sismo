#!/usr/bin/env python3
"""
Pobla eventos del Galeras 2006 en seismic_events con datos MiniSEED.

Lee los archivos JSON de public/data/galeras/ y crea/actualiza los eventos
correspondientes en Supabase con los campos mseed_* configurados.

Uso:
    python populate_galeras_events.py
"""
import json
import os
from pathlib import Path
from datetime import datetime

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
GALERAS_DIR = Path(__file__).parent.parent / "public" / "data" / "galeras"

def parse_galeras_filename(filename: str) -> dict | None:
    """
    Parsea un nombre de archivo formato YYMMDDHHMMGXX.json donde XX es el tipo.
    Retorna dict con date, time, subtype, o None si no es válido.
    
    Ejemplo: 0602011028GVA.json -> 2006-02-01 10:28:00, tipo VA
    """
    if not filename.endswith(".json"):
        return None
    
    # Quitar .json y validar longitud (12 dígitos + 3 letras tipo = 15 chars)
    name = filename[:-5]  # sin .json
    if len(name) < 12:
        return None
    
    try:
        code = name[:12]  # YYMMDDHHMMGG (los primeros 12)
        type_code = name[12:] if len(name) > 12 else ""  # El resto es el tipo (ej: VA, LP, TR, TO)
        
        yy = int(code[0:2])
        mm = int(code[2:4])
        dd = int(code[4:6])
        hh = int(code[6:8])
        mi = int(code[8:10])
        
        year = 2000 + yy
        date_str = f"{year:04d}-{mm:02d}-{dd:02d}"
        time_str = f"{hh:02d}:{mi:02d}:00"
        
        # Mapeo de códigos de tipo a subtipo volcánico
        subtype_map = {
            "GVA": "va",  # Volcano-Tectónico
            "GLP": "lp",  # Long Period
            "GTR": "tr",  # Tremor
            "GTO": "to",  # Tornillo
            "GHB": "hb",  # Hybrid
        }
        subtype = subtype_map.get(type_code.upper(), "")
        
        return {
            "date": date_str,
            "time": time_str,
            "subtype": subtype,
            "filename": filename,
        }
    except (ValueError, IndexError):
        return None


def load_json_metadata(filepath: Path) -> dict:
    """Carga metadatos del JSON procesado."""
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)
    return {
        "station": data.get("station", "CUFP"),
        "network": data.get("network", "CM"),
        "duration": data.get("duration", 0),
        "sampling_rate": data.get("samplingRate", 100),
    }


def main():
    print("=" * 70)
    print("Población de eventos del Galeras 2006 con datos MiniSEED")
    print("=" * 70)
    
    if not GALERAS_DIR.exists():
        print(f"ERROR: Directorio no encontrado: {GALERAS_DIR}")
        exit(1)
    
    # Leer index.json para ver qué eventos hay
    index_path = GALERAS_DIR / "index.json"
    if not index_path.exists():
        print(f"ERROR: index.json no encontrado en {GALERAS_DIR}")
        exit(1)
    
    with open(index_path, "r", encoding="utf-8") as f:
        index = json.load(f)
    
    events = index.get("events", [])
    print(f"\n✓ Encontrados {len(events)} eventos en index.json\n")
    
    inserted = 0
    updated = 0
    errors = 0
    
    for ev in events:
        event_id = ev["id"]
        label = ev.get("label", event_id)
        file_path = f"data/galeras/{event_id}.json"
        
        # Parsear fecha/hora del nombre de archivo
        parsed = parse_galeras_filename(f"{event_id}.json")
        if not parsed:
            print(f"⚠ {event_id}: formato de nombre inválido, saltando")
            errors += 1
            continue
        
        event_date = parsed["date"]
        event_time = parsed["time"]
        
        # Cargar metadatos del JSON
        json_path = GALERAS_DIR / f"{event_id}.json"
        if not json_path.exists():
            print(f"⚠ {event_id}: archivo JSON no encontrado, saltando")
            errors += 1
            continue
        
        try:
            metadata = load_json_metadata(json_path)
        except Exception as e:
            print(f"⚠ {event_id}: error leyendo JSON: {e}")
            errors += 1
            continue
        
        # Buscar si el evento ya existe en seismic_events
        try:
            result = supabase.table("seismic_events").select("event_id").eq("event_date", event_date).eq("event_time", event_time).execute()
            existing = result.data and len(result.data) > 0
        except Exception as e:
            print(f"⚠ {event_id}: error consultando Supabase: {e}")
            errors += 1
            continue
        
        if existing:
            # Actualizar evento existente
            try:
                supabase.table("seismic_events").update({
                    "mseed_available": True,
                    "mseed_file_path": file_path,
                    "mseed_station": metadata["station"],
                    "mseed_data_source": "galeras",
                }).eq("event_date", event_date).eq("event_time", event_time).execute()
                print(f"✓ {event_id}: actualizado ({event_date} {event_time})")
                updated += 1
            except Exception as e:
                print(f"✗ {event_id}: error actualizando: {e}")
                errors += 1
        else:
            # Insertar nuevo evento
            try:
                supabase.table("seismic_events").insert({
                    "event_date": event_date,
                    "event_time": event_time,
                    "location_name": "Volcán Galeras, Nariño",
                    "magnitude": ev.get("magnitude"),
                    "depth_km": ev.get("depth_km", 5.0),
                    "latitude": 1.2216,  # Coordenadas del Galeras
                    "longitude": -77.3742,
                    "event_type": "volcanic",
                    "volcanic_subtype": parsed.get("subtype", ""),
                    "source": "OVSP",
                    "mseed_available": True,
                    "mseed_file_path": file_path,
                    "mseed_station": metadata["station"],
                    "mseed_data_source": "galeras",
                    "notes": f"Registro triaxial estación {metadata['station']} ({metadata['network']}). Duración: {metadata['duration']:.1f}s, {metadata['sampling_rate']}Hz.",
                }).execute()
                print(f"✓ {event_id}: insertado ({event_date} {event_time})")
                inserted += 1
            except Exception as e:
                print(f"✗ {event_id}: error insertando: {e}")
                errors += 1
    
    print("\n" + "=" * 70)
    print(f"Resumen:")
    print(f"  Insertados: {inserted}")
    print(f"  Actualizados: {updated}")
    print(f"  Errores: {errors}")
    print("=" * 70)


if __name__ == "__main__":
    main()
