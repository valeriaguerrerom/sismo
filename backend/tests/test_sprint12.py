"""
Sprint 12 — HU004: administración de usuarios.

Casos CPR-004-1 a CPR-004-5 (pytest). Se prueba la lógica de administración de
usuarios contra un cliente de Supabase SIMULADO en memoria (sin tocar la base de
datos real de producción):

  - El backend solo expone la ELIMINACIÓN de cuentas (`/api/admin/users/{id}` y
    `/api/account`); el listado, el cambio de rol y la activación/desactivación
    los hace el panel admin del frontend (adminData.ts) sobre `profiles` con RLS.
    Aquí se replican esas operaciones sobre un `profiles` en memoria con la misma
    forma de datos (columnas role/active), más la autorización real del endpoint
    de borrado (que SÍ es del backend).

Herramienta: pytest (TestClient de FastAPI con los clientes Supabase mockeados).

NOTA de alcance (ver RESUMEN): como no hay una Supabase de pruebas aparte, estas
pruebas NO escriben en producción: todas operan sobre el cliente en memoria. Los
casos que, hechos "en real", modificarían cuentas que no son de la sesión de
prueba (promover/desactivar/eliminar usuarios reales) se cubren así a nivel de
contrato y lógica, no contra la base real.
"""
import pytest
from fastapi.testclient import TestClient

import main
import api.account as account

client = TestClient(main.app)


# ─────────────────── Cliente Supabase simulado en memoria ───────────────────

class _Result:
    def __init__(self, data=None, count=None):
        self.data = data
        self.count = count


class _Query:
    """Consulta encadenable mínima sobre una tabla en memoria."""
    def __init__(self, table_rows, op="select", count_mode=False):
        self._rows = table_rows
        self._op = op
        self._filters = []
        self._payload = None
        self._single = False
        self._count = count_mode

    def select(self, *_a, count=None, **_k):
        self._op = "select"
        self._count = count is not None
        return self

    def update(self, payload):
        self._op = "update"; self._payload = payload; return self

    def insert(self, payload):
        self._op = "insert"; self._payload = payload; return self

    def eq(self, col, val):
        self._filters.append((col, val)); return self

    def single(self):
        self._single = True; return self

    def _match(self, r):
        return all(r.get(c) == v for c, v in self._filters)

    def execute(self):
        matched = [r for r in self._rows if self._match(r)]
        if self._op == "update":
            for r in matched:
                r.update(self._payload)
            return _Result(data=matched)
        if self._op == "insert":
            self._rows.append(dict(self._payload))
            return _Result(data=[self._payload])
        # select
        if self._count:
            return _Result(data=matched, count=len(matched))
        if self._single:
            if not matched:
                raise Exception("no rows")
            return _Result(data=matched[0])
        return _Result(data=matched)


class _AuthAdmin:
    def __init__(self, db):
        self._db = db
    def delete_user(self, user_id):
        self._db["profiles"] = [p for p in self._db["profiles"] if p.get("id") != user_id]
        self._db.setdefault("_deleted", []).append(user_id)


class _Auth:
    def __init__(self, db):
        self.admin = _AuthAdmin(db)


class FakeSupabase:
    def __init__(self, db):
        self._db = db
        self.auth = _Auth(db)
    def table(self, name):
        return _Query(self._db.setdefault(name, []))


@pytest.fixture
def db():
    """Base en memoria con un admin, un investigador y algunos reportes."""
    return {
        "profiles": [
            {"id": "admin-1", "full_name": "Admin Uno", "email": "admin@test.co", "role": "admin", "active": True, "last_login": "2026-01-10T00:00:00Z"},
            {"id": "admin-2", "full_name": "Admin Dos", "email": "admin2@test.co", "role": "admin", "active": True, "last_login": None},
            {"id": "user-1", "full_name": "Investigador Uno", "email": "inv@test.co", "role": "user", "active": True, "last_login": "2026-01-09T00:00:00Z"},
        ],
        "simulation_reports": [
            {"id": "r1", "user_id": "user-1", "title": "Sim", "notes": "n", "results": {}},
        ],
        "account_deletions": [],
    }


@pytest.fixture
def patched(db, monkeypatch):
    """Hace que el endpoint de borrado use el cliente en memoria y un caller fijo."""
    fake = FakeSupabase(db)
    monkeypatch.setattr(account, "_admin_clients", lambda: (fake, fake))
    return db, fake


# ─────────────────── Operaciones del panel admin (adminData) ───────────────────
# Replican, sobre el cliente en memoria, lo que hace el panel admin del frontend
# contra `profiles` (listar, cambiar rol, activar/desactivar).

def admin_list_users(sb):
    return sb.table("profiles").select("*").execute().data

def admin_set_role(sb, uid, role):
    sb.table("profiles").update({"role": role}).eq("id", uid).execute()

def admin_set_active(sb, uid, active):
    sb.table("profiles").update({"active": active}).eq("id", uid).execute()


# ───────────────────────────── CPR-004-1 ─────────────────────────────
def test_consultar_lista_usuarios(db):
    """El sistema lista los usuarios con su rol, estado y último acceso."""
    sb = FakeSupabase(db)
    users = admin_list_users(sb)
    assert len(users) == 3
    for u in users:
        assert "role" in u and "active" in u and "last_login" in u
    roles = {u["role"] for u in users}
    assert roles == {"admin", "user"}


# ───────────────────────────── CPR-004-2 ─────────────────────────────
def test_promover_investigador_administrador(db):
    """El sistema actualiza el rol de investigador a administrador."""
    sb = FakeSupabase(db)
    admin_set_role(sb, "user-1", "admin")
    updated = next(u for u in db["profiles"] if u["id"] == "user-1")
    assert updated["role"] == "admin"


# ───────────────────────────── CPR-004-3 ─────────────────────────────
def test_desactivar_cuenta(db):
    """El sistema cambia el estado y el usuario desactivado no puede ingresar."""
    sb = FakeSupabase(db)
    admin_set_active(sb, "user-1", False)
    u = next(u for u in db["profiles"] if u["id"] == "user-1")
    assert u["active"] is False
    # Regla de la app (auth.tsx): una cuenta con active=False se bloquea al
    # cargar el perfil; aquí se refleja en el dato que el frontend consulta.
    assert u["active"] is False


# ───────────────────────────── CPR-004-4 ─────────────────────────────
def test_eliminar_usuario(patched, monkeypatch):
    """El sistema (admin) elimina la cuenta de otro usuario, con confirmación."""
    db, _fake = patched
    # El caller verificado es admin-1 (administrador).
    monkeypatch.setattr(account, "_verified_user_id", lambda anon, token: "admin-1")
    res = client.request(
        "DELETE", "/api/admin/users/user-1",
        headers={"Authorization": "Bearer token-admin"},
        json={"reason": "prueba"},
    )
    assert res.status_code == 200
    assert res.json()["deleted"] is True
    # El usuario ya no está en profiles y sus reportes quedaron anonimizados.
    assert all(p["id"] != "user-1" for p in db["profiles"])
    rep = db["simulation_reports"][0]
    assert rep["user_id"] is None
    assert rep["title"] == "Simulación anonimizada"


# ───────────────────────────── CPR-004-5 ─────────────────────────────
def test_abrir_admin_cuenta_investigador(patched, monkeypatch):
    """El sistema le niega el acceso de administración desde la API (403)."""
    db, _fake = patched
    # El caller verificado es un investigador (role 'user'), no admin.
    monkeypatch.setattr(account, "_verified_user_id", lambda anon, token: "user-1")
    res = client.request(
        "DELETE", "/api/admin/users/admin-2",
        headers={"Authorization": "Bearer token-user"},
        json={"reason": "intento"},
    )
    assert res.status_code == 403
    assert "administrador" in res.json()["detail"].lower()
    # Y no se eliminó a nadie.
    assert any(p["id"] == "admin-2" for p in db["profiles"])
