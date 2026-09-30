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


WINDOW_SECONDS = 120.0  # ventana total alrededor del sismo


def main() -> None:
    import numpy as np

    if not RAW.exists():
        print(f"No existe {RAW.resolve()}")
        return
    st = read(str(RAW))
    cum = st.select(station="CUM")
    if len(cum) == 0:
        print("El evento no tiene estación CUM; elige otro.")
        print("Estaciones disponibles:", sorted({tr.stats.station for tr in st}))
        return

    # Recorte a ~120 s CENTRADOS en el sismo. Ubicamos el pico de energía en la
    # componente vertical de mayor tasa y tomamos 20 s antes y 100 s después
    # (cubre llegada + coda). Se recorta CONSERVANDO todas las trazas (el
    # velocímetro EH y el acelerómetro HN), para que el ejemplo muestre ambos.
    ref = max(cum, key=lambda tr: tr.stats.sampling_rate)  # traza de más muestras
    env = np.abs(ref.data.astype(float))
    i_peak = int(np.argmax(env))
    t_peak = ref.stats.starttime + i_peak / ref.stats.sampling_rate
    t0 = t_peak - 20.0
    t1 = t0 + WINDOW_SECONDS
    # No salir de los límites reales de los datos.
    data_start = max(tr.stats.starttime for tr in cum)
    data_end = min(tr.stats.endtime for tr in cum)
    t0 = max(t0, data_start)
    t1 = min(t1, data_end)
    cum = cum.slice(t0, t1)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    cum.write(str(OUT), format="MSEED")
    size_kb = OUT.stat().st_size / 1024
    chans = sorted({tr.stats.channel for tr in cum})
    dur = float(min(tr.stats.endtime for tr in cum) - max(tr.stats.starttime for tr in cum))
    print(f"Escrito: {OUT.resolve()}")
    print(f"  Estación: CUM · canales: {', '.join(chans)} · {size_kb:.0f} KB")
    print(f"  Trazas: {len(cum)} · red: {cum[0].stats.network} · duración: {dur:.0f} s")


if __name__ == "__main__":
    main()
