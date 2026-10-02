"""
Tests de control de acceso de los endpoints de administración (sin cuentas reales).

Cubren:
  - Sin sesión (sin header Authorization) -> 401.
  - Token presente pero de un usuario con rol 'user' -> 403.
  - El borrado de la propia cuenta sin token -> 401.

Los escenarios con sesión usan monkeypatch para simular la verificación del
token y la consulta de rol, sin depender de Supabase. La verificación EN VIVO
contra Supabase real (IDOR entre prueba1/prueba2, escalada de rol en profiles)
vive en backend/scripts/admin/verify_access_control.py.
"""
import api.account as account
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_admin_delete_user_sin_sesion_es_401():
    r = client.request("DELETE", "/api/admin/users/00000000-0000-0000-0000-000000000000")
    assert r.status_code == 401


def test_delete_own_account_sin_sesion_es_401():
    r = client.request("DELETE", "/api/account")
    assert r.status_code == 401


def test_admin_delete_user_con_usuario_normal_es_403(monkeypatch):
    """Un token válido de rol 'user' no puede usar el endpoint de admin."""

    class _FakeTable:
        def select(self, *a, **k): return self
        def eq(self, *a, **k): return self
        def single(self): return self
        def execute(self):
            # Simula que el perfil del que llama tiene rol 'user'.
            return type("R", (), {"data": {"role": "user"}})()

    class _FakeAdmin:
        def table(self, *a, **k): return _FakeTable()

    class _FakeAnon:
        pass

    # El que llama queda identificado como un usuario cualquiera...
    monkeypatch.setattr(account, "_verified_user_id", lambda anon, token: "caller-user-id")
    # ...y los clientes anon/admin se simulan (no se toca Supabase).
    monkeypatch.setattr(account, "_admin_clients", lambda: (_FakeAnon(), _FakeAdmin()))

    r = client.request(
        "DELETE",
        "/api/admin/users/22222222-2222-2222-2222-222222222222",
        headers={"Authorization": "Bearer token-de-usuario-normal"},
    )
    assert r.status_code == 403
    assert "administrador" in r.json()["detail"].lower()
