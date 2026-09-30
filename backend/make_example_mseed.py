"""
Genera un MiniSEED de EJEMPLO pequeño (una sola estación, tres componentes)
para el tutorial "¿Cómo consigo un archivo MiniSEED?" del Explorador.

Toma un evento tectónico corto de la red CM, se queda solo con la estación CUM
(Cumbal, Nariño) y sus tres componentes, y escribe un .mseed liviano. Ese
archivo se sube luego a Supabase Storage (bucket público) y el botón
"Descargar archivo de ejemplo" apunta a su URL pública.

Uso:
    cd backend
    py make_example_mseed.py

Salida:
    backend/example_data/ejemplo_CUM_tectonico.mseed
"""
from pathlib import Path

from obspy import read

# Evento corto con estación CUM (ML 2.5, 2023-10-17), ~21 s.
RAW = Path("data_raw/Colombia/CM_M2.5_2023-10-17T14-39-45.mseed")
OUT_DIR = Path("example_data")
OUT = OUT_DIR / "ejemplo_CUM_tectonico.mseed"


def main() -> None:
    if not RAW.exists():
        print(f"No existe {RAW.resolve()}")
        return
    st = read(str(RAW))
    cum = st.select(station="CUM")
    if len(cum) == 0:
        print("El evento no tiene estación CUM; elige otro.")
        print("Estaciones disponibles:", sorted({tr.stats.station for tr in st}))
        return
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    cum.write(str(OUT), format="MSEED")
    size_kb = OUT.stat().st_size / 1024
    chans = sorted({tr.stats.channel for tr in cum})
    print(f"Escrito: {OUT.resolve()}")
    print(f"  Estación: CUM · canales: {', '.join(chans)} · {size_kb:.0f} KB")
    print(f"  Trazas: {len(cum)} · red: {cum[0].stats.network}")


if __name__ == "__main__":
    main()
