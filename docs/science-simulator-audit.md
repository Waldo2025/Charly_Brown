# Auditoría de simuladores científicos · 24 septiembre 2026

## Alcance y evidencia

El catálogo contiene **180 perfiles** (56 de Física, 41 de Química, 41 de Biología y 42 de Matemáticas). Tras la corrección usa **86 modelos distintos**; el runtime registra 92, incluidos modelos de compatibilidad. El catálogo exportado `SCIENCE_TOPIC_CATALOG` es la fuente para enumerarlos sin mantener otra lista de pruebas.

La evidencia se guarda en `artifacts/science-audit-20260924/`:

- `audit.json`: matriz parametrizada de **2,160 casos**: 180 perfiles × escritorio/móvil × sin imágenes/imágenes disponibles/imágenes fallidas × preview/módulo empaquetado con estilo exportado. Resultado: **2,160 aprobados, 0 fallos y 0 errores de página**.
- `screenshots/`: dos capturas por perfil y tamaño: zona científica y sufijo `-controls` después de desplazar hasta los controles. Las imágenes son de la zona visible del laboratorio, que dispone de desplazamiento interno.
- `targeted-final-audit.json`: **60/60 aprobados, 0 fallos y 0 errores de página**, cinco perfiles (Pascal y cuatro variantes de tabla periódica), ambos tamaños/superficies y los tres estados de imágenes; verifica desplazamiento al carbono desde el control y accesibilidad de la región.
- `profiles.json`: inventario de los 180 perfiles, controles, medición inicial, fidelidad y supuestos.
- `keyboard-audit.json`: **360 aprobados, 0 fallos y 0 errores de página**: foco nativo, flecha en control y Enter para ejecutar/pausar/reiniciar, en los 180 perfiles de ambos tamaños.
- `generated-sandbox.json`: **5 comprobaciones aprobadas** de pruebas reales de aislamiento del iframe, comandos, telemetría, rechazo de emisor ajeno y destrucción.

La suite científica terminó con **192/192 pruebas aprobadas**. La [inspección visual](../artifacts/science-audit-20260924/visual-inspection.md) registra revisión de las 12 hojas de contacto y detalles seleccionados; no equivale a inspección humana ampliada de cada captura ni a validación por especialista de cada modelo.

**Trazabilidad de versiones:** `audit.json` conserva el hash original `f3f38cc1ac11babc881d77752d4ea08930be85d215a1f4aeba51f23375152471`. Durante la ejecución se restringió la etiqueta hidráulica de seguridad a `model === "fluid"` (antes bastaba `Number.isFinite(m.outputForce)`), para no atribuir válvula de alivio/carga al modelo ideal Pascal. `keyboard-audit.json` corresponde al runtime posterior `2d44fab78762464d5311911b9fb0ff23cd90bbfdb2ed3f00f0ce6316eb8e39bc`. Después se agregó navegación visible/enfocable y autodesplazamiento de la tabla periódica. `targeted-final-audit.json` documenta estas dos correcciones sobre la versión final; no se sobrescriben los hashes anteriores ni se afirma que toda la matriz se repitiera tras cambios puntuales de presentación.

Comandos reproducibles:

```sh
node --test tests/science-model-scientific-contract.test.mjs
node tests/science-model-browser-audit.mjs
SCIENCE_AUDIT_CAPTURE_ONLY=1 node tests/science-model-browser-audit.mjs
SCIENCE_AUDIT_KEYBOARD_ONLY=1 node tests/science-model-browser-audit.mjs
SCIENCE_AUDIT_FILTER="tabla-periodica|pascal|metales|no-metales|gases-nobles" node tests/science-model-browser-audit.mjs
node tests/science-generated-sandbox-browser.mjs
```

La primera prueba incluye 180 pruebas por perfil con valores iniciales y cada extremo de cada control, además de referencias numéricas independientes para mecánica, circuitos, álgebra, geometría, genética y química. La prueba de navegador monta Phaser en modo Canvas para evitar agotar la cuota de contextos WebGL durante miles de montajes. Comprueba mediciones finitas, dibujo montado, telemetría, límites, pausa/reinicio, diagramas válidos, tabla periódica accesible, botones reales con límites visibles y equivalencia numérica entre las dos superficies.

**Esta matriz no certifica exactitud científica exhaustiva ni sustituye una revisión humana de las 720 capturas.** La superficie de exportación es el runtime compilado en memoria por esbuild con la hoja exportada; el ZIP completo del editor, su empaquetado final, reproducción por `file://`, autenticación y despliegue requieren las pruebas de integración del proyecto.

## Correcciones entregadas

| Área | Antes | Después |
| --- | --- | --- |
| Ácidos y bases | `Phaser` global inexistente interrumpía la rama gráfica | Conversión de color independiente del import ESM; pH con concentración, dilución y neutralización de ácido/base fuerte |
| Disoluciones | Alias `solution → fluid` convertía concentración en presión | El ID explícito tiene precedencia; los cuatro perfiles conservan su modelo |
| Tabla periódica | Filas gráficas 8/9 se publicaban como periodos químicos | Periodos 6/7; bloque f separado de grupos numerados; carácter metálico y metaloide corregido |
| Escenas con imágenes | La imagen principal suprimía ecuaciones/geometría; el fallback tapaba el fondo | Overlays científicos conservados y transparentes; MRUA mantiene sus indicadores específicos |
| Movimiento de imágenes | Pausa recolocaba el objeto en el ancla | Pausa conserva posición temporal |
| Ondas y partículas | Longitud de onda ignorada y rapidez constante entre 0–54 °C | Onda usa `kx−ωt`; partículas responden a raíz de temperatura absoluta |
| Átomo | Límite gráfico de 18 electrones con controles hasta 20 | Cuarta capa del esquema didáctico para K/Ca; ajuste al viewport |
| Matemáticas | 39 temas calculaban siempre `y=mx+b` | 31 modelos dedicados: operaciones, racionales, exponentes, proporciones, álgebra, sistemas, geometría y datos |
| Física | Potencia/cinética/flotación/circuitos/reflexión reutilizaban modelos incompatibles | 24 modelos especializados adicionales; circuito con fuente, conexiones serie/paralelo y resistencias; unidades, supuestos y gráficos derivados de sus cálculos |
| Conducción móvil | Dimensiones fijas producían radios negativos en Canvas | Espacio lógico mínimo escalado al viewport; no cambia el modelo térmico |
| División/herencia | Meiosis dibujaba sólo dos células; herencia usaba dibujo de mitosis | Cuatro células finales, controles didácticos del ciclo y probabilidades mendelianas con conteos esperados |
| Objetivos | Métrica inexistente podía convertirse en cero; umbrales tratados como igualdad | Valores ausentes/indefinidos no completan; soporte `gte/lte` |
| Accesibilidad y controles | Tabla interactiva oculta por `aria-hidden`; switch limitado a dos opciones | Tabla accesible; select para opciones múltiples; ocultación correcta de objetivos deshabilitados |

Los nuevos kernels se separan en `science-model-math.mjs`, `science-model-physics.mjs` y `science-model-biology.mjs`; contratos y diagramas SVG se comparten. Las mediciones y figuras usan los mismos resultados. Las imágenes generadas no participan en la aritmética ni sustituyen escalas y relaciones.

## Límites científicos y de diseño pendientes

- **Biología:** numerosos modelos siguen siendo ilustrativos: estado celular, metabolismo, evolución, clasificación, infección, endocrino, inmunidad, homeostasis y estabilidad ecológica. Sus coeficientes e índices no están calibrados con datos experimentales. Se muestra `modelFidelity`/`modelAssumptions` en la telemetría; requieren validación didáctica por especialistas si se desean predicciones reales.
- **Química:** disolución, solubilidad y conductividad relativa son representaciones simplificadas sin identidad de soluto/material. La geometría molecular no es una optimización cuántica ni valida todos los estados de valencia. La fase del agua usa aproximación termodinámica limitada y no resuelve calor latente ni nucleación. El pH supone especies fuertes monopróticas a 25 °C, sin actividad ni tampones.
- **Física:** los modelos educativos son ideales. Flotación representa equilibrio, circuitos resistencias ideales, magnetismo un conductor infinito, convección un coeficiente fijo y radiación un cuerpo gris. Los gráficos son experimentos paramétricos; no todos requieren una animación temporal. Esos supuestos delimitan el modelo y no son funcionalidades pendientes del alcance educativo.
- **Matemáticas:** cálculos en punto flotante, excepto representación racional simplificada cuando procede. Sistemas singulares, divisiones por cero, triángulos imposibles y probabilidades inválidas se señalan como configuraciones sin resultado único real. El muestreo de curvas es finito, no un CAS simbólico completo.
- **Controles y animaciones heredadas:** ciertas variables cualitativas sólo alteran representación, una métrica secundaria o un objetivo. No debe interpretarse que toda animación es una solución dinámica cuantitativa. La cobertura automática verifica ejecución; aún corresponde revisar perceptibilidad, textos pequeños, contraste sobre fondos generados concretos y recorrido exhaustivo del teclado y lector de pantalla real (la prueba realizada cubre foco nativo, flechas y Enter).
- **Datos guardados:** se conserva compatibilidad de IDs antiguos. La actualización a un modelo temático dedicado ocurre al aplicar el perfil curricular actual; no se modifican documentos remotos ni archivos ZIP ya publicados automáticamente.
- **Arte generado:** la matriz usa imágenes deterministas de prueba y fallos de carga deliberados; no evalúa todos los fondos futuros de un proveedor. La aceptación de cada actividad debe revisar composición, legibilidad, precisión de recursos y relación con el fenómeno.

## Simuladores generados

`activity.simulator.generated` requiere `candidateId`, `reviewStatus: "approved"`, `html` y `htmlHash` SHA-256 del documento exacto. El hash verifica integridad, no autorización: la aprobación pertenece al backend. El iframe conserva origen opaco (`sandbox="allow-scripts"`, sin `allow-same-origin`) y política CSP que bloquea red, objetos, formularios y frames. Los recursos visuales deben estar incrustados como `data:`/`blob:`. El módulo y la exportación comparten `generatedSimulatorDocument()` y `GENERATED_SIMULATOR_CSP`.

El padre envía `{ type: "science-simulator:command", command: "run" | "pause" | "reset" | "setParam", id?, value? }`. El hijo puede responder `{ type: "science-simulator:state", state }`; sólo se acepta el `contentWindow` del iframe activo. El padre nunca evalúa código del hijo. La revisión científica/humana del candidato sigue siendo necesaria antes de aprobarlo.
