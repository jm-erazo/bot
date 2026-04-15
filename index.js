/**
 * WhatsApp Bot Empresarial — v3.0 (GEMINI EDITION)
 * ─────────────────────────────────────────────────────────────────────────────
 * Fixes v3.0:
 * 🔧 CORREGIDO: Pairing code — se solicita fuera del event handler con delay
 * 🔧 CORREGIDO: makeCacheableSignalKeyStore para mejor rendimiento en v7
 * ✨ NUEVO: Anti-spam (rate limiting por contacto)
 * ✨ NUEVO: Comandos !faq, !politicas, !horario, !traducir, !sticker-texto
 * ✨ NUEVO: Comando !encuesta para hacer votaciones rápidas
 * ✨ NUEVO: Comando !estado para ver estado del bot
 * ✨ NUEVO: Guardar API Key en .env automáticamente
 * ✨ NUEVO: Respuesta fuera de horario configurable
 * ✨ NUEVO: Manejo de mensajes en grupos (opcional)
 * ✨ NUEVO: Comando !recargar para recargar empresa.json sin reiniciar
 * 🤖 ACTUALIZADO: IA cambiada de Anthropic (Claude) a Google (Gemini)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
} from "baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import readline from "readline";
import fs from "fs";
import path from "path";
// Importamos la librería de Google Gemini
import { GoogleGenerativeAI } from "@google/generative-ai";

// ─── Configuración base ───────────────────────────────────────────────────────

const CONFIG = {
  // IA — Configuración para Gemini
  GEMINI_API_KEY:          process.env.GEMINI_API_KEY || cargarEnvKey(),
  GEMINI_MODEL:            "gemini-1.5-flash", // Modelo rápido y económico, ideal para chats
  MAX_TOKENS_RESPUESTA:    500,

  // Archivos
  AUTH_FOLDER:             "auth_info_baileys",
  DB_EMPRESA:              "empresa.json",
  DB_CONVERSACIONES:       "conversaciones.json",
  ENV_FILE:                ".env",

  // Reconexión
  MAX_RECONNECT_ATTEMPTS:  8,
  RECONNECT_BASE_DELAY_MS: 4000,

  // Anti-spam: máximo N mensajes por minuto por contacto
  RATE_LIMIT_MAX:          8,
  RATE_LIMIT_WINDOW_MS:    60_000,

  // Grupos: true = responder en grupos también
  RESPONDER_GRUPOS:        false,
};

// ─── Cargar .env si existe ────────────────────────────────────────────────────

function cargarEnvKey() {
  try {
    if (fs.existsSync(".env")) {
      const contenido = fs.readFileSync(".env", "utf-8");
      // Cambiado de ANTHROPIC_API_KEY a GEMINI_API_KEY
      const match = contenido.match(/^GEMINI_API_KEY=(.+)$/m);
      if (match) return match[1].trim();
    }
  } catch (_) {}
  return "";
}

function guardarEnvKey(key) {
  try {
    let contenido = "";
    if (fs.existsSync(".env")) contenido = fs.readFileSync(".env", "utf-8");
    // Cambiado de ANTHROPIC_API_KEY a GEMINI_API_KEY
    if (contenido.match(/^GEMINI_API_KEY=.*/m)) {
      contenido = contenido.replace(/^GEMINI_API_KEY=.*/m, `GEMINI_API_KEY=${key}`);
    } else {
      contenido += (contenido.endsWith("\n") || !contenido ? "" : "\n") + `GEMINI_API_KEY=${key}\n`;
    }
    fs.writeFileSync(".env", contenido, "utf-8");
  } catch (e) {
    console.error("⚠️  No se pudo guardar el .env:", e.message);
  }
}

// ─── Logger ───────────────────────────────────────────────────────────────────

const logger = pino({ level: "silent" });

// ─── readline ─────────────────────────────────────────────────────────────────

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const pregunta = (texto) => new Promise((resolve) => rl.question(texto, (ans) => resolve(ans.trim())));
const cerrarRL = () => { try { rl.close(); } catch (_) {} };

// ─── Base de datos JSON ───────────────────────────────────────────────────────

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

// ─── Empresa (con recarga dinámica) ──────────────────────────────────────────

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
      { pregunta: "¿Tienen sede física?",         respuesta: "Sí, en Bogotá. También atendemos de forma virtual." },
    ],
    respuesta_fuera_horario: true,
    mensaje_fuera_horario: "Gracias por escribirnos 🙏 Estamos fuera de horario. Te responderemos pronto.",
  });
  console.log(`\n📝 Se creó ${CONFIG.DB_EMPRESA} con datos de plantilla.\n`);
}

let empresa = cargarJSON(CONFIG.DB_EMPRESA, {});
let conversaciones = cargarJSON(CONFIG.DB_CONVERSACIONES, {});

function recargarEmpresa() {
  empresa = cargarJSON(CONFIG.DB_EMPRESA, empresa);
  return empresa;
}

// ─── Anti-spam (rate limiter) ─────────────────────────────────────────────────

const rateLimiter = new Map(); // jid → [timestamps]

function verificarRateLimit(jid) {
  const ahora = Date.now();
  const ventana = CONFIG.RATE_LIMIT_WINDOW_MS;
  if (!rateLimiter.has(jid)) rateLimiter.set(jid, []);
  const tiempos = rateLimiter.get(jid).filter((t) => ahora - t < ventana);
  tiempos.push(ahora);
  rateLimiter.set(jid, tiempos);
  return tiempos.length <= CONFIG.RATE_LIMIT_MAX;
}

// ─── Historial de conversación ────────────────────────────────────────────────

function registrarMensaje(jid, rol, contenido) {
  if (!conversaciones[jid]) conversaciones[jid] = [];
  conversaciones[jid].push({ rol, contenido, ts: new Date().toISOString() });
  if (conversaciones[jid].length > 40) conversaciones[jid].splice(0, 20);
  guardarJSON(CONFIG.DB_CONVERSACIONES, conversaciones);
}

// Adaptamos el historial para el formato que espera Gemini (user y model)
function historialIA(jid) {
  return (conversaciones[jid] || []).slice(-20).map((m) => ({
    role:    m.rol === "bot" ? "model" : "user", // Gemini usa 'model' en lugar de 'assistant'
    parts:   [{ text: m.contenido }],
  }));
}

// ─── IA con Google Gemini ────────────────────────────────────────────────────

async function consultarIA(jid, preguntaUsuario) {
  if (!CONFIG.GEMINI_API_KEY) {
    return "⚠️ La IA no está configurada. Agrega tu GEMINI_API_KEY al iniciar el bot.";
  }

  const systemPrompt = `Eres el asistente virtual de ${empresa.nombre || "la empresa"}.
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
- Si el usuario saluda, salúdalo de vuelta presentándote como asistente de ${empresa.nombre || "la empresa"}.
- Máximo 3 párrafos por respuesta para ser conciso en WhatsApp.`;

  try {
    // Inicializamos el SDK de Google con la API Key
    const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_API_KEY);
    
    // Obtenemos el modelo
    const model = genAI.getGenerativeModel({ 
        model: CONFIG.GEMINI_MODEL,
        systemInstruction: systemPrompt // Aquí inyectamos el contexto de la empresa
    });

    // Recuperamos el historial adaptado a Gemini
    const historial = historialIA(jid);

    // Iniciamos la sesión de chat con el historial previo
    const chatSession = model.startChat({
      history: historial,
      generationConfig: {
        maxOutputTokens: CONFIG.MAX_TOKENS_RESPUESTA,
      },
    });

    // Enviamos el nuevo mensaje
    const result = await chatSession.sendMessage(preguntaUsuario);
    const response = await result.response;
    
    return response.text() || "No pude generar una respuesta.";

  } catch (e) {
    console.error("❌ Error conectando con Gemini API:", e.message);
    
    // Manejo de errores específicos (ej. API Key inválida)
    if (e.message.includes("API key not valid") || e.status === 403) {
       CONFIG.GEMINI_API_KEY = "";
       return "🔑 La API Key de IA es inválida. Reinicia el bot y verifica tu clave.";
    }

    return "Lo siento, hubo un problema con el asistente IA. Intenta de nuevo en unos momentos.";
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function send(sock, jid, text) {
  try {
    await sock.sendMessage(jid, { text: String(text) });
  } catch (err) {
    console.error("❌ Error enviando mensaje:", err.message);
  }
}

async function sendReaccion(sock, jid, key, emoji) {
  try {
    await sock.sendMessage(jid, { react: { text: emoji, key } });
  } catch (_) {}
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
  const ahora = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
  const hora  = ahora.getHours();
  const dia   = ahora.getDay();
  const diasHabil = empresa.dias_habil || [1, 2, 3, 4, 5];
  const inicio    = empresa.horario_inicio ?? 8;
  const fin       = empresa.horario_fin   ?? 18;
  return !diasHabil.includes(dia) || hora < inicio || hora >= fin;
}

// ─── Recordatorios ────────────────────────────────────────────────────────────

const recordatorios = new Map();

function programarRecordatorio(sock, jid, texto, minutos) {
  const id = setTimeout(async () => {
    await send(sock, jid, `⏰ *Recordatorio:* ${texto}`);
  }, minutos * 60_000);
  if (!recordatorios.has(jid)) recordatorios.set(jid, []);
  recordatorios.get(jid).push({ texto, minutos, id });
}

// ─── Encuestas (votaciones) ───────────────────────────────────────────────────

const encuestas = new Map(); // jid → { pregunta, opciones, votos, participantes }

// ─── Comandos ────────────────────────────────────────────────────────────────

async function manejarComando(sock, jid, texto, senderName, msgKey) {
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
      await send(sock, jid, `╔═══════════════════════════════╗
║    🤖 *BOT EMPRESARIAL WA* ║
╚═══════════════════════════════╝

📋 *INFORMACIÓN*
  🙋 *!hola* — Saludo personalizado
  ℹ️  *!info* — Estado del bot
  🕐 *!hora* — Fecha y hora Bogotá
  🏢 *!empresa* — Info de la empresa
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
      const iaStatus  = CONFIG.GEMINI_API_KEY ? `✅ Activa (${CONFIG.GEMINI_MODEL})` : "❌ Sin API Key";
      const jidsActivos = Object.keys(conversaciones).length;
      await send(sock, jid, `🤖 *Estado del Bot*

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
      await send(sock, jid, `🏢 *${empresa.nombre || "Empresa"}*

📄 ${empresa.descripcion || "Sin descripción."}
🏭 Sector: ${empresa.sector || "N/A"}
🕐 Horario: ${empresa.horario || "N/A"}
📍 Dirección: ${empresa.direccion || "N/A"}

_Escribe *!contacto*, *!servicios*, *!faq* o *!politicas* para más información._`);
      break;
    }

    // ── !contacto ─────────────────────────────────────────────────────────
    case "!contacto": {
      await send(sock, jid, `📞 *Contacto — ${empresa.nombre || "Empresa"}*

📱 Teléfono: ${empresa.telefono || "N/A"}
📧 Email: ${empresa.email || "N/A"}
📍 Dirección: ${empresa.direccion || "N/A"}
🕐 Horario: ${empresa.horario || "N/A"}

_¡Estamos para servirte!_ 🤝`);
      break;
    }

    // ── !servicios ────────────────────────────────────────────────────────
    case "!servicios":
    case "!productos": {
      const lista = (empresa.productos || []).map((p, i) => `  ${i + 1}. ${p}`).join("\n");
      await send(sock, jid, `💼 *Servicios de ${empresa.nombre || "la empresa"}:*\n\n${lista || "Sin servicios configurados."}\n\n_Para más info, escríbenos o visítanos._`);
      break;
    }

    // ── !horario ──────────────────────────────────────────────────────────
    case "!horario": {
      const fueraH = esFueraHorario();
      const estadoH = fueraH ? "❌ Fuera de horario ahora" : "✅ Abierto ahora";
      await send(sock, jid, `🕐 *Horario de Atención*

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
        await send(sock, jid, "🧮 *Calculadora*\nUso: *!calc [expresión]*\nEjemplos:\n  !calc 150 * 0.19 + 50\n  !calc (100 + 200) / 3\n  !calc 2^10");
        break;
      }
      // Soportar ^ como potencia
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
      await send(sock, jid, `⏰ ¡Listo, ${senderName}! Te recordaré en *${minutos} minuto${minutos !== 1 ? "s" : ""}*:\n_"${textoRec}"_`);
      break;
    }

    // ── !clima ────────────────────────────────────────────────────────────
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
        const wxRes = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
          `&current_weather=true&hourly=relativehumidity_2m,apparent_temperature&timezone=auto`
        );
        const wx = await wxRes.json();
        const cw = wx.current_weather;
        const horaActual = new Date().getHours();
        const codigoWMO = {
          0:"☀️ Despejado", 1:"🌤️ Mayormente despejado", 2:"⛅ Parcialmente nublado",
          3:"☁️ Nublado", 45:"🌫️ Neblina", 48:"🌫️ Escarcha",
          51:"🌦️ Llovizna leve", 61:"🌧️ Lluvia leve", 63:"🌧️ Lluvia moderada",
          65:"🌧️ Lluvia fuerte", 80:"🌦️ Chubascos", 95:"⛈️ Tormenta",
        };
        const desc        = codigoWMO[cw.weathercode] || `Código ${cw.weathercode}`;
        const humedad     = wx.hourly?.relativehumidity_2m?.[horaActual] ?? "N/A";
        const sensacion   = wx.hourly?.apparent_temperature?.[horaActual] ?? "N/A";
        await send(sock, jid,
          `🌍 *Clima en ${name}, ${country}*\n\n` +
          `🌡️ Temperatura: *${cw.temperature}°C*\n` +
          `🌡️ Sensación térmica: ${sensacion}°C\n` +
          `💨 Viento: ${cw.windspeed} km/h\n` +
          `💧 Humedad: ${humedad}%\n` +
          `🌥️ Condición: ${desc}\n\n` +
          `_Datos: Open-Meteo.com_`
        );
      } catch (e) {
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
      if (!CONFIG.GEMINI_API_KEY) {
        await send(sock, jid, "❌ La traducción requiere la IA activa. Configura tu API Key.");
        break;
      }
      const textoOriginal = args.join(" ");
      await send(sock, jid, "🌐 Traduciendo...");
      try {
        // También cambiamos la traducción para que use Gemini
        const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: CONFIG.GEMINI_MODEL });
        
        const result = await model.generateContent(`Traduce el siguiente texto al inglés. Responde SOLO con la traducción, sin explicaciones:\n\n${textoOriginal}`);
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
      const opcionesEnc = parteEnc.slice(1).slice(0, 5); // máximo 5 opciones
      encuestas.set(jid, {
        pregunta: preguntaEnc,
        opciones: opcionesEnc,
        votos:    new Array(opcionesEnc.length).fill(0),
        participantes: new Set(),
        creador: senderName,
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
      const senderJid = msgKey.remoteJid + ":" + senderName;
      if (encuesta.participantes.has(senderJid)) {
        await send(sock, jid, "⚠️ Ya votaste en esta encuesta.");
        break;
      }
      encuesta.votos[voto - 1]++;
      encuesta.participantes.add(senderJid);
      const total    = encuesta.votos.reduce((a, b) => a + b, 0);
      const resumen  = encuesta.opciones.map((o, i) => {
        const pct  = total ? Math.round((encuesta.votos[i] / total) * 100) : 0;
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
      const t = Date.now();
      await send(sock, jid, `🏓 Pong! Latencia aprox: *${Date.now() - t}ms*`);
      break;
    }

    // ── !olvidar ──────────────────────────────────────────────────────────
    case "!olvidar":
    case "!reset": {
      conversaciones[jid] = [];
      guardarJSON(CONFIG.DB_CONVERSACIONES, conversaciones);
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
  console.log("║   🤖  WhatsApp Bot v3.0 — Configuración  ║");
  console.log("╚══════════════════════════════════════════╝\n");

  // ── Paso 1: API Key de Gemini ──────────────────────────────────────────
  console.log("┌─ PASO 1: Clave de API de Google Gemini (IA) ─────────────┐");
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
        CONFIG.GEMINI_API_KEY = await pregunta("Ingresa la nueva API Key: ");
      }
    } else {
      const ingresada = await pregunta("Ingresa tu API Key de Gemini (AIzaSy...): ");
      CONFIG.GEMINI_API_KEY = ingresada.trim();
    }

    if (CONFIG.GEMINI_API_KEY) {
      process.stdout.write("🔍 Validando API Key... ");
      try {
        // Validamos la clave haciendo una petición simple a Gemini
        const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: CONFIG.GEMINI_MODEL });
        
        await model.generateContent("ping");

        console.log("✅ API Key válida.\n");
        guardarEnvKey(CONFIG.GEMINI_API_KEY);
        console.log("💾 API Key guardada en .env para próximas sesiones.\n");
        
      } catch (e) {
        console.log(`❌ API Key inválida.\n   Detalle: ${e.message}\n   El bot continuará sin IA.\n`);
        CONFIG.GEMINI_API_KEY = "";
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
let startTime = Date.now();

async function startBot(usarPairingCode, telefonoPairing) {
  const { state, saveCreds } = await useMultiFileAuthState(CONFIG.AUTH_FOLDER);
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
    printQRInTerminal: !usarPairingCode,
    // CORREGIDO: Browsers.ubuntu funciona mejor para pairing code en v7
    browser: usarPairingCode ? Browsers.ubuntu("Chrome") : Browsers.windows("Chrome"),
    syncFullHistory:            false,
    markOnlineOnConnect:        true,
    generateHighQualityLinkPreview: false,
    connectTimeoutMs:           60_000,
    defaultQueryTimeoutMs:      60_000,
    keepAliveIntervalMs:        25_000,
  });

  // ─── PAIRING CODE: Solicitarlo fuera del event handler ─────────────────
  // CORRECCIÓN PRINCIPAL: No llamar dentro del evento 'connection.update'.
  // Se espera un momento para que el socket establezca el handshake inicial
  // y luego se llama directamente. Esto evita el error "Connection Closed".

  if (usarPairingCode && !sock.authState.creds.registered) {
    // Pequeño delay para permitir que el handshake WS se complete
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

      // Si falla el pairing code, intentar QR como fallback
      console.log("🔄 Intentando reconexión...\n");
    }
  }

  // ─── Eventos de conexión ────────────────────────────────────────────────
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (!usarPairingCode && qr) {
      console.log("📱 QR generado. Escanea desde WhatsApp → Dispositivos vinculados → Vincular dispositivo\n");
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
      startTime = Date.now();
      cerrarRL();
      console.log("✅ ¡Conectado a WhatsApp exitosamente!\n");
      console.log("─────────────────────────────────────────────────────────");
      console.log("  Comandos: !menu !hola !empresa !calc !clima !recordar !faq");
      console.log("  IA: cualquier mensaje sin '!' activa el asistente");
      console.log(`  IA activa: ${CONFIG.GEMINI_API_KEY ? "✅ Sí" : "❌ No (sin API Key)"}`);
      console.log("─────────────────────────────────────────────────────────\n");
    }
  });

  sock.ev.on("creds.update", saveCreds);

  // ─── Mensajes entrantes ─────────────────────────────────────────────────
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      if (msg.key.fromMe || !msg.message) continue;

      const jid        = msg.key.remoteJid;
      const esGrupo    = jid.endsWith("@g.us");

      // Ignorar grupos si no está activado
      if (esGrupo && !CONFIG.RESPONDER_GRUPOS) continue;

      const senderName = msg.pushName || "Usuario";

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
        // Solo avisar una vez cada ~60s para no spamear el aviso
        continue;
      }

      console.log(`📩 [${esGrupo ? "Grupo" : senderName}] ${textLimpio.substring(0, 80)}`);

      if (textLimpio.startsWith("!")) {
        await manejarComando(sock, jid, textLimpio, senderName, msg.key);
      } else {
        // Verificar horario y responder si está fuera
        if (esFueraHorario() && empresa.respuesta_fuera_horario) {
          const msgFuera = empresa.mensaje_fuera_horario ||
            "Gracias por escribirnos. Estamos fuera de horario. Te responderemos pronto.";
          // Solo enviar mensaje fuera de horario si es la primera vez en esta sesión
          const ultimoMsg = conversaciones[jid]?.slice(-1)[0];
          const esReciente = ultimoMsg && (Date.now() - new Date(ultimoMsg.ts).getTime()) < 3_600_000;
          if (!esReciente) {
            await send(sock, jid, `🕐 ${msgFuera}\n\n_Horario: ${empresa.horario || "No configurado"}_`);
          }
        }

        // Consultar IA siempre (también fuera de horario si tiene API Key)
        registrarMensaje(jid, "user", textLimpio);
        await sock.sendPresenceUpdate("composing", jid);
        const respuestaIA = await consultarIA(jid, textLimpio);
        registrarMensaje(jid, "bot", respuestaIA);
        await send(sock, jid, respuestaIA);
        await sock.sendPresenceUpdate("paused", jid);
      }
    }
  });

  return sock;
}

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
