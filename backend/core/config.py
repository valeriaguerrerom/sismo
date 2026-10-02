"""
Configuración por entorno (seguridad).
=======================================

Centraliza el endurecimiento del backend según el entorno de ejecución para que
tanto ``main.py`` como los routers de ``api/`` compartan el mismo criterio sin
duplicar lógica.

APP_ENV controla el comportamiento:
    - "development" (por defecto): orígenes CORS locales, detalles de error
      visibles y documentación interactiva habilitada.
    - "production": CORS restringido a ALLOWED_ORIGINS, detalles de error
      ocultos y documentación deshabilitada.

Autores: Valeria Guerrero, Luisa Basante — Universidad Mariana, Nariño (2026)
"""
import os

APP_ENV = os.getenv("APP_ENV", "development").strip().lower()
IS_PRODUCTION = APP_ENV == "production"


def safe_error_detail(exc: Exception, mensaje_publico: str) -> str:
    """Devuelve el detalle de error adecuado al entorno.

    En producción oculta el mensaje interno de la excepción (puede filtrar rutas,
    nombres de tablas o trazas) y devuelve solo un mensaje genérico. En desarrollo
    incluye el detalle real para facilitar la depuración.

    Args:
        exc: La excepción capturada.
        mensaje_publico: Mensaje genérico seguro para mostrar al usuario final.

    Returns:
        str: El mensaje a exponer en la respuesta HTTP.
    """
    if IS_PRODUCTION:
        return mensaje_publico
    return f"{mensaje_publico}: {exc}"
