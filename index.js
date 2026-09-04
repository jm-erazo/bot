/**
 * WhatsApp Bot Empresarial — v3.5.2 (GEMINI EDITION)
 * ─────────────────────────────────────────────────────────────────────────────
 * Cambios v3.5.2 (formato y sesión; sin cambios de arquitectura):
 * ✨ Triple asterisco: ***texto*** y ___texto___ (negrita+cursiva de Markdown)
 *    ahora se convierten a *texto* (negrita de WhatsApp), sin dejar asteriscos
 *    sueltos. Aplica a los títulos que devuelve la IA.
 * 🔧 Sesión separada: creds.json (+ creds.json.bak) viven SOLOS en AUTH_FOLDER;
 *    las claves de sesión de Baileys van en AUTH_FOLDER/keys/. Se implementa con
 *    un auth state propio (useAuthStateSeparado) con escritura atómica, en lugar
 *    de useMultiFileAuthState (que mezclaba todo en una carpeta).
 *
 * Cambios v3.5.1 (estabilidad: el bot NO se cae; sin cambios de arquitectura):
 * 🔧 CRÍTICO: el bot se caía al enviar (Boom 428 "Connection Closed") y el
 *    hosting lo reiniciaba, corrompiendo la sesión. Ahora:
 *    - process.on("uncaughtException"/"unhandledRejection"): un fallo puntual ya
 *      NO tumba el proceso; se registra y el bot sigue vivo.
 *    - estaConectado(): se comprueba el socket ANTES de enviar; send(),
 *      sendConImagen(), sendReaccion() y presencia() nunca lanzan.
 *    - cada mensaje entrante se procesa en su propio try/catch: si uno falla, se
 *      omite y se continúa con los demás.
 * 🔧 Sesión a prueba de fallos: creds.json vive en su carpeta dedicada y se
 *    respalda (creds.json.bak) tras cada guardado válido. Si se corrompe por un
 *    reinicio abrupto, asegurarSesionIntegra() lo restaura del respaldo en vez
 *    de exigir re-escanear el QR.
 * 🔧 Baileys fijado a 7.0.0-rc14 (antes "latest", que podía traer una versión
 *    rota como la rc.8 que rompía el envío con 428).
 * ✨ Fichas de !empresa y !contacto con etiquetas en negrita, más legibles.
 *
 * Cambios v3.5.0 (respuestas ricas; sin cambios de arquitectura):
 * ✨ Longitud adaptativa: se elimina el tope rígido de 3 párrafos. El prompt pide
 *    respuestas cortas para preguntas simples y completas cuando hacen falta.
 *    MAX_TOKENS_RESPUESTA sube a 4096 para no cortar respuestas largas.
 * ✨ Formato WhatsApp: formatearParaWhatsApp() convierte el Markdown que devuelve
 *    Gemini (**negrita**, ##, [x](url), viñetas) al formato nativo de WhatsApp
 *    (*negrita*, _cursiva_, ~tachado~), para que el texto NO llegue con
 *    asteriscos dobles ni se vea "mal pegado".
 * ✨ Imágenes de la empresa: media/ contiene imágenes por tema (servicios,
 *    contacto, nosotros…). El bot adjunta la que corresponde a la intención del
 *    mensaje. Si falta el archivo, responde con solo texto (nunca falla).
 * ✨ Empresa más completa: empresa.json suma beneficios por servicio, más FAQ
 *    (13), casos de éxito, testimonios y diferenciadores. Los módulos de
 *    contexto aprovechan todo eso; la info interna sigue sin exponerse.
 *
 * Cambios v3.4.4 (cambio de modelo; sin cambios de arquitectura):
 * 🔧 Modelo activo: "gemini-3.5-flash-lite" (familia 3.x, GA). Es el más rápido
 *    y económico de la serie 3.5. thinkingConfig sigue sin enviarse por defecto,
 *    así que no reaparece el 400 de la v3.4.2. MAX_TOKENS_RESPUESTA sube a 1200
 *    porque la familia 3.x piensa por defecto ("medium") y conviene holgura para
 *    que la respuesta no se corte.
 *
 * Cambios v3.4.3 (400 invalid argument; sin cambios de arquitectura):
 * 🔧 El thinkingConfig añadido en la v3.4.2 provocaba "400 Bad Request: invalid
 *    argument" con el alias gemini-flash-latest: el modelo al que apunta no
 *    acepta ese campo. thinkingConfig ya NO se envía por defecto
 *    (GEMINI_THINKING_BUDGET = null); el límite de 800 tokens basta para que las
 *    respuestas no se corten. Se puede reactivar poniendo un número si el modelo
 *    lo soporta.
 * 🔧 El 400 de argumento inválido se clasificaba como "transitorio" y el bot
 *    reintentaba en bucle. Ahora se reconoce como error de configuración
 *    ("modelo") y responde con un aviso claro en vez de reintentar sin fin.
 *
 * Cambios v3.4.2 (respuestas cortadas; sin cambios de arquitectura):
 * 🔧 Las respuestas se truncaban a media frase. Causa: los modelos Gemini 2.5+
 *    Flash "piensan" antes de responder y esos tokens de razonamiento se
 *    descuentan de maxOutputTokens; con el límite en 500, el pensamiento se
 *    comía casi todo y quedaban pocos tokens para la respuesta visible.
 *    Solución: (1) se desactiva el pensamiento (thinkingBudget: 0 en 2.5;
 *    thinkingLevel "low" en 3.x, que no permite apagarlo); (2) el límite sube a
 *    800; (3) si aun así se alcanza el límite, la respuesta se cierra con una
 *    frase completa en vez de enviarse cortada.
 *
 * Cambios v3.4.1 (compatibilidad de modelo; sin cambios de arquitectura):
 * 🔧 Google retiró "gemini-2.5-flash" para claves nuevas (404 "no longer
 *    available to new users"). El modelo por defecto pasa a "gemini-flash-latest",
 *    un alias que apunta siempre al Flash vigente y evita futuros 404.
 * 🔧 El arranque ya distingue el 404 de modelo del error de clave: antes lo
 *    mostraba como "error temporal" genérico. Ahora dice que la CLAVE es válida
 *    y cómo elegir un modelo disponible.
 * ✨ Nueva utilidad: listar-modelos.mjs muestra los modelos que acepta tu clave.
 *
 * Cambios v3.4 (optimización de contexto; arquitectura y flujo intactos):
 * ⚡ TOKENS: El system prompt fijo pasó de ~1.743 a ~320 tokens. La información
 *           detallada de la empresa (servicios, políticas, FAQ, identidad,
 *           contacto, alcance) ya no viaja completa en cada mensaje: un enrutador
 *           de intención (detectarModulos) carga SOLO el/los módulos que el
 *           mensaje necesita, como bloque "CONTEXTO:" del turno. Promedio medido
 *           ≈675 tokens/mensaje (−61%); saludos y charla sin tema ≈320 (−82%).
 *           La empresa NO se simplifica: empresa.json sigue completo; solo cambia
 *           cuánta información llega al modelo en cada turno.
 * ✨ Cada módulo de contexto se compila una vez y se cachea por separado.
 *
 * Cambios v3.3 (evolución; arquitectura y flujo intactos):
 * 🔧 CRÍTICO: La corrección v3.2 (429 = cuota, no key inválida) solo se había
 *             aplicado en menuInicio(). consultarIA() seguía borrando la API Key
 *             ante cualquier error 403, incluido PERMISSION_DENIED por cuota →
 *             el bot se quedaba sin IA en caliente pese a tener una key válida.
 *             La clasificación se centraliza ahora en clasificarErrorGemini().
 * 🔧 CORREGIDO: conversaciones.json se reescribía completo y de forma síncrona
 *             en cada mensaje (bloqueo del event loop, O(contactos) por mensaje).
 *             Ahora la escritura es diferida y atómica (tmp + rename), lo que
 *             además evita dejar el archivo corrupto si el proceso muere a media
 *             escritura (antes: pérdida total del historial).
 * 🔧 CORREGIDO: El Map `recordatorios` se llenaba y no se vaciaba nunca → fuga
 *             de memoria. Cada entrada se elimina al dispararse su temporizador.
 * 🔧 CORREGIDO: esFueraHorario() ya comprueba `respuesta_fuera_horario`; la
 *             condición se evaluaba dos veces en el flujo de mensajes.
 * 🔧 CORREGIDO: La versión estaba escrita a mano en tres sitios y no coincidía
 *             (cabecera v3.2, menú v3.1, package.json 3.2.0) → const VERSION.
 * ⚡ RENDIMIENTO: El system prompt se reconstruía en cada mensaje concatenando
 *             todo empresa.json. Ahora se compila una sola vez y se invalida al
 *             recargar la empresa.
 * ✨ NUEVO: empresa.json admite bloques corporativos (identidad, catálogo,
 *             organización, procesos, estrategia). Solo los de cara al cliente
 *             entran al prompt; los internos quedan excluidos por diseño.
 * ✨ NUEVO: !nosotros (historia, misión, visión y valores).
 *
 * Correcciones v3.2:
 * 🔧 CRÍTICO: La validación de API Key descartaba claves VÁLIDAS cuando Google
 *             devolvía error 429 (quota excedida en el free tier). La clave era
 *             correcta pero el bot la eliminaba → el bot arrancaba sin IA aunque
 *             el usuario ingresara una key buena. Ahora se distingue entre:
 *               • 429 / RESOURCE_EXHAUSTED → cuota agotada, key VÁLIDA (se guarda)
 *               • 401 / 403 / API_KEY_INVALID → key realmente inválida (se descarta)
 *               • Otros errores transitorios → se conserva la key igualmente
 *
 * Correcciones v3.1:
 * 🔧 CRÍTICO: qrcode-terminal faltaba en package.json → bot no arrancaba
 * 🔧 CRÍTICO: El mensaje actual se incluía en el historial de Gemini Y se enviaba
 *             de nuevo con sendMessage → IA recibía cada mensaje duplicado
 * 🔧 CRÍTICO: Sin validación de alternancia user/model en historial de Gemini
 *             → API lanzaba error 400 en conversaciones largas
 * 🔧 CRÍTICO: qrcode-terminal no tiene exports ESM → requiere createRequire
 * 🔧 CORREGIDO: !ping siempre mostraba 0ms (ambos Date.now() síncronos)
 * 🔧 CORREGIDO: Clima usaba hora local del servidor, no la del lugar consultado
 * 🔧 CORREGIDO: !votar usaba senderName como ID (nombres repetidos → mismo voto)
 * 🔧 CORREGIDO: Se creaba instancia GoogleGenerativeAI en cada mensaje → overhead
 * 🔧 CORREGIDO: result.response awaiteado innecesariamente (no es una Promise)
 * 🔧 CORREGIDO: rateLimiter Map crecía indefinidamente → memory leak
 * ✨ NUEVO: Manejadores SIGINT/SIGTERM para cierre limpio del proceso
 * ✨ NUEVO: Limpieza periódica del rateLimiter cada 5 minutos
 * ✨ NUEVO: Open-Meteo usa parámetro `current` moderno (más preciso)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import makeWASocket, {
  initAuthCreds,
  BufferJSON,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
} from "baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import readline from "node:readline";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { GoogleGenerativeAI } from "@google/generative-ai";

// FIX: qrcode-terminal no tiene exports ESM nativos → createRequire obligatorio.
// Sin esto, el import falla silenciosamente o lanza ERR_REQUIRE_ESM en Node 18+.
const require = createRequire(import.meta.url);
const qrcode = require("qrcode-terminal");

// ─── Configuración base ───────────────────────────────────────────────────────

// Única fuente de verdad de la versión: debe coincidir con package.json.
// Antes estaba escrita a mano en la cabecera, en el menú de inicio y en el
// README, y las tres se habían desincronizado.
const VERSION = "3.5.2";

const CONFIG = {
  // IA — Google Gemini
  GEMINI_API_KEY:          process.env.GEMINI_API_KEY || cargarEnvKey(),
  // Modelo activo: Gemini 3.5 Flash-Lite (familia 3.x, GA). Es el modelo más
  // rápido y económico de la serie 3.5, pensado para alto volumen y baja latencia
  // como este bot de atención. Identificador verificado en la documentación
  // oficial de Google (ai.google.dev). Si algún día devuelve 404 por jubilación,
  // ejecuta `node listar-modelos.mjs` para ver los modelos disponibles con tu
  // clave, o usa el alias "gemini-flash-lite-latest" para que se actualice solo.
  GEMINI_MODEL:            "gemini-3.5-flash-lite",
  // Presupuesto de tokens de la respuesta VISIBLE. Los modelos que "piensan"
  // (Gemini 2.5+ y toda la familia 3.x) gastan tokens de razonamiento de este
  // mismo presupuesto antes de escribir. El usuario pidió respuestas sin límite
  // rígido: la brevedad la controla el prompt (longitud adaptativa), no un tope
  // bajo. 4096 deja sitio de sobra para respuestas largas cuando hacen falta,
  // más el pensamiento del modelo. Flash-Lite solo cobra los tokens generados,
  // así que subir el tope no encarece las respuestas cortas.
  MAX_TOKENS_RESPUESTA:    4096,
  // Control del "pensamiento" del modelo. Desactivado por defecto (null) porque
  // NO todos los modelos aceptan thinkingConfig: enviarlo a un modelo que no lo
  // soporta —o a uno donde el pensamiento es constante, como algunas versiones a
  // las que apunta el alias gemini-flash-latest— provoca un 400 INVALID_ARGUMENT
  // y el bot deja de responder. El límite de 800 tokens ya evita por sí solo que
  // las respuestas se corten, así que este ajuste es opcional.
  //   null → no se envía thinkingConfig (compatible con cualquier modelo).
  //   0    → intenta desactivar el pensamiento (solo modelos 2.5 que lo permitan).
  //   >0   → presupuesto de pensamiento en tokens (p. ej. 128).
  // Si tu modelo es 2.5-flash "clásico" y quieres respuestas aún más rápidas,
  // prueba 0; si ves un 400 al escribir, vuelve a dejarlo en null.
  GEMINI_THINKING_BUDGET:  null,

  // Archivos
  // AUTH_FOLDER contiene ÚNICAMENTE creds.json y su respaldo creds.json.bak.
  // Las claves de sesión de Baileys (pre-key-*, session-*, sender-key-*, que son
  // obligatorias para descifrar mensajes) viven en la subcarpeta KEYS_FOLDER,
  // separadas de las credenciales. Ver useAuthStateSeparado().
  AUTH_FOLDER:             "auth_folder",
  KEYS_SUBFOLDER:          "keys",   // dentro de AUTH_FOLDER
  DB_EMPRESA:              "empresa.json",
  DB_CONVERSACIONES:       "conversaciones.json",
  ENV_FILE:                ".env",
  MEDIA_FOLDER:            "media",   // imágenes de la empresa (logo, servicios…)

  // Envío de imágenes junto a las respuestas.
  //   true  → adjunta la imagen de la empresa según el tema del mensaje.
  //   false → solo texto (útil si las imágenes aún son placeholders).
  ENVIAR_IMAGENES:         true,

  // Reconexión
  MAX_RECONNECT_ATTEMPTS:  8,
  RECONNECT_BASE_DELAY_MS: 4000,

  // Anti-spam: máximo N mensajes por minuto por contacto
  RATE_LIMIT_MAX:          8,
  RATE_LIMIT_WINDOW_MS:    60_000,

  // Grupos: true = responder en grupos también
  RESPONDER_GRUPOS:        false,
};

// ─── Cargar / guardar .env ────────────────────────────────────────────────────

function cargarEnvKey() {
  try {
    if (fs.existsSync(".env")) {
      const contenido = fs.readFileSync(".env", "utf-8");
      const match = contenido.match(/^GEMINI_API_KEY=(.+)$/m);
      if (match) return match[1].trim();
    }
  } catch (_) {}
  return "";
}

function guardarEnvKey(key) {
  try {
    let contenido = fs.existsSync(".env") ? fs.readFileSync(".env", "utf-8") : "";
    if (/^GEMINI_API_KEY=.*/m.test(contenido)) {
      contenido = contenido.replace(/^GEMINI_API_KEY=.*/m, `GEMINI_API_KEY=${key}`);
    } else {
      contenido += (contenido.endsWith("\n") || !contenido ? "" : "\n") + `GEMINI_API_KEY=${key}\n`;
    }
    fs.writeFileSync(".env", contenido, "utf-8");
  } catch (e) {
    console.error("⚠️  No se pudo guardar el .env:", e.message);
  }
}

// ─── Logger (silencioso para no contaminar la consola) ───────────────────────

const logger = pino({ level: "silent" });

// ─── readline ─────────────────────────────────────────────────────────────────

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const pregunta = (texto) => new Promise((resolve) => rl.question(texto, (ans) => resolve(ans.trim())));
const cerrarRL = () => { try { rl.close(); } catch (_) {} };

// ─── Persistencia JSON ───────────────────────────────────────────────────────

function cargarJSON(archivo, valorDefecto) {
  try {
    if (fs.existsSync(archivo)) return JSON.parse(fs.readFileSync(archivo, "utf-8"));
  } catch (e) {
    console.error(`⚠️  Error leyendo ${archivo}:`, e.message);
  }
  return valorDefecto;
}

/**
 * Escritura ATÓMICA: se escribe en un temporal y se renombra. rename() es una
 * operación atómica del sistema de archivos, de modo que el archivo destino
 * nunca queda a medias.
 *
 * FIX: writeFileSync() directo sobre el archivo real dejaba conversaciones.json
 * truncado si el proceso moría durante la escritura. Al arrancar, JSON.parse()
 * fallaba y cargarJSON() devolvía el valor por defecto → se perdía TODO el
 * historial de conversaciones.
 */
function guardarJSON(archivo, datos) {
  const tmp = `${archivo}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(datos, null, 2), "utf-8");
    fs.renameSync(tmp, archivo);
  } catch (e) {
    console.error(`⚠️  Error guardando ${archivo}:`, e.message);
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (_) {}
  }
}

/**
 * Guardado diferido para archivos de escritura muy frecuente.
 *
 * FIX (cuello de botella): registrarMensaje() llamaba a guardarJSON() en cada
 * mensaje entrante y en cada respuesta, serializando el objeto COMPLETO de
 * conversaciones (todos los contactos) de forma síncrona. Con la base de
 * contactos creciendo, el coste por mensaje crecía con ella y bloqueaba el
 * event loop justo mientras se atendía a un usuario.
 *
 * Ahora las escrituras se agrupan en una ventana corta. El cierre limpio
 * (gracefulShutdown) fuerza el volcado pendiente, así que no se pierde nada.
 */
const escriturasPendientes = new Map(); // archivo → timeout

function guardarJSONDiferido(archivo, datos, esperaMs = 2000) {
  if (escriturasPendientes.has(archivo)) return; // ya hay un volcado programado
  const id = setTimeout(() => {
    escriturasPendientes.delete(archivo);
    guardarJSON(archivo, datos);
  }, esperaMs);
  id.unref?.(); // no debe mantener vivo el proceso por sí solo
  escriturasPendientes.set(archivo, id);
}

/** Fuerza los volcados pendientes (cierre limpio, comandos que deben persistir ya). */
function vaciarEscriturasPendientes(archivo, datos) {
  const id = escriturasPendientes.get(archivo);
  if (id) {
    clearTimeout(id);
    escriturasPendientes.delete(archivo);
  }
  guardarJSON(archivo, datos);
}

// ─── Sesión de WhatsApp: creds separadas de las claves ───────────────────────
//
// Baileys necesita dos cosas: las CREDENCIALES (creds.json, la identidad del
// dispositivo) y las CLAVES de sesión (pre-keys, sesiones de cifrado, sender
// keys… obligatorias para descifrar mensajes). El useMultiFileAuthState estándar
// las mezcla todas en una misma carpeta.
//
// Aquí se separan físicamente, como pide el proyecto:
//   AUTH_FOLDER/            → SOLO creds.json y creds.json.bak
//   AUTH_FOLDER/keys/       → las claves de sesión (una por archivo)
//
// creds.json se respalda tras cada guardado válido y se restaura solo si se
// corrompe, para no tener que re-escanear el QR ante un reinicio abrupto.

function dirAuth()      { return path.join(process.cwd(), CONFIG.AUTH_FOLDER); }
function dirKeys()      { return path.join(dirAuth(), CONFIG.KEYS_SUBFOLDER); }
function rutaCreds()    { return path.join(dirAuth(), "creds.json"); }
function rutaCredsBak() { return path.join(dirAuth(), "creds.json.bak"); }

/** ¿El archivo existe y es JSON válido (no truncado)? */
function jsonValido(ruta) {
  try {
    const txt = fs.readFileSync(ruta, "utf-8");
    JSON.parse(txt);
    return txt.trim().length > 0;
  } catch (_) {
    return false;
  }
}

/** Copia creds.json → creds.json.bak solo si el original está sano. */
function respaldarCreds() {
  try {
    const creds = rutaCreds();
    if (jsonValido(creds)) fs.copyFileSync(creds, rutaCredsBak());
  } catch (err) {
    console.error("⚠️  No se pudo respaldar creds.json:", err?.message || err);
  }
}

/**
 * Garantiza que las carpetas existan y que creds.json no esté corrupto. Si lo
 * está pero hay respaldo válido, lo restaura. Se llama antes de arrancar.
 */
function asegurarSesionIntegra() {
  try {
    if (!fs.existsSync(dirAuth()))  fs.mkdirSync(dirAuth(),  { recursive: true });
    if (!fs.existsSync(dirKeys()))  fs.mkdirSync(dirKeys(),  { recursive: true });
    const creds = rutaCreds(), bak = rutaCredsBak();
    if (fs.existsSync(creds) && !jsonValido(creds)) {
      if (jsonValido(bak)) {
        fs.copyFileSync(bak, creds);
        console.log("♻️  creds.json estaba dañado: restaurado desde el respaldo.");
      } else {
        console.log("⚠️  creds.json dañado y sin respaldo válido. Habrá que re-vincular.");
      }
    }
  } catch (err) {
    console.error("⚠️  Error verificando la sesión:", err?.message || err);
  }
}

/**
 * Auth state personalizado (reemplaza a useMultiFileAuthState) que guarda:
 *   - creds.json en AUTH_FOLDER (solo eso + su respaldo)
 *   - cada clave de sesión como un archivo dentro de AUTH_FOLDER/keys/
 *
 * Escritura atómica (tmp + rename) para que un corte a media escritura no deje
 * un archivo truncado. Devuelve { state, saveCreds } con la misma interfaz que
 * useMultiFileAuthState, así el resto de startBot() no cambia.
 */
async function useAuthStateSeparado() {
  asegurarSesionIntegra();

  const escribir = (ruta, valor) => {
    const tmp = `${ruta}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(valor, BufferJSON.replacer));
    fs.renameSync(tmp, ruta);
  };
  const leer = (ruta) => {
    try { return JSON.parse(fs.readFileSync(ruta, "utf-8"), BufferJSON.reviver); }
    catch (_) { return null; }
  };
  // Nombre de archivo seguro para una clave (evita / y otros caracteres).
  const archivoClave = (tipo, id) =>
    path.join(dirKeys(), `${tipo}-${id}`.replace(/[^0-9A-Za-z._-]/g, "_") + ".json");

  const creds = leer(rutaCreds()) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: (tipo, ids) => {
          const data = {};
          for (const id of ids) {
            let valor = leer(archivoClave(tipo, id));
            // app-state-sync-key debe devolverse como estructura del protobuf.
            if (tipo === "app-state-sync-key" && valor) {
              valor = valor; // BufferJSON ya lo reconstruye; Baileys lo acepta.
            }
            if (valor) data[id] = valor;
          }
          return data;
        },
        set: (datos) => {
          for (const tipo in datos) {
            for (const id in datos[tipo]) {
              const valor = datos[tipo][id];
              const ruta  = archivoClave(tipo, id);
              if (valor) escribir(ruta, valor);
              else { try { fs.existsSync(ruta) && fs.unlinkSync(ruta); } catch (_) {} }
            }
          }
        },
      },
    },
    saveCreds: () => {
      escribir(rutaCreds(), creds);
      respaldarCreds();
    },
  };
}

// ─── Empresa ─────────────────────────────────────────────────────────────────

if (!fs.existsSync(CONFIG.DB_EMPRESA)) {
  guardarJSON(CONFIG.DB_EMPRESA, {
    nombre:      "Mi Empresa S.A.S.",
    sector:      "Tecnología",
    descripcion: "Empresa dedicada al desarrollo de software y soluciones digitales.",
    horario:     "Lunes a Viernes de 8:00 AM a 6:00 PM",
    horario_inicio: 8,
    horario_fin:    18,
    dias_habil:  [1, 2, 3, 4, 5],
    telefono:    "+57 300 000 0000",
    email:       "info@miempresa.com",
    direccion:   "Calle 100 #15-20, Bogotá, Colombia",
    productos:   ["Desarrollo de aplicaciones web", "Chatbots empresariales", "Consultoría tecnológica"],
    politicas: {
      devolucion: "30 días de garantía en todos los productos.",
      envio:      "Entrega digital inmediata tras confirmación de pago.",
      pago:       "Aceptamos transferencia, PSE, tarjeta de crédito y débito.",
    },
    faqs: [
      { pregunta: "¿Cuánto tarda un proyecto?",  respuesta: "Entre 2 y 8 semanas según la complejidad." },
      { pregunta: "¿Ofrecen soporte post-venta?", respuesta: "Sí, 3 meses de soporte gratuito incluido." },
      { pregunta: "¿Tienen sede física?",         respuesta: "Sí, en Bogotá. También atendemos de forma virtual." },
    ],
    respuesta_fuera_horario: true,
    mensaje_fuera_horario:   "Gracias por escribirnos 🙏 Estamos fuera de horario. Te responderemos pronto.",
  });
  console.log(`\n📝 Se creó ${CONFIG.DB_EMPRESA} con datos de plantilla.\n`);
}

let empresa        = cargarJSON(CONFIG.DB_EMPRESA, {});
let conversaciones = cargarJSON(CONFIG.DB_CONVERSACIONES, {});

function recargarEmpresa() {
  empresa = cargarJSON(CONFIG.DB_EMPRESA, empresa);
  // El contexto de la empresa viaja en el system prompt, no en el cliente de IA:
  // recrear GoogleGenerativeAI aquí (como se hacía antes) no cambiaba nada. Lo
  // que sí debe rehacerse es el prompt compilado y el modelo que lo lleva dentro.
  invalidarCacheIA();
  return empresa;
}

// ─── Singleton de Google Generative AI ───────────────────────────────────────
// FIX: Antes se creaba una nueva instancia en cada mensaje → overhead innecesario.
// Ahora se inicializa una sola vez y se reutiliza. Se reinicializa solo al
// cambiar la API Key o recargar empresa.json.

let genAI = CONFIG.GEMINI_API_KEY ? new GoogleGenerativeAI(CONFIG.GEMINI_API_KEY) : null;

// ─── Anti-spam con limpieza automática ───────────────────────────────────────

const rateLimiter = new Map(); // jid → [timestamps]

function verificarRateLimit(jid) {
  const ahora  = Date.now();
  const tiempos = (rateLimiter.get(jid) || []).filter((t) => ahora - t < CONFIG.RATE_LIMIT_WINDOW_MS);
  tiempos.push(ahora);
  rateLimiter.set(jid, tiempos);
  return tiempos.length <= CONFIG.RATE_LIMIT_MAX;
}

// FIX: El Map crecía indefinidamente. Limpieza periódica cada 5 minutos
// para eliminar entradas de contactos inactivos.
setInterval(() => {
  const ahora = Date.now();
  for (const [jid, tiempos] of rateLimiter) {
    const activos = tiempos.filter((t) => ahora - t < CONFIG.RATE_LIMIT_WINDOW_MS);
    if (activos.length === 0) rateLimiter.delete(jid);
    else rateLimiter.set(jid, activos);
  }
}, 5 * 60_000);

// ─── Historial de conversación ────────────────────────────────────────────────

function registrarMensaje(jid, rol, contenido) {
  if (!conversaciones[jid]) conversaciones[jid] = [];
  conversaciones[jid].push({ rol, contenido, ts: new Date().toISOString() });
  if (conversaciones[jid].length > 40) conversaciones[jid].splice(0, 20);
  // Camino caliente: se agrupan las escrituras en lugar de volcar el archivo
  // completo por cada mensaje. gracefulShutdown() fuerza el volcado pendiente.
  guardarJSONDiferido(CONFIG.DB_CONVERSACIONES, conversaciones);
}

/**
 * Construye el historial para Gemini a partir de los mensajes almacenados.
 *
 * FIX CRÍTICO #1: Esta función debe llamarse ANTES de registrar el mensaje actual
 * del usuario. Si se llamara después, el mensaje actual estaría en el historial
 * Y también sería enviado por sendMessage → Gemini lo recibiría duplicado.
 *
 * FIX CRÍTICO #2: Gemini exige que el historial alterne estrictamente
 * user → model → user → model y empiece con "user". Mensajes huérfanos
 * (sin par) causan el error 400 "roles must alternate". Esta función solo
 * incluye pares completos user+model para garantizar el formato correcto.
 *
 * @param {Array} historialRaw - conversaciones[jid] ANTES del mensaje actual
 * @returns {Array} Historial validado en formato Gemini
 */
function buildGeminiHistory(historialRaw = []) {
  const pares = [];
  let i = 0;
  while (i < historialRaw.length - 1) {
    const curr = historialRaw[i];
    const next = historialRaw[i + 1];
    if (curr.rol === "user" && next.rol === "bot") {
      pares.push(
        { role: "user",  parts: [{ text: curr.contenido }] },
        { role: "model", parts: [{ text: next.contenido }] }
      );
      i += 2; // avanzar el par completo
    } else {
      i++; // descartar mensaje huérfano
    }
  }
  // Últimos 10 pares (20 mensajes) para no exceder el contexto de Gemini
  return pares.slice(-20);
}

// ─── Clasificación de errores de Gemini ──────────────────────────────────────

/**
 * Clasifica un error de la API de Gemini en una de tres categorías.
 *
 * FIX CRÍTICO v3.3: esta lógica existía SOLO dentro de menuInicio(). En
 * consultarIA() había una versión distinta y más débil que descartaba la API Key
 * ante `e.status === 403` sin comprobar antes si el error era de cuota. Google
 * responde 403 PERMISSION_DENIED en varios escenarios de cuota y facturación, de
 * modo que el bot borraba en caliente una clave perfectamente válida y se quedaba
 * sin IA hasta el siguiente reinicio: exactamente el fallo que la v3.2 arregló en
 * el arranque, pero que seguía vivo en tiempo de ejecución.
 *
 * Tener una sola función evita que ambas rutas vuelvan a divergir.
 *
 * @param {Error} e
 * @returns {"cuota"|"key_invalida"|"modelo"|"transitorio"}
 */
function clasificarErrorGemini(e) {
  const msg = String(e?.message || "");
  const status = e?.status ?? e?.response?.status;

  // La cuota se evalúa PRIMERO: un 429/RESOURCE_EXHAUSTED significa que la clave
  // es correcta y solo hay que esperar. Nunca debe tratarse como clave inválida.
  if (
    status === 429 ||
    msg.includes("429") ||
    /quota/i.test(msg) ||
    msg.includes("RESOURCE_EXHAUSTED") ||
    msg.includes("Too Many Requests")
  ) return "cuota";

  // Solo se descarta la clave cuando Google dice explícitamente que no sirve.
  if (
    msg.includes("API key not valid") ||
    msg.includes("API_KEY_INVALID")   ||
    msg.includes("INVALID_API_KEY")   ||
    status === 401 || status === 403  ||
    msg.includes("401")
  ) return "key_invalida";

  // Modelo o argumento no válido: no tiene sentido reintentar, es de config.
  // El texto llega en varias formas: "404", "not found", "INVALID_ARGUMENT" o
  // "[400 Bad Request] Request contains an invalid argument" (minúsculas).
  if (
    msg.includes("404") ||
    /not found/i.test(msg) ||
    /invalid argument/i.test(msg) ||
    msg.includes("INVALID_ARGUMENT") ||
    status === 400 ||
    msg.includes("400")
  ) {
    return "modelo";
  }

  // Red, timeout o error puntual: se conserva la clave.
  return "transitorio";
}

// ─── System prompt (compilado una sola vez) ──────────────────────────────────

// ─── Contexto empresarial modular (lazy loading) ─────────────────────────────
//
// El system prompt viaja en CADA mensaje. Enviar toda la información de la
// empresa (servicios, políticas, FAQ, identidad…) costaba ~1.743 tokens por
// mensaje aunque el usuario preguntara una sola cosa.
//
// Rediseño v3.4: se separa el contexto en dos capas.
//   1. PROMPT BASE (fijo, ~320 tokens): identidad mínima, un índice de los temas
//      disponibles y las instrucciones. Va en systemInstruction y se cachea.
//   2. MÓDULOS (bajo demanda): servicios, políticas, FAQ, identidad, contacto y
//      alcance. Cada módulo se compila una vez y se cachea por separado. En cada
//      mensaje, un enrutador de intención decide QUÉ módulos añadir, y solo esos
//      viajan como bloque "CONTEXTO:" del turno.
//
// La información de la empresa NO se reduce: sigue completa en empresa.json.
// Solo cambia CUÁNTA viaja al modelo en cada mensaje. Los bloques internos
// (organizacion, procesos, estrategia) siguen sin exponerse nunca.

/** Normaliza texto para el enrutador: minúsculas y sin acentos. */
function normalizar(s) {
  return String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Compiladores de cada módulo. Reciben `empresa` y devuelven texto plano.
const COMPILAR_MODULO = {
  servicios(e) {
    if (!Array.isArray(e.catalogo) || !e.catalogo.length) {
      return `Servicios: ${(e.productos || []).join(", ")}`;
    }
    const detalle = e.catalogo.map((s) => {
      const precio = s.precio_desde_cop
        ? `desde COP ${Number(s.precio_desde_cop).toLocaleString("es-CO")}`
        : "precio a cotizar";
      let linea = `- ${s.servicio}: ${s.descripcion} (Modalidad: ${s.modalidad || "N/A"}. ` +
             `Duración: ${s.duracion || "N/A"}. Precio ${precio}, sin IVA. ` +
             `Entregable: ${s.entregable || "N/A"}.)`;
      if (Array.isArray(s.beneficios) && s.beneficios.length) {
        linea += `\n  Beneficios: ${s.beneficios.join("; ")}.`;
      }
      if (s.ideal_para) linea += `\n  Ideal para: ${s.ideal_para}`;
      return linea;
    }).join("\n");
    let out = `Servicios:\n${detalle}`;
    // Diferenciadores: por qué elegir la firma (si hay consulta de servicios,
    // suele ayudar a cerrar).
    if (Array.isArray(e.por_que_nosotros) && e.por_que_nosotros.length) {
      out += `\n\nPor qué elegirnos:\n- ${e.por_que_nosotros.join("\n- ")}`;
    }
    return out;
  },
  politicas(e) {
    const pol = e.politicas || {};
    if (!Object.keys(pol).length) return "";
    return "Políticas:\n" + Object.entries(pol).map(([k, v]) => `- ${k}: ${v}`).join("\n");
  },
  faqs(e) {
    if (!e.faqs?.length) return "";
    return "Preguntas frecuentes:\n" + e.faqs.map((f) => `- P: ${f.pregunta}\n  R: ${f.respuesta}`).join("\n");
  },
  identidad(e) {
    const id = e.identidad;
    if (!id) return "";
    const partes = [];
    if (id.historia) partes.push(`- Historia: ${id.historia}`);
    if (id.mision)   partes.push(`- Misión: ${id.mision}`);
    if (id.vision)   partes.push(`- Visión: ${id.vision}`);
    if (id.valores?.length) partes.push(`- Valores: ${id.valores.join(" ")}`);
    let out = partes.length ? `Identidad de la empresa:\n${partes.join("\n")}` : "";
    if (Array.isArray(e.casos_exito) && e.casos_exito.length) {
      const casos = e.casos_exito
        .map((c) => `- ${c.sector}: ${c.reto} → ${c.solucion} Resultado: ${c.resultado}`)
        .join("\n");
      out += `\n\nCasos de éxito (anonimizados):\n${casos}`;
    }
    if (Array.isArray(e.testimonios) && e.testimonios.length) {
      const tst = e.testimonios.map((t) => `- "${t.texto}" (${t.autor})`).join("\n");
      out += `\n\nTestimonios:\n${tst}`;
    }
    return out;
  },
  contacto(e) {
    const canales = Array.isArray(e.canales_atencion)
      ? "\n" + e.canales_atencion.map((c) => `- ${c.canal}: ${c.detalle} (${c.horario})`).join("\n")
      : "";
    return `Contacto y canales:\n- Teléfono: ${e.telefono || "N/A"}\n- Email: ${e.email || "N/A"}\n` +
           `- Dirección: ${e.direccion || "N/A"}\n- Horario: ${e.horario || "N/A"}${canales}`;
  },
  alcance(e) {
    const co = e.clientes_objetivo;
    if (!co) return "";
    const partes = [];
    if (co.segmento_primario) partes.push(`- Segmento objetivo: ${co.segmento_primario}`);
    if (co.no_atendemos)      partes.push(`- Fuera de alcance: ${co.no_atendemos}`);
    return partes.length ? `Alcance de la empresa:\n${partes.join("\n")}` : "";
  },
};

// Palabras/frases clave por módulo (normalizadas sin acentos al comparar).
const INTENCION_KW = {
  servicios: ["servicio", "precio", "cuesta", "costo", "vale", "tarifa", "cotiz",
              "cobran", "catalogo", "diagnostico", "consultoria", "automatiz",
              "formacion", "adopcion", "optimizacion de procesos", "producto"],
  politicas: ["politica", "pago", "pagar", "se paga", "forma de pago", "metodo de pago",
              "factura", "cancel", "reprogram", "reembolso", "devoluc", "garantia",
              "confidencial", "privacidad", "proteg", "contrato", "anticipo", "iva"],
  faqs:      ["tardan", "tarda", "demoran", "tiempo de entrega", "cuanto dura",
              "presencial", "virtual", "sede fisica", "atienden a empresas",
              "trabajan con empresas", "soporte", "post-venta", "postventa"],
  identidad: ["historia", "mision", "vision", "valores", "quienes son",
              "sobre ustedes", "fundacion", "cuando nacieron", "sobre la empresa",
              "cultura", "filosofia", "trayectoria"],
  contacto:  ["telefono", "llamar", "correo", "email", "direccion", "donde estan",
              "donde quedan", "ubicacion", "oficina", "como los contacto",
              "como contacto", "a que hora", "horario"],
  alcance:   ["hacen desarrollo", "hacen software", "desarrollo a la medida",
              "desarrollo de software", "tipo de cliente", "fuera de alcance",
              "infraestructura", "redes", "soporte tecnico de equipos"],
};

/**
 * Enrutador de intención: decide qué módulos de contexto necesita el mensaje.
 *
 * @param {string} texto - Mensaje del usuario
 * @returns {string[]} nombres de módulos a inyectar (posiblemente vacío)
 */
function detectarModulos(texto) {
  const t = " " + normalizar(texto) + " ";
  const activos = new Set();
  for (const [nombre, kws] of Object.entries(INTENCION_KW)) {
    if (kws.some((k) => t.includes(normalizar(k)))) activos.add(nombre);
  }
  // Desambiguación: "proteger/confidencial la información" es una duda de
  // política de datos, no de servicios ni de tipo de cliente. La palabra
  // "empresa" en "mi empresa" tiende a activar varios módulos por error.
  if (activos.has("politicas") &&
      /(proteg|confidencial|privacidad).*(informacion|dato|empresa)/.test(t)) {
    return ["politicas"];
  }
  return [...activos];
}

/**
 * Construye el bloque "CONTEXTO:" del turno con solo los módulos pertinentes.
 * Devuelve "" si el mensaje no necesita contexto adicional (p. ej. un saludo).
 */
function construirContextoTurno(texto) {
  const modulos = detectarModulos(texto);
  if (!modulos.length) return "";
  const bloques = modulos
    .map((m) => moduloCache[m] ??= COMPILAR_MODULO[m](empresa))
    .filter(Boolean);
  return bloques.length ? `CONTEXTO:\n${bloques.join("\n\n")}` : "";
}

// ─── Imágenes de la empresa ──────────────────────────────────────────────────
//
// Las imágenes viven en la carpeta CONFIG.MEDIA_FOLDER ("media/"). Se envían
// junto a la respuesta según el tema detectado, para que el mensaje se vea más
// completo y corporativo. Si una imagen no existe, el bot envía solo texto: las
// imágenes son un plus, nunca un punto de fallo.

// Qué imagen corresponde a cada módulo de intención. El nombre es el del archivo
// dentro de media/ (sin depender de la extensión: rutaImagen prueba varias).
const IMAGEN_POR_MODULO = {
  servicios: "servicios",
  politicas: "politicas",
  identidad: "nosotros",
  contacto:  "contacto",
  faqs:      "faqs",
  alcance:   "servicios",
};
const IMAGEN_BIENVENIDA = "bienvenida";
const EXTENSIONES_IMG = [".jpg", ".jpeg", ".png", ".webp"];

/**
 * Devuelve la ruta absoluta de una imagen de media/ si existe (probando las
 * extensiones comunes), o null si no hay archivo. Cachea el resultado para no
 * tocar el disco en cada mensaje.
 */
const _cacheRutaImg = new Map();
function rutaImagen(nombre) {
  if (!nombre) return null;
  if (_cacheRutaImg.has(nombre)) return _cacheRutaImg.get(nombre);
  let encontrada = null;
  for (const ext of EXTENSIONES_IMG) {
    const ruta = path.join(process.cwd(), CONFIG.MEDIA_FOLDER, nombre + ext);
    if (fs.existsSync(ruta)) { encontrada = ruta; break; }
  }
  _cacheRutaImg.set(nombre, encontrada);
  return encontrada;
}

/**
 * Decide qué imagen (si alguna) acompaña a una respuesta de la IA, a partir del
 * mensaje del usuario. Devuelve el nombre de archivo o null.
 */
function imagenParaMensaje(textoUsuario) {
  if (!CONFIG.ENVIAR_IMAGENES) return null;
  const modulos = detectarModulos(textoUsuario);
  for (const m of modulos) {
    const img = IMAGEN_POR_MODULO[m];
    if (img && rutaImagen(img)) return img;
  }
  return null;
}

/**
 * Compila el PROMPT BASE ligero: identidad mínima + índice de temas + reglas.
 * No incluye el detalle de servicios, políticas ni FAQ: esos llegan por módulo.
 */
function construirSystemPrompt() {
  const nombre = empresa.nombre || "la empresa";
  const ciudad = empresa.identidad?.ciudad || "";
  const temas  = Object.keys(COMPILAR_MODULO).join(", ");
  const reserva = empresa.divulgacion?.instruccion_asistente
    || "No reveles información interna de la empresa.";

  return `Eres el asistente virtual de ${nombre}.
Sector: ${empresa.sector || "N/A"}
Descripción: ${empresa.descripcion || "N/A"}
Horario: ${empresa.horario || "N/A"}
Contacto: ${empresa.telefono || ""} | ${empresa.email || ""}${ciudad ? `\nCiudad: ${ciudad}` : ""}

Dispones de información detallada sobre estos temas: ${temas}. Cuando el mensaje incluya un bloque rotulado "CONTEXTO:", trátalo como la fuente de verdad y responde a partir de él. Si el usuario pregunta por un tema del que no recibiste contexto, respóndele con lo que sepas y, si hace falta el detalle, ofrécele comunicar con un asesor.

Instrucciones:
- Responde siempre en español, de forma amable y profesional.
- No inventes información que no esté en el contexto.
- ${reserva}
- Ajusta la longitud a la pregunta: si es simple (un saludo, un dato puntual, un
  sí/no), responde en 1-2 frases; si el usuario pide detalles, comparaciones o
  varias cosas a la vez, extiéndete lo necesario para responder completo, sin
  cortar la información. No rellenes ni repitas para alargar.
- Usa el formato de WhatsApp para que el mensaje se lea ordenado: *negrita* para
  lo importante (nombres, precios, títulos), _cursiva_ para matices, y viñetas
  con "- " cuando enumeres. NO uses Markdown (**dobles asteriscos**, ##, etc.).
- Usa emojis con moderación para hacer la conversación más amigable.
- Si el usuario saluda, salúdalo de vuelta presentándote como asistente de ${nombre}.`;
}

// Caché del prompt base, del modelo y de cada módulo de contexto.
// El prompt base y el modelo solo cambian al recargar la empresa o la API Key.
// Los módulos se compilan la primera vez que se necesitan y se reutilizan.
let systemPromptCache = null;
let modelCache        = null;
let moduloCache       = {};

function invalidarCacheIA() {
  systemPromptCache = null;
  modelCache        = null;
  moduloCache       = {}; // los módulos dependen de empresa.json
}

/**
 * Config de generación para las llamadas a Gemini.
 *
 * Por defecto solo fija maxOutputTokens, que es lo único universalmente aceptado
 * y suficiente para evitar respuestas cortadas. El thinkingConfig NO se envía a
 * menos que el operador lo pida explícitamente (CONFIG.GEMINI_THINKING_BUDGET !=
 * null), porque enviarlo a un modelo que no lo soporta —o donde el pensamiento
 * es constante, como algunas versiones del alias gemini-flash-latest— devuelve
 * un 400 INVALID_ARGUMENT y el bot deja de responder.
 */
function construirGenerationConfig() {
  const cfg = { maxOutputTokens: CONFIG.MAX_TOKENS_RESPUESTA };
  const budget = CONFIG.GEMINI_THINKING_BUDGET;

  // Solo se añade si el operador lo configuró a un número (0 o un presupuesto).
  // Con null (valor por defecto) no se toca: compatible con cualquier modelo.
  if (typeof budget === "number") {
    cfg.thinkingConfig = { thinkingBudget: budget };
  }
  return cfg;
}

function obtenerModeloIA() {
  if (!genAI) return null;
  if (!modelCache) {
    systemPromptCache ??= construirSystemPrompt();
    modelCache = genAI.getGenerativeModel({
      model: CONFIG.GEMINI_MODEL,
      systemInstruction: systemPromptCache,
      generationConfig: construirGenerationConfig(),
    });
  }
  return modelCache;
}

// ─── IA con Google Gemini ────────────────────────────────────────────────────

/**
 * Consulta Gemini con el mensaje actual y el historial previo ya validado.
 *
 * El contexto empresarial pertinente se inyecta SOLO para el mensaje actual,
 * anteponiéndolo al texto del usuario. No entra en el historial persistido, de
 * modo que no se acumula turno tras turno.
 *
 * @param {string} preguntaUsuario  - Mensaje actual del usuario
 * @param {Array}  historialGemini  - Historial pre-validado por buildGeminiHistory()
 */
async function consultarIA(preguntaUsuario, historialGemini = []) {
  if (!CONFIG.GEMINI_API_KEY || !genAI) {
    return "⚠️ La IA no está configurada. Agrega tu GEMINI_API_KEY al iniciar el bot.";
  }

  try {
    const model = obtenerModeloIA();

    // historialGemini ya está validado y NO contiene el mensaje actual.
    // sendMessage() agrega el mensaje actual al contexto internamente.
    // El modelo ya se crea con generationConfig (maxOutputTokens + thinking),
    // así que no hace falta repetirla aquí.
    const chatSession = model.startChat({ history: historialGemini });

    // Lazy loading: solo los módulos que la intención del mensaje requiere.
    const contexto = construirContextoTurno(preguntaUsuario);
    const mensaje  = contexto ? `${contexto}\n\nUsuario: ${preguntaUsuario}` : preguntaUsuario;

    // FIX: result.response NO es una Promise en @google/generative-ai.
    // El await adicional era innecesario; result.response ya es el objeto respuesta.
    const result = await chatSession.sendMessage(mensaje);
    const respuesta = result.response.text() || "";

    // Red de seguridad: si el modelo se detiene por límite de tokens (MAX_TOKENS),
    // la respuesta llega cortada a media frase. Antes esto se enviaba tal cual
    // (el usuario veía un "...¿En" sin terminar). Ahora se detecta y se cierra
    // con una frase completa en vez de dejar la oración truncada.
    const razon = result.response.candidates?.[0]?.finishReason;
    if (razon === "MAX_TOKENS" && respuesta) {
      const corte = respuesta.replace(/\s+\S*$/, "").trim();
      return `${corte}\n\n¿Deseas que te amplíe algún punto? 😊`;
    }

    return respuesta || "No pude generar una respuesta.";

  } catch (e) {
    const tipo = clasificarErrorGemini(e);
    console.error(`❌ Error conectando con Gemini API [${tipo}]:`, e.message);

    switch (tipo) {
      case "cuota":
        // La clave es válida: NO se descarta. Solo hay que esperar a que se
        // renueve la cuota del free tier.
        return "⏳ Límite de uso de IA alcanzado. Intenta de nuevo en un momento.";

      case "key_invalida":
        CONFIG.GEMINI_API_KEY = "";
        genAI = null;
        invalidarCacheIA();
        return "🔑 La API Key de IA es inválida. Reinicia el bot y verifica tu clave en aistudio.google.com.";

      case "modelo":
        // Google retira versiones de modelo (404 "no longer available"). El
        // administrador puede ejecutar `node listar-modelos.mjs` para ver los
        // identificadores válidos y actualizar CONFIG.GEMINI_MODEL.
        console.error(
          `   El modelo "${CONFIG.GEMINI_MODEL}" no está disponible para esta clave.\n` +
          `   Ejecuta: node listar-modelos.mjs  y actualiza CONFIG.GEMINI_MODEL en index.js.`
        );
        return "⚠️ Modelo de IA no disponible en este momento. El administrador debe actualizar la configuración.";

      default:
        return "Lo siento, hubo un problema con el asistente IA. Intenta de nuevo en unos momentos.";
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Formato de texto para WhatsApp ──────────────────────────────────────────
//
// Gemini suele devolver Markdown (**negrita**, ## títulos, tablas...), pero
// WhatsApp usa su propio formato: *negrita*, _cursiva_, ~tachado~, ```mono```.
// Si se envía el Markdown tal cual, el usuario ve "**Texto**" con los asteriscos
// a la vista. Esta función traduce Markdown → formato WhatsApp y limpia lo que
// WhatsApp no soporta, para que el mensaje se vea pegado y ordenado.
//
// Es una función pura (texto → texto), sin efectos, para poder probarla aislada.
function formatearParaWhatsApp(texto) {
  if (!texto) return "";
  let t = String(texto);

  // 1. Proteger los bloques de código ``` ``` para no tocar su interior.
  const bloques = [];
  t = t.replace(/```[\s\S]*?```/g, (m) => {
    bloques.push(m);
    return `\u0000B${bloques.length - 1}\u0000`;
  });
  // Proteger también el código en línea `así`.
  const inline = [];
  t = t.replace(/`[^`\n]+`/g, (m) => {
    inline.push(m);
    return `\u0000I${inline.length - 1}\u0000`;
  });

  // 2. Viñetas Markdown al inicio de línea (*, +, -) → "• ". Se hace ANTES de
  //    negrita/cursiva para que el "*" de una viñeta no se confunda con formato.
  t = t.replace(/^\s*[*+-]\s+/gm, "• ");

  // 3. Marcador temporal de negrita: protege lo que será *negrita* para que el
  //    paso de cursiva (*x* → _x_) no lo estropee. Títulos y **negrita** se
  //    guardan aquí y se restauran al final como *texto* de WhatsApp.
  const negritas = [];
  const guardarNegrita = (txt) => {
    negritas.push(txt.trim());
    return `\u0000N${negritas.length - 1}\u0000`;
  };

  // 3a. Encabezados Markdown (#, ##, ###) → negrita (vía marcador).
  t = t.replace(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/gm, (_, txt) => guardarNegrita(txt));

  // 4. Triple asterisco ***texto*** (negrita+cursiva de Markdown) → negrita.
  //    Debe ir ANTES que **texto**: si no, la regex de doble asterisco captura
  //    "**texto*" y deja un asterisco suelto. El usuario quiere ***x*** = *x*.
  t = t.replace(/\*\*\*(.+?)\*\*\*/gs, (_, x) => guardarNegrita(x));
  t = t.replace(/___(.+?)___/gs, (_, x) => guardarNegrita(x));

  // 4a. Negrita Markdown **texto** y __texto__ → marcador de negrita.
  t = t.replace(/\*\*(.+?)\*\*/gs, (_, x) => guardarNegrita(x));
  t = t.replace(/__(.+?)__/gs, (_, x) => guardarNegrita(x));
  //    *texto* que quede (cursiva Markdown) → _texto_ (cursiva WhatsApp).
  t = t.replace(/(^|[^*\w])\*([^*\n]+?)\*(?!\*)/g, "$1_$2_");
  //    Restaurar la negrita con la sintaxis de WhatsApp: *texto*.
  t = t.replace(/\u0000N(\d+)\u0000/g, (_, i) => `*${negritas[+i]}*`);
  //    _texto_ de Markdown ya coincide con WhatsApp: se deja igual.

  // 5. Tachado ~~texto~~ → ~texto~
  t = t.replace(/~~(.+?)~~/gs, "~$1~");

  // 6. Enlaces [texto](url) → "texto (url)"; WhatsApp no soporta enlaces con
  //    máscara, así que se muestra la URL para que sea clicable.
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1 ($2)");

  // 7. Citas Markdown "> " → se conservan (WhatsApp también usa "> " para citar).

  // 8. Compactar tres o más saltos de línea a máximo dos (párrafos legibles).
  t = t.replace(/\n{3,}/g, "\n\n");

  // 9. Restaurar el código protegido, con la sintaxis de WhatsApp (``` y `).
  t = t.replace(/\u0000I(\d+)\u0000/g, (_, i) => inline[+i]);
  t = t.replace(/\u0000B(\d+)\u0000/g, (_, i) => bloques[+i]);

  return t.trim();
}

// Estado de la conexión del socket. Baileys expone sock.ws.readyState (1 = OPEN)
// y sock.user (definido tras autenticar). Comprobarlo antes de enviar evita el
// Boom 428 "Connection Closed" que se produce al escribir sobre un socket muerto.
function estaConectado(sock) {
  try {
    return !!sock && !!sock.user && sock.ws?.readyState === 1;
  } catch (_) {
    return false;
  }
}

async function send(sock, jid, text) {
  if (!estaConectado(sock)) {
    console.error("⚠️  Envío omitido: sin conexión activa a WhatsApp.");
    return false;
  }
  try {
    await sock.sendMessage(jid, { text: formatearParaWhatsApp(text) });
    return true;
  } catch (err) {
    // No relanza: un fallo de envío nunca debe tumbar el bot.
    console.error("❌ Error enviando mensaje:", err?.message || err);
    return false;
  }
}

/**
 * Envía un mensaje acompañado de una imagen de la empresa (si existe el archivo).
 * El texto se formatea igual que en send() y va como pie de la imagen (caption).
 * Si la imagen no existe o su envío falla, cae con elegancia a solo texto, de
 * modo que el bot nunca falla por una imagen.
 */
async function sendConImagen(sock, jid, text, nombreImagen) {
  if (!estaConectado(sock)) {
    console.error("⚠️  Envío de imagen omitido: sin conexión activa.");
    return false;
  }
  const caption = formatearParaWhatsApp(text);
  try {
    const ruta = rutaImagen(nombreImagen);
    if (ruta) {
      await sock.sendMessage(jid, { image: { url: ruta }, caption });
      return true;
    }
  } catch (err) {
    // La imagen falló (p. ej. 428 puntual): se intenta al menos el texto.
    console.error(`⚠️  No se pudo enviar la imagen "${nombreImagen}":`, err?.message || err);
  }
  // Sin imagen disponible o falló: se envía solo el texto.
  return send(sock, jid, text);
}

async function sendReaccion(sock, jid, key, emoji) {
  if (!estaConectado(sock)) return;
  try {
    await sock.sendMessage(jid, { react: { text: emoji, key } });
  } catch (_) {}
}

/** Actualiza el indicador de "escribiendo…" sin lanzar si el socket está muerto. */
async function presencia(sock, jid, estado) {
  if (!estaConectado(sock)) return;
  try {
    await sock.sendPresenceUpdate(estado, jid);
  } catch (_) {
    // El presence es cosmético; su fallo jamás debe interrumpir el flujo.
  }
}

function formatUptime(s) {
  const h   = Math.floor(s / 3600);
  const m   = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return `${h}h ${m}m ${sec}s`;
}

function sanitizarTelefono(num) {
  return num.replace(/\D/g, "");
}

function esFueraHorario() {
  if (!empresa.respuesta_fuera_horario) return false;
  const ahora     = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
  const hora      = ahora.getHours();
  const dia       = ahora.getDay();
  const diasHabil = empresa.dias_habil ?? [1, 2, 3, 4, 5];
  const inicio    = empresa.horario_inicio ?? 8;
  const fin       = empresa.horario_fin   ?? 18;
  return !diasHabil.includes(dia) || hora < inicio || hora >= fin;
}

// ─── Recordatorios ────────────────────────────────────────────────────────────

const recordatorios = new Map(); // jid → [{ texto, minutos, id }]

/**
 * Programa un recordatorio y lo retira del registro al dispararse.
 *
 * FIX: el Map solo crecía. Cada !recordar añadía una entrada que no se
 * eliminaba nunca, ni siquiera después de que el temporizador se disparara, de
 * modo que el proceso acumulaba memoria mientras estuviera vivo. Ahora la
 * entrada se limpia al completarse, y el jid desaparece cuando no le quedan
 * recordatorios pendientes.
 */
function programarRecordatorio(sock, jid, texto, minutos) {
  const entrada = { texto, minutos, id: null };

  entrada.id = setTimeout(async () => {
    try {
      await send(sock, jid, `⏰ *Recordatorio:* ${texto}`);
    } finally {
      const lista = recordatorios.get(jid);
      if (lista) {
        const i = lista.indexOf(entrada);
        if (i !== -1) lista.splice(i, 1);
        if (lista.length === 0) recordatorios.delete(jid);
      }
    }
  }, minutos * 60_000);

  if (!recordatorios.has(jid)) recordatorios.set(jid, []);
  recordatorios.get(jid).push(entrada);
}

/** Recordatorios pendientes de un chat (usado por !recordar para informar al usuario). */
function recordatoriosPendientes(jid) {
  return recordatorios.get(jid)?.length ?? 0;
}

// ─── Encuestas ────────────────────────────────────────────────────────────────

const encuestas = new Map(); // jid → { pregunta, opciones, votos, participantes, creador }

// ─── Comandos ────────────────────────────────────────────────────────────────
// senderJid es el JID real del remitente (msg.key.participant en grupos, msg.key.remoteJid en DM)

async function manejarComando(sock, jid, texto, senderName, senderJid, msgKey) {
  await sock.sendPresenceUpdate("composing", jid);
  await delay(400);

  const partes = texto.trim().split(/\s+/);
  const cmd    = partes[0].toLowerCase();
  const args   = partes.slice(1);

  switch (cmd) {

    // ── !menu ──────────────────────────────────────────────────────────────
    case "!menu":
    case "!ayuda":
    case "!help": {
      const ia = CONFIG.GEMINI_API_KEY ? "✅" : "❌";
      await send(sock, jid,
`╔═══════════════════════════════╗
║    🤖 *BOT EMPRESARIAL WA* ║
╚═══════════════════════════════╝

📋 *INFORMACIÓN*
  🙋 *!hola* — Saludo personalizado
  ℹ️  *!info* — Estado del bot
  🕐 *!hora* — Fecha y hora Bogotá
  🏢 *!empresa* — Info de la empresa
  📖 *!nosotros* — Historia, misión y valores
  📞 *!contacto* — Datos de contacto
  💼 *!servicios* — Productos/servicios
  📋 *!faq* — Preguntas frecuentes
  📜 *!politicas* — Políticas de la empresa
  🕐 *!horario* — Horario de atención

📊 *HERRAMIENTAS*
  🧮 *!calc* [expr]          — Calculadora
  🌡️  *!clima* [ciudad]       — Clima en tiempo real
  ⏰ *!recordar* [min] [msg] — Recordatorio personal
  🗳️  *!encuesta* [pregunta]  — Crear encuesta rápida
  🔢 *!votar* [número]       — Votar en encuesta activa
  🌐 *!traducir* [texto]     — Traducir al inglés con IA

🎮 *DIVERSIÓN*
  😂 *!chiste* — Chiste aleatorio
  🏓 *!ping* — Latencia del bot

⚙️  *CONFIGURACIÓN*
  🗑️  *!olvidar* — Borrar historial de chat
  🔄 *!recargar* — Recargar datos empresa.json

🤖 *IA [${ia}]:* Escribe cualquier mensaje sin "!" y el asistente inteligente responderá.

_Powered by Baileys + Google Gemini_`);
      break;
    }

    // ── !hola ─────────────────────────────────────────────────────────────
    case "!hola":
    case "!hi":
    case "!hello": {
      const opciones = [
        `¡Hola, ${senderName}! 👋 ¿En qué puedo ayudarte hoy?`,
        `¡Qué bueno verte, ${senderName}! 😊 Estoy aquí para ayudarte.`,
        `Hey ${senderName}! 🤙 Soy el asistente de *${empresa.nombre || "la empresa"}*. ¿En qué te ayudo?`,
        `¡Bienvenido/a, ${senderName}! 🌟 ¿Cómo puedo servirte hoy?`,
      ];
      await sendReaccion(sock, jid, msgKey, "👋");
      await send(sock, jid, opciones[Math.floor(Math.random() * opciones.length)]);
      break;
    }

    // ── !info ─────────────────────────────────────────────────────────────
    case "!info":
    case "!estado": {
      const iaStatus    = CONFIG.GEMINI_API_KEY ? `✅ Activa (${CONFIG.GEMINI_MODEL})` : "❌ Sin API Key";
      const jidsActivos = Object.keys(conversaciones).length;
      await send(sock, jid,
`🤖 *Estado del Bot*

🏷️  *Versión:* v${VERSION}
📦 *Librería:* Baileys (WhiskeySockets) v7
🌐 *Protocolo:* WhatsApp Web WebSocket
⚡ *Runtime:* Node.js ${process.version}
🖥️  *Plataforma:* ${process.platform}
⏱️  *Uptime:* ${formatUptime(process.uptime())}
🧠 *IA Gemini:* ${iaStatus}
🏢 *Empresa:* ${empresa.nombre || "No configurada"}
💬 *Conversaciones:* ${jidsActivos} contacto(s)
🛡️  *Anti-spam:* ✅ Activo (${CONFIG.RATE_LIMIT_MAX} msg/min)
👥 *Grupos:* ${CONFIG.RESPONDER_GRUPOS ? "✅ Responde" : "❌ Ignora"}

_Hecho con ❤️ usando Baileys + Google Gemini_`);
      break;
    }

    // ── !hora ─────────────────────────────────────────────────────────────
    case "!hora":
    case "!time": {
      const hora = new Date().toLocaleString("es-CO", {
        timeZone: "America/Bogota",
        weekday: "long", year: "numeric", month: "long",
        day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
      });
      await send(sock, jid, `🕐 *Hora actual (Bogotá):*\n${hora}`);
      break;
    }

    // ── !empresa ──────────────────────────────────────────────────────────
    case "!empresa": {
      await send(sock, jid,
`🏢 *${empresa.nombre || "Empresa"}*

${empresa.descripcion || "Sin descripción."}

📄 *Sector:* ${empresa.sector || "N/A"}
🕐 *Horario:* ${empresa.horario || "N/A"}
📍 *Dirección:* ${empresa.direccion || "N/A"}

_Escribe *!nosotros*, *!contacto*, *!servicios*, *!faq* o *!politicas* para más información._`);
      break;
    }

    // ── !contacto ─────────────────────────────────────────────────────────
    case "!contacto": {
      await send(sock, jid,
`📞 *Contacto — ${empresa.nombre || "Empresa"}*

📱 *Teléfono:* ${empresa.telefono || "N/A"}
📧 *Email:* ${empresa.email || "N/A"}
📍 *Dirección:* ${empresa.direccion || "N/A"}
🕐 *Horario:* ${empresa.horario || "N/A"}

_¡Estamos para servirte!_ 🤝`);
      break;
    }

    // ── !servicios ────────────────────────────────────────────────────────
    case "!servicios":
    case "!productos": {
      // Si empresa.json trae `catalogo`, se muestra el detalle (modalidad,
      // duración y precio). Si no, se cae a la lista simple `productos`, de modo
      // que un empresa.json antiguo sigue funcionando igual que antes.
      const catalogo = Array.isArray(empresa.catalogo) ? empresa.catalogo : [];
      if (catalogo.length) {
        const detalle = catalogo.map((s, i) => {
          const precio = s.precio_desde_cop
            ? `desde *COP ${Number(s.precio_desde_cop).toLocaleString("es-CO")}*`
            : "*a cotizar*";
          return `*${i + 1}. ${s.servicio}*\n` +
                 `   ${s.descripcion}\n` +
                 `   ⏱️ ${s.duracion || "N/A"}  ·  💰 ${precio}`;
        }).join("\n\n");
        await send(sock, jid,
          `💼 *Servicios de ${empresa.nombre || "la empresa"}*\n\n${detalle}\n\n` +
          `_Precios sin IVA. Escribe *!politicas* para pagos y cancelaciones, ` +
          `o cuéntanos tu caso y te orientamos._`);
        break;
      }
      const lista = (empresa.productos || []).map((p, i) => `  ${i + 1}. ${p}`).join("\n");
      await send(sock, jid,
        `💼 *Servicios de ${empresa.nombre || "la empresa"}:*\n\n${lista || "Sin servicios configurados."}\n\n_Para más info, escríbenos o visítanos._`);
      break;
    }

    // ── !nosotros ─────────────────────────────────────────────────────────
    // Expone la identidad corporativa (historia, misión, visión y valores) que
    // ahora vive en empresa.json. Solo información pública: la estructura
    // interna, los procesos y los indicadores no se divulgan.
    case "!nosotros":
    case "!about": {
      const id = empresa.identidad;
      if (!id || !(id.historia || id.mision || id.vision)) {
        await send(sock, jid, "ℹ️ No hay información corporativa configurada en empresa.json.");
        break;
      }
      const valores = id.valores?.length
        ? "\n\n⭐ *Valores*\n" + id.valores.map((v) => `  • ${v}`).join("\n")
        : "";
      await send(sock, jid,
`🏢 *Sobre ${id.nombre_comercial || empresa.nombre}*

${id.historia || ""}

🎯 *Misión*
${id.mision || "N/A"}

🔭 *Visión*
${id.vision || "N/A"}${valores}

_Escribe *!servicios* para ver cómo podemos ayudarte._`);
      break;
    }

    // ── !horario ──────────────────────────────────────────────────────────
    case "!horario": {
      const fueraH  = esFueraHorario();
      const estadoH = fueraH ? "❌ Fuera de horario ahora" : "✅ Abierto ahora";
      await send(sock, jid,
`🕐 *Horario de Atención*

📅 ${empresa.horario || "No configurado"}

Estado actual: ${estadoH}

_Si estás fuera de horario, deja tu mensaje y te responderemos lo antes posible._`);
      break;
    }

    // ── !faq ──────────────────────────────────────────────────────────────
    case "!faq":
    case "!preguntas": {
      const faqs = empresa.faqs || [];
      if (!faqs.length) {
        await send(sock, jid, "ℹ️ No hay preguntas frecuentes configuradas en empresa.json.");
        break;
      }
      const texto = faqs.map((f, i) => `*${i + 1}. ${f.pregunta}*\n   ${f.respuesta}`).join("\n\n");
      await send(sock, jid, `❓ *Preguntas Frecuentes*\n\n${texto}\n\n_¿Tienes otra pregunta? Escríbela y la IA te responderá._`);
      break;
    }

    // ── !politicas ────────────────────────────────────────────────────────
    case "!politicas":
    case "!políticas": {
      const pol = empresa.politicas || {};
      if (!Object.keys(pol).length) {
        await send(sock, jid, "ℹ️ No hay políticas configuradas en empresa.json.");
        break;
      }
      const texto = Object.entries(pol)
        .map(([k, v]) => `*${k.charAt(0).toUpperCase() + k.slice(1)}:*\n   ${v}`)
        .join("\n\n");
      await send(sock, jid, `📜 *Políticas — ${empresa.nombre || "la empresa"}*\n\n${texto}`);
      break;
    }

    // ── !calc ─────────────────────────────────────────────────────────────
    case "!calc":
    case "!calcular": {
      if (!args.length) {
        await send(sock, jid,
          "🧮 *Calculadora*\nUso: *!calc [expresión]*\nEjemplos:\n  !calc 150 * 0.19 + 50\n  !calc (100 + 200) / 3\n  !calc 2^10");
        break;
      }
      const expr = args.join(" ").replace(/\^/g, "**").replace(/[^0-9+\-*/().% ]/g, "");
      try {
        // eslint-disable-next-line no-new-func
        const resultado = Function(`"use strict"; return (${expr})`)();
        if (typeof resultado !== "number" || !isFinite(resultado)) throw new Error("Resultado inválido");
        const formateado = Number.isInteger(resultado)
          ? resultado.toLocaleString("es-CO")
          : resultado.toLocaleString("es-CO", { maximumFractionDigits: 6 });
        await send(sock, jid, `🧮 *Calculadora*\n\n📐 Expresión: \`${args.join(" ")}\`\n✅ Resultado: *${formateado}*`);
      } catch {
        await send(sock, jid, "❌ Expresión inválida. Ejemplo: *!calc 100 * 1.19*");
      }
      break;
    }

    // ── !recordar ─────────────────────────────────────────────────────────
    case "!recordar":
    case "!recordatorio": {
      const minutos  = parseInt(args[0]);
      const textoRec = args.slice(1).join(" ");
      if (isNaN(minutos) || minutos <= 0 || !textoRec) {
        await send(sock, jid, "⏰ Uso: *!recordar [minutos] [mensaje]*\nEjemplo: !recordar 30 Llamar al cliente");
        break;
      }
      if (minutos > 1440) {
        await send(sock, jid, "⚠️ Máximo 1440 minutos (24 horas) por recordatorio.");
        break;
      }
      programarRecordatorio(sock, jid, textoRec, minutos);
      const pendientes = recordatoriosPendientes(jid);
      const aviso = pendientes > 1 ? `\n_Tienes ${pendientes} recordatorios pendientes en este chat._` : "";
      await send(sock, jid, `⏰ ¡Listo, ${senderName}! Te recordaré en *${minutos} minuto${minutos !== 1 ? "s" : ""}*:\n_"${textoRec}"_${aviso}`);
      break;
    }

    // ── !clima ────────────────────────────────────────────────────────────
    case "!clima":
    case "!weather": {
      const ciudad = args.join(" ") || "Bogotá";
      await send(sock, jid, `🌡️ Consultando clima para *${ciudad}*...`);
      try {
        const geoRes  = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(ciudad)}&count=1&language=es`
        );
        const geoData = await geoRes.json();
        if (!geoData.results?.length) {
          await send(sock, jid, `❌ No encontré la ciudad: *${ciudad}*. Intenta con el nombre completo.`);
          break;
        }
        const { latitude, longitude, name, country } = geoData.results[0];

        // FIX: Usar el parámetro `current` moderno de Open-Meteo.
        // Antes se usaba `hourly` indexado por horaActual = new Date().getHours(),
        // lo que era incorrecto porque el índice debería ser el de la ciudad
        // consultada en su timezone, no el del servidor. El parámetro `current`
        // devuelve directamente los valores presentes de la ubicación, sin ambigüedades.
        const wxRes = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
          `&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m` +
          `&timezone=auto`
        );
        const wx = await wxRes.json();
        const cw = wx.current;

        if (!cw) {
          await send(sock, jid, "❌ No pude obtener datos del clima. Intenta más tarde.");
          break;
        }

        const codigoWMO = {
          0:"☀️ Despejado", 1:"🌤️ Mayormente despejado", 2:"⛅ Parcialmente nublado",
          3:"☁️ Nublado", 45:"🌫️ Neblina", 48:"🌫️ Escarcha",
          51:"🌦️ Llovizna leve", 61:"🌧️ Lluvia leve", 63:"🌧️ Lluvia moderada",
          65:"🌧️ Lluvia fuerte", 80:"🌦️ Chubascos", 95:"⛈️ Tormenta",
        };
        const desc = codigoWMO[cw.weather_code] || `Código ${cw.weather_code}`;

        await send(sock, jid,
          `🌍 *Clima en ${name}, ${country}*\n\n` +
          `🌡️ Temperatura: *${cw.temperature_2m}°C*\n` +
          `🌡️ Sensación térmica: ${cw.apparent_temperature}°C\n` +
          `💨 Viento: ${cw.wind_speed_10m} km/h\n` +
          `💧 Humedad: ${cw.relative_humidity_2m}%\n` +
          `🌥️ Condición: ${desc}\n\n` +
          `_Datos: Open-Meteo.com_`
        );
      } catch (e) {
        console.error("Error clima:", e.message);
        await send(sock, jid, "❌ No pude obtener el clima en este momento. Intenta más tarde.");
      }
      break;
    }

    // ── !traducir ─────────────────────────────────────────────────────────
    case "!traducir":
    case "!translate": {
      if (!args.length) {
        await send(sock, jid, "🌐 Uso: *!traducir [texto]*\nEjemplo: !traducir Buenos días a todos");
        break;
      }
      if (!CONFIG.GEMINI_API_KEY || !genAI) {
        await send(sock, jid, "❌ La traducción requiere la IA activa. Configura tu API Key.");
        break;
      }
      const textoOriginal = args.join(" ");
      await send(sock, jid, "🌐 Traduciendo...");
      try {
        // Reutilizar el singleton genAI en lugar de crear una instancia nueva
        const model = genAI.getGenerativeModel({ model: CONFIG.GEMINI_MODEL });
        const result = await model.generateContent(
          `Traduce el siguiente texto al inglés. Responde SOLO con la traducción, sin explicaciones:\n\n${textoOriginal}`
        );
        const traduccion = result.response.text() || "No se pudo traducir.";
        await send(sock, jid, `🌐 *Traducción:*\n\n🇨🇴 _${textoOriginal}_\n🇺🇸 *${traduccion.trim()}*`);
      } catch (e) {
        console.error("Error traduciendo con Gemini:", e.message);
        await send(sock, jid, "❌ Error al traducir. Intenta de nuevo.");
      }
      break;
    }

    // ── !encuesta ─────────────────────────────────────────────────────────
    case "!encuesta":
    case "!poll": {
      // Formato: !encuesta ¿Pregunta? | Opción1 | Opción2 | Opción3
      const rawText  = args.join(" ");
      const parteEnc = rawText.split("|").map((p) => p.trim()).filter(Boolean);
      if (parteEnc.length < 3) {
        await send(sock, jid,
          "🗳️ *Crear encuesta:*\n" +
          "Uso: *!encuesta [pregunta] | [op1] | [op2] | ...*\n\n" +
          "Ejemplo:\n!encuesta ¿Mejor lenguaje? | JavaScript | Python | Rust"
        );
        break;
      }
      const preguntaEnc = parteEnc[0];
      const opcionesEnc = parteEnc.slice(1).slice(0, 5);
      encuestas.set(jid, {
        pregunta:      preguntaEnc,
        opciones:      opcionesEnc,
        votos:         new Array(opcionesEnc.length).fill(0),
        // FIX: Guardar JIDs reales de votantes, no nombres (los nombres pueden repetirse)
        participantes: new Set(),
        creador:       senderName,
      });
      const listaOpc = opcionesEnc.map((o, i) => `  ${i + 1}️⃣  ${o}`).join("\n");
      await send(sock, jid,
        `🗳️ *Nueva encuesta de ${senderName}:*\n\n` +
        `❓ *${preguntaEnc}*\n\n${listaOpc}\n\n` +
        `_Responde con *!votar [número]* para votar_\n` +
        `_Ej: !votar 1_`
      );
      break;
    }

    // ── !votar ────────────────────────────────────────────────────────────
    case "!votar":
    case "!vote": {
      const encuesta = encuestas.get(jid);
      if (!encuesta) {
        await send(sock, jid, "❌ No hay una encuesta activa en este chat. Usa *!encuesta* para crear una.");
        break;
      }
      const voto = parseInt(args[0]);
      if (isNaN(voto) || voto < 1 || voto > encuesta.opciones.length) {
        await send(sock, jid, `⚠️ Voto inválido. Elige un número del 1 al ${encuesta.opciones.length}.`);
        break;
      }
      // FIX: Usar senderJid (JID único del remitente) en lugar de
      // remoteJid + senderName. Antes, dos personas con el mismo nombre
      // contaban como la misma persona, y cambiar el nombre permitía votar
      // varias veces. El JID es inmutable y único por usuario.
      if (encuesta.participantes.has(senderJid)) {
        await send(sock, jid, "⚠️ Ya votaste en esta encuesta.");
        break;
      }
      encuesta.votos[voto - 1]++;
      encuesta.participantes.add(senderJid);
      const total   = encuesta.votos.reduce((a, b) => a + b, 0);
      const resumen = encuesta.opciones.map((o, i) => {
        const pct   = total ? Math.round((encuesta.votos[i] / total) * 100) : 0;
        const barra = "█".repeat(Math.round(pct / 10)) + "░".repeat(10 - Math.round(pct / 10));
        return `  ${i + 1}. ${o}\n     ${barra} ${pct}% (${encuesta.votos[i]} voto${encuesta.votos[i] !== 1 ? "s" : ""})`;
      }).join("\n\n");
      await sendReaccion(sock, jid, msgKey, "✅");
      await send(sock, jid, `🗳️ *Encuesta: ${encuesta.pregunta}*\n\n${resumen}\n\n_Total: ${total} voto${total !== 1 ? "s" : ""}_`);
      break;
    }

    // ── !chiste ───────────────────────────────────────────────────────────
    case "!chiste":
    case "!joke": {
      const chistes = [
        "¿Por qué los programadores confunden Halloween y Navidad?\nPorque OCT 31 = DEC 25 🎃🎄",
        "Un SQL entra a un bar y le pregunta a dos mesas:\n¿Puedo unirme (JOIN) a ustedes? 😂",
        "¿Cuántos programadores se necesitan para cambiar un foco?\nNinguno, es problema de hardware 💡",
        "Mi código no tiene bugs...\n¡Tiene features no documentadas! 🐛",
        "¿Por qué el dev dejó su trabajo?\nNo le daban arrays... digo, aumentos 💰",
        "Debugging es como ser detective en una película de crimen donde tú también eres el asesino 🔍",
        "El cliente: 'Quiero que esto sea exactamente como Facebook, pero diferente.'\nEl dev: '...' 😅",
        "// Esto funciona, no tocar.\n// Nadie sabe por qué. 👻",
      ];
      await send(sock, jid, `😂 *Chiste del día:*\n\n${chistes[Math.floor(Math.random() * chistes.length)]}`);
      break;
    }

    // ── !ping ─────────────────────────────────────────────────────────────
    case "!ping": {
      // FIX: Antes ambos Date.now() eran síncronos → resultado siempre 0ms.
      // Ahora medimos el tiempo real que tarda sock.sendMessage en completarse,
      // lo que incluye la latencia de red al servidor de WhatsApp.
      const t0 = Date.now();
      await sock.sendMessage(jid, { text: "🏓 Calculando latencia..." });
      const latencia = Date.now() - t0;
      await send(sock, jid, `🏓 *Pong!* Latencia de envío: *${latencia}ms*`);
      break;
    }

    // ── !olvidar ──────────────────────────────────────────────────────────
    case "!olvidar":
    case "!reset": {
      conversaciones[jid] = [];
      // El usuario pidió borrar: se fuerza el volcado en vez de esperar al
      // guardado diferido, para que el borrado sobreviva a un cierre inmediato.
      vaciarEscriturasPendientes(CONFIG.DB_CONVERSACIONES, conversaciones);
      await send(sock, jid, `🗑️ ¡Listo, ${senderName}! Borré tu historial de conversación con la IA. Empecemos de nuevo 😊`);
      break;
    }

    // ── !recargar ─────────────────────────────────────────────────────────
    case "!recargar":
    case "!reload": {
      recargarEmpresa();
      await send(sock, jid, `🔄 ¡Datos de *${empresa.nombre}* recargados desde empresa.json!`);
      break;
    }

    // ── Comando desconocido ───────────────────────────────────────────────
    default: {
      if (cmd.startsWith("!")) {
        await send(sock, jid, `❓ Comando *${cmd}* no reconocido.\nEscribe *!menu* para ver todos los comandos disponibles.`);
      }
    }
  }

  await sock.sendPresenceUpdate("paused", jid);
}

// ─── Menú interactivo de inicio ───────────────────────────────────────────────

async function menuInicio() {
  console.log("\n╔══════════════════════════════════════════╗");
  console.log(`║   🤖  WhatsApp Bot v${VERSION} — Configuración ║`);
  console.log("╚══════════════════════════════════════════╝\n");

  // ── Paso 1: API Key de Gemini ──────────────────────────────────────────
  console.log("┌─ PASO 1: Clave de API de Google Gemini (IA) ─────────────┐");
  console.log("│  Obtén tu clave gratis en: aistudio.google.com/apikey    │");
  console.log("│  1) Configurar / validar API Key                         │");
  console.log("│  2) Omitir (el bot funcionará sin respuestas de IA)      │");
  console.log("└──────────────────────────────────────────────────────────┘");

  let opcionAPI = "";
  while (!["1", "2"].includes(opcionAPI)) {
    opcionAPI = await pregunta("Selecciona una opción [1/2]: ");
    if (!["1", "2"].includes(opcionAPI)) console.log("⚠️  Opción inválida. Escribe 1 o 2.");
  }

  if (opcionAPI === "1") {
    const keyActual = CONFIG.GEMINI_API_KEY;
    if (keyActual) {
      const preview = `${keyActual.slice(0, 14)}${"*".repeat(Math.max(0, keyActual.length - 14))}`;
      console.log(`\n🔑 API Key detectada: ${preview}`);
      const cambiar = await pregunta("¿Deseas cambiarla? [s/N]: ");
      if (cambiar.toLowerCase() === "s") {
        CONFIG.GEMINI_API_KEY = await pregunta("Ingresa la nueva API Key (AIzaSy...): ");
      }
    } else {
      const ingresada = await pregunta("Ingresa tu API Key de Gemini (AIzaSy...): ");
      CONFIG.GEMINI_API_KEY = ingresada.trim();
    }

    if (CONFIG.GEMINI_API_KEY) {
      process.stdout.write("🔍 Validando API Key... ");
      try {
        // Reinicializar el singleton con la nueva clave antes de validar
        genAI = new GoogleGenerativeAI(CONFIG.GEMINI_API_KEY);
        invalidarCacheIA(); // el modelo cacheado colgaba de la clave anterior
        const model = genAI.getGenerativeModel({ model: CONFIG.GEMINI_MODEL });
        await model.generateContent("ping");
        console.log("✅ API Key válida.\n");
        guardarEnvKey(CONFIG.GEMINI_API_KEY);
        console.log("💾 API Key guardada en .env para próximas sesiones.\n");
      } catch (e) {
        const msg  = e.message || "";
        const tipo = clasificarErrorGemini(e);

        // La misma clasificación que usa consultarIA(). Antes esta lógica estaba
        // duplicada aquí y en el manejador de errores de la IA, con criterios
        // distintos: el arranque conservaba la clave ante un 429 pero el runtime
        // la borraba ante un 403. Ahora ambas rutas comparten clasificador.
        if (tipo === "cuota") {
          // La key ES válida; solo hay que esperar a que se renueve la cuota.
          console.log("⚠️  Cuota de solicitudes agotada (límite free tier).\n");
          console.log("   ✅ La API Key parece correcta — se guardará y usará cuando haya cuota.\n");
          guardarEnvKey(CONFIG.GEMINI_API_KEY);
          console.log("💾 API Key guardada en .env para próximas sesiones.\n");
          // genAI ya está inicializado con la key; NO lo reseteamos.
        } else if (tipo === "key_invalida") {
          console.log(`❌ API Key inválida (error de autenticación).\n   Detalle: ${msg}\n   El bot continuará sin IA.\n`);
          CONFIG.GEMINI_API_KEY = "";
          genAI = null;
          invalidarCacheIA();
        } else if (tipo === "modelo") {
          // La CLAVE es válida; lo que no existe es el modelo. Google retira
          // versiones (404 "no longer available to new users"). Se guarda la
          // clave y se indica cómo elegir un modelo disponible.
          console.log(`❌ El modelo "${CONFIG.GEMINI_MODEL}" no está disponible para esta clave.\n   Detalle: ${msg}\n`);
          console.log("   ✅ Tu API Key SÍ es válida y se guardará.");
          console.log("   👉 Ejecuta:  node listar-modelos.mjs   para ver los modelos disponibles,");
          console.log("      y copia uno en CONFIG.GEMINI_MODEL (index.js, línea ~97).\n");
          guardarEnvKey(CONFIG.GEMINI_API_KEY);
          console.log("💾 API Key guardada en .env para próximas sesiones.\n");
        } else {
          // Error de red u otro error transitorio.
          // Conservamos la key para no perder la configuración del usuario.
          console.log(`⚠️  No se pudo validar la API Key (error temporal): ${msg}\n`);
          console.log("   La key se guardará igualmente. Si el error persiste, revisa tu clave.\n");
          guardarEnvKey(CONFIG.GEMINI_API_KEY);
          console.log("💾 API Key guardada en .env para próximas sesiones.\n");
        }
      }
    } else {
      console.log("⚠️  No ingresaste una API Key. El bot continuará sin IA.\n");
    }
  } else {
    console.log("⏭️  Se omitió la configuración de IA.\n");
  }

  // ── Paso 2: Método de conexión ────────────────────────────────────────────
  console.log("┌─ PASO 2: Método de conexión a WhatsApp ──────────────────┐");
  console.log("│  1) Código QR             (escanear con la cámara)       │");
  console.log("│  2) Código de emparejamiento  (vincular por número)      │");
  console.log("└──────────────────────────────────────────────────────────┘");

  let opcionConexion = "";
  while (!["1", "2"].includes(opcionConexion)) {
    opcionConexion = await pregunta("Selecciona una opción [1/2]: ");
    if (!["1", "2"].includes(opcionConexion)) console.log("⚠️  Opción inválida. Escribe 1 o 2.");
  }

  const usarPairingCode = opcionConexion === "2";
  let telefonoPairing   = "";

  if (usarPairingCode) {
    console.log("\n📋 El número debe incluir código de país, sin +, guiones ni espacios.");
    console.log("   Ejemplo Colombia → 573001234567\n");
    while (telefonoPairing.length < 7) {
      const raw = await pregunta("📱 Ingresa tu número de WhatsApp: ");
      telefonoPairing = sanitizarTelefono(raw);
      if (telefonoPairing.length < 7) console.log("⚠️  Número inválido. Asegúrate de incluir el código de país.");
    }
  }

  console.log("");
  return { usarPairingCode, telefonoPairing };
}

// ─── Función principal del bot ────────────────────────────────────────────────

let reconnectAttempts = 0;
let activeSock        = null; // referencia global para el cierre limpio

async function startBot(usarPairingCode, telefonoPairing) {
  // Auth state que guarda SOLO creds.json (+ respaldo) en AUTH_FOLDER y las
  // claves de sesión en AUTH_FOLDER/keys/. asegurarSesionIntegra() se llama
  // dentro y restaura creds desde el respaldo si estuviera dañado.
  const { state, saveCreds } = await useAuthStateSeparado();
  const { version }          = await fetchLatestBaileysVersion();

  console.log(`🤖 WhatsApp Bot iniciando... (WA v${version.join(".")})`);
  console.log(`🧠 Empresa: ${empresa.nombre || "Sin configurar"}`);
  console.log(`🔗 Modo: ${usarPairingCode ? "Código de emparejamiento" : "Código QR"}\n`);

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      // makeCacheableSignalKeyStore mejora rendimiento en Baileys v7
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    logger,
    // printQRInTerminal está deprecado en Baileys v7 → manejamos QR manualmente
    printQRInTerminal: false,
    // Browsers.ubuntu recomendado para pairing code; Browsers.windows para QR
    browser: usarPairingCode ? Browsers.ubuntu("Chrome") : Browsers.windows("Chrome"),
    syncFullHistory:                false,
    markOnlineOnConnect:            true,
    generateHighQualityLinkPreview: false,
    connectTimeoutMs:               60_000,
    defaultQueryTimeoutMs:          60_000,
    keepAliveIntervalMs:            25_000,
  });

  activeSock = sock;

  // ─── Pairing Code ────────────────────────────────────────────────────────
  // IMPORTANTE: requestPairingCode() debe llamarse FUERA del event handler
  // de connection.update. Llamarlo dentro causaba "Connection Closed" porque
  // el WebSocket no había completado el handshake inicial.
  // El delay de 2500ms da tiempo al handshake WS antes de la solicitud.
  if (usarPairingCode && !sock.authState.creds.registered) {
    await delay(2500);
    try {
      console.log("⏳ Solicitando código de emparejamiento...");
      const code = await sock.requestPairingCode(telefonoPairing);
      const codeFormateado = code?.match(/.{1,4}/g)?.join("-") ?? code;

      console.log("\n╔══════════════════════════════════════════╗");
      console.log("║   🔑 CÓDIGO DE EMPAREJAMIENTO:           ║");
      console.log(`║        ${codeFormateado.padEnd(34)}║`);
      console.log("╚══════════════════════════════════════════╝");
      console.log("👉 En WhatsApp → Dispositivos vinculados → Vincular con número");
      console.log("   Ingresa el código de 8 caracteres que aparece arriba.\n");
      console.log("⏳ Esperando que confirmes en WhatsApp...\n");
    } catch (e) {
      console.error(`\n❌ Error solicitando código de emparejamiento: ${e.message}`);
      console.log("💡 Posibles causas:");
      console.log("   • El número no está registrado en WhatsApp");
      console.log("   • Ya existe una sesión activa (borra auth_info_baileys/ e intenta de nuevo)");
      console.log("   • WhatsApp bloqueó temporalmente el dispositivo (espera unos minutos)\n");
      console.log("🔄 Intentando mantener conexión para reconectar...\n");
    }
  }

  // ─── Eventos de conexión ────────────────────────────────────────────────
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (!usarPairingCode && qr) {
      console.log("\n╔══════════════════════════════════════════╗");
      console.log("║   📱 ESCANEA ESTE CÓDIGO QR EN WHATSAPP  ║");
      console.log("╚══════════════════════════════════════════╝\n");
      qrcode.generate(qr, { small: true });
      console.log("\n👉 WhatsApp → Dispositivos vinculados → Vincular dispositivo");
      console.log("⏳ El QR expira en ~60 segundos. Si vence, aparecerá uno nuevo.\n");
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error instanceof Boom
        ? lastDisconnect.error.output.statusCode
        : null;

      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      if (!shouldReconnect) {
        console.log("\n⛔ Sesión cerrada (logout). Borra la carpeta auth_info_baileys/ y reinicia el bot.");
        cerrarRL();
        process.exit(0);
      } else if (reconnectAttempts < CONFIG.MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        // Backoff exponencial con tope en 4× el delay base
        const wait = CONFIG.RECONNECT_BASE_DELAY_MS * Math.min(reconnectAttempts, 4);
        console.log(`\n🔄 Reconectando (${reconnectAttempts}/${CONFIG.MAX_RECONNECT_ATTEMPTS}) en ${wait / 1000}s... [código: ${statusCode}]`);
        setTimeout(() => startBot(usarPairingCode, telefonoPairing), wait);
      } else {
        console.log("\n⛔ Máximo de reconexiones alcanzado. Reinicia el bot manualmente.");
        cerrarRL();
        process.exit(1);
      }
    }

    if (connection === "open") {
      reconnectAttempts = 0;
      cerrarRL();
      console.log("✅ ¡Conectado a WhatsApp exitosamente!\n");
      console.log("─────────────────────────────────────────────────────────");
      console.log("  Comandos: !menu !hola !empresa !calc !clima !recordar !faq");
      console.log("  IA: cualquier mensaje sin '!' activa el asistente");
      console.log(`  IA activa: ${CONFIG.GEMINI_API_KEY ? "✅ Sí" : "❌ No (sin API Key)"}`);
      console.log("─────────────────────────────────────────────────────────\n");
    }
  });

  // saveCreds() ya escribe creds.json de forma atómica y actualiza el respaldo.
  sock.ev.on("creds.update", saveCreds);

  // ─── Mensajes entrantes ─────────────────────────────────────────────────
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      // Cada mensaje se procesa en su propio try/catch: si uno falla (envío,
      // IA, imagen…), se registra y se sigue con el resto. Un mensaje
      // problemático nunca debe romper el loop ni tumbar el proceso.
      try {
      if (msg.key.fromMe || !msg.message) continue;

      const jid     = msg.key.remoteJid;
      const esGrupo = jid.endsWith("@g.us");

      if (esGrupo && !CONFIG.RESPONDER_GRUPOS) continue;

      const senderName = msg.pushName || "Usuario";
      // JID real del remitente: en grupos es msg.key.participant; en DM es remoteJid
      const senderJid  = msg.key.participant || msg.key.remoteJid;

      const text =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption ||
        "";

      if (!text.trim()) continue;

      const textLimpio = text.trim();

      // Anti-spam
      if (!verificarRateLimit(jid)) {
        console.log(`🛡️  Rate limit: ${senderName} (${jid.split("@")[0]})`);
        continue;
      }

      console.log(`📩 [${esGrupo ? "Grupo" : senderName}] ${textLimpio.substring(0, 80)}`);

      if (textLimpio.startsWith("!")) {
        await manejarComando(sock, jid, textLimpio, senderName, senderJid, msg.key);
      } else {
        // Aviso fuera de horario (solo una vez por hora para no ser molesto).
        // esFueraHorario() ya comprueba empresa.respuesta_fuera_horario en su
        // primera línea; la condición estaba evaluada dos veces.
        if (esFueraHorario()) {
          const msgFuera   = empresa.mensaje_fuera_horario ||
            "Gracias por escribirnos. Estamos fuera de horario. Te responderemos pronto.";
          const ultimoMsg  = conversaciones[jid]?.slice(-1)[0];
          const esReciente = ultimoMsg && (Date.now() - new Date(ultimoMsg.ts).getTime()) < 3_600_000;
          if (!esReciente) {
            await send(sock, jid, `🕐 ${msgFuera}\n\n_Horario: ${empresa.horario || "No configurado"}_`);
          }
        }

        // ── FIX CRÍTICO: Construir historial ANTES de registrar el mensaje actual ──
        // Si se construyera después, el mensaje actual estaría incluido en el
        // historial Y también sería enviado por sendMessage() → duplicación.
        // buildGeminiHistory() además garantiza la alternancia correcta user/model.
        const historialGemini = buildGeminiHistory(conversaciones[jid] || []);

        registrarMensaje(jid, "user", textLimpio);
        await presencia(sock, jid, "composing");

        const respuestaIA = await consultarIA(textLimpio, historialGemini);

        registrarMensaje(jid, "bot", respuestaIA);
        // Si el tema del mensaje tiene una imagen asociada en media/, se adjunta;
        // si no, sendConImagen cae a solo texto. Ambas rutas están blindadas: si
        // la conexión se cayó, no se envía nada y el bot sigue vivo.
        const img = imagenParaMensaje(textLimpio);
        if (img) {
          await sendConImagen(sock, jid, respuestaIA, img);
        } else {
          await send(sock, jid, respuestaIA);
        }
        await presencia(sock, jid, "paused");
      }
      } catch (errMsg) {
        // Fallo procesando ESTE mensaje: se registra y se continúa con el resto.
        console.error("⚠️  Error procesando un mensaje (se omite y se continúa):",
          errMsg?.message || errMsg);
      }
    }
  });

  return sock;
}

// ─── Cierre limpio (Ctrl+C o kill) ───────────────────────────────────────────

function gracefulShutdown(signal) {
  console.log(`\n🛑 Señal ${signal} recibida. Cerrando bot limpiamente...`);
  try { if (activeSock) activeSock.end(); } catch (_) {}
  cerrarRL();
  // Fuerza cualquier escritura diferida pendiente antes de salir.
  vaciarEscriturasPendientes(CONFIG.DB_CONVERSACIONES, conversaciones);
  console.log("💾 Conversaciones guardadas. ¡Hasta pronto!");
  process.exit(0);
}

process.on("SIGINT",  () => gracefulShutdown("SIGINT"));   // Ctrl+C
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));  // kill / pm2 stop

// ─── Red de seguridad global ──────────────────────────────────────────────────
//
// CRÍTICO: sin esto, cualquier excepción no capturada (p. ej. un envío sobre un
// socket ya cerrado → Boom 428 "Connection Closed") tumbaba TODO el proceso, el
// hosting lo reiniciaba y, al reiniciar a media escritura, la sesión se
// corrompía. El objetivo del usuario es claro: el bot NO debe caerse nunca.
//
// Estos manejadores registran el error y dejan el proceso VIVO. La reconexión de
// WhatsApp la maneja connection.update; aquí solo evitamos que un fallo puntual
// (un mensaje que no se pudo enviar, una imagen, un presence) mate el bot.
process.on("uncaughtException", (err) => {
  const codigo = err?.output?.statusCode || err?.code || "";
  console.error(`⚠️  Excepción no capturada [${codigo}]: ${err?.message || err}`);
  // No se hace process.exit: el bot sigue corriendo y la conexión se recupera
  // sola. Solo se sale ante un fallo verdaderamente irrecuperable de arranque.
});

process.on("unhandledRejection", (reason) => {
  const codigo = reason?.output?.statusCode || reason?.code || "";
  console.error(`⚠️  Promesa rechazada sin manejar [${codigo}]: ${reason?.message || reason}`);
});

// ─── Arrancar ─────────────────────────────────────────────────────────────────

(async () => {
  try {
    const { usarPairingCode, telefonoPairing } = await menuInicio();
    await startBot(usarPairingCode, telefonoPairing);
  } catch (err) {
    console.error("❌ Error fatal al iniciar el bot:", err.message);
    console.error(err.stack);
    cerrarRL();
    process.exit(1);
  }
})();
