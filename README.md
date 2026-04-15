# 🤖 WhatsApp Bot Empresarial v2.0

Bot de WhatsApp construido con [Baileys](https://github.com/WhiskeySockets/Baileys) + **Claude AI (Anthropic)**, con soporte para conexión por QR o **código de emparejamiento**.

---

## ✨ Características nuevas en v2.0

| Característica | Descripción |
|---|---|
| 🔑 Pairing Code | Conexión sin QR, solo con número de teléfono |
| 🧠 IA Empresarial | Claude AI responde con contexto de tu empresa |
| 🏢 Base de datos JSON | `empresa.json` editable con info de tu negocio |
| 💬 Historial | Guarda contexto de conversación por usuario |
| 🧮 Calculadora | Evalúa expresiones matemáticas |
| 🌡️ Clima | Consulta el clima de cualquier ciudad (sin API key) |
| ⏰ Recordatorios | Programa recordatorios por tiempo |
| 🔄 Reconexión inteligente | Backoff exponencial con límite de intentos |

---

## ⚙️ Requisitos

- Node.js **v17 o superior**
- Una cuenta de WhatsApp activa
- (Opcional) Clave API de Anthropic para la IA: [console.anthropic.com](https://console.anthropic.com)

---

## 🚀 Instalación

```bash
# 1. Instalar dependencias
npm install

# 2. (Opcional) Configurar la IA - crea un archivo .env
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env

# 3a. Iniciar con QR (método clásico)
npm start

# 3b. Iniciar con código de emparejamiento (sin QR)
npm run pairing
```

### Con código de emparejamiento:
1. Ejecuta `npm run pairing`
2. Ingresa tu número con código de país (ej: `573001234567`)
3. Recibirás un código tipo `ABCD-EFGH`
4. En WhatsApp: **Configuración → Dispositivos vinculados → Vincular con número de teléfono**

---

## 📋 Comandos disponibles

| Comando | Descripción |
|---|---|
| `!menu` | Menú principal |
| `!hola` | Saludo personalizado |
| `!info` | Info del bot y estado de IA |
| `!hora` | Fecha y hora actual (Bogotá) |
| `!chiste` | Chiste aleatorio |
| `!ping` | Verificar latencia |
| `!empresa` | Info de la empresa |
| `!contacto` | Datos de contacto |
| `!servicios` | Productos/servicios |
| `!calc [expr]` | Calculadora (ej: `!calc 100 * 1.19`) |
| `!recordar [min] [msg]` | Recordatorio programado |
| `!clima [ciudad]` | Clima de cualquier ciudad |
| `!olvidar` | Borra tu historial de conversación |

**Cualquier mensaje sin `!`** activa el asistente IA con contexto de tu empresa.

---

## 🏢 Personalizar la empresa

Edita `empresa.json` con la información real de tu negocio:

```json
{
  "nombre": "Tu Empresa",
  "sector": "Tu sector",
  "descripcion": "Descripción de tu empresa",
  "horario": "Lunes a Viernes 8am-6pm",
  "telefono": "+57 ...",
  "email": "info@tuempresa.com",
  "productos": ["Producto 1", "Producto 2"],
  "politicas": {
    "devolucion": "...",
    "pago": "..."
  },
  "faqs": [
    { "pregunta": "¿...?", "respuesta": "..." }
  ]
}
```

La IA usará automáticamente esta información para responder preguntas de clientes.

---

## 📁 Estructura del proyecto

```
whatsapp-bot/
├── index.js                  # Lógica principal
├── package.json
├── empresa.json              # ⚙️ Info de tu empresa (editar)
├── conversaciones.json       # Auto-generado (historial IA)
├── auth_info_baileys/        # Auto-generado (sesión WA)
└── README.md
```

---

## ⚠️ Notas importantes

- `auth_info_baileys/` guarda tu sesión. **No la subas a Git** (ya está en `.gitignore`).
- El **Pairing Code** permite vincular sin escanear QR, pero sigue siendo una sesión de WhatsApp Web (no Mobile API). Solo puedes tener **un dispositivo vinculado** con este método.
- Si cambias de método (QR↔Pairing), borra `auth_info_baileys/` y reinicia.
- La IA requiere `ANTHROPIC_API_KEY`. Sin ella, el bot funciona con comandos pero no responde preguntas libres.

---

## 📚 Recursos

- [Documentación Baileys](https://baileys.wiki)
- [GitHub Baileys](https://github.com/WhiskeySockets/Baileys)
- [API Anthropic](https://docs.anthropic.com)
