# Auditoría de cumplimiento frente a la encuesta de evaluación

Este documento cruza cada escenario de prueba (E1 a E8) y cada dimensión de la
encuesta con lo que está realmente implementado en el código, con evidencia
(archivo y qué hace). Es una verificación de código, no una prueba en vivo.

**Alcance y límites de esta auditoría**

- Se verificó el código del repositorio (frontend `src/`, backend `backend/`,
  migraciones `supabase/migrations/`). No se probó el sitio en vivo
  `https://sismonarino.com`: la disponibilidad en línea, los tiempos de
  respuesta reales y la fluidez dependen del despliegue y no se pueden medir
  leyendo el código.
- Las afirmaciones de percepción (contraste visual, "transmite confianza",
  claridad pedagógica) no se "cumplen" en código; aquí se indica si hay base
  objetiva para una respuesta favorable.
- Convención de estado: **Cumple** (implementado y verificado), **Parcial**
  (implementado con un matiz o hueco), **Requiere prueba en vivo** (no
  verificable solo en código).

---

## 1. Escenarios de prueba (E1 a E8)

| Escenario | Estado | Evidencia (archivo · qué hace) |
|-----------|--------|--------------------------------|
| **E1.** Crear cuenta, iniciar sesión, cerrar sesión, recuperar contraseña | Cumple | `src/pages/Auth.tsx` (registro con nombre, correo, contraseña, consentimiento; login; "¿Olvidaste tu contraseña?"). `src/lib/auth.tsx`: `signUp`, `signIn`, `signOut`, `signInWithGoogle`, `sendPasswordReset` (`resetPasswordForEmail`), `updatePassword`. `src/pages/ResetPassword.tsx` + `recoveryMode` (evento `PASSWORD_RECOVERY`). Google OAuth incluido. |
| **E2.** Configurar y ejecutar una simulación con parámetros propios | Cumple | `src/components/simulation/ParametersPanel.tsx` edita Vp, Vs, densidad, magnitud, profundidad, duración, dx, tipo de fuente, estación (distancia y dirección) y mecanismo (strike/dip/rake). Ejecuta en el backend: `POST /api/simulate/full` (`src/lib/api.ts`). Resultados en 3 vistas (`WaveChart`, `TriaxialPlane`, `ParticleMotion`) + `ResultsPanel`. |
| **E3.** Guardar la simulación y descargar CSV, PNG y PDF | Cumple | Guardado en `simulation_reports` (`ResultsPanel.tsx` `handleSaveReport`, requiere sesión). Exportar: CSV (`exportCSV`, `text/csv`), PNG (`src/lib/exportImage.ts`, WebGL o html2canvas), PDF (`src/lib/reportPdf.ts` con jsPDF: parámetros, métricas, sismogramas, corte, partícula e interpretación, la misma que se ve en pantalla). Hay que guardar antes de exportar (`hasSaved`). Tests: `reportPdf.test`, `exportImage.test`, `csvSafe.test`, `MyReports.test`. |
| **E4.** Buscar un evento real en el Explorador, ver su sismograma y cargarlo en el Simulador | Cumple | `src/pages/Explorer.tsx`: fuentes Galeras y red CM/SGC con buscador y filtros (subtipo volcánico, región, magnitud mínima, filtro por estación en el mapa). Sismograma triaxial (`TriaxialPreview`, N/E/Z). Botón "Cargar en Simulador" → `onLoadRealData` → `App.tsx` arma los parámetros → `navigate('simulation')`. Mapa 2D Leaflet (`SeismicMap`). |
| **E5.** Descargar el archivo de ejemplo y cargarlo en Mi archivo MiniSEED | Cumple | Dos ejemplos reales descargables: `backend/example_data/ejemplo_CUM_tectonico.mseed` y `ejemplo_CUFP_volcanico.mseed`, servidos por `GET /api/examples/mseed/{kind}`; botones en `MseedUpload.tsx`. Carga: `POST /api/upload/mseed` (ObsPy; elige estación de la red, exige 3 componentes, filtra, normaliza, decima). Matiz: los ejemplos los sirve el backend (no son estáticos en `public/`), así que requieren el backend en ejecución. |
| **E6.** Cargar un evento en el Mapa 3D y reproducir la propagación | Cumple | `src/pages/Map3D.tsx`: modal de catálogo con filtros y paginación; `applyEvent` coloca epicentro y pide tiempos de viaje (`getTravelTimes`). Reproducir/Pausar con reloj `elapsed`; anillos P/S que se expanden (`Scene3D.tsx`); sismogramas por estación (`RecordSection`). Modelos homogéneo/IASP91 y vistas Norte/Corte/Superior. |
| **E7.** Ingresar datos inválidos (fuera de rango o archivo no MiniSEED) y observar la respuesta | Cumple | Parámetros fuera de rango: `validateParams` (`src/lib/paramLimits.ts`) recorta al valor válido y muestra un aviso dorado (no bloquea). Archivo no MiniSEED: el backend lo lee con ObsPy y, si falla, responde HTTP 400 "No se pudo leer el archivo como MiniSEED"; el frontend lo muestra en una caja roja. Estación fuera de la red → 422; faltan componentes → 422; vacío o >50 MB → 400; demasiadas cargas → 429. QuakeML también se valida. |
| **E8.** Recorrer la plataforma desde un teléfono o con la ventana reducida | Cumple (código) / Requiere prueba en vivo (render real) | Responsive con breakpoints sm/md/lg en todas las páginas clave; navbar con menú hamburguesa (`Navbar.tsx` `md:hidden`); el Simulador y el Mapa 3D apilan y colapsan paneles en móvil; la barra de capítulos de Educación se vuelve una fila deslizable. La verificación visual real en un teléfono la debe hacer la evaluadora. |

**Observaciones sobre los escenarios**

- E3: el CSV de la simulación contiene solo números (tiempo y tres
  componentes), por eso no pasa por el saneador anti inyección de fórmulas
  (`csvSafe.ts`), que sí se usa en las exportaciones del panel de administración.
- E5: si el backend no está en ejecución, la descarga del archivo de ejemplo
  falla (no es un archivo estático del frontend).
- E5/E7: el endpoint `POST /api/upload/mseed` no valida la sesión en el
  servidor; la restricción de "solo con sesión" es de la interfaz. No expone
  datos de otros usuarios (no persiste nada), pero conviene saberlo.

---

## 2. Dimensión Adecuación funcional

| Afirmación | Base objetiva |
|-----------|---------------|
| 1. Las funciones cubren simular y visualizar ondas | Sí: Simulador (FDM backend) + 3 visualizaciones + Explorador + Mapa 3D + Educación. |
| 2. Resultados completos y coherentes con lo ingresado | Sí: `ResultsPanel` muestra amplitud, arribos P/S, frecuencia dominante, Vp/Vs, impedancia, malla; derivados de los parámetros ingresados. |
| 3. Tareas sin pasos innecesarios | Sí, salvo el requisito deliberado de guardar antes de exportar (evita exportar algo no persistido). |
| 4. CSV, PNG y PDF coinciden con la pantalla | Sí: el PDF usa los mismos datos y la misma función de interpretación que la vista; PNG captura la vista activa. |

## 3. Dimensión Eficiencia de desempeño

Requiere prueba en vivo. El código muestra decisiones a favor del desempeño
(cómputo en backend con Numba, submuestreo de series a 600/1200/3000 puntos,
timeouts, carga incremental de sismogramas en el Mapa 3D), pero los tiempos de
respuesta y la fluidez reales dependen del servidor y del equipo del evaluador.

## 4. Dimensión Compatibilidad

| Afirmación | Base objetiva |
|-----------|---------------|
| 9. Funciona en el navegador/dispositivo usado | Requiere prueba en vivo (navegadores modernos; usa WebGL para el 3D). |
| 10. Los archivos (MiniSEED, CSV, PDF) abren en otros programas | Sí: formatos estándar. CSV `text/csv` (con BOM en exportes admin), PNG, PDF (jsPDF), XLSX (SheetJS), JSON; MiniSEED se lee con ObsPy. |
| 11. Inicio de sesión, carga de eventos y datos sin errores visibles | Sí en código (manejo de errores con fallback y mensajes claros); confirmación final requiere prueba en vivo. |

## 5. Dimensión Usabilidad

| Afirmación | Estado | Base objetiva |
|-----------|--------|---------------|
| 12. Interfaz intuitiva, módulos reconocibles | Cumple | Navbar con íconos y etiquetas; páginas separadas por módulo. |
| 13. Fácil de aprender sin capacitación | Cumple | Tours guiados (driver.js), tooltips, estados vacíos con instrucciones. |
| 14. Navegación clara y coherente | Cumple | SPA con transición y scroll al tope; protección de rutas. |
| 15. Mensajes de error claros | Cumple | Mensajes en español (`translateError`, `friendlyError`, validaciones de formulario y de archivo). |
| 16. Evita errores con límites, defaults y confirmaciones | Cumple | Rangos y autoajuste de parámetros; valores por defecto; modales de confirmación en acciones destructivas (borrar reporte, eliminar cuenta escribiendo el correo). |
| 17. Diseño visual consistente | Cumple | Tipografía Inter global; paleta fija (terracota, verde, oro, tinta); componentes UI reutilizables (Badge, Tooltip, Logo, Pagination, VolcanoLoader). |
| 18. Se adapta a pantallas de distinto tamaño | Cumple (código) | Breakpoints sm/md/lg en todas las páginas clave; navbar hamburguesa; paneles que colapsan/apilan. |
| 19. Accesible (contraste, textos legibles, teclado) | Parcial | Hay `aria-label` en botones de ícono, `alt` en imágenes, `aria-hidden` en SVG decorativos, `role="img"` en gráficos, teclado en Tooltip/Accordion y `prefers-reduced-motion`. No hay `aria-live`/`role="alert"` para errores dinámicos, y el contraste real de textos pequeños (`text-stone-400`) y el comportamiento con lector de pantalla requieren prueba con herramientas de accesibilidad. |

## 6. Dimensión Fiabilidad

| Afirmación | Base objetiva |
|-----------|---------------|
| 20. Estable sin fallos | Requiere prueba en vivo. El código tiene manejo defensivo (timeouts, fallback a datos locales, captura de errores). |
| 21. Ante entrada inválida informa y permite continuar sin perder lo hecho | Cumple: parámetros fuera de rango se autoajustan con aviso; el archivo inválido se rechaza con mensaje sin perder el estado. |
| 22. Disponible en línea cuando se necesita | Requiere prueba en vivo (depende del despliegue). |

## 7. Dimensión Seguridad

| Afirmación | Estado | Base objetiva |
|-----------|--------|---------------|
| 23. Registro, inicio y recuperación transmiten confianza | Cumple (código) | Flujos completos con Supabase Auth; la contraseña se deriva en el cliente (PBKDF2-SHA256, 310k iteraciones) y no viaja en texto plano; mensajes neutros que no revelan si un correo existe. |
| 24. Exige contraseñas seguras | Cumple | `PASSWORD_RULES`/`isPasswordStrong`: 8+ caracteres, letra, número y símbolo, validado en registro y cambio. (La protección de contraseñas filtradas y el mínimo del servidor se configuran en el panel de Supabase.) |
| 25. Cada usuario ve solo su información | Cumple | RLS: "Users manage own reports" (`auth.uid() = user_id`); rutas admin solo con `role = 'admin'`; triggers que impiden auto-promoción a admin. |
| 26. Rechaza archivos o datos inválidos con mensajes claros | Cumple | Validación de MiniSEED y QuakeML con ObsPy; parámetros con rango; mensajes en español. |
| 27. Informa sobre el tratamiento de datos personales | Parcial | Casilla de autorización (Ley 1581 de 2012) obligatoria en el registro y sección de privacidad en el perfil; el enlace apunta a la política institucional externa de la Universidad Mariana. No hay una página de política propia dentro de la app. |

---

## 8. Validez conceptual del modelo físico

El motor es un solver de la ecuación de onda **elástica 2D** (`backend/core/fdm.py`):
sistema P-SV acoplado más una ecuación escalar SH, diferencias finitas de 2.º
orden en espacio y tiempo (leapfrog explícito), estabilidad por CFL
(`dt ≤ dx/(Vp·√2)` con margen 0.9), fuente de Ricker o Gabor, bordes absorbentes
tipo Cerjan y superficie libre en z=0. Compilado con Numba.

| Afirmación | Estado | Base objetiva |
|-----------|--------|---------------|
| 1. Vp, Vs, densidad, λ, μ con unidades, rangos y relaciones coherentes | Cumple | Unidades mostradas (m/s, kg/m³); λ y μ en GPa con la fórmula correcta (`μ=ρ·Vs²`, `λ=ρ·Vp²−2μ`). Restricción `Vs < Vp/√2` validada. |
| 2. Método numérico adecuado con fines académicos | Cumple | FDM elástico 2.º orden con CFL, fuente Ricker/Gabor, Cerjan y superficie libre. |
| 3. Fuente tectónica y volcánica coherente con su mecanismo | Cumple | Tectónica: doble par con tensor de momento `moment_tensor(strike,dip,rake)` (convención Aki y Richards). Volcánica: fuente isótropa radial (no excita SH). |
| 4. Dos capas representa una capa blanda superficial | Cumple | Capa superficial con Vp/Vs/densidad y espesor propios sobre un semiespacio; interfaz plana con módulos promediados. Es una versión mínima (dos capas, interfaz horizontal). |
| 5. Modelos velocidad constante e IASP91 con alcances claros | Cumple | Selector en el Mapa 3D; en IASP91 se deshabilitan los sliders Vp/Vs y se indica que usa sus propias velocidades por capa. |
| 6. Se informan las simplificaciones | Cumple | Avisos repetidos: prototipo educativo que no sustituye al SGC; la geografía es solo referencia (no entra al cálculo); ubicaciones aproximadas; sin coda física en medio homogéneo. |

**Matiz honesto (importante para responder la encuesta):** el modelo es 2D, en
medio homogéneo o de dos capas planas, sin coda física real, y la latitud y
longitud no entran en el cálculo (solo la distancia y la dirección). La propia
plataforma lo declara de forma repetida. Las afirmaciones de validez física son
sostenibles con fines **académicos y educativos**, no como herramienta de
predicción operativa.

## 9. Coherencia de los resultados

| Afirmación | Estado | Base objetiva |
|-----------|--------|---------------|
| 7. Arribos P y S coherentes con distancia y velocidad | Cumple | Detección por STA comparada con `t = d/v` (tolerancia); si no coincide usa el teórico y lo marca con `*`. |
| 8. Relación Vp/Vs e impedancia coherentes | Cumple | Se muestran como métricas derivadas de los valores ingresados. |
| 9. Amplitud y duración coherentes con fuente y medio | Cumple (académico) | Dependen de magnitud, mecanismo y medio; duración acotada al primer rebote de borde para no mostrar reflexiones artificiales. |
| 10. Movimiento de partícula refleja la polarización P/S | Cumple | `ParticleMotion` (hodograma 3D): P longitudinal, S transversal, con color por fase. |
| 11. Al cambiar un parámetro, los resultados cambian en la dirección esperada | Cumple (académico) | El solver responde a Vp/Vs/densidad/magnitud/distancia de forma física. |
| 12. Semejanza razonable con registros reales | Parcial | Es un pseudo-sismograma de un medio simplificado; se parece en los arribos y el orden P-S-superficial, pero no reproduce la coda ni la complejidad real. El Explorador permite comparar con registros reales. |

## 10. Pertinencia de datos y contexto regional

| Afirmación | Estado | Base objetiva |
|-----------|--------|---------------|
| 13. Fuentes confiables citadas (SGC, OVSP, USGS) | Cumple | Catálogo con fuente por evento; Educación con `educationContent.ts` (regla de rigor, citas con DOI) y `docs/educacion-contenido.md`. |
| 14. Estaciones, eventos y sismicidad representativos | Cumple | Red del SGC en Nariño, eventos del Galeras y de la red CM. |
| 15. Señales reales con tres componentes y filtros | Cumple | `TriaxialPreview` N/E/Z y pasabanda configurable en la carga MiniSEED. |
| 16. Contextualizada en Nariño | Cumple | Galeras, fallas de Romeral y Afiladores, subducción de Nazca, historia sísmica local. |
| 17. El Mapa 3D facilita comprender la propagación | Cumple (código) | Escena 3D con anillos P/S y sismogramas por estación; la claridad percibida requiere prueba con usuarios. |

## 11. Aplicabilidad e intención pedagógica

Base objetiva: módulo Educación con 5 capítulos interactivos (ondas, magnitud,
profundidad, historia, metodología) más glosario, referencias y quiz; cada
capítulo se marca al completar su reto; el quiz da explicación y fuente por
pregunta. Contenido con fuentes verificadas. La utilidad real para enseñanza y
la recomendación son juicios del evaluador (prueba con usuarios).

---

## 12. Huecos y acciones sugeridas (priorizadas)

1. **Política de datos propia (Seguridad 27).** Hoy se enlaza a la política
   externa de la Universidad Mariana. Si la evaluación exige una política visible
   dentro de la plataforma, conviene una página propia de tratamiento de datos.
2. **Accesibilidad (Usabilidad 19).** Añadir `role="alert"`/`aria-live` a los
   mensajes de error de formularios y revisar el contraste de los textos
   pequeños en gris (`text-stone-400`) para cumplir WCAG AA. Requiere además una
   prueba con lector de pantalla y medidor de contraste.
3. **Sesión en la carga MiniSEED.** El endpoint `POST /api/upload/mseed` no
   valida la sesión en el servidor (solo la interfaz la oculta sin sesión). No
   filtra datos de otros usuarios, pero endurecerlo sería más seguro.
4. **Archivo de ejemplo dependiente del backend (E5).** Los ejemplos MiniSEED los
   sirve el backend; si se quiere que la descarga funcione sin backend, podrían
   publicarse también como estáticos en `public/`.
5. **Configuración server-side de Supabase.** El mínimo de contraseña y la
   protección de contraseñas filtradas se activan en el panel de Supabase, no en
   el repositorio: conviene confirmarlos antes de la evaluación.
6. **Pruebas en vivo.** Eficiencia (dimensión 2), disponibilidad (Fiabilidad 22),
   compatibilidad real por navegador (9) y la vista en móvil (E8) deben probarse
   en `https://sismonarino.com`, no se verifican en código.

## 13. Resumen

Los ocho escenarios (E1 a E8) están implementados y verificados en el código.
Las dimensiones de adecuación funcional, usabilidad, seguridad, validez del
modelo (con fines académicos) y pedagogía tienen base sólida. Quedan como
matices: la accesibilidad no es exhaustiva, la política de datos es externa, y
las dimensiones de desempeño, disponibilidad y la vista en móvil deben
confirmarse con una prueba en vivo. El modelo físico es un FDM elástico 2D
genuino y la plataforma es consistentemente honesta sobre sus simplificaciones.
