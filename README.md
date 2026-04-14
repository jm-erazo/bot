# 🤖 WhatsApp Bot con Baileys v7

Bot de WhatsApp construido con [Baileys](https://github.com/WhiskeySockets/Baileys), la librería WebSocket para WhatsApp Web.

## ⚙️ Requisitos

- Node.js **v17 o superior**
- Una cuenta de WhatsApp activa

## 🚀 Instalación y uso

```bash
# 1. Instalar dependencias
npm install

# 2. Iniciar el bot
npm start
```

Al ejecutarlo por primera vez, aparecerá un **código QR en la terminal**.  
Abre WhatsApp > Dispositivos vinculados > Vincular dispositivo y escanéalo.

## 📋 Comandos disponibles

| Comando    | Descripción                  |
|------------|------------------------------|
| `!menu`    | Muestra el menú de comandos  |
| `!hola`    | Saludo personalizado         |
| `!info`    | Información del bot          |
| `!hora`    | Hora actual (Bogotá)         |
| `!chiste`  | Chiste aleatorio             |
| `!ping`    | Verificar latencia           |

## 📁 Estructura del proyecto

```
whatsapp-bot/
├── index.js              # Lógica principal del bot
├── package.json
├── .gitignore
├── auth_info_baileys/    # Se crea automáticamente (sesión)
└── README.md
```

## ⚠️ Notas importantes

- `auth_info_baileys/` guarda tu sesión. **No la subas a Git**.
- `useMultiFileAuthState` es solo para desarrollo. En producción usa una DB.
- El bot solo responde a comandos que empiecen con `!`.

## 🛠️ Agregar nuevos comandos

En `index.js`, dentro del `switch (command)`, agrega un nuevo `case`:

```js
case '!micomando': {
  await sendTextMessage(sock, jid, '¡Hola desde mi comando!');
  break;
}
```

## 📚 Recursos

- [Documentación Baileys](https://baileys.wiki)
- [GitHub Baileys](https://github.com/WhiskeySockets/Baileys)
- [Discord de soporte](https://whiskey.so/discord)
