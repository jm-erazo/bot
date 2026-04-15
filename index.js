/**
 * WhatsApp Bot con Baileys
 * ─────────────────────────────────────────────────────────────────────────────
 * Características:
 *   ✅ Menú interactivo al iniciar (validar API key + elegir método de conexión)
 *   ✅ Conexión por QR o código de emparejamiento (pairing code) — CORREGIDO
 *   ✅ IA con contexto empresarial (Anthropic Claude via API)
 *   ✅ Base de datos local en JSON (empresa.json)
 *   ✅ Comandos extendidos: clima, calculadora, encuesta, recordatorio, etc.
 *   ✅ Reconexión automática con backoff exponencial
 *   ✅ Log de conversaciones en conversaciones.json
 * ─────────────────────────────────────────────────────────────────────────────
 */

import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
} from "baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import readline from "readline";
import fs from "fs";

// ─── Configuración base ───────────────────────────────────────────────────────

const CONFIG = {
  ANTHROPIC_API_KEY:       process.env.ANTHROPIC_API_KEY || "",
  AUTH_FOLDER:             "auth_info_baileys",
  DB_EMPRESA:              "empresa.json",
  DB_CONVERSACIONES:       "conversaciones.json",
  MAX_RECONNECT_ATTEMPTS:  5,
  RECONNECT_BASE_DELAY_MS: 3000,
};

const logger = pino({ level: "silent" });

// ─── readline: UNA sola instancia para todo el proceso ───────────────────────

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function pregunta(texto) {
  return new Promise((resolve) => rl.question(texto, (ans) => resolve(ans.trim())));
}

function cerrarRL() {
  try { rl.close(); } catch (_) {}
}

// ─── Base de datos local JSON ─────────────────────────────────────────────────

function cargarJSON(archivo, valorDefecto) {
  try {
    if (fs.existsSync(archivo)) return JSON.parse(fs.readFileSync(archivo, "utf-8"));
  } catch (e) {
    console.error(`⚠️  Error leyendo ${archivo}:`, e.message);
  }
  return valorDefecto;
}

function guardarJSON(archivo, datos) {
  try {
    fs.writeFileSync(archivo, JSON.stringify(datos, null, 2), "utf-8");
  } catch (e) {
    console.error(`⚠️  Error guardando ${archivo}:`, e.message);
  }
}

// Crear empresa.json con plantilla si no existe
if (!fs.existsSync(CONFIG.DB_EMPRESA)) {
  const plantilla = {
    nombre:      "Mi Empresa S.A.S.",
    sector:      "Tecnología",
    descripcion: "Empresa dedicada al desarrollo de software y soluciones digitales.",
    horario:     "Lunes a Viernes de 8:00 AM a 6:00 PM",
    telefono:    "+57 300 000 0000",
    email:       "info@miempresa.com",
    direccion:   "Calle 100 #15-20, Bogotá, Colombia",
    productos: [
      "Desarrollo de aplicaciones web",
      "Chatbots empresariales",
      "Consultoría tecnológica",
    ],
    politicas: {
      devolucion: "30 días de garantía en todos los productos.",
      envio:      "Entrega digital inmediata tras confirmación de pago.",
      pago:       "Aceptamos transferencia, PSE, tarjeta de crédito y débito.",
    },
    faqs: [
      { pregunta: "¿Cuánto tarda un proyecto?",  respuesta: "Entre 2 y 8 semanas según la complejidad." },
      { pregunta: "¿Ofrecen soporte post-venta?", respuesta: "Sí, 3 meses de soporte gratuito incluido." },
    ],
  };
  guardarJSON(CONFIG.DB_EMPRESA, plantilla);
  console.log(`\n📝 Se creó ${CONFIG.DB_EMPRESA} con datos de plantilla.\n`);
}

const empresa      = cargarJSON(CONFIG.DB_EMPRESA, {});
let conversaciones = cargarJSON(CONFIG.DB_CONVERSACIONES, {});

// ─── Historial de conversación ────────────────────────────────────────────────

function registrarMensaje(jid, rol, contenido) {
  if (!conversaciones[jid]) conversaciones[jid] = [];
  conversaciones[jid].push({ rol, contenido, ts: new Date().toISOString() });
  if (conversaciones[jid].length > 40) conversaciones[jid].splice(0, 20);
  guardarJSON(CONFIG.DB_CONVERSACIONES, conversaciones);
}

function historialIA(jid) {
  return (conversaciones[jid] || []).slice(-20).map((m) => ({
    role:    m.rol === "bot" ? "assistant" : "user",
    content: m.contenido,
  }));
}

// ─── IA con Claude (Anthropic API) ───────────────────────────────────────────

async function consultarIA(jid, preguntaUsuario) {
  if (!CONFIG.ANTHROPIC_API_KEY) {
    return "⚠️ La IA no está configurada. Agrega tu ANTHROPIC_API_KEY en el archivo .env o como variable de entorno.";
  }

  const sistemPrompt = `Eres el asistente virtual de ${empresa.nombre || "la empresa"}.
Sector: ${empresa.sector || "N/A"}
Descripción: ${empresa.descripcion || "N/A"}
Horario: ${empresa.horario || "N/A"}
Contacto: ${empresa.telefono || ""} | ${empresa.email || ""}
Dirección: ${empresa.direccion || "N/A"}
Productos/Servicios: ${(empresa.productos || []).join(", ")}
Políticas: ${JSON.stringify(empresa.politicas || {})}
FAQs: ${(empresa.faqs || []).map((f) => `P: ${f.pregunta} R: ${f.respuesta}`).join(" | ")}

Instrucciones:
- Responde siempre en español, de forma amable, concisa y profesional.
- Si no sabes algo sobre la empresa, indica que puedes comunicar con un agente humano.
- No inventes información que no esté en el contexto.
- Usa emojis con moderación para hacer la conversación más amigable.
- Si el usuario saluda, salúdalo de vuelta presentándote como asistente de ${empresa.nombre || "la empresa"}.`;

  const mensajes = [
    ...historialIA(jid),
    { role: "user", content: preguntaUsuario },
  ];

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         CONFIG.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model:      "claude-haiku-4-5",
        max_tokens: 500,
        system:     sistemPrompt,
        messages:   mensajes,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error("❌ Error API Anthropic:", err);
      return "Lo siento, hubo un problema al consultar la IA. Por favor intenta de nuevo.";
    }

    const data = await res.json();
    return data.content?.[0]?.text || "No pude generar una respuesta.";
  } catch (e) {
    console.error("❌ Error conectando con IA:", e.message);
    return "Error de conexión con el servicio de IA. Intenta más tarde.";
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function send(sock, jid, text) {
  try {
    await sock.sendMessage(jid, { text });
  } catch (err) {
    console.error("❌ Error enviando mensaje:", err.message);
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

// ─── Recordatorios ────────────────────────────────────────────────────────────

const recordatorios = new Map();

function programarRecordatorio(sock, jid, texto, minutos) {
  const timerId = setTimeout(async () => {
    await send(sock, jid, `⏰ *Recordatorio:* ${texto}`);
  }, minutos * 60 * 1000);

  if (!recordatorios.has(jid)) recordatorios.set(jid, []);
  recordatorios.get(jid).push({ texto, minutos, timerId });
}

// ─── Comandos ────────────────────────────────────────────────────────────────

async function manejarComando(sock, jid, texto, senderName) {
  await sock.sendPresenceUpdate("composing", jid);
  await delay(500);

  const partes = texto.trim().split(/\s+/);
  const cmd    = partes[0].toLowerCase();
  const args   = partes.slice(1);

  switch (cmd) {

    case "!menu":
    case "!ayuda":
    case "!help": {
      const menu = `╔═══════════════════════════════╗
║    🤖 *BOT EMPRESARIAL WA*    ║
╚═══════════════════════════════╝

📋 *Comandos disponibles:*

🙋 *!hola*            — Saludo personalizado
ℹ️  *!info*            — Info del bot
🕐 *!hora*            — Fecha y hora actual
😂 *!chiste*          — Chiste aleatorio
🏓 *!ping*            — Verificar latencia
🏢 *!empresa*         — Info de la empresa
📞 *!contacto*        — Datos de contacto
💼 *!servicios*       — Productos/servicios
🧮 *!calc* [expr]     — Calculadora (ej: !calc 5*8+2)
⏰ *!recordar* [min] [texto] — Recordatorio
🌡️  *!clima* [ciudad]  — Clima en una ciudad
🗑️  *!olvidar*         — Borra tu historial de chat
📋 *!menu*            — Este menú

🤖 *IA:* Escribe cualquier pregunta sin "!" y el asistente inteligente responderá.

_Powered by Baileys + Claude AI_`;
      await send(sock, jid, menu);
      break;
    }

    case "!hola":
    case "!hi":
    case "!hello": {
      const saludos = [
        `¡Hola, ${senderName}! 👋 ¿En qué puedo ayudarte hoy?`,
        `¡Qué bueno verte, ${senderName}! 😊 Estoy aquí para ayudarte.`,
        `Hey ${senderName}! 🤙 Soy el asistente de *${empresa.nombre || "la empresa"}*. ¿En qué te ayudo?`,
      ];
      await send(sock, jid, saludos[Math.floor(Math.random() * saludos.length)]);
      break;
    }

    case "!info": {
      const ai = CONFIG.ANTHROPIC_API_KEY ? "✅ Activa" : "❌ Sin API Key";
      await send(sock, jid, `🤖 *Información del Bot*

📦 *Librería:* Baileys (WhiskeySockets)
🌐 *Protocolo:* WhatsApp Web WebSocket
⚡ *Runtime:* Node.js ${process.version}
🖥️  *Plataforma:* ${process.platform}
⏱️  *Uptime:* ${formatUptime(process.uptime())}
🧠 *IA Claude:* ${ai}
🏢 *Empresa:* ${empresa.nombre || "No configurada"}

_Hecho con ❤️ usando Baileys + Claude AI_`);
      break;
    }

    case "!hora":
    case "!time": {
      const hora = new Date().toLocaleString("es-CO", {
        timeZone: "America/Bogota",
        weekday:  "long",
        year:     "numeric",
        month:    "long",
        day:      "numeric",
        hour:     "2-digit",
        minute:   "2-digit",
        second:   "2-digit",
      });
      await send(sock, jid, `🕐 *Hora actual (Bogotá):*\n${hora}`);
      break;
    }

    case "!chiste":
    case "!joke": {
      const chistes = [
        "¿Por qué los programadores confunden Halloween y Navidad?\nPorque OCT 31 = DEC 25 🎃🎄",
        "Un SQL entra a un bar y pregunta a dos mesas:\n¿Puedo unirme (JOIN) a ustedes? 😂",
        "¿Cuántos programadores se necesitan para cambiar un foco?\nNinguno, es problema de hardware 💡",
        "Mi código no tiene bugs...\n¡Tiene features no documentadas! 🐛",
        "¿Por qué el dev dejó su trabajo?\nNo le daban arrays... digo, aumentos 💰",
        "Debugging es el arte de ser el detective en una película de crimen\ndonde tú también eres el asesino 🔍",
      ];
      await send(sock, jid, `😂 *Chiste del día:*\n\n${chistes[Math.floor(Math.random() * chistes.length)]}`);
      break;
    }

    case "!ping": {
      const t = Date.now();
      await send(sock, jid, `🏓 Pong! Latencia: *${Date.now() - t}ms*`);
      break;
    }

    case "!empresa": {
      await send(sock, jid, `🏢 *${empresa.nombre || "Empresa"}*

📄 ${empresa.descripcion || "Sin descripción."}
🏭 Sector: ${empresa.sector || "N/A"}
🕐 Horario: ${empresa.horario || "N/A"}
📍 Dirección: ${empresa.direccion || "N/A"}

_Escribe *!contacto* para datos de contacto o *!servicios* para ver nuestros productos._`);
      break;
    }

    case "!contacto": {
      await send(sock, jid, `📞 *Contacto - ${empresa.nombre || "Empresa"}*

📱 Teléfono: ${empresa.telefono || "N/A"}
📧 Email: ${empresa.email || "N/A"}
📍 Dirección: ${empresa.direccion || "N/A"}
🕐 Horario de atención: ${empresa.horario || "N/A"}

_¡Estamos para servirte!_`);
      break;
    }

    case "!servicios":
    case "!productos": {
      const lista = (empresa.productos || []).map((p, i) => `  ${i + 1}. ${p}`).join("\n");
      await send(sock, jid, `💼 *Servicios de ${empresa.nombre || "la empresa"}:*\n\n${lista || "Sin servicios configurados."}\n\n_Para más info escríbenos o visítanos._`);
      break;
    }

    case "!calc":
    case "!calcular": {
      if (!args.length) {
        await send(sock, jid, "🧮 Uso: *!calc [expresión]*\nEjemplo: !calc 150 * 0.19 + 50");
        break;
      }
      const expr = args.join(" ").replace(/[^0-9+\-*/().% ]/g, "");
      try {
        const resultado = Function(`"use strict"; return (${expr})`)();
        if (typeof resultado !== "number" || !isFinite(resultado)) throw new Error("Resultado inválido");
        await send(sock, jid, `🧮 *Calculadora*\n\n📐 ${expr}\n✅ Resultado: *${resultado.toLocaleString("es-CO")}*`);
      } catch {
        await send(sock, jid, "❌ Expresión matemática inválida. Ejemplo: *!calc 100 * 1.19*");
      }
      break;
    }

    case "!recordar":
    case "!recordatorio": {
      const minutos  = parseInt(args[0]);
      const textoRec = args.slice(1).join(" ");
      if (isNaN(minutos) || minutos <= 0 || !textoRec) {
        await send(sock, jid, "⏰ Uso: *!recordar [minutos] [mensaje]*\nEjemplo: !recordar 30 Llamar al cliente");
        break;
      }
      programarRecordatorio(sock, jid, textoRec, minutos);
      await send(sock, jid, `⏰ ¡Listo, ${senderName}! Te recordaré en *${minutos} minuto${minutos > 1 ? "s" : ""}*:\n_"${textoRec}"_`);
      break;
    }

    case "!clima":
    case "!weather": {
      const ciudad = args.join(" ") || "Bogotá";
      await send(sock, jid, `🌡️ Consultando clima para *${ciudad}*...`);
      try {
        const geoRes  = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(ciudad)}&count=1&language=es`);
        const geoData = await geoRes.json();
        if (!geoData.results?.length) {
          await send(sock, jid, `❌ No encontré la ciudad: *${ciudad}*. Intenta con el nombre completo.`);
          break;
        }
        const { latitude, longitude, name, country } = geoData.results[0];
        const wxRes  = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&hourly=relativehumidity_2m&timezone=auto`);
        const wx     = await wxRes.json();
        const cw     = wx.current_weather;
        const codigoWMO = {
          0: "☀️ Despejado",         1: "🌤️ Mayormente despejado", 2: "⛅ Parcialmente nublado",
          3: "☁️ Nublado",           45: "🌫️ Neblina",             48: "🌫️ Escarcha",
          51: "🌦️ Llovizna",         61: "🌧️ Lluvia leve",         63: "🌧️ Lluvia moderada",
          65: "🌧️ Lluvia fuerte",    80: "🌦️ Chubascos",           95: "⛈️ Tormenta",
        };
        const desc    = codigoWMO[cw.weathercode] || `Código ${cw.weathercode}`;
        const humedad = wx.hourly?.relativehumidity_2m?.[new Date().getHours()] ?? "N/A";
        await send(sock, jid, `🌍 *Clima en ${name}, ${country}*\n\n🌡️ Temperatura: *${cw.temperature}°C*\n💨 Viento: ${cw.windspeed} km/h\n💧 Humedad: ${humedad}%\n🌥️ Estado: ${desc}\n\n_Datos de Open-Meteo_`);
      } catch {
        await send(sock, jid, "❌ No pude obtener el clima. Intenta más tarde.");
      }
      break;
    }

    case "!olvidar":
    case "!reset": {
      conversaciones[jid] = [];
      guardarJSON(CONFIG.DB_CONVERSACIONES, conversaciones);
      await send(sock, jid, `🗑️ ¡Listo, ${senderName}! Borré tu historial de conversación. Empecemos de nuevo 😊`);
      break;
    }

    default: {
      if (cmd.startsWith("!")) {
        await send(sock, jid, `❓ Comando *${cmd}* no reconocido.\nEscribe *!menu* para ver todos los comandos disponibles.`);
      }
      break;
    }
  }

  await sock.sendPresenceUpdate("paused", jid);
}

// ─── Menú interactivo de inicio ───────────────────────────────────────────────

async function menuInicio() {
  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║   🤖  WhatsApp Bot — Configuración       ║");
  console.log("╚══════════════════════════════════════════╝\n");

  // ── Paso 1: API Key de Anthropic ──────────────────────────────────────────
  console.log("┌─ PASO 1: Clave de API de Anthropic (IA) ─────────────────┐");
  console.log("│  1) Validar / ingresar API Key                           │");
  console.log("│  2) Omitir (el bot funcionará sin respuestas de IA)      │");
  console.log("└──────────────────────────────────────────────────────────┘");

  let opcionAPI = "";
  while (!["1", "2"].includes(opcionAPI)) {
    opcionAPI = await pregunta("Selecciona una opción [1/2]: ");
    if (!["1", "2"].includes(opcionAPI)) console.log("⚠️  Opción inválida. Escribe 1 o 2.");
  }

  if (opcionAPI === "1") {
    const keyActual = CONFIG.ANTHROPIC_API_KEY;
    if (keyActual) {
      const preview = `${keyActual.slice(0, 10)}${"*".repeat(Math.max(0, keyActual.length - 10))}`;
      console.log(`\n🔑 API Key detectada en entorno: ${preview}`);
      const cambiar = await pregunta("¿Deseas cambiarla? [s/N]: ");
      if (cambiar.toLowerCase() === "s") {
        CONFIG.ANTHROPIC_API_KEY = await pregunta("Ingresa la nueva API Key: ");
      }
    } else {
      CONFIG.ANTHROPIC_API_KEY = await pregunta("Ingresa tu API Key de Anthropic: ");
    }

    if (CONFIG.ANTHROPIC_API_KEY) {
      process.stdout.write("🔍 Validando API Key... ");
      try {
        const testRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type":      "application/json",
            "x-api-key":         CONFIG.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model:      "claude-haiku-4-5",
            max_tokens: 10,
            messages:   [{ role: "user", content: "ping" }],
          }),
        });
        if (testRes.ok) {
          console.log("✅ API Key válida.\n");
        } else {
          const errData = await testRes.json().catch(() => ({}));
          console.log(`❌ API Key inválida (${errData?.error?.type || testRes.status}). El bot continuará sin IA.\n`);
          CONFIG.ANTHROPIC_API_KEY = "";
        }
      } catch (e) {
        console.log(`⚠️  No se pudo validar (${e.message}). Verifica tu conexión. El bot continuará sin IA.\n`);
        CONFIG.ANTHROPIC_API_KEY = "";
      }
    } else {
      console.log("⚠️  No ingresaste una API Key. El bot continuará sin IA.\n");
    }
  } else {
    console.log("⏭️  Se omitió la configuración de IA.\n");
  }

  // ── Paso 2: Método de conexión ────────────────────────────────────────────
  console.log("┌─ PASO 2: Método de conexión a WhatsApp ──────────────────┐");
  console.log("│  1) Código QR        (escanear con la cámara)            │");
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

async function startBot(usarPairingCode, telefonoPairing) {
  const { state, saveCreds } = await useMultiFileAuthState(CONFIG.AUTH_FOLDER);
  const { version }          = await fetchLatestBaileysVersion();

  console.log(`🤖 WhatsApp Bot iniciando... (WA v${version.join(".")})`);
  console.log(`🧠 Empresa: ${empresa.nombre || "Sin configurar (edita empresa.json)"}`);
  console.log(`🔗 Modo: ${usarPairingCode ? "Código de emparejamiento" : "QR"}\n`);

  // ─── Configuración del socket ───────────────────────────────────────────
  // NOTAS IMPORTANTES según la documentación oficial de Baileys:
  //  • printQRInTerminal DEBE ser false cuando se usa pairing code
  //  • Para pairing code se recomienda browser macOS Chrome para evitar rechazos
  //  • requestPairingCode() debe llamarse UNA SOLA VEZ (flag pairingCodeSolicitado)

  const sock = makeWASocket({
    version,
    auth:              state,
    logger,
    printQRInTerminal: !usarPairingCode,
    browser:           usarPairingCode
                         ? Browsers.macOS("Chrome")
                         : Browsers.windows("Chrome"),
    syncFullHistory:   false,
  });

  // Flag para solicitar el código UNA SOLA VEZ (bug principal del código original)
  let pairingCodeSolicitado = false;

  // ─── Evento de conexión ─────────────────────────────────────────────────
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // Solicitar pairing code la primera vez que llega el evento QR o "connecting"
    // CORRECCIÓN: antes se creaba un readline nuevo dentro de este evento cada vez
    // que se emitía el QR (~cada 30s), generando múltiples prompts en paralelo.
    if (
      usarPairingCode &&
      !pairingCodeSolicitado &&
      !sock.authState.creds.registered &&
      (!!qr || connection === "connecting")
    ) {
      pairingCodeSolicitado = true;
      try {
        const code           = await sock.requestPairingCode(telefonoPairing);
        const codeFormateado = code?.match(/.{1,4}/g)?.join("-") || code;
        console.log("\n╔══════════════════════════════════════════╗");
        console.log("║  🔑 CÓDIGO DE EMPAREJAMIENTO:            ║");
        console.log(`║      ${codeFormateado.padEnd(38)}║`);
        console.log("╚══════════════════════════════════════════╝");
        console.log("👉 Abre WhatsApp → Dispositivos vinculados → Vincular con número de teléfono");
        console.log("   Ingresa el código de 8 dígitos que aparece arriba.\n");
      } catch (e) {
        console.error("❌ Error generando código de emparejamiento:", e.message);
        console.log("💡 Verifica que el número sea correcto y que WhatsApp esté activo.\n");
        // Permitir un reintento si el primer intento falla
        pairingCodeSolicitado = false;
      }
    }

    // Aviso extra para QR (printQRInTerminal ya lo imprime automáticamente)
    if (!usarPairingCode && qr) {
      console.log("📱 Escanea el QR → WhatsApp → Dispositivos vinculados → Vincular dispositivo\n");
    }

    // ── Conexión cerrada ────────────────────────────────────────────────────
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
        const wait = CONFIG.RECONNECT_BASE_DELAY_MS * reconnectAttempts;
        console.log(`\n🔄 Reconectando (intento ${reconnectAttempts}/${CONFIG.MAX_RECONNECT_ATTEMPTS}) en ${wait / 1000}s... (código: ${statusCode})`);
        setTimeout(() => startBot(usarPairingCode, telefonoPairing), wait);
      } else {
        console.log("\n⛔ Máximo de reconexiones alcanzado. Reinicia el bot manualmente.");
        cerrarRL();
        process.exit(1);
      }
    }

    // ── Conexión exitosa ────────────────────────────────────────────────────
    if (connection === "open") {
      reconnectAttempts = 0;
      cerrarRL(); // Ya no necesitamos stdin
      console.log("✅ ¡Conectado a WhatsApp exitosamente!\n");
      console.log("─────────────────────────────────────────────────");
      console.log("  Comandos: !menu !hola !empresa !calc !clima !recordar");
      console.log("  IA: cualquier mensaje sin '!' activa el asistente");
      console.log("  IA activa:", CONFIG.ANTHROPIC_API_KEY ? "✅ Sí" : "❌ No (sin API Key)");
      console.log("─────────────────────────────────────────────────\n");
    }
  });

  // ─── Guardar credenciales ───────────────────────────────────────────────
  sock.ev.on("creds.update", saveCreds);

  // ─── Mensajes entrantes ─────────────────────────────────────────────────
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      if (msg.key.fromMe || !msg.message) continue;

      const jid        = msg.key.remoteJid;
      const senderName = msg.pushName || "Usuario";

      const text =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption ||
        "";

      if (!text.trim()) continue;

      const textLimpio = text.trim();
      console.log(`📩 [${senderName}] ${textLimpio}`);

      if (textLimpio.startsWith("!")) {
        await manejarComando(sock, jid, textLimpio, senderName);
      } else {
        registrarMensaje(jid, "user", textLimpio);
        await sock.sendPresenceUpdate("composing", jid);
        const respuestaIA = await consultarIA(jid, textLimpio);
        registrarMensaje(jid, "bot", respuestaIA);
        await send(sock, jid, respuestaIA);
        await sock.sendPresenceUpdate("paused", jid);
      }
    }
  });
}

// ─── Arrancar ─────────────────────────────────────────────────────────────────

(async () => {
  try {
    const { usarPairingCode, telefonoPairing } = await menuInicio();
    await startBot(usarPairingCode, telefonoPairing);
  } catch (err) {
    console.error("❌ Error fatal al iniciar el bot:", err.message);
    cerrarRL();
    process.exit(1);
  }
})();
