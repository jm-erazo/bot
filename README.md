# 🤖 WhatsApp Bot Empresarial v3.1

Bot de WhatsApp con IA (Google Gemini), comandos empresariales y múltiples correcciones de bugs.

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

### Bug 8 — Instancia de `GoogleGenerativeAI` creada por mensaje
**Causa:** Se hacía `new GoogleGenerativeAI(key)` en cada llamada a `consultarIA()` y `!traducir`.  
**Fix:** Singleton inicializado una vez; se reinicializa solo al cambiar la API Key o recargar empresa.

### Bug 9 — Memory leak en `rateLimiter`
**Causa:** El `Map` crecía indefinidamente con entradas de todos los contactos que jamás enviaron un mensaje.  
**Fix:** `setInterval` cada 5 minutos elimina entradas de contactos sin actividad reciente.

---

## 🚀 Instalación

```bash
# 1. Clona o descarga el proyecto
cd bot

# 2. Instala dependencias (requiere Node.js >= 18)
npm install

# 3. Inicia el bot
npm start
```

---

## ⚙️ Configuración

El bot configura todo interactivamente al iniciar. También puedes crear un archivo `.env`:

```env
GEMINI_API_KEY=AIzaSyTuClaveAqui
```

Obtén tu API Key gratis en: **https://aistudio.google.com/apikey**

Para personalizar la empresa, edita `empresa.json`:

```json
{
  "nombre": "Tu Empresa S.A.S.",
  "sector": "Tu sector",
  "horario": "Lunes a Viernes 8AM - 6PM",
  "horario_inicio": 8,
  "horario_fin": 18,
  "dias_habil": [1, 2, 3, 4, 5],
  "respuesta_fuera_horario": true,
  "mensaje_fuera_horario": "Tu mensaje fuera de horario..."
}
```

Después de editar, envía `!recargar` por WhatsApp sin reiniciar el bot.

---

## 📋 Comandos disponibles

| Comando | Descripción |
|---------|-------------|
| `!menu` | Muestra todos los comandos |
| `!hola` | Saludo personalizado |
| `!info` | Estado del bot |
| `!hora` | Fecha y hora en Bogotá |
| `!empresa` | Info de la empresa |
| `!contacto` | Datos de contacto |
| `!servicios` | Productos/servicios |
| `!faq` | Preguntas frecuentes |
| `!politicas` | Políticas de la empresa |
| `!horario` | Horario + estado actual |
| `!calc [expr]` | Calculadora (soporta `^` para potencias) |
| `!clima [ciudad]` | Clima en tiempo real |
| `!recordar [min] [msg]` | Recordatorio |
| `!encuesta [preg] \| [op1] \| [op2]` | Crear encuesta |
| `!votar [número]` | Votar en encuesta activa |
| `!traducir [texto]` | Traducción al inglés con IA |
| `!chiste` | Chiste aleatorio |
| `!ping` | Latencia real del bot |
| `!olvidar` | Borrar historial de chat con IA |
| `!recargar` | Recargar empresa.json sin reiniciar |

**IA:** Cualquier mensaje sin `!` activa el asistente inteligente.

---

## 🛡️ Características de seguridad

- **Anti-spam:** Máximo 8 mensajes por minuto por contacto
- **Rate limiting:** Automático con limpieza de memoria cada 5 minutos
- **Grupos:** Desactivado por defecto (editar `CONFIG.RESPONDER_GRUPOS`)
- **Fuera de horario:** Mensaje automático configurable (máximo 1 vez por hora)
- **Cierre limpio:** Manejo de SIGINT/SIGTERM para guardar datos antes de cerrar

---

## 🔄 Solución de problemas

### Error: "Cannot find module 'qrcode-terminal'"
Ejecuta `npm install` para instalar todas las dependencias.

### Error: Connection Closed al usar código de emparejamiento
1. Borra la carpeta `auth_info_baileys/`
2. Verifica que el número incluye código de país (ej: 573001234567)
3. Asegúrate de que WhatsApp esté activo en el teléfono
4. Espera ~30 segundos antes de intentar de nuevo

### Error: API Key inválida
1. Verifica que la clave empieza con `AIzaSy`
2. Revisa en **aistudio.google.com** que la clave esté activa
3. Asegúrate de que el modelo `gemini-2.0-flash` esté disponible en tu región

### La IA repite el mensaje del usuario
Asegúrate de usar la versión v3.1. Este era el bug #2 corregido.

### Sesión caducada
Borra la carpeta `auth_info_baileys/` y vuelve a vincular.
