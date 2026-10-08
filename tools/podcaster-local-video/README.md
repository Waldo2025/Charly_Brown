# Podcaster · Motor de video local (gratis, GPU del Mac)

**Servidor Snoopy**: un programa Node sin dependencias que conecta `podcaster.html` con
**ComfyUI** corriendo en tu Apple Silicon, usando **Wan 2.2 TI2V-5B** (open source, licencia
Apache 2.0). El video se genera 100 % en tu máquina: costo $0, sin cuota Veo/Omni.

```
podcaster.html (sitio desplegado o local)
      │  fetch http://127.0.0.1:8792   (token de emparejamiento)
      ▼
tools/podcaster-local-video/server.mjs
      │  API nativa http://127.0.0.1:8188
      ▼
ComfyUI (Metal/MPS) · Wan 2.2 TI2V-5B · imagen → clip mp4
```

## 1. Arrancar "Servidor Snoopy" (app con icono, doble clic, sin Terminal)

Los usuarios finales descargan el paquete desde Snoopy Editor (enlace **⬇ Descargar Servidor
Snoopy** en Ajustes de video) o se lo construyes tú:

```bash
npm run build:servidor-snoopy   # genera public/descargas/servidor-snoopy-mac.zip
```

El zip trae **`Servidor Snoopy.app`** (con su icono) y `LEEME.txt`. Uso normal:

1. Descomprimir el zip.
2. **Arrastrar `Servidor Snoopy.app` a la carpeta Aplicaciones.**
3. Abrirla con **doble clic**, desde **Launchpad** o desde el **Dock** (se queda con su icono
   mientras el motor está encendido).

La app arranca ComfyUI si ya existe en `~/ComfyUI`, levanta el motor y abre su **consola**
(`http://127.0.0.1:8792/consola`). Si ya había un Snoopy encendido, no duplica el motor: solo
abre la consola. Para apagarlo, **Salir** desde el icono del Dock (la app cierra también
ComfyUI). Logs: `/tmp/snoopy-servidor.log` y `/tmp/snoopy-comfyui.log`.

> **Primera vez (un clic extra):** como la app viene descargada de internet, macOS puede decir
> «no se puede abrir porque Apple no pudo verificar que no contenga software malicioso». Haz
> **clic derecho sobre la app → Abrir** y confirma; esto pasa **una sola vez**. (Alternativa:
> **Ajustes del Sistema → Privacidad y seguridad → Abrir de todas formas**.) Las apps copiadas
> localmente, por ejemplo desde una memoria, no muestran ese aviso.

Los avances de consola siguen disponibles con `node tools/podcaster-local-video/server.mjs`, y
`servidor-snoopy.command` queda para quien prefiera verlo en Terminal. Variables opcionales:

- `PODCASTER_LOCAL_VIDEO_PORT` (por defecto `8792`)
- `COMFY_API_BASE` (por defecto `http://127.0.0.1:8188`)
- `PODCASTER_LOCAL_VIDEO_ORIGINS` — orígenes extra CORS separados por comas. Se aceptan por
  defecto `localhost`/`127.0.0.1` y `https://charly-brown.web.app`.

La clave maestra vive en `~/.charlybrown/podcaster-local-video.json` (nunca en el repo ni dentro
del `.app`; la app solo escribe en tu carpeta de usuario); la consola tiene un botón
**📋 Copiar clave** como respaldo manual.

## 2. Instalar el motor (un clic, sin Terminal) — recomendado

La **consola de Snoopy** (`http://127.0.0.1:8792/consola`, se abre sola al arrancar) tiene el
botón **🚀 Instalar motor gratis**. Hace todo por ti, con barra de progreso:

1. Revisa requisitos (Mac Apple Silicon, `git`, Python 3.10–3.13) y el espacio libre según la
   RAM: **≈12 GB** en Macs de 8 GB, **≈15 GB** en los de 16 GB, **≈25 GB** en equipos grandes.
2. Descarga e instala **ComfyUI** en `~/ComfyUI` (open source, GPL) con PyTorch/MPS.
3. Descarga **Wan 2.2 TI2V-5B** desde Hugging Face. En Macs de poca RAM baja la **versión ligera
   GGUF** (`QuantStack/Wan2.2-TI2V-5B-GGUF` + `city96/umt5-xxl-encoder-gguf`): modelo
   **2,4 GB (8 GB de RAM) o 3,2 GB (16 GB)** + codificador **2,9 / 3,4 GB** + VAE 1,3 GB. En
   equipos grandes baja la versión completa (modelo 10 GB + codificador 7 GB).
4. Escribe los nombres de los modelos en `~/.charlybrown/podcaster-local-video.json` para que
   el workflow los use automáticamente.

Cuando termina: cierra la pestaña y **vuelve a abrir Servidor Snoopy** (doble clic a la app);
enciende ComfyUI solo y la consola pondrá el punto verde. El botón `Reintentar` reanuda
descargas interrumpidas (curl `-C -`), y lo que ya existe no se vuelve a bajar.

Si prefieres una GUI de terceros para ComfyUI, **ComfyUI Desktop**
(https://www.comfy.org/download) también sirve: instala los mismos archivos split y ajusta
`PODCASTER_LOCAL_VIDEO_CONFIG` → `models` con tus nombres.

## 3. Alternativa manual (expertos)

```bash
git clone --depth 1 https://github.com/comfyanonymous/ComfyUI && cd ComfyUI
python3.12 -m venv venv && venv/bin/pip install torch torchvision torchaudio
venv/bin/pip install -r requirements.txt
venv/bin/python main.py --port 8188
```

Modelos (formato *split files* que espera `workflows/wan22-i2v.json`; Hugging Face no pide
cuenta en este repo):

| Archivo | Carpeta |
|---|---|
| `wan2.2_ti2v_5B_1024_fp16.safetensors` | `ComfyUI/models/diffusion_models/` |
| `umt5_xxl_fp8_e4m3fn_scaled.safetensors` | `ComfyUI/models/text_encoders/` |
| `wan2.2_vae.safetensors` | `ComfyUI/models/vae/` |

Con nombres distintos a los de arriba, escríbelos en el campo `models`
(`{ "models": { "unet": …, "clip": …, "vae": … } }`) de
`~/.charlybrown/podcaster-local-video.json` o deja que el instalador los elija.

**Qué aguanta cada Mac (lo que el planificador usa de verdad, no teoría):**

| Mac | Nativo de la GPU | Video final guardado | Duración típica |
|---|---|---|---|
| 8 GB | 512×288 base | 1280×720 | 4–8 s |
| 16 GB | 640×352 base · 704×384 Turbo | 1920×1080 | 8 s |
| ≥24 GB | 832×464 base · 896 Turbo | 1920×1080 | 8 s |

## 4. Conectar Snoopy Editor con el código de 6 números

1. Con el Servidor Snoopy encendido, abre `podcaster.html` (desplegado o local): la opción
   **"Wan 2.2 local (GPU del equipo) · gratis, sin costo"** aparece sola (la página sondea `GET /health`).
2. Pulsa **🔗 Conectar con Snoopy**: el sitio muestra un código (ej. `482-015`).
3. Ese código se teclea en la consola de Snoopy y se confirma (estilo Chromecast). El navegador
   del sitio hace polling en `POST /pair/status` y guarda la clave solo en `localStorage`.
4. Selecciona el modelo local y genera la escena. El clip sube a tu Storage por la ruta
   existente (`/api/podcaster/scene-media/upload`) y se registra como ahorro (`videoSessions`),
   sin tocar cuota de Veo.

Un origen web cualquiera no puede confirmar códigos por su cuenta: `/pair/confirm` exige la
clave de consola que solo contiene el HTML de `/consola`, servido sin cabeceras CORS.

## 5. Workflows

`workflows/wan22-i2v.json` está en formato API y replica el template oficial
**Wan 2.2 5B image-to-video** en versión *split files*.
El motor sustituye los tokens `"__UNET_CLASS__"`, `"__CLIP_CLASS__"`, `"__UNET__"`, `"__CLIP__"`,
`"__VAE__"`, `"__PROMPT__"`, `"__NEGATIVE__"`, `"__IMAGE_NAME__"`, `"__WIDTH__"`, `"__HEIGHT__"`,
`"__LENGTH__"`, `"__FPS__"`, `"__SEED__"`, `"__STEPS__"`. Los nombres de archivos salen de `models`
en la configuración (los escribe el instalador). Si tu versión de ComfyUI cambió los nodos,
exporta tu workflow con *Save (API Format)* y sobreescribe el archivo manteniendo los tokens.

**Macs con poca RAM (8 GB y 16 GB).** El instalador baja entonces la versión cuantizada GGUF y
clona el nodo open source [ComfyUI-GGUF](https://github.com/city96/ComfyUI-GGUF): en 16 GB
`Wan2.2-TI2V-5B-Q4_K_M.gguf` (3,2 GB) + `umt5-xxl-encoder-Q4_K_M.gguf` (3,4 GB); en 8 GB los
`Q3_K_M` (2,4 + 2,9 GB). Al ver `.gguf`, el motor cambia los cargadores a `UnetLoaderGGUF` /
`CLIPLoaderGGUF` (y quita `weight_dtype`, que esos nodos no aceptan). Con los safetensors
completos —10 GB de UNet más 6,4 GB del codificador de texto— el equipo no tiene memoria para
los frames y ComfyUI se queda colgado sin completar ni el primer paso.

**El planificador por presupuesto.** El sitio ya no pide píxeles: manda la duración (8 s por
escena) y si es vertical, y `planLocalRender()` decide el plan según la RAM detectada:

| Tier | Nativo máx. (base) | Techo de memoria (frames × píxeles) | Video final | Minutos por defecto |
|---|---|---|---|---|
| 8 GB | 512×288 | 10 M | 1280×720 | 60 |
| 16 GB | 640×352 | 32 M | 1920×1080 | 40 |
| >24 GB | 832×464 | 60 M | 1920×1080 | 45 |

Reglas: nunca sube del techo nativo, siempre cuadros `4n+1` y lados múltiplo de **32** (el VAE
reduce 16× y el parche del modelo 2×: con 16 no basta, los 704×416 del plan original se quedaron
en 704×384 por esa razón), y los minutos que sobran se gastan en **pasos** (lo que de verdad
mejora la imagen), no en píxeles. La
resolución final la recupera el **afinador**: reescala con lanczos y aplica un `unsharp` suave
(`crf 18`), cuesta segundos y memoria cero, así que un clip nacido en 640×352 se guarda como MP4 de
1920×1080. Snoopy usa el primer camino que tenga a mano (`clip-polish.mjs`):

1. **ffmpeg** si está instalado (`brew install ffmpeg`).
2. Si no, **el propio Python de ComfyUI** con PyAV + Pillow (`polish-clip.py`). macOS no trae ffmpeg
   de serie, y el venv de ComfyUI ya está en el equipo y ya tiene esas dos librerías, así que el
   afinador funciona sin instalar nada.
3. Si tampoco hay afinador, se entrega el clip nativo en vez de perder la escena.

La consola dice cuál usó (`Calidad de la escena` → «ffmpeg» / «el afinador de ComfyUI» / «sin
afinador»), y `tools/podcaster-local-video/test/clip-polish.test.mjs` comprueba el camino real de
PyAV subiendo un clip de verdad.

**Movimiento suave (hasta 24 fps), dentro del afinado.** El planificador entrega 8, 12 o 16 fps
según cuántos pixeles caben; a 8 o 12 fps el video se ve a saltos y eso es lo que más delata al
motor local frente a Veo. Al reescalar, Snoopy mezcla los fotogramas vecinos y sube la cadencia
hasta el techo de 24 fps: 12 → 24 duplicando, 8 → 24 en grupos de tres, y 16 se queda como está
porque el siguiente paso sería 32. No es trabajo de GPU ni descarga nada —sale del mismo paso que
ya reescala—, así que viene **encendido** y se apaga desde la consola con
«Movimiento suave (hasta 24 fps)» (`POST /quality {smoothMotion:false}`, guardado en
`config.smoothMotion` y sobrevive a cerrar la app). La duración no cambia: se escriben
`factor·N` cuadros a `factor·rate`, y la ficha del clip anota `fps` final, `nativeFps` y
`motionSmoothed`. El coste real es CPU y algo de peso (un clip de 8 s del usuario pasó de 6,9 a
8,8 MB y salió en ~14 s). El aviso honesto va en la consola: en movimientos rápidos la mezcla
puede dejar un leve rastro.

`calibrateK()` mide cada escena real (segundos ÷ frames·píxeles·pasos) y guarda la constante en la
configuración, así que la segunda escena ya llega con la estimación corregida para ese Mac.

El lanzador arranca ComfyUI con `--cache-none` cuando el Mac tiene ≤24 GB de RAM: suelta cada
modelo entre nodos en vez de mantener los tres cargados a la vez, que es lo que provoca el
intercambio constante con el que el muestreo no avanza. Generar en un Mac de 16 GB sigue tardando
decenas de minutos por escena; el sitio espera hasta 90 minutos.

### Avance real: los pasos llegan por websocket, no por HTTP

ComfyUI 0.38 **no** publica el paso actual por HTTP (`/api/jobs` solo dice `in_progress` y
`/history/:promptId` responde hasta que el video termina). El avance real vive en su websocket
`/ws?clientId=…` (`{"type":"progress","data":{"value","max","prompt_id"}}`). `watchProgress()` en
`comfy-client.mjs` abre esa conexión con el `WebSocket` global de Node ≥22 (sin dependencias) y el
daemon la usa para escribir `step` y una `hint` honesta: «Paso 5 de 8 en tu GPU · 31 min
transcurridos de unos 19 estimados…», y al terminar el muestreo «Muestreo terminado · Wan está
comprimiendo los frames». Si el websocket no informa, la barra sigue avanzando pero lo etiqueta
«avance aproximado»; nunca se finge un paso concreto. Pasado el estimado, `plan.overEstimate` pasa
a `true` y se deja de prometer «le faltan ~1 min».

### Cancelar: la dueña de la GPU siempre puede

`POST /jobs/:id/cancel` (token del editor) y `POST /scene/cancel` (clave de consola) llaman al mismo
`cancelJob()`: interrumpe ComfyUI si la escena está en curso o la quita de su cola si espera, y
libera `runningJobId` para que entre la siguiente. Cancelar **sí** apaga la generación, no solo
pinta el estado: si el cancel llega mientras se preparaba el workflow, el daemon interrumpe apenas
entra en la cola. Por eso la consola tiene su propio botón «Cancelar escena» —el editor puede haber
cerrado la pestaña, pero el Mac es tuyo—. Los códigos de conexión también se pueden cerrar antes de
que expiren con `POST /pair/cancel-code`; la cuenta atrás que se ve en la consola es del código, no
de la escena.

### Tarjetas «Cola de Snoopy» y «Calidad de la escena»

La consola muestra cada escena en curso con su plan (`8s en 640×352 · 97 cuadros a 12 fps · 11
pasos · unos 40 min`) y el reloj real. **Calidad de la escena** tiene tres presets —Rápido (20 min),
Equilibrado (40 min), Máximo (90 min)— que llaman a `POST /quality`; lo elegido se guarda y aplica a
las escenas siguientes. Más minutos significan más pasos, nunca más píxeles.

Cada preset también dice **con qué modelo** cumple su presupuesto, porque el tiempo no se gasta
igual en un modelo que en otro:

| Preset | Motor que usa | Qué hace |
|---|---|---|
| ⚡ Rápido (20 min) | `wan22-max-turbo` (4-6 pasos, cfg 1, VAE por tiles) y, si no está, el base | 704×384 en 16 GB; el Turbo entra **por download** desde la misma tarjeta |
| Equilibrado (40 min) | `wan22-base-q4km` | 640×352, más pasos |
| Máximo (90 min) | `wan22-base-q4km` | 640×352, el mayor número de pasos |

Lo contrario de lo que se creía al principio: el peldaño Turbo vive en **Rápido**, no en Máximo,
porque 4 pasos con cfg 1 es justamente el camino barato. En un Mac de 8 GB Rápido **no** baja el
Turbo (7,7 GB no caben con margen) y se queda en el base con la nota visible; la consola se niega
incluso a iniciar esa descarga. `selectArtifactForPreset()` es el único dueño de esa decisión y el
sitio ve lo mismo en `GET /quality` (`engine.artifactId`, `engine.fallbackNote`).

### Tarjeta «Memoria del Mac» de la consola

La consola (`http://127.0.0.1:8792/consola`) lee RAM e intercambio cada pocos segundos y los
muestra con un semáforo (cómoda · justa · saturada). El botón **Liberar memoria** llama
a `POST /free` de ComfyUI, que suelta los modelos que Wan 2.2 deja residentes (≈9 GB) y baja el
intercambio sin reiniciar nada. Snoopy también lo hace solo al terminar cada video en equipos de
≤24 GB, para no dejar la GPU acaparada. Mientras hay un video generándose el botón se niega (409):
soltar los modelos a mitad de muestra dejaría el clip perdido. Lo que el botón **no** puede hacer es
recuperar el intercambio que otras apps ya volcaron al disco; para eso queda cerrar apps o reiniciar.

## 6. API de Servidor Snoopy

| Ruta | Auth | Descripción |
|---|---|---|
| `GET /health` | — | `{ok, version, model, models, comfyReachable, engineInstalled, engine:{artifactId, label, unet, presetId, fallbackNote, smoothMotion, smoothTargetFps}, gpu, busy}` — `engine` dice con qué modelo saldrá la **próxima** escena, para que el editor no prometa Turbo antes de descargarlo |
| `POST /jobs` | token | `{mode:"i2v", prompt, negativePrompt, firstFrame(dataURL), durationSec:8, aspectRatio, portrait, seed}` → 202 `{jobId, plan}`. Cola máx. 1+1 (429), body ≤12 MB. `width`/`height`/`lengthFrames` siguen aceptándose, pero **manda el plan del equipo** |
| `GET /jobs/:id` | token | `{status: queued\|running\|ready\|error\|canceled, stage, progress, step, hint, model, durationSec, plan}` — `durationSec` es el clip real, `step` es `{value,max,phase:"sample"\|"decode"}` con el paso real de ComfyUI (o `null` si el websocket no informó) y `plan` trae `{width,height,lengthFrames,fps,steps,estimatedMinutes,elapsedMinutes,remainingMinutes,overEstimate,note}` |
| `GET /jobs/:id/video` | token | bytes `video/mp4` (afinados al target del tier) |
| `POST /jobs/:id/cancel` | token | interrumpe/elimina de la cola |
| `POST /scene/cancel` | clave de consola | `{jobId?}` — la consola detiene la escena en curso (o la primera en espera) sin necesitar el token del editor; sin escena activa responde 404 |
| `GET /consola` | — | consola web de Snoopy (HTML, sin CORS a propósito) |
| `POST /pair/request` | — (origen permitido) | `{pairId, code:"###-###", expiresIn:300}` |
| `POST /pair/confirm` | clave de consola | teclea el código en la consola; un origen extraño no puede confirmarlo |
| `POST /pair/status` | — | `{status:"pending"\|"paired"\|"expired", token?}` — la clave solo tras confirmar |
| `GET /pair/pending` | clave de consola | `{pairs:[{pairId, origin, code, secondsLeft}], editors:[…]}` — solicitudes abiertas que ve la consola |
| `POST /pair/cancel-code` | clave de consola | `{pairId}` (o `{code}`) — cierra un código antes de que expire; el sitio recibe 404 en `/pair/status` |
| `POST /install/start` | clave de consola | lanza `engine-installer.mjs` (202; 409 si ya trabaja) |
| `GET /install/status` | clave de consola | `{running, step, percent, message, logTail, error, done}` |
| `GET /memory` | clave de consola | `{ramTotalGb, ramFreeGb, swapUsedGb, swapTotalGb, level:"comoda\|justa\|critica", busy, advice}` (no toca ComfyUI, nunca bloquea) |
| `POST /memory/free` | clave de consola | `POST /free` de ComfyUI: suelta los modelos; 409 si se está generando, 502 si ComfyUI no responde |
| `GET /quality` | clave de consola | `{tierId, ramGb, budgetMinutes, presetId, presets, upscaleLongEdge, maxNativeLongEdge, kCalibrated, nextPlan, engines, clipFinish, diskFreeGb, smoothMotion, smoothTargetFps, smoothNextFps}` — `clipFinish` dice si hay afinador y `smoothNextFps` la cadencia real de la próxima escena mezclando (0 = no aplica, p. ej. a 16 fps) |
| `POST /quality` | clave de consola | `{preset:"rapido\|equilibrado\|maximo"}` (o `{budgetMinutes}`) y/o `{smoothMotion:true\|false}` → el mismo payload con lo elegido ya guardado; 400 si el preset no existe. El interruptor puede venir solo: no obliga a reelegir nivel |
| `POST /engine/ladder/download` | clave de consola | `{artifactId:"wan22-max-turbo"}` → 202 con el progreso de instalación. 400 si el nivel ya viene incluido, si el Mac es de 8 GB, si falta el motor base o si el disco no tiene margen; 500 si no está el instalador |
| `GET /engine/ladder/status` | clave de consola | `{running, step, percent, message, done, presetId, engines, diskFreeGb}` — el avance de la descarga con los niveles ya disponibles |
| `GET /queue` | clave de consola | `{busy, jobs:[…con su plan y reloj], last}` — la cola que pinta la consola |
| `GET /clips` | clave de consola | `{dir, clips:[{id, jobId, file, createdAt, durationSec, width, height, steps, fps, nativeFps, motionSmoothed, minutes, estimatedMinutes, bytes, prompt, title, storageUrl}]}` — los videos guardados en este Mac, del más nuevo al más viejo (se guardan los 40 últimos). `width`/`height`/`fps` son los del archivo final ya afinado; `nativeFps` es el de la GPU y `motionSmoothed` si el suavizado aplicó |
| `GET /clips/:id` | clave de consola | bytes `video/mp4` del clip guardado (el `id` solo acepta nombres de archivo normales; nada de `../`) |
| `PATCH /jobs/:id` | token | `{title, storageUrl}` — Snoopy Editor avisa de la escena que ya subió a Storage y eso se enlaza en la lista |

Cabecera: `X-Local-Video-Token: <token>` para el sitio, `X-Console-Key: <clave>` para la consola.
El modo `t2v` responde 400 hasta la fase 2.

### Tarjeta «Videos de Snoopy» de la consola

Cada escena que termina se guarda en `~/.charlybrown/podcaster-clips` con su ficha `.json`
al lado (duración real, píxeles, pasos, minutos de GPU y el prompt). La consola los lista del
más nuevo al más viejo con **▶ Ver** (se reproduce ahí mismo) y **⬇ Descargar**; se conservan
los 40 últimos. Cuando Snoopy Editor sube el clip a Storage, manda `PATCH /jobs/:id` con el
título y la URL, y la ficha local gana el enlace «guardada en el sitio»: así el video del Mac y
la escena de la biblioteca quedan conectados, pero el clip sigue visible aunque lo borres del
sitio o no haya internet.

## Solución de problemas

- **La opción local no aparece en el selector** → Servidor Snoopy apagado o bloqueado; `curl http://127.0.0.1:8792/health`.
- **La app no abre la primera vez** → clic derecho sobre `Servidor Snoopy.app` → **Abrir** (una sola vez; macOS avisa de las apps descargadas de internet).
- **`comfyReachable:false` con `engineInstalled:true`** → el motor está instalado pero ComfyUI está apagado: cierra y vuelve a abrir la app Servidor Snoopy.
- **La instalación falló a medias** → pulsa **Reintentar**: reanuda las descargas donde se cortaron y salta lo ya instalado.
- **En un Mac de 8 GB la primera escena tarda más de lo estimado** → normal la primera vez: `calibrateK` aprende de cada escena y desde la segunda la estimación viene corregida. Mientras tanto usa **⚡ Rápido**.
- **El muestreo no avanza o tarda una barbaridad** → mira la tarjeta **Memoria del Mac** de la consola. Si está en 🔴, pulsa **🧹 Liberar memoria**, cierra apps pesadas y, si sigue alto, reinicia el Mac: el intercambio ya volcado al disco solo se recupera reiniciando, y Snoopy no puede borrarlo por ti.
- **Falta `git` o Python** → el instalador lo dice con el paso concreto a seguir (en macOS el aviso habitual es `xcode-select --install`).
- **CORS desde otro dominio desplegado** → exporta `PODCASTER_LOCAL_VIDEO_ORIGINS=https://<tu-dominio>` al arrancar (charly-brown.web.app ya está permitido por defecto).
- **ComfyUI terminó sin video** → revisa la consola de ComfyUI (modelos/VAE faltantes o con nombre distinto son la causa #1; ver `models` en la configuración).
- **«Última escena falló» pero el clip sí existe** → ComfyUI 0.38 anuncia el mp4 dentro de `images`
  (con `animated: true`) y no en `videos`; `extractOutputVideo()` ya busca en los dos sitios. Si
  vuelve a pasar, el archivo queda en `~/ComfyUI/output/podcaster_local` y puedes recuperarlo.
- **El clip sale en 640×352 en vez de 1080p** → Snoopy no encontró afinador. Con ComfyUI instalado
  ya basta, porque usa su propio Python (PyAV + Pillow); ffmpeg es opcional (`brew install ffmpeg`).
  La consola dice cuál está usando en «Calidad de la escena».
- **El video se ve a saltos** → entra la cadencia, no la resolución. Mira
  `Calidad de la escena` → «Movimiento suave (hasta 24 fps)»: está encendido por defecto, pero solo
  mezcla si hay afinador y si la escena salió de la GPU a 8 o 12 fps (a 16 se queda como está). La
  consola dice la cadencia real de la próxima escena antes de que la generes.
- **Dentro del video aparecen letras sin sentido** → el motor local **no escribe texto**: el rótulo
  vive en la capa de texto del sitio, que se ve al reproducir y al exportar. Si la *imagen* de escena
  ya traía el título pintado, Wan lo anima y lo derrite. Desde el 2026-10-04 el prompt de la imagen
  manda el tema como tema (`functions/src/ai-jobs.js`), así que las imágenes generadas antes hay que
  regenerarlas desde el modal de la escena.
