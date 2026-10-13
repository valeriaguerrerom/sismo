# Pruebas por sprint

La plataforma cuenta con pruebas automatizadas en tres herramientas:

- **Vitest** — pruebas unitarias del frontend.
- **pytest** — pruebas del backend.
- **Playwright** — pruebas de extremo a extremo (navegador).

Las pruebas se organizan por **sprint** (1 a 16), cada uno asociado a una o
varias historias de usuario (HU). Esta página resume cómo volver a ejecutarlas.

## Preparación (una sola vez)

```powershell
# Dependencias
pnpm install

# Para las pruebas de extremo a extremo (Playwright):
# 1) Compilar el frontend
pnpm build
# 2) Servir el frontend en el puerto 8080 (dejar la terminal abierta)
pnpm exec vite preview --port 8080 --host
# 3) En otra terminal, levantar el backend en el puerto 8000
cd backend ; py -m uvicorn main:app --port 8000
```

!!! note "Entorno de las pruebas de extremo a extremo"
    Playwright se ejecuta en Chromium y en serie (`--project=chromium
    --workers=1`). Las pruebas son de lectura o escriben únicamente datos de la
    propia cuenta de prueba, que luego se limpian. Algunos casos se omiten a
    propósito (flujos que requieren OAuth real, envío de correo real, una cuenta
    administradora o escrituras en producción) y quedan documentados como
    omitidos en la evidencia de cada sprint.

## Cómo ejecutar un sprint

Cada sprint se corre con uno o varios de estos comandos, según las herramientas
que use. Ejemplos representativos:

=== "Vitest (frontend)"

    ```powershell
    pnpm exec vitest run src/lib/sprint04.test.ts --reporter=verbose
    ```

=== "pytest (backend)"

    ```powershell
    cd backend ; py -m pytest tests/test_sprint04.py -v
    ```

=== "Playwright (E2E)"

    ```powershell
    $env:E2E_ENV='local'; pnpm exec playwright test e2e/sprint03.spec.ts --project=chromium --workers=1
    ```

Sustituye el número de sprint en el nombre del archivo para ejecutar otro
sprint. Los sprints que combinan herramientas se corren con un comando por cada
una.

## Resumen por sprint

| Sprint | Historias de usuario | Herramientas |
|-------:|----------------------|--------------|
| 1 | HU005, HU006 | Vitest + pytest |
| 2 | HU007 | pytest |
| 3 | HU008, HU024 | Playwright |
| 4 | HU043, HU038, HU023 | Vitest + pytest |
| 5 | HU010, HU016, HU011 | Vitest + Playwright |
| 6 | HU001, HU002, HU003, HU013 | Playwright |
| 7 | HU009 | Vitest |
| 8 | HU026, HU027 | Vitest |
| 9 | HU034, HU025 | Vitest + pytest |
| 10 | HU015, HU014, HU017 | Vitest |
| 11 | HU019, HU028 | Vitest |
| 12 | HU021, HU022, HU037, HU004 | pytest + Playwright |
| 13 | HU012, HU018, HU020, HU041 | Vitest |
| 14 | HU029, HU040, HU031, HU042 | pytest + Vitest + Playwright |
| 15 | HU032, HU033, HU039, HU030 | pytest + Playwright |
| 16 | HU035, HU036 | Playwright |

## Correr todas las pruebas

```powershell
# Vitest (todo el frontend)
pnpm exec vitest run

# pytest (todo el backend)
cd backend ; py -m pytest -q
```

## Totales acumulados (Sprints 1–16)

| Alcance | Casos | Ejecutados | Aprobados | Omitidos |
|---------|------:|-----------:|----------:|---------:|
| Sprint 1 | 14 | 14 | 14 | 0 |
| Sprints 2–16 | 164 | 133 | 133 | 31 |
| **Total** | **178** | **147** | **147** | **31** |

Los casos omitidos lo son por restricciones del entorno de prueba (sin un
servicio de datos de pruebas aparte, sin OAuth/SMTP reales automatizables y sin
cuenta administradora), no por fallos. Cada omisión queda justificada en la
evidencia del sprint correspondiente.
