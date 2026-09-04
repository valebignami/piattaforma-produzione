// ============================================================
// Test di coerenza JS ↔ DB (spec §5.6 punto 3).
// I dati NON stanno qui: stanno nel JSON fra $fixture$ e $fixture$ di sql/test_coerenza.sql,
// che è anche il file che li prova contro il database. Qui si legge quello stesso JSON e si
// verifica che le tre funzioni duplicate di comune.js diano gli stessi risultati attesi.
// Se qualcuno cambia i numeri da una parte sola, uno dei due test fallisce.
// ============================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as c from "../js/comune.js";

// Si aggancia all'insert, non ai soli delimitatori: i commenti in testa al file li nominano,
// e uno split secco prenderebbe il pezzo sbagliato.
const sql = readFileSync(new URL("../sql/test_coerenza.sql", import.meta.url), "utf8");
const dentro = /_fixture_coerenza values \(\$fixture\$([\s\S]*?)\$fixture\$::jsonb\)/.exec(sql);
assert.ok(dentro, "sql/test_coerenza.sql: fixture non trovata");
const fx = JSON.parse(dentro[1]);

test("la fixture di test_coerenza.sql si legge e ha tutte le sezioni", () => {
  for (const sezione of ["codici_ammessi", "colonne_fuori", "previsti", "schede", "controlli", "codici", "bilanci"]) {
    assert.ok(fx[sezione], `manca la sezione ${sezione}`);
  }
  assert.ok(fx.controlli.length >= 8 && fx.codici.length >= 4 && fx.bilanci.length >= 4);
});

test("le mappe di comune.js coprono esattamente i codici ammessi dal database", () => {
  // I codici della fixture sono confrontati con i `check` veri dentro test_coerenza.sql:
  // se qui coincidono con le mappe, le etichette del tablet coprono tutti i casi e nessuno in più.
  assert.deepEqual(Object.keys(c.MOMENTI).sort(), [...fx.codici_ammessi.momento].sort());
  assert.deepEqual(Object.keys(c.TIPI_EVENTO).sort(), [...fx.codici_ammessi.tipo_evento].sort());
  assert.deepEqual(Object.keys(c.CAUSE_FERMO).sort(), [...fx.codici_ammessi.causa_fermo].sort());
});

test("CAMPI_CONTROLLO cita esattamente le colonne fuori riferimento della vista", () => {
  const dalCodice = c.CAMPI_CONTROLLO.filter((x) => x.fuori).map((x) => x.fuori).sort();
  assert.deepEqual(dalCodice, [...fx.colonne_fuori].sort());
});

// ---------- fuoriRange ↔ controlli_scostamenti ----------
for (const caso of fx.controlli) {
  test(`fuoriRange come la vista — ${caso.nome}`, () => {
    const rif = { ...fx.schede[caso.scheda], ...fx.previsti };
    const r = c.fuoriRange(caso.valori, rif);
    for (const colonna of fx.colonne_fuori) {
      assert.equal(r[colonna], caso.fuori.includes(colonna), `${caso.nome}: ${colonna}`);
    }
    assert.equal(r.n_fuori, caso.fuori.length, `${caso.nome}: n_fuori`);
  });
}

// ---------- codiciFigli ↔ _codici_figli ----------
for (const caso of fx.codici) {
  test(`codiciFigli come la RPC — ${caso.nome}`, () => {
    assert.deepEqual(c.codiciFigli(caso.n_prog, caso.n_figli, caso.kg_residui, caso.n_esistenti), caso.atteso);
  });
}

// ---------- bilancioChiusura ↔ _controlla_figli_e_bilancio ----------
for (const caso of fx.bilanci) {
  test(`bilancioChiusura come la RPC — ${caso.nome}`, () => {
    const b = c.bilancioChiusura({
      pesoConImballo: caso.peso_con_imballo,
      pesoImballo: caso.peso_imballo,
      pesoTubolare: caso.peso_tubolare,
      figli: caso.figli.map((f) => ({ pesoLordo: f.peso_lordo_kg, pesoTubolare: f.peso_tubolare_kg })),
      kgResidui: caso.kg_residui,
    });
    assert.equal(b.ok, caso.ok, caso.nome);
  });
}
