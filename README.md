# 🤖 WhatsApp Bot Empresarial v3.0

Bot de WhatsApp con IA (Claude), comandos empresariales y código de emparejamiento corregido.

---

## 🔧 Correcciones v3.0

### Bug 1 — API Key de Anthropic siempre inválida
**Causa:** El modelo usado era `claude-haiku-4-5` (incorrecto).  
**Fix:** Ahora usa el string exacto `claude-haiku-4-5-20251001`.

### Bug 2 — Código de emparejamiento "Connection Closed"
**Causa:** `requestPairingCode()` se llamaba dentro del event handler `connection.update` antes de que el WebSocket completara el handshake.  
**Fix:** Se llama **fuera** del event handler con un delay de 2.5s para asegurar que el socket esté listo.

### Bug 3 — Sin `makeCacheableSignalKeyStore`
**Causa:** Baileys v7 requiere el key store con caché para mejor rendimiento.  
**Fix:** Se importa y usa correctamente.

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
ANTHROPIC_API_KEY=sk-ant-api03-TuClaveAqui
```

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
| `!ping` | Latencia del bot |
| `!olvidar` | Borrar historial de chat con IA |
| `!recargar` | Recargar empresa.json sin reiniciar |

**IA:** Cualquier mensaje sin `!` activa el asistente inteligente.

---

## 🛡️ Características de seguridad

- **Anti-spam:** Máximo 8 mensajes por minuto por contacto
- **Rate limiting:** Automático, sin banear
- **Grupos:** Desactivado por defecto (editar `CONFIG.RESPONDER_GRUPOS`)
- **Fuera de horario:** Mensaje automático configurable

---

## 🔄 Solución de problemas

### Error: Connection Closed al usar código de emparejamiento
1. Borra la carpeta `auth_info_baileys/`
2. Verifica que el número incluye código de país (ej: 573001234567)
3. Asegúrate de que WhatsApp esté activo en el teléfono
4. Espera ~30 segundos antes de intentar de nuevo

### Error: API Key inválida
1. Verifica que la clave empieza con `sk-ant-`
2. Revisa en console.anthropic.com que la clave esté activa
3. Asegúrate de que tengas crédito disponible

### Sesión caducada
Borra la carpeta `auth_info_baileys/` y vuelve a vincular.
