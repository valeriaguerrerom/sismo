#!/usr/bin/env python3
"""Verifica qué eventos tienen mseed_available=true."""
import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

supabase = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_ANON_KEY"))

print("Eventos con datos MiniSEED disponibles:\n")
result = supabase.table("seismic_events").select(
    "event_id, event_date, event_time, location_name, mseed_available, mseed_station, mseed_file_path"
).eq("mseed_available", True).order("event_date").execute()

if not result.data:
    print("NO hay eventos con mseed_available=true")
    print("\nEjecuta: py populate_galeras_events.py")
else:
    print(f"{len(result.data)} eventos encontrados:\n")
    for r in result.data:
        print(f"{r['event_date']} {r['event_time']} - {r['location_name']}")
        print(f"  Estación: {r['mseed_station']}, Archivo: {r['mseed_file_path']}\n")
