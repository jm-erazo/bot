/**
 * Banco de pruebas: carga el index.js REAL, recorta únicamente el IIFE de
 * arranque interactivo (que abriría readline y la conexión a WhatsApp) y
 * verifica las funciones críticas contra el comportamiento esperado.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(dir, "index.js"), "utf-8");

// Recortar el arranque: todo desde el marcador "─── Arrancar ───"
const corte = src.indexOf("// ─── Arrancar ─");
if (corte === -1) throw new Error("No se encontró el marcador de arranque");

const modulo =
  src.slice(0, corte) +
  `\nexport { clasificarErrorGemini, buildGeminiHistory, construirSystemPrompt,
            detectarModulos, construirContextoTurno, COMPILAR_MODULO,
            construirGenerationConfig, CONFIG,
            esFueraHorario, guardarJSON, VERSION, empresa, recargarEmpresa };\n`;

const tmp = path.join(dir, "__test_modulo.mjs");
fs.writeFileSync(tmp, modulo, "utf-8");

const m = await import("./__test_modulo.mjs");

let ok = 0, fail = 0;
const eq = (nombre, real, esperado) => {
  const bien = JSON.stringify(real) === JSON.stringify(esperado);
  bien ? ok++ : fail++;
  console.log(`${bien ? "  ✓" : "  ✗"} ${nombre}${bien ? "" : `\n      esperado: ${JSON.stringify(esperado)}\n      real    : ${JSON.stringify(real)}`}`);
};
const que = (nombre, cond) => { cond ? ok++ : fail++; console.log(`${cond ? "  ✓" : "  ✗"} ${nombre}`); };

// ── 1. clasificarErrorGemini ────────────────────────────────────────────────
console.log("\n1. clasificarErrorGemini — el fix del que dependía el caso CB-04");
const err = (msg, status) => Object.assign(new Error(msg), status ? { status } : {});

eq("429 explícito → cuota",                    m.clasificarErrorGemini(err("Too Many Requests", 429)), "cuota");
eq("RESOURCE_EXHAUSTED → cuota",               m.clasificarErrorGemini(err("[429] RESOURCE_EXHAUSTED")), "cuota");
eq("texto 'quota exceeded' → cuota",           m.clasificarErrorGemini(err("Quota exceeded for model")), "cuota");
eq("403 con mención de cuota → cuota (regresión v3.2)",
                                               m.clasificarErrorGemini(err("PERMISSION_DENIED: quota exceeded", 403)), "cuota");
eq("API_KEY_INVALID → key_invalida",           m.clasificarErrorGemini(err("API_KEY_INVALID")), "key_invalida");
eq("'API key not valid' → key_invalida",       m.clasificarErrorGemini(err("API key not valid. Pass a valid API key.")), "key_invalida");
eq("401 → key_invalida",                       m.clasificarErrorGemini(err("Unauthorized", 401)), "key_invalida");
eq("403 puro → key_invalida",                  m.clasificarErrorGemini(err("PERMISSION_DENIED", 403)), "key_invalida");
eq("404 modelo → modelo",                      m.clasificarErrorGemini(err("models/x is not found")), "modelo");
eq("404 'no longer available' → modelo (no key_invalida)",
                                               m.clasificarErrorGemini(err("[404 Not Found] This model models/gemini-2.5-flash is no longer available to new users.")), "modelo");
eq("timeout de red → transitorio",             m.clasificarErrorGemini(err("fetch failed ETIMEDOUT")), "transitorio");

// ── 2. buildGeminiHistory ───────────────────────────────────────────────────
console.log("\n2. buildGeminiHistory — alternancia estricta user/model");
const H = (...r) => r.map(([rol, c]) => ({ rol, contenido: c }));

eq("historial vacío", m.buildGeminiHistory([]), []);
eq("par completo",
   m.buildGeminiHistory(H(["user", "hola"], ["bot", "buenas"])),
   [{ role: "user", parts: [{ text: "hola" }] }, { role: "model", parts: [{ text: "buenas" }] }]);
que("mensaje huérfano al final se descarta",
   m.buildGeminiHistory(H(["user", "a"], ["bot", "b"], ["user", "sin respuesta"])).length === 2);
que("user huérfano inicial no rompe la alternancia",
   m.buildGeminiHistory(H(["user", "x"], ["user", "a"], ["bot", "b"])).length === 2);

const largo = [];
for (let i = 0; i < 30; i++) largo.push({ rol: "user", contenido: `u${i}` }, { rol: "bot", contenido: `b${i}` });
const rec = m.buildGeminiHistory(largo);
que("se acota a 20 entradas (10 pares)", rec.length === 20);
que("empieza en 'user' tras el recorte", rec[0].role === "user");
que("alterna estrictamente user/model",
   rec.every((x, i) => x.role === (i % 2 === 0 ? "user" : "model")));

// ── 3. Prompt base ligero + enrutamiento de contexto ────────────────────────
console.log("\n3. Prompt base ligero (v3.4)");
const est = (t) => Math.round(t.length / 4);
const p = m.construirSystemPrompt();
que(`prompt base ≤ 500 tokens (real: ${est(p)})`, est(p) <= 500);
que("prompt base incluye el nombre de la empresa", p.includes("Vértice Consultoría Digital S.A.S."));
que("prompt base anuncia los temas disponibles", p.includes("servicios") && p.includes("politicas"));
que("prompt base NO trae el detalle de servicios", !p.includes("Diagnóstico digital empresarial:"));
que("prompt base NO trae las 8 FAQ completas", !p.includes("¿Cómo protegen la información"));
que("prompt base lleva la instrucción de no divulgar", p.includes(m.empresa.divulgacion.instruccion_asistente));

console.log("\n3b. Enrutador de intención (detectarModulos)");
const ruta = (msg) => m.detectarModulos(msg).sort();
eq("saludo → sin módulos",              ruta("Hola, buenos días"), []);
eq("precio → servicios",                ruta("¿Cuánto cuesta una consultoría?"), ["servicios"]);
eq("pago → politicas",                  ruta("¿Cómo son las formas de pago?"), ["politicas"]);
eq("confidencialidad → solo politicas", ruta("¿Cómo protegen la información de mi empresa?"), ["politicas"]);
eq("identidad → identidad",             ruta("¿Quiénes son y cuál es su misión?"), ["identidad"]);
eq("contacto → contacto",               ruta("¿Cuál es su dirección y teléfono?"), ["contacto"]);
eq("desarrollo → alcance",              ruta("¿Ustedes hacen desarrollo de software?"), ["alcance"]);
eq("mixto → servicios + politicas",     ruta("¿Qué precio tiene la automatización y cómo se paga?"), ["politicas", "servicios"]);
que("pregunta vaga → sin módulos (base basta)", m.detectarModulos("necesito ayuda con mi negocio").length === 0);

console.log("\n3c. El contexto del turno solo trae lo pedido, y nunca lo interno");
const ctxPrecio = m.construirContextoTurno("¿cuánto cuesta el diagnóstico?");
que("contexto de precio incluye el catálogo", ctxPrecio.includes("Diagnóstico digital empresarial"));
que("contexto de precio incluye montos",      ctxPrecio.includes("890.000"));
que("contexto de precio NO incluye FAQ",       !ctxPrecio.includes("Preguntas frecuentes"));
const ctxTodo = m.detectarModulos("servicios precio pago garantia historia mision contacto telefono desarrollo software")
  .map((x) => m.COMPILAR_MODULO[x](m.empresa)).join("\n");
que("ningún módulo expone el organigrama",    !ctxTodo.includes(m.empresa.organizacion.organigrama));
que("ningún módulo expone cargos internos",   !ctxTodo.includes("Analista administrativa"));
que("ningún módulo expone indicadores/metas", !ctxTodo.includes("Propuestas cerradas sobre propuestas enviadas"));
que("ningún módulo expone el crecimiento",    !ctxTodo.includes(m.empresa.estrategia.crecimiento_esperado));
que("el saludo no genera contexto",           m.construirContextoTurno("hola") === "");

// ── 4. Compatibilidad con un empresa.json antiguo ──────────────────────────
console.log("\n4. Compatibilidad hacia atrás (empresa.json sin los bloques nuevos)");
const backup = fs.readFileSync(path.join(dir, "empresa.json"), "utf-8");
const antiguo = {
  nombre: "Mi Empresa S.A.S.", sector: "Tecnología", descripcion: "Desc.",
  horario: "L-V 8-18", horario_inicio: 8, horario_fin: 18, dias_habil: [1, 2, 3, 4, 5],
  telefono: "+57 300", email: "a@b.co", direccion: "Calle 1",
  productos: ["Servicio A", "Servicio B"],
  politicas: { pago: "Contado" },
  faqs: [{ pregunta: "¿P?", respuesta: "R" }],
  respuesta_fuera_horario: true, mensaje_fuera_horario: "Fuera de horario",
};
fs.writeFileSync(path.join(dir, "empresa.json"), JSON.stringify(antiguo, null, 2), "utf-8");
m.recargarEmpresa();
const p2 = m.construirSystemPrompt();
const ctx2 = m.construirContextoTurno("¿qué servicios ofrecen y a qué precio?");
que("base sigue ligero sin 'identidad'",         est(p2) <= 500);
que("servicios cae a 'productos' sin catálogo",  ctx2.includes("Servicio A, Servicio B"));
que("mantiene las políticas vía módulo",         m.construirContextoTurno("¿cómo pago?").includes("Contado"));
que("instrucción de reserva por defecto",        p2.includes("No reveles información interna"));
fs.writeFileSync(path.join(dir, "empresa.json"), backup, "utf-8");
m.recargarEmpresa();
que("empresa restaurada tras el test", m.empresa.nombre === "Vértice Consultoría Digital S.A.S.");

// ── 5. Escritura atómica ───────────────────────────────────────────────────
console.log("\n5. guardarJSON — escritura atómica");
const f = path.join(dir, "__test_atomic.json");
m.guardarJSON(f, { a: 1, ñ: "áé" });
que("el archivo se escribe", fs.existsSync(f));
que("el contenido es correcto", fs.readFileSync(f, "utf-8").includes('"ñ": "áé"'));
que("no queda ningún .tmp huérfano", !fs.existsSync(`${f}.tmp`));
fs.unlinkSync(f);

// ── 6. Versión coherente ───────────────────────────────────────────────────
console.log("\n6. Versión");
const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf-8"));
eq("VERSION coincide con package.json", m.VERSION, pkg.version);

// ── 7. Control de pensamiento (evita respuestas truncadas) ───────────────────
console.log("\n7. construirGenerationConfig — thinking según modelo");
que("maxOutputTokens holgado (≥ 800)", m.CONFIG.MAX_TOKENS_RESPUESTA >= 800);
que("incluye thinkingConfig", !!m.construirGenerationConfig().thinkingConfig);
const modeloOrig = m.CONFIG.GEMINI_MODEL;
m.CONFIG.GEMINI_MODEL = "gemini-2.5-flash";
que("2.5 → thinkingBudget 0 (desactivado)", m.construirGenerationConfig().thinkingConfig.thinkingBudget === 0);
m.CONFIG.GEMINI_MODEL = "gemini-flash-latest";
que("alias -latest → budget definido", m.construirGenerationConfig().thinkingConfig.thinkingBudget === 0);
m.CONFIG.GEMINI_MODEL = "gemini-3.5-flash";
que("3.x → thinkingLevel 'low' (no se puede apagar)", m.construirGenerationConfig().thinkingConfig.thinkingLevel === "low");
m.CONFIG.GEMINI_MODEL = modeloOrig;

fs.unlinkSync(tmp);
console.log(`\n${"─".repeat(46)}\nRESULTADO: ${ok} correctas, ${fail} fallidas\n`);
process.exit(fail ? 1 : 0);
