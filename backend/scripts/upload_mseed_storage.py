"""
Sube los MiniSEED crudos de backend/data_raw a un bucket PÚBLICO de Supabase
Storage (por defecto 'mseed-raw'). Se ejecuta UNA sola vez (no en cada
despliegue): los archivos quedan en Storage y el backend los lee por URL.

Conserva la ruta relativa de cada archivo como key del objeto, de modo que
coincida con lo que espera backend/api/waveforms.py:
    - CM (tectónicos):   Colombia/{event_id}.mseed  ·  Ecuador/{event_id}.mseed
    - Galeras (volcán.): datos_mseed/{lp,to,tr,va}/{event_id}/{canal}.mseed

Usa la API REST de Storage con `requests` (no supabase-py) porque el SDK antiguo
no valida el formato nuevo de la clave service_role. La clave
SUPABASE_SERVICE_KEY se lee de backend/.env (ignorado por git) y NUNCA se
hardcodea. La LECTURA del bucket es pública; la escritura requiere esta clave.

Uso:
    cd backend
    py scripts/upload_mseed_storage.py            # sube lo que falte
    py scripts/upload_mseed_storage.py --force    # re-sube todo (upsert)

Autores: Valeria Guerrero, Luisa Basante — Universidad Mariana, Nariño (2026)
"""
import os
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_RAW = BACKEND_DIR / "data_raw"
BUCKET = "mseed-raw"

load_dotenv(BACKEND_DIR / ".env")

URL = os.getenv("SUPABASE_URL", "").rstrip("/")
KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
HEADERS = {"Authorization": f"Bearer {KEY}", "apikey": KEY}


def ensure_bucket() -> bool:
    """Crea el bucket público si no existe. Devuelve True si está listo."""
    r = requests.get(f"{URL}/storage/v1/bucket", headers=HEADERS, timeout=30)
    r.raise_for_status()
    names = {b["name"] for b in r.json()}
    if BUCKET in names:
        print(f"[upload] Bucket '{BUCKET}' ya existe.")
        return True
    r = requests.post(
        f"{URL}/storage/v1/bucket", headers=HEADERS, timeout=30,
        json={"id": BUCKET, "name": BUCKET, "public": True},
    )
    if r.status_code in (200, 201):
        print(f"[upload] Bucket '{BUCKET}' creado (público).")
        return True
    print(f"[upload] Error creando bucket: {r.status_code} {r.text[:200]}")
    return False


def upload_one(key_path: str, data: bytes, force: bool) -> str:
    """Sube un objeto. Devuelve 'ok' | 'skip' | 'err'."""
    endpoint = f"{URL}/storage/v1/object/{BUCKET}/{key_path}"
    headers = {**HEADERS, "content-type": "application/octet-stream"}
    if force:
        headers["x-upsert"] = "true"
    r = requests.post(endpoint, headers=headers, data=data, timeout=120)
    if r.status_code in (200, 201):
        return "ok"
    # 409 = ya existe (cuando no forzamos): se considera ya subido.
    if r.status_code == 409:
        return "skip"
    print(f"  [error] {key_path}: {r.status_code} {r.text[:150]}")
    return "err"


def main():
    force = "--force" in sys.argv
    if not URL or not KEY:
        print("[upload] Falta SUPABASE_URL o SUPABASE_SERVICE_KEY en backend/.env")
        sys.exit(1)
    if not DATA_RAW.exists():
        print(f"[upload] No existe {DATA_RAW}")
        sys.exit(1)

    if not ensure_bucket():
        sys.exit(1)

    files = sorted(DATA_RAW.rglob("*.mseed"))
    total = len(files)
    if total == 0:
        print("[upload] No hay archivos .mseed en data_raw.")
        return
    print(f"[upload] {total} archivos .mseed -> bucket '{BUCKET}' (force={force})...")

    ok = skip = err = 0
    for i, f in enumerate(files, 1):
        key_path = f.relative_to(DATA_RAW).as_posix()
        try:
            res = upload_one(key_path, f.read_bytes(), force)
        except Exception as e:
            res = "err"
            print(f"  [error] {key_path}: {e}")
        if res == "ok":
            ok += 1
        elif res == "skip":
            skip += 1
        else:
            err += 1
        if i % 50 == 0 or i == total:
            print(f"  progreso {i}/{total}  (ok={ok} ya={skip} err={err})")

    print(f"[upload] Listo. Subidos={ok}  ya-existian={skip}  errores={err}")

    # Manifiesto público: lista de TODAS las rutas del bucket. El backend lo lee
    # (sin service key) para saber qué archivos hay por evento, ya que listar el
    # bucket requiere permisos que el anon no tiene en un bucket público.
    import json
    manifest = [f.relative_to(DATA_RAW).as_posix() for f in files]
    manifest_bytes = json.dumps(manifest, ensure_ascii=False).encode("utf-8")
    res = upload_one("manifest.json", manifest_bytes, force=True)  # siempre sobrescribe
    print(f"[upload] manifest.json ({len(manifest)} rutas): {res}")

    sample = files[0].relative_to(DATA_RAW).as_posix()
    print(f"[upload] URL publica de ejemplo:\n  {URL}/storage/v1/object/public/{BUCKET}/{sample}")
    print(f"[upload] Manifiesto:\n  {URL}/storage/v1/object/public/{BUCKET}/manifest.json")


if __name__ == "__main__":
    main()
