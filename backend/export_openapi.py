"""
Exporta el esquema OpenAPI de la API a un archivo JSON estático.

Se usa en el paso de build de la documentación para generar la referencia de la
API de **solo lectura** (Redoc) que se publica bajo /docs/api, sin necesidad de
un servidor en marcha ni de habilitar la documentación interactiva en producción.

    py export_openapi.py [ruta_salida]

Por defecto escribe en ``../public/docs/api/openapi.json`` (relativo a backend/).
Importa la aplicación FastAPI y vuelca ``app.openapi()``; no abre puertos ni
hace peticiones de red. Las credenciales no intervienen en la generación del
esquema.
"""
import json
import os
import sys
from pathlib import Path

# Generar siempre el esquema completo, con independencia del modo de ejecución.
os.environ.setdefault("APP_ENV", "development")


def main() -> None:
    """Genera y guarda el esquema OpenAPI en formato JSON."""
    # Importar aquí (no arriba) para que APP_ENV ya esté fijado antes de crear
    # la aplicación y sus routers.
    from main import app

    schema = app.openapi()

    if len(sys.argv) > 1:
        out_path = Path(sys.argv[1])
    else:
        out_path = Path(__file__).resolve().parent.parent / "public" / "docs" / "api" / "openapi.json"

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(schema, ensure_ascii=False, indent=2), encoding="utf-8")

    paths = schema.get("paths", {})
    print(f"OpenAPI escrito en {out_path} ({len(paths)} rutas)")


if __name__ == "__main__":
    main()
