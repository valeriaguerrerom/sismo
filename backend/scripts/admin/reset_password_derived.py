"""
Restablece la contraseña de una cuenta con el ESQUEMA DERIVADO del frontend.

Desde que SismoNariño deriva la contraseña en el cliente (PBKDF2, ver
src/lib/passwordDerive.ts), lo que Supabase guarda ya no es la contraseña real
sino su derivado. Las cuentas creadas ANTES de ese cambio dejan de poder entrar.
Este script las restablece: deriva la nueva contraseña con el MISMO esquema y la
fija con la API de administración de Supabase.

Seguridad:
    - Solo corre en LOCAL con la service key (SUPABASE_SERVICE_ROLE_KEY de .env).
    - La nueva contraseña se pide por consola de forma OCULTA (getpass): nunca
      como argumento, ni en un archivo, ni en el historial del shell.
    - El correo se pide por consola; no se hardcodea.
    - No imprime la contraseña ni el derivado.

Uso:
    cd backend
    py scripts/admin/reset_password_derived.py
    # pide: correo, luego la nueva contraseña (oculta, dos veces).

Para cuentas que no son del administrador ni de prueba, NO uses este script:
el camino correcto es "¿Olvidaste tu contraseña?" en la propia aplicación.

Autores: Valeria Guerrero, Luisa Basante — Universidad Mariana, Nariño (2026)
"""
import getpass
import hashlib
import os
import re
import sys
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

# backend/ está tres niveles arriba (scripts/admin/este_archivo.py).
BACKEND_DIR = Path(__file__).resolve().parents[2]
load_dotenv(BACKEND_DIR / ".env")

# Parámetros IDÉNTICOS a src/lib/passwordDerive.ts. No cambiar sin migrar.
ITERATIONS = 310_000
KEY_BYTES = 32
SALT_PREFIX = "sismonarino:"

# Política mínima (coincide con authConsent.ts: 8+, letra, número, símbolo).
_POLICY = [
    (lambda p: len(p) >= 8, "al menos 8 caracteres"),
    (lambda p: bool(re.search(r"[a-zA-Z]", p)), "una letra"),
    (lambda p: bool(re.search(r"\d", p)), "un número"),
    (lambda p: bool(re.search(r"[^a-zA-Z0-9]", p)), "un símbolo"),
]


def derive_auth_secret(email: str, password: str) -> str:
    """Replica deriveAuthSecret del frontend (PBKDF2-SHA256, 310k, 32 bytes hex)."""
    salt = (SALT_PREFIX + email.strip().lower()).encode("utf-8")
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, ITERATIONS, dklen=KEY_BYTES)
    return dk.hex()


def _check_policy(password: str) -> list[str]:
    return [msg for ok, msg in _POLICY if not ok(password)]


def _find_user_id(sb, email: str) -> str | None:
    """Busca el id del usuario por correo recorriendo auth.users (admin API)."""
    target = email.strip().lower()
    page = 1
    while True:
        res = sb.auth.admin.list_users(page=page, per_page=200)
        users = res if isinstance(res, list) else getattr(res, "users", res)
        if not users:
            return None
        for u in users:
            if (getattr(u, "email", "") or "").lower() == target:
                return getattr(u, "id", None)
        if len(users) < 200:
            return None
        page += 1


def main() -> None:
    url = os.getenv("SUPABASE_URL", "")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "") or os.getenv("SUPABASE_SERVICE_KEY", "")
    if not url or not key:
        sys.exit(
            "ERROR: falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en backend/.env.\n"
            "Este script solo se ejecuta en local con la service key; nunca en producción."
        )

    email = input("Correo de la cuenta a restablecer: ").strip()
    if "@" not in email:
        print("Correo no válido.")
        sys.exit(1)

    pw1 = getpass.getpass("Nueva contraseña (no se mostrará): ")
    faltan = _check_policy(pw1)
    if faltan:
        print("La contraseña no cumple la política: falta " + ", ".join(faltan) + ".")
        sys.exit(1)
    pw2 = getpass.getpass("Repite la nueva contraseña: ")
    if pw1 != pw2:
        print("Las contraseñas no coinciden.")
        sys.exit(1)

    sb = create_client(url, key)
    user_id = _find_user_id(sb, email)
    if not user_id:
        print("No se encontró una cuenta con ese correo.")
        sys.exit(1)

    # Se fija el DERIVADO (no la contraseña real), igual que haría el navegador.
    secret = derive_auth_secret(email, pw1)
    sb.auth.admin.update_user_by_id(user_id, {"password": secret})

    # Limpieza defensiva de variables sensibles.
    pw1 = pw2 = secret = ""
    print("Contraseña restablecida con el esquema derivado. La cuenta ya puede iniciar sesión.")


if __name__ == "__main__":
    main()
