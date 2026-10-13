# Documentación del backend

Bienvenido a la documentación técnica del **backend** de SismoNariño, el
Simulador Triaxial de Pseudo-Sismogramas del subsuelo de Nariño (Colombia).

Esta sección describe la API REST y el motor de simulación, y la mayor parte de
la *Referencia del código* se genera automáticamente a partir de los docstrings
del propio código fuente.

!!! info "Otras secciones de la documentación"
    - **Backend** (esta sección): API y motor de simulación.
    - **Frontend**: componentes, hooks y tipos de la interfaz web.
    - **API**: referencia interactiva de solo lectura de los endpoints REST.

## Qué es el backend

El backend es una API REST construida con **FastAPI** sobre **Uvicorn**. Cumple
dos funciones principales:

1. **Simulación numérica.** Ejecuta el método de diferencias finitas (FDM) para
   la ecuación de onda elástica en 2D y devuelve pseudo-sismogramas triaxiales
   (componentes Norte, Este y Vertical) junto con métricas como las llegadas de
   las ondas P y S. El cálculo pesado se acelera con NumPy y Numba.
2. **Servicios de datos y utilidades.** Expone catálogos de estaciones, cálculo
   de tiempos de viaje, sismogramas sintéticos y lectura de formas de onda
   reales (MiniSEED) para el Mapa 3D, además de importación de catálogos
   QuakeML y procesamiento de archivos MiniSEED cargados por investigadores.

## Grupos de endpoints

| Grupo | Propósito |
|-------|-----------|
| Simulación | Ejecuta el FDM y calcula constantes elásticas (parámetros de Lamé). |
| Datos sísmicos | Consulta de eventos históricos y estadísticas. |
| Educación | Preguntas de quiz, datos de ondas y línea de tiempo. |
| Mapa 3D | Estaciones, tiempos de viaje, sismogramas sintéticos y formas de onda. |
| Importación | Carga de catálogos QuakeML y de archivos MiniSEED. |
| Contacto | Buzón de mensajes con control anti-spam. |

La referencia interactiva completa de cada endpoint está en la sección **API**.

## Diseño tolerante a fallos

Los endpoints de datos están pensados para no interrumpir la plataforma: cuando
el servicio de base de datos no está disponible, responden con datos de respaldo
en lugar de un error, de modo que la aplicación siga siendo utilizable.

## Cómo está organizada esta documentación

- [Arquitectura](arquitectura.md): vista de contexto, contenedores y componentes
  del backend (diagramas C4 en Mermaid).
- [Despliegue](despliegue.md): cómo se publica la plataforma, en términos
  generales y sin exponer secretos.
- [Pruebas por sprint](pruebas.md): cómo volver a ejecutar las pruebas
  automatizadas, organizadas por sprint.
- **Referencia del código**: documentación generada de los módulos del backend.
