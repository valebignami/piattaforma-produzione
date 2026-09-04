// Ogni id cercato con byId("...") in un js/<pagina>.js deve esistere nell'HTML della pagina.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const COPPIE = [
  ["js/index.js", "index.html"],
  ["js/ufficio.js", "ufficio.html"],
  ["js/ufficio/magazzino.js", "ufficio.html"],
  ["js/ufficio/pianificazione.js", "ufficio.html"],
  ["js/ufficio/impostazioni.js", "ufficio.html"],
  ["js/stampa.js", "stampa.html"],
];

for (const [js, html] of COPPIE) {
  test(`${js}: gli id cercati esistono in ${html}`, () => {
    const src = readFileSync(new URL("../" + js, import.meta.url), "utf8");
    const pagina = readFileSync(new URL("../" + html, import.meta.url), "utf8");
    const ids = [...src.matchAll(/byId\("([^"]+)"\)/g)].map((m) => m[1]);
    assert.ok(ids.length > 0, "nessun byId trovato: il test non prova nulla");
    for (const id of ids) assert.ok(pagina.includes(`id="${id}"`), `id mancante nell'HTML: ${id}`);
  });
}
