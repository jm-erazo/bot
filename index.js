/**
 * WhatsApp Bot con Baileys v7
 * --------------------------------------------------
 * Compatible con Baileys v7 (ESM, sin makeInMemoryStore)
 * Lógica de comandos con switch/case
 * --------------------------------------------------
 */

import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from "baileys";
import { Boom } from "@hapi/boom";
import qrcode from "qrcode-terminal";
import pino from "pino";

// Logger silencioso (cambia "silent" a "info" para ver logs de Baileys)
const logger = pino({ level: "silent" });

// ─── Función principal ──────────────────────────────────────────────────────
async function startBot() {
  // 1. Estado de autenticación (solo para desarrollo/pruebas)
  //    ⚠️  En producción implementa tu propia persistencia en DB
  const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys");

  // 2. Versión más reciente del protocolo WA
  const { version } = await fetchLatestBaileysVersion();
  console.log(`\n🤖 WhatsApp Bot iniciando... (WA v${version.join(".")})\n`);

  // 3. Crear el socket (makeWASocket es el export DEFAULT en v7)
  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false,
    browser: ["WhatsApp Bot", "Chrome", "1.0.0"],
  });

  // ─── 4. Manejar actualizaciones de conexión ─────────────────────────────
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // Mostrar QR en terminal
    if (qr) {
      console.log("📱 Escanea este QR con tu WhatsApp:\n");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "close") {
      const statusCode =
        lastDisconnect?.error instanceof Boom
          ? lastDisconnect.error.output.statusCode
          : null;

      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      if (shouldReconnect) {
        console.log(`\n🔄 Reconectando... (código: ${statusCode})`);
        setTimeout(() => startBot(), 3000);
      } else {
        console.log(
          "\n⛔ Sesión cerrada. Borra la carpeta auth_info_baileys/ y reinicia."
        );
      }
    }

    if (connection === "open") {
      console.log("\n✅ ¡Conectado a WhatsApp exitosamente!\n");
      console.log("─────────────────────────────────────────");
      console.log("  Comandos: !menu !hola !info !hora !chiste !ping");
      console.log("─────────────────────────────────────────\n");
    }
  });

  // ─── 5. Guardar credenciales ─────────────────────────────────────────────
  sock.ev.on("creds.update", saveCreds);

  // ─── 6. Manejar mensajes entrantes ──────────────────────────────────────
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      if (msg.key.fromMe || !msg.message) continue;

      const jid = msg.key.remoteJid;
      const senderName = msg.pushName || "Usuario";

      // Extraer texto (simple o extendido)
      const text =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        "";

      if (!text) continue;

      const command = text.trim().toLowerCase();
      console.log(`📩 ${senderName}: ${text}`);

      await handleCommand(sock, jid, command, senderName);
    }
  });
}

// ─── Manejador de comandos con switch/case ───────────────────────────────────
async function handleCommand(sock, jid, command, senderName) {
  // Indicador de escritura
  await sock.sendPresenceUpdate("composing", jid);
  await delay(700);

  switch (command) {

    case "!menu":
    case "!ayuda":
    case "!help": {
      const menu =
`╔══════════════════════════╗
║   🤖 *BOT DE WHATSAPP*   ║
╚══════════════════════════╝

📋 *Comandos disponibles:*

🙋 *!hola*   — Saludo personalizado
ℹ️  *!info*   — Info del bot
🕐 *!hora*   — Hora actual (Bogotá)
😂 *!chiste* — Chiste aleatorio
🏓 *!ping*   — Verificar latencia
📋 *!menu*   — Este menú

_Escribe un comando para comenzar_`;
      await send(sock, jid, menu);
      break;
    }

    case "!hola":
    case "!hi":
    case "!hello": {
      const opciones = [
        `¡Hola, ${senderName}! 👋 ¿En qué puedo ayudarte hoy?`,
        `¡Qué bueno verte, ${senderName}! 😊 ¿Cómo estás?`,
        `Hey ${senderName}! 🤙 Aquí estoy para lo que necesites.`,
      ];
      await send(sock, jid, opciones[Math.floor(Math.random() * opciones.length)]);
      break;
    }

    case "!info": {
      const info =
`🤖 *Información del Bot*

📦 *Librería:* Baileys v7 (WhiskeySockets)
🌐 *Protocolo:* WhatsApp Web WebSocket
⚡ *Runtime:* Node.js ${process.version}
🖥️  *Plataforma:* ${process.platform}
⏱️  *Uptime:* ${formatUptime(process.uptime())}

_Hecho con ❤️ usando Baileys_`;
      await send(sock, jid, info);
      break;
    }

    case "!hora":
    case "!time": {
      const hora = new Date().toLocaleString("es-CO", {
        timeZone: "America/Bogota",
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      await send(sock, jid, `🕐 *Hora actual (Bogotá):*\n${hora}`);
      break;
    }

    case "!chiste":
    case "!joke": {
      const chistes = [
        "¿Por qué los programadores confunden Halloween y Navidad?\nPorque OCT 31 = DEC 25 🎃🎄",
        "Un SQL entra a un bar y le pregunta a dos mesas:\n¿Puedo unirme a ustedes? 😂",
        "¿Cuántos programadores se necesitan para cambiar un foco?\nNinguno, ese es problema de hardware 💡",
        "Mi código no tiene bugs...\n¡Tiene features no documentadas! 🐛",
        "¿Por qué el programador dejó su trabajo?\nNo le daban arrays... digo, aumentos 💰",
      ];
      const chiste = chistes[Math.floor(Math.random() * chistes.length)];
      await send(sock, jid, `😂 *Chiste del día:*\n\n${chiste}`);
      break;
    }

    case "!ping": {
      const t = Date.now();
      await send(sock, jid, `🏓 Pong! Latencia: *${Date.now() - t}ms*`);
      break;
    }

    default: {
      if (command.startsWith("!")) {
        await send(
          sock,
          jid,
          `❓ Comando *${command}* no reconocido.\nEscribe *!menu* para ver los comandos.`
        );
      }
      break;
    }
  }

  await sock.sendPresenceUpdate("paused", jid);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function send(sock, jid, text) {
  try {
    await sock.sendMessage(jid, { text });
  } catch (err) {
    console.error("❌ Error enviando mensaje:", err.message);
  }
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function formatUptime(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return `${h}h ${m}m ${sec}s`;
}

// ─── Arrancar ────────────────────────────────────────────────────────────────
startBot().catch(console.error);
