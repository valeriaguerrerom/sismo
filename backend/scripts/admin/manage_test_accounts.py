"""
Gestiona las cuentas de PRUEBA (borrar y crear) para los tests de la auditoría.

Hace dos cosas, cada una con confirmación explícita por consola:

  1. BORRAR cuentas de prueba: se le pasan correos (uno por línea) y, tras
     mostrarlos enmascarados y pedir confirmación, los elimina de auth.users
     (la baja cascada al perfil). PROTECCIÓN: se niega a borrar cualquier cuenta
     cuyo rol en profiles sea 'admin'.

  2. CREAR dos cuentas de usuario normal (prueba1 / prueba2) con el ESQUEMA
     DERIVADO del frontend (PBKDF2), confirmando el correo (email_confirm=True)
     y marcando rol 'user'. La contraseña se pide por consola (oculta) y se
     deriva igual que en el navegador; NO se escribe en disco.

Seguridad:
    - Solo corre en local con SUPABASE_SERVICE_ROLE_KEY de backend/.env.
    - No borra administradores. Pide confirmación escribiendo 'BORRAR'.
    - No imprime contraseñas ni derivados.

Uso:
    cd backend
    py scripts/admin/manage_test_accounts.py

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

# Parámetros IDÉNTICOS a src/lib/passwordDerive.ts.
ITERATIONS = 310_000
KEY_BYTES = 32
SALT_PREFIX = "sismonarino:"

_POLICY = [
    (lambda p: len(p) >= 8, "al menos 8 caracteres"),
    (lambda p: bool(re.search(r"[a-zA-Z]", p)), "una letra"),
    (lambda p: bool(re.search(r"\d", p)), "un número"),
    (lambda p: bool(re.search(r"[^a-zA-Z0-9]", p)), "un símbolo"),
]


def derive_auth_secret(email: str, password: str) -> str:
    salt = (SALT_PREFIX + email.strip().lower()).encode("utf-8")
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, ITERATIONS, dklen=KEY_BYTES)
    return dk.hex()


def _mask(email: str) -> str:
    if "@" not in email:
        return email
    local, domain = email.split("@", 1)
    return f"{(local[0] if local else '?')}***@{domain}"


def _check_policy(password: str) -> list[str]:
    return [msg for ok, msg in _POLICY if not ok(password)]


def _all_users(sb) -> list:
    out, page = [], 1
    while True:
        res = sb.auth.admin.list_users(page=page, per_page=200)
        users = res if isinstance(res, list) else getattr(res, "users", res)
        if not users:
            break
        out.extend(users)
        if len(users) < 200:
            break
        page += 1
    return out


def _role_of(sb, user_id: str) -> str | None:
    rows = sb.table("profiles").select("role").eq("id", user_id).limit(1).execute().data or []
    return rows[0]["role"] if rows else None


def _delete_flow(sb) -> None:
    print("\n=== BORRAR CUENTAS DE PRUEBA ===")
    print("Escribe los correos a borrar, uno por línea. Línea vacía para terminar.")
    emails = []
    while True:
        line = input("  correo> ").strip()
        if not line:
            break
        emails.append(line.lower())
    if not emails:
        print("Nada que borrar.")
        return

    users_by_email = {}
    for u in _all_users(sb):
        em = (getattr(u, "email", "") or "").lower()
        users_by_email[em] = u

    objetivos = []
    for em in emails:
        u = users_by_email.get(em)
        if not u:
            print(f"  - {_mask(em)}: no existe, se omite.")
            continue
        uid = getattr(u, "id", "")
        role = _role_of(sb, uid)
        if role == "admin":
            print(f"  - {_mask(em)}: es ADMIN, NO se borra (protegido).")
            continue
        objetivos.append((em, uid))
        print(f"  - {_mask(em)}: rol '{role}' → marcada para borrar.")

    if not objetivos:
        print("No quedó ninguna cuenta válida para borrar.")
        return

    conf = input(f"\nSe borrarán {len(objetivos)} cuenta(s). Escribe 'BORRAR' para confirmar: ").strip()
    if conf != "BORRAR":
        print("Cancelado. No se borró nada.")
        return

    for em, uid in objetivos:
        sb.auth.admin.delete_user(uid)
        print(f"  borrada: {_mask(em)}")


def _create_one(sb, email: str) -> None:
    role_ok = email.strip().lower()
    faltan_email = "@" not in role_ok
    if faltan_email:
        print(f"  correo no válido: {_mask(email)}")
        return
    pw1 = getpass.getpass(f"  contraseña para {_mask(email)} (oculta): ")
    faltan = _check_policy(pw1)
    if faltan:
        print("  no cumple la política: falta " + ", ".join(faltan) + ". Se omite.")
        return
    secret = derive_auth_secret(role_ok, pw1)
    # Crea la cuenta ya confirmada y con rol 'user' en metadata; el trigger de
    # perfil (o el upsert del primer login) la reflejará en profiles.
    sb.auth.admin.create_user({
        "email": role_ok,
        "password": secret,
        "email_confirm": True,
        "user_metadata": {"full_name": email.split("@", 1)[0]},
    })
    pw1 = secret = ""
    print(f"  creada: {_mask(role_ok)} (rol user)")


def _create_flow(sb) -> None:
    print("\n=== CREAR CUENTAS DE PRUEBA (rol user) ===")
    n = input("¿Cuántas cuentas crear? (Enter = 2): ").strip()
    try:
        count = int(n) if n else 2
    except ValueError:
        count = 2
    for _ in range(count):
        email = input("  correo de la cuenta de prueba: ").strip()
        if email:
            _create_one(sb, email)


def main() -> None:
    url = os.getenv("SUPABASE_URL", "")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "") or os.getenv("SUPABASE_SERVICE_KEY", "")
    if not url or not key:
        sys.exit(
            "ERROR: falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en backend/.env.\n"
            "Este script solo se ejecuta en local con la service key; nunca en producción."
        )
    sb = create_client(url, key)

    print("¿Qué quieres hacer?")
    print("  1) Borrar cuentas de prueba")
    print("  2) Crear cuentas de prueba")
    print("  3) Borrar y luego crear")
    opt = input("Opción [1/2/3]: ").strip()
    if opt in ("1", "3"):
        _delete_flow(sb)
    if opt in ("2", "3"):
        _create_flow(sb)
    print("\nListo.")


if __name__ == "__main__":
    main()
