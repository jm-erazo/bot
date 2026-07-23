/**
 * Lista los modelos de Gemini disponibles para TU API Key.
 *
 * Úsalo cuando el bot devuelva un 404 "model no longer available": te dice
 * exactamente qué identificadores acepta tu clave hoy, para copiar uno válido
 * en CONFIG.GEMINI_MODEL (index.js).
 *
 *   node listar-modelos.mjs
 *
 * Lee la clave de la variable de entorno GEMINI_API_KEY o del archivo .env que
 * el bot genera al configurarse.
 */
import fs from "node:fs";

function leerKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY.trim();
  try {
    const env = fs.readFileSync(new URL("./.env", import.meta.url), "utf-8");
    const m = env.match(/^GEMINI_API_KEY\s*=\s*(.+)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  } catch (_) {}
  return "";
}

const key = leerKey();
if (!key) {
  console.error("❌ No encontré la API Key. Ejecuta el bot y configúrala, o usa:");
  console.error("   GEMINI_API_KEY=tu_clave node listar-modelos.mjs");
  process.exit(1);
}

const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;

try {
  const r = await fetch(url);
  if (!r.ok) {
    const t = await r.text();
    console.error(`❌ La API respondió ${r.status}. Detalle:\n${t.slice(0, 500)}`);
    if (r.status === 400 || r.status === 403) {
      console.error("\n👉 Suele significar que la clave es inválida. Genera una nueva en aistudio.google.com/apikey");
    }
    process.exit(1);
  }
  const data = await r.json();
  const modelos = (data.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""))
    .sort();

  console.log(`\n✅ Tu clave tiene acceso a ${modelos.length} modelos que sirven para chat:\n`);
  for (const m of modelos) {
    const reco = /flash-latest|flash-lite-latest|2\.5-flash|3\.\d-flash/.test(m) ? "  ⭐ recomendado" : "";
    console.log(`   ${m}${reco}`);
  }
  console.log(`\nCopia uno en CONFIG.GEMINI_MODEL dentro de index.js (línea ~97).`);
  console.log(`El bot viene con "gemini-flash-latest", que se actualiza solo.\n`);
} catch (e) {
  console.error("❌ Error de red al consultar la API:", e.message);
  process.exit(1);
}
