/**
 * WhatsApp Bot con Baileys v7
 * --------------------------------------------------
 * Conexión vía QR Code o Pairing Code
 * Lógica de comandos con switch/case
 * --------------------------------------------------
 */

import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeInMemoryStore,
  jidDecode,
} from "baileys";
import { Boom } from "@hapi/boom";
import qrcode from "qrcode-terminal";
import pino from "pino";

// ─── Logger silencioso (cambia "silent" a "info" para ver todos los logs) ────
const logger = pino({ level: "silent" });

// ─── Store en memoria (opcional, guarda mensajes/contactos en RAM) ─────────
const store = makeInMemoryStore({ logger });

// ─── Función principal ──────────────────────────────────────────────────────
async function startBot() {
  // 1. Estado de autenticación (archivos locales - solo para desarrollo)
  //    ⚠️  En producción implementa tu propia persistencia (DB, Redis, etc.)
  const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys");

  // 2. Obtener la versión más reciente del protocolo WA
  const { version } = await fetchLatestBaileysVersion();
  console.log(`\n🤖 WhatsApp Bot iniciando... (versión WA: ${version.join(".")})\n`);

  // 3. Crear el socket
  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false, // lo manejamos manualmente abajo
    browser: ["WhatsApp Bot", "Chrome", "1.0.0"],
  });

  // Enlazar el store al socket
  store.bind(sock.ev);

  // ─── 4. Manejar actualizaciones de conexión ─────────────────────────────
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // Mostrar QR en terminal cuando esté disponible
    if (qr) {
      console.log("📱 Escanea este código QR con tu WhatsApp:\n");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "close") {
      const statusCode = (lastDisconnect?.error instanceof Boom)
        ? lastDisconnect.error.output.statusCode
        : null;

      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      console.log(
        `\n❌ Conexión cerrada. Razón: ${statusCode ?? "desconocida"}.`,
        shouldReconnect ? "Reconectando..." : "Sesión cerrada. Elimina auth_info_baileys y reinicia."
      );

      if (shouldReconnect) {
        // Pequeña espera antes de reconectar
        setTimeout(() => startBot(), 3000);
      }
    }

    if (connection === "open") {
      console.log("\n✅ ¡Conectado a WhatsApp exitosamente!\n");
      console.log("─────────────────────────────────────────");
      console.log("  Comandos disponibles:");
      console.log("  !menu    → Muestra el menú principal");
      console.log("  !hola    → Saludo personalizado");
      console.log("  !info    → Info del bot");
      console.log("  !hora    → Hora actual");
      console.log("  !chiste  → Un chiste random");
      console.log("  !ping    → Verificar si el bot responde");
      console.log("─────────────────────────────────────────\n");
    }
  });

  // ─── 5. Guardar credenciales cuando se actualicen ───────────────────────
  sock.ev.on("creds.update", saveCreds);

  // ─── 6. Manejar mensajes entrantes ──────────────────────────────────────
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    // Solo procesar mensajes nuevos (no historial)
    if (type !== "notify") return;

    for (const msg of messages) {
      // Ignorar mensajes del propio bot y mensajes sin contenido
      if (msg.key.fromMe || !msg.message) continue;

      const jid = msg.key.remoteJid; // ID del chat (número@s.whatsapp.net o grupo@g.us)
      const isGroup = jid?.endsWith("@g.us");
      const senderName = msg.pushName || "Usuario";

      // Extraer texto del mensaje (texto simple o extendido)
      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        "";

      if (!text) continue; // Ignorar mensajes sin texto (imágenes, audio, etc.)

      const command = text.trim().toLowerCase();

      console.log(`📩 [${isGroup ? "GRUPO" : "DM"}] ${senderName}: ${text}`);

      // ─── 7. Lógica del bot con switch/case ───────────────────────────
      await handleCommand(sock, jid, command, senderName, msg);
    }
  });
}

// ─── Función de manejo de comandos ─────────────────────────────────────────
async function handleCommand(sock, jid, command, senderName, originalMsg) {
  // Tipeo simulado (hace que el bot parezca más natural)
  await sock.sendPresenceUpdate("composing", jid);
  await delay(800);

  switch (command) {
    // ── MENÚ ──────────────────────────────────────────────────────────────
    case "!menu":
    case "!ayuda":
    case "!help": {
      const menu = `╔══════════════════════════╗
║   🤖 *BOT DE WHATSAPP*   ║
╚══════════════════════════╝

📋 *Comandos disponibles:*

🙋 *!hola* — Saludo personalizado
ℹ️  *!info* — Info del bot
🕐 *!hora* — Hora actual del servidor
😂 *!chiste* — Un chiste aleatorio
🏓 *!ping* — Verificar latencia
📋 *!menu* — Este menú

_Escribe un comando para comenzar_`;

      await sendTextMessage(sock, jid, menu);
      break;
    }

    // ── HOLA ──────────────────────────────────────────────────────────────
    case "!hola":
    case "!hi":
    case "!hello": {
      const greetings = [
        `¡Hola, ${senderName}! 👋 ¿En qué puedo ayudarte hoy?`,
        `¡Qué bueno verte, ${senderName}! 😊 ¿Cómo estás?`,
        `Hey ${senderName}! 🤙 Aquí estoy para lo que necesites.`,
      ];
      const response = greetings[Math.floor(Math.random() * greetings.length)];
      await sendTextMessage(sock, jid, response);
      break;
    }

    // ── INFO ──────────────────────────────────────────────────────────────
    case "!info": {
      const info = `🤖 *Información del Bot*

📦 *Librería:* Baileys v7 (WhiskeySockets)
🌐 *Protocolo:* WhatsApp Web WebSocket
⚡ *Runtime:* Node.js ${process.version}
🖥️  *Plataforma:* ${process.platform}
⏱️  *Uptime:* ${formatUptime(process.uptime())}

_Desarrollado con ❤️ usando Baileys_`;

      await sendTextMessage(sock, jid, info);
      break;
    }

    // ── HORA ──────────────────────────────────────────────────────────────
    case "!hora":
    case "!time": {
      const now = new Date();
      const timeStr = now.toLocaleString("es-CO", {
        timeZone: "America/Bogota",
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      await sendTextMessage(sock, jid, `🕐 *Hora actual (Bogotá):*\n${timeStr}`);
      break;
    }

    // ── CHISTE ────────────────────────────────────────────────────────────
    case "!chiste":
    case "!joke": {
      const chistes = [
        "¿Por qué los programadores confunden Halloween y Navidad?\nPorque OCT 31 = DEC 25 🎃🎄",
        "Un SQL entra a un bar y le pregunta a dos mesas:\n¿Puedo unirme a ustedes? 😂",
        "¿Cuántos programadores se necesitan para cambiar un foco?\nNinguno, ese es un problema de hardware 💡",
        "Mi código no tiene bugs...\n¡Tiene features no documentadas! 🐛",
        "¿Por qué el programador dejó su trabajo?\nPorque no le daban arrays... digo, aumentos 💰",
      ];
      const chiste = chistes[Math.floor(Math.random() * chistes.length)];
      await sendTextMessage(sock, jid, `😂 *Chiste del día:*\n\n${chiste}`);
      break;
    }

    // ── PING ──────────────────────────────────────────────────────────────
    case "!ping": {
      const start = Date.now();
      await sendTextMessage(sock, jid, `🏓 Pong! Latencia: *${Date.now() - start}ms*`);
      break;
    }

    // ── COMANDO NO RECONOCIDO ─────────────────────────────────────────────
    default: {
      // Solo responder si empieza con "!" para no responder a cualquier mensaje
      if (command.startsWith("!")) {
        await sendTextMessage(
          sock,
          jid,
          `❓ Comando *${command}* no reconocido.\nEscribe *!menu* para ver los comandos disponibles.`
        );
      }
      break;
    }
  }

  // Detener indicador de escritura
  await sock.sendPresenceUpdate("paused", jid);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Envía un mensaje de texto simple */
async function sendTextMessage(sock, jid, text) {
  try {
    await sock.sendMessage(jid, { text });
    console.log(`📤 Respuesta enviada a ${jid}`);
  } catch (error) {
    console.error("Error al enviar mensaje:", error);
  }
}

/** Delay en milisegundos */
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

/** Formatea el uptime en horas/minutos/segundos */
function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h}h ${m}m ${s}s`;
}

// ─── Arrancar el bot ─────────────────────────────────────────────────────────
startBot().catch(console.error);
