# 🤖 WhatsApp Bot Empresarial v3.4.3

Bot de WhatsApp con IA (Google Gemini), comandos empresariales y un perfil de empresa simulada completo.

Arquitectura de un solo archivo (`index.js`) sobre Baileys v7 + `@google/generative-ai`, con persistencia en JSON. La v3.4 **no cambia la arquitectura**: reduce el consumo de tokens cargando el contexto de la empresa bajo demanda.

---

## 🔧 Error 400 "invalid argument" (v3.4.3)

La v3.4.2 añadió `thinkingConfig` para controlar el pensamiento del modelo, pero
**no todos los modelos aceptan ese campo**: con el alias `gemini-flash-latest`
Google respondía `400 Bad Request: invalid argument` y el bot dejaba de
contestar. Además, ese 400 se clasificaba como error "transitorio" y el bot
reintentaba en bucle.

Correcciones:
1. `thinkingConfig` **ya no se envía por defecto** (`GEMINI_THINKING_BUDGET =
   null`). El límite de 800 tokens basta para que las respuestas no se corten,
   y así el bot es compatible con cualquier modelo. Se puede reactivar poniendo
   un número si tu modelo lo soporta.
2. El 400 de argumento inválido se reconoce como error de **configuración**, no
   transitorio: el bot avisa con un mensaje claro en vez de reintentar sin fin.

---

## 🔧 Respuestas cortadas (v3.4.2)

Los modelos Gemini 2.5+ Flash "piensan" antes de responder, y esos tokens de
razonamiento se descuentan del mismo presupuesto (`maxOutputTokens`) que la
respuesta visible. Con un límite bajo, el pensamiento consumía casi todo y la
respuesta llegaba cortada a media frase.

Solución en tres capas:
1. **Pensamiento desactivado** (`thinkingBudget: 0`) en los modelos 2.5, que es
   lo ideal para un bot de atención con respuestas cortas: más rápido y barato.
   Los modelos 3.x no permiten apagarlo del todo, así que el bot cae a
   `thinkingLevel: "low"` automáticamente según el nombre del modelo.
2. **Límite subido a 800 tokens**, margen de sobra para 3 párrafos de WhatsApp.
3. Si aun así se alcanza el límite, la respuesta **se cierra con una frase
   completa** en vez de enviarse truncada.

Se ajusta en `CONFIG.MAX_TOKENS_RESPUESTA` y `CONFIG.GEMINI_THINKING_BUDGET`.

---

## 🔧 Modelo de IA (v3.4.1)

Google retira versiones de modelo periódicamente. `gemini-2.5-flash` empezó a
devolver `404 "This model is no longer available to new users"` para claves
nuevas, aunque su fecha oficial de baja sea posterior.

El bot usa por defecto **`gemini-flash-latest`**, un alias que apunta siempre al
modelo Flash vigente, así no hay que editar el código en cada jubilación.

Si prefieres fijar una versión concreta o el alias fallara, averigua qué acepta
tu clave con:

```bash
node listar-modelos.mjs
```

y copia uno de los identificadores que muestre en `CONFIG.GEMINI_MODEL`
(`index.js`, línea ~97).

> ⚠️ **Seguridad:** nunca compartas capturas donde se vea tu API Key completa.
> Si se filtró, bórrala en [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
> y genera una nueva; el bot la volverá a pedir al arrancar.

---

## ⚡ Optimización de contexto (v3.4)

El *system prompt* viaja en **cada** mensaje. En la v3.3, enriquecer la empresa simulada lo llevó a ~1.743 tokens fijos por mensaje, aunque el usuario solo saludara.

La v3.4 separa el contexto en dos capas:

1. **Prompt base ligero (~379 tokens, fijo):** identidad mínima de la empresa, un índice de los temas disponibles y las instrucciones. Es lo único que va en `systemInstruction`.
2. **Módulos bajo demanda:** `servicios`, `politicas`, `faqs`, `identidad`, `contacto`, `alcance`. Un **enrutador de intención** (`detectarModulos`) analiza el mensaje y añade **solo** el/los módulos pertinentes como bloque `CONTEXTO:` de ese turno. Cada módulo se compila una vez y se cachea.

**Resultado medido** (promedio ponderado por un tráfico realista de atención):

| | v3.3 | v3.4 |
|---|---|---|
| Prompt base fijo | 1.743 tk | **379 tk** |
| Saludo / charla sin tema | 1.743 tk | **379 tk** (−78 %) |
| Consulta de precio | 1.743 tk | 855 tk (−51 %) |
| Consulta de pago | 1.743 tk | 620 tk (−64 %) |
| **Promedio por mensaje** | **1.743 tk** | **≈639 tk (−63 %)** |

La empresa **no se simplifica**: `empresa.json` sigue completo (byte a byte), con sus 5 servicios, 8 FAQ, organigrama, procesos e indicadores. Lo único que cambió es **cuánta** de esa información llega al modelo en cada turno. Los bloques internos (`organizacion`, `procesos`, `estrategia`) siguen sin exponerse nunca, verificado por el test.

Los comandos directos (`!servicios`, `!faq`, `!politicas`, `!nosotros`, `!contacto`) siguen mostrando el detalle completo **leyéndolo de `empresa.json` sin pasar por la IA**: cero tokens.

Todo se controla desde `construirSystemPrompt()`, `COMPILAR_MODULO` e `INTENCION_KW`. Para afinar el enrutado basta con editar las palabras clave.

---

## 🚀 Uso

```bash
npm install
npm start      # menú interactivo: API Key → método de conexión
npm test       # 56 verificaciones sobre las funciones críticas
```

Requiere Node.js ≥ 18 (probado en 22). La API Key de Gemini se obtiene gratis en
[aistudio.google.com/apikey](https://aistudio.google.com/apikey) y queda guardada en `.env`.

---

## 🔧 Cambios v3.3

### Bug 1 — La corrección v3.2 estaba a medio aplicar (**CRÍTICO**)
**Causa:** la v3.2 arregló que un error 429 (cuota agotada del *free tier*) no descartara una API Key
válida, pero **solo dentro de `menuInicio()`**. En `consultarIA()` sobrevivía una versión distinta y más
débil que borraba la clave ante cualquier `e.status === 403`, sin comprobar antes si el error era de
cuota. Google responde 403 `PERMISSION_DENIED` en varios escenarios de cuota, así que el bot podía
quedarse sin IA **en caliente**, con una clave correcta, hasta el siguiente reinicio.
**Fix:** una única función `clasificarErrorGemini()` que devuelve `cuota` / `key_invalida` / `modelo` /
`transitorio`, evaluando **siempre la cuota primero**. La usan tanto el arranque como el runtime, de modo
que ambas rutas no pueden volver a divergir.

### Bug 2 — Escritura de `conversaciones.json` (**CRÍTICO**)
**Causa:** `registrarMensaje()` llamaba a `guardarJSON()` en cada mensaje entrante y en cada respuesta,
serializando de forma **síncrona** el objeto completo de conversaciones (todos los contactos). El coste
por mensaje crecía con la base de contactos y bloqueaba el *event loop* justo mientras se atendía a un
usuario. Además, `writeFileSync()` sobre el archivo real lo dejaba truncado si el proceso moría a media
escritura: al arrancar, `JSON.parse()` fallaba y se perdía **todo** el historial.
**Fix:** escritura **atómica** (`tmp` + `rename`) y **diferida** (agrupa las escrituras del camino
caliente). `!olvidar` y el cierre limpio fuerzan el volcado pendiente, así que no se pierde nada.

### Bug 3 — Fuga de memoria en recordatorios
**Causa:** el `Map` de recordatorios solo crecía: nunca se eliminaba una entrada, ni siquiera después de
que el temporizador se disparara.
**Fix:** la entrada se retira al completarse el recordatorio, y el chat desaparece del `Map` cuando no le
quedan pendientes. El registro pasó a tener uso real: `!recordar` informa cuántos hay pendientes.

### Bug 4 — Validación duplicada
**Causa:** `esFueraHorario()` ya comprueba `empresa.respuesta_fuera_horario` en su primera línea, pero el
flujo de mensajes volvía a evaluarlo: `if (esFueraHorario() && empresa.respuesta_fuera_horario)`.
**Fix:** se eliminó la condición redundante.

### Bug 5 — Versión desincronizada en tres sitios
**Causa:** la cabecera decía v3.2, el menú de inicio imprimía v3.1 y `package.json` declaraba 3.2.0.
**Fix:** una constante `VERSION` como única fuente de verdad, verificada por el test contra `package.json`.

### Mejora — El system prompt se reconstruía en cada mensaje
**Causa:** `consultarIA()` concatenaba todo `empresa.json` y llamaba a `getGenerativeModel()` en **cada**
mensaje, aunque nada de eso cambia entre mensajes.
**Fix:** `construirSystemPrompt()` compila el prompt una sola vez y se cachea junto al modelo.
`invalidarCacheIA()` lo rehace solo al recargar la empresa o cambiar la API Key.

---

## 🏢 Empresa simulada (`empresa.json`)

Perfil del escenario controlado **EP-01**: microempresa de servicios de Santiago de Cali, subsector
consultoría, con tres puestos de atención y WhatsApp Business como canal principal.

**Vértice Consultoría Digital S.A.S.** — 5 servicios, 8 preguntas frecuentes, políticas de pago,
cancelación, reprogramación, confidencialidad y garantía.

### Bloques públicos e internos

El archivo separa lo que el asistente **puede decir** de lo que **no debe divulgar**:

| Bloque | Contenido | ¿Entra al prompt? |
|---|---|---|
| `nombre`, `sector`, `descripcion`, `horario`, contacto | Datos básicos | ✅ |
| `identidad` | Historia, misión, visión, valores, cultura | ✅ (misión, visión, valores) |
| `catalogo` | 5 servicios con modalidad, duración, precio y entregable | ✅ |
| `politicas` | Pago, cancelación, reprogramación, confidencialidad, garantía | ✅ |
| `faqs` | 8 preguntas frecuentes | ✅ |
| `clientes_objetivo` | Segmentos, dolores, fuera de alcance | ✅ (solo *fuera de alcance*) |
| `canales_atencion` | Canales y horarios | ❌ (los cubre `!contacto`) |
| `organizacion` | Organigrama, departamentos, cargos | ❌ **interno** |
| `procesos` | Procesos internos y SLA | ❌ **interno** |
| `estrategia` | Objetivos, indicadores, crecimiento, ventajas | ❌ **interno** |

Un asistente de atención al cliente no debe recitar el organigrama ni los indicadores internos a quien
escribe por WhatsApp. El bloque `divulgacion` lleva la instrucción explícita que se inyecta en el prompt,
y el test verifica que nada de lo interno se filtre.

### Compatibilidad

Todas las claves originales (`nombre`, `productos`, `politicas`, `faqs`, `horario_inicio`…) **se conservan
con el mismo tipo y significado**. Los bloques nuevos son **opcionales**: un `empresa.json` antiguo sigue
funcionando sin tocar nada, y `!servicios` cae automáticamente a la lista simple `productos` si no existe
`catalogo`. El test cubre este escenario.

---

## 📋 Comandos

| Grupo | Comandos |
|---|---|
| Información | `!menu` `!hola` `!info` `!hora` `!empresa` `!nosotros` `!contacto` `!servicios` `!faq` `!politicas` `!horario` |
| Herramientas | `!calc` `!clima` `!recordar` `!encuesta` `!votar` `!traducir` |
| Diversión | `!chiste` `!ping` |
| Configuración | `!olvidar` `!recargar` |

`!nosotros` es el único comando nuevo de la v3.3: expone la identidad corporativa (historia, misión,
visión y valores) que ahora vive en `empresa.json`. Cualquier mensaje que no empiece por `!` lo atiende la IA.

---

## 🔧 Correcciones v3.2

### Bug — API Key válida descartada por error de cuota (**CRÍTICO**)
**Causa:** la validación trataba cualquier error como clave inválida. Un 429 (cuota del *free tier*
agotada) hacía que el bot borrara una clave correcta y arrancara sin IA.
**Fix:** se distinguió 429/`RESOURCE_EXHAUSTED` (cuota, clave válida) de 401/403/`API_KEY_INVALID`
(clave inválida). Los errores transitorios conservan la clave.
*(La v3.3 completó este arreglo: ver Bug 1.)*

---

## 🔧 Correcciones v3.1

### Bug 1 — `qrcode-terminal` faltaba en package.json (**CRÍTICO**)
**Causa:** El código importaba `qrcode-terminal` pero no estaba declarado como dependencia.
**Fix:** Agregado a `package.json`. Además, usa `createRequire` porque el paquete no tiene exports ESM nativos.

### Bug 2 — Historial duplicado en Gemini (**CRÍTICO**)
**Causa:** `registrarMensaje(jid, "user", ...)` se llamaba **antes** de `consultarIA()`.
Esto hacía que el mensaje actual ya estuviera en el historial que se pasaba a `startChat()`,
y luego `sendMessage()` lo enviaba de nuevo → Gemini recibía cada mensaje **dos veces**.
**Fix:** El historial se construye **antes** de registrar el mensaje actual.

### Bug 3 — Sin validación de alternancia user/model en Gemini (**CRÍTICO**)
**Causa:** La API de Gemini exige que el historial alterne estrictamente `user → model → user → model`.
Mensajes huérfanos (por errores o reinicios) causaban el error 400 "roles must alternate".
**Fix:** `buildGeminiHistory()` solo incluye pares completos `user+model`, descartando mensajes sin par.

### Bug 4 — `qrcode-terminal` falla en ESM
**Causa:** Node.js con `"type": "module"` no puede importar módulos CJS sin `createRequire`.
**Fix:** `import { createRequire } from "node:module"; const require = createRequire(import.meta.url);`

### Bug 5 — `!ping` mostraba siempre 0ms
**Causa:** Ambos `Date.now()` eran síncronos, sin ninguna operación async entre ellos.
**Fix:** Se mide el tiempo que tarda `sock.sendMessage()` en completarse (latencia real de red).

### Bug 6 — Clima con datos de hora incorrectos
**Causa:** `hourly[new Date().getHours()]` usaba la hora del servidor, no la de la ciudad consultada.
**Fix:** Migrado al parámetro `current` moderno de Open-Meteo que entrega valores presentes directamente.

### Bug 7 — `!votar` permitía votos múltiples con el mismo nombre
**Causa:** El ID de votante era `remoteJid + ":" + senderName`. Dos personas con el mismo nombre
de WhatsApp contaban como la misma persona, y cambiar el nombre permitía votar varias veces.
**Fix:** Se usa `msg.key.participant || msg.key.remoteJid` (JID único e inmutable).

---

## 🧪 Pruebas

`npm test` carga el `index.js` real (recorta solo el arranque interactivo) y ejecuta 56 verificaciones:

- **`clasificarErrorGemini`** (10): incluida la regresión del Bug 1 — un 403 que menciona cuota debe
  clasificarse como `cuota` y **no** descartar la clave.
- **`buildGeminiHistory`** (7): alternancia estricta, descarte de huérfanos, recorte a 10 pares.
- **`construirSystemPrompt`** (11): incluye servicios, precios, políticas y FAQ; y **no filtra**
  organigrama, cargos, indicadores ni planes de crecimiento.
- **Compatibilidad hacia atrás** (5): un `empresa.json` sin los bloques nuevos sigue funcionando.
- **Escritura atómica** (3) y **versión** (1).

---

## 📁 Estructura

```
index.js          Bot completo (arquitectura de un solo archivo)
empresa.json      Perfil de la empresa simulada (EP-01)
test.mjs          Banco de pruebas
package.json      Dependencias y scripts
.env              GEMINI_API_KEY (se genera solo; ignorado por git)
conversaciones.json   Historial por contacto (se genera solo; ignorado por git)
auth_info_baileys/    Sesión de WhatsApp (se genera sola; ignorada por git)
```

---

## 🧪 Pruebas de la optimización

`npm test` ejecuta 56 verificaciones. Las de la v3.4 cubren: prompt base ≤ 500 tokens; el enrutador
`detectarModulos` acierta en saludos, precio, pago, confidencialidad, identidad, contacto, alcance y
consultas mixtas; el contexto del turno trae solo lo pedido; y **ningún** módulo expone el organigrama,
los cargos, los indicadores ni los planes de crecimiento.
