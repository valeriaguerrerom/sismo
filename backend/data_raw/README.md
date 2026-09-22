# Datos Sísmicos Crudos — Red CM (Colombia)

Esta carpeta contiene archivos MiniSEED de la Red Sismológica Nacional de Colombia (red CM),
descargados del servicio de datos del SGC. **No se versionan** porque ocupan ~215 MB.

## Estructura

```
data_raw/
├── Col_full/      89 eventos — Colombia, catálogo completo
├── Colombia/      23 eventos — Colombia, selección regional
├── Ecuador/       22 eventos — frontera sur, red CM con cobertura binacional
└── README.md      Este archivo
```

## Origen de los datos

- **Fuente**: Servicio Geológico Colombiano (SGC) / Red Sismológica Nacional de Colombia (RSNC)
- **Red**: CM (código FDSN)
- **Formato**: MiniSEED (IEEE 32-bit float o STEIM2)
- **Nomenclatura**: `CM_M<magnitud>_<fecha>T<hora>.mseed`
  - Ejemplo: `CM_M6.3_2025-04-25T11-44-52.mseed`
- **Contenido por archivo**: 30–36 trazas (múltiples estaciones × 3 componentes, posiblemente varios instrumentos por estación)

## Tipos de instrumento presentes

| Prefijo canal | Tipo | Magnitud física registrada |
|---------------|------|----------------------------|
| HN, HL        | Acelerómetro (strong motion) | Aceleración (m/s²) |
| HH            | Velocímetro broadband (alta ganancia, alta tasa) | Velocidad (m/s) |
| BH            | Velocímetro broadband (baja tasa) | Velocidad (m/s) |
| EH            | Velocímetro short period (alta tasa) | Velocidad (m/s) |

## Por qué no se versionan

- ~215 MB en total (89 + 23 + 22 = 134 archivos)
- Datos binarios que no se benefician de diff
- Disponibles para descarga desde el SGC bajo demanda

## Cómo poblar esta carpeta

Copiar los archivos .mseed manualmente desde la fuente original:

```bash
# Ejemplo (ajustar rutas)
cp /ruta/a/Col_full/*.mseed backend/data_raw/Col_full/
cp /ruta/a/Colombia/*.mseed backend/data_raw/Colombia/
cp /ruta/a/Ecuador/*.mseed backend/data_raw/Ecuador/
```

## Procesamiento

Usar `backend/inventory_mseed.py` para generar un inventario sin modificar los datos:

```bash
cd backend
py inventory_mseed.py
```

El procesamiento y conversión a JSON se implementará en una etapa posterior.
