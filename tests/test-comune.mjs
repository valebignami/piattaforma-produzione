import { test } from "node:test";
import assert from "node:assert/strict";
import * as c from "../js/comune.js";

test("kgAlMetro: formula del manuale (larg × sp × 2,7 / 1000), esatta in virgola mobile", () => {
  assert.equal(c.kgAlMetro(1500, 2), 8.1);          // (1500·2·27)/10000 = 8.1 esatto; (1500·2·2.7)/1000 darebbe 8.100000000000001
  assert.equal(Number(c.kgAlMetro(1080, 0.45).toFixed(2)), 1.31);
});

test("metriDaKg: esempi del manuale, arrotondati all'intero", () => {
  assert.equal(c.metriDaKg(7000, 1500, 2), 864);   // 864,2 nel manuale
  assert.equal(c.metriDaKg(6500, 1500, 2), 802);   // 802,47 → 802 (spec §2.7)
});

test("kgDaMetri: inverso", () => {
  assert.equal(c.kgDaMetri(500, 1500, 2), 4050);
});

test("costanti dello spec", () => {
  assert.equal(c.SOGLIA_CONTROLLO_MIN, 20);
  assert.equal(c.SOGLIA_BOLLA_PCT, 3);
  assert.equal(c.TOLLERANZA_PCT, 10);
  assert.equal(c.GLOSS_PERP_MAX, 40);
  assert.equal(c.GLOSS_PAR_MAX, 60);
  assert.equal(c.TOLLERANZA_BILANCIO, 1.02);
});

test("codiciFigli: caso A puro → nessun suffisso", () => {
  assert.deepEqual(c.codiciFigli("A5000", 1, 0, 0), ["A5000"]);
});
test("codiciFigli: caso B → /A /B", () => {
  assert.deepEqual(c.codiciFigli("A5000", 2, 0, 0), ["A5000/A", "A5000/B"]);
});
test("codiciFigli: caso C con un solo figlio → /A", () => {
  assert.deepEqual(c.codiciFigli("A5000", 1, 2450, 0), ["A5000/A"]);
});
test("codiciFigli: secondo giro dopo un caso C → continua da /B", () => {
  assert.deepEqual(c.codiciFigli("A5000", 1, 0, 1), ["A5000/B"]);
  assert.deepEqual(c.codiciFigli("A5000", 2, 0, 1), ["A5000/B", "A5000/C"]);
});
test("codiciFigli: zero figli è un errore; oltre 26 lettere è un errore", () => {
  assert.throws(() => c.codiciFigli("A5000", 0, 0, 0), /almeno un rotolo/);
  assert.throws(() => c.codiciFigli("A5000", 2, 0, 25), /Troppi rotoli/);
});

test("prossimoNProg: massimo mai usato + 1, stessa lettera, ignora i codici fuori formato", () => {
  const usati = ["A4999", "A5000", "COLLAUDO-0001", "B0012", "A5000/A"];
  assert.equal(c.prossimoNProg(usati, "A"), "A5001");
  assert.equal(c.prossimoNProg(usati, "B"), "B0013");
  assert.equal(c.prossimoNProg(usati, "C"), "C0001");
  assert.equal(c.prossimoNProg([], "A"), "A0001");
});

const RIF_SAT = { sgrassatura_temp_min: 52, sgrassatura_temp_max: 68, satina_temp_min: 50, satina_temp_max: 58,
  ossido_temp_min: 33, ossido_temp_max: 39, fissaggio_temp_min: 92, fissaggio_temp_max: 98,
  velocita_prevista: 2.3, ampere_previsti: 8400, micron_previsti: 5, tipo: "satinato" };
const RIF_NAT = { ...RIF_SAT, tipo: "naturale" };

test("fuoriRange: dentro i range → niente fuori", () => {
  const r = c.fuoriRange({ temp_sgrassatura: 60, temp_ossido: 37, velocita_m_min: 2.3, corrente_a: 8400,
    micron: 5, gloss_perpendicolare: 30, gloss_parallelo: 50 }, RIF_SAT);
  assert.equal(r.n_fuori, 0);
});
test("fuoriRange: temperatura sotto il minimo e sopra il massimo", () => {
  assert.equal(c.fuoriRange({ temp_ossido: 32 }, RIF_SAT).temp_ossido_fuori, true);
  assert.equal(c.fuoriRange({ temp_ossido: 40 }, RIF_SAT).temp_ossido_fuori, true);
  assert.equal(c.fuoriRange({ temp_ossido: 39 }, RIF_SAT).temp_ossido_fuori, false);
});
test("fuoriRange: valore null o range assente → mai fuori", () => {
  assert.equal(c.fuoriRange({ temp_ossido: null }, RIF_SAT).temp_ossido_fuori, false);
  assert.equal(c.fuoriRange({ temp_ossido: 99 }, { ...RIF_SAT, ossido_temp_min: null }).temp_ossido_fuori, false);
});
test("fuoriRange: ±10 % su velocità, ampere, micron", () => {
  assert.equal(c.fuoriRange({ velocita_m_min: 2.6 }, RIF_SAT).velocita_m_min_fuori, true);   // +13 %
  assert.equal(c.fuoriRange({ velocita_m_min: 2.5 }, RIF_SAT).velocita_m_min_fuori, false);  // +8,7 %
  assert.equal(c.fuoriRange({ corrente_a: 7500 }, RIF_SAT).corrente_a_fuori, true);          // −10,7 %
  assert.equal(c.fuoriRange({ micron: 4.4 }, RIF_SAT).micron_fuori, true);                  // −12 %
  assert.equal(c.fuoriRange({ micron: 5.5 }, RIF_SAT).micron_fuori, false);                 // +10 % esatto → dentro
});
test("fuoriRange: gloss con soglia ≥, solo per schede satinate", () => {
  assert.equal(c.fuoriRange({ gloss_perpendicolare: 40 }, RIF_SAT).gloss_perpendicolare_fuori, true);
  assert.equal(c.fuoriRange({ gloss_perpendicolare: 39.9 }, RIF_SAT).gloss_perpendicolare_fuori, false);
  assert.equal(c.fuoriRange({ gloss_parallelo: 60 }, RIF_SAT).gloss_parallelo_fuori, true);
  assert.equal(c.fuoriRange({ gloss_perpendicolare: 80, gloss_parallelo: 90 }, RIF_NAT).n_fuori, 0);
});

test("annotazioniDaEventi: solo fatti, ordinati per metri, formato italiano (esempio spec §3.7)", () => {
  const ev = [
    { tipo: "difetto", contametri: 2100, tipo_difetto_nome: "Graffi", tipo_difetto_causa: "rulli" },
    { tipo: "fermo", contametri: 900, causa_fermo: "guasto" },
    { tipo: "giunta_film", contametri: 1250 },
    { tipo: "primi_metri_non_ossidati", contametri: 15 },
    { tipo: "aggiunta", contametri: 1000, prodotto: "satina", litri: 200 },
    { tipo: "nota", contametri: 50, descrizione: "test" },
  ];
  assert.equal(c.annotazioniDaEventi(ev), "Primi 15 m non ossidati. Giunta film a 1.250 m. Graffi a 2.100 m.");
});
test("annotazioniDaEventi: senza eventi rilevanti → stringa vuota", () => {
  assert.equal(c.annotazioniDaEventi([{ tipo: "fermo", contametri: 10 }]), "");
});

test("residuoProposto: esempio spec, primo giro → 2.450", () => {
  assert.equal(c.residuoProposto(6500, 100, 600, 1500, 2), 2450);
});
test("bilancioChiusura: primo giro (caso C, tubolare null)", () => {
  const b = c.bilancioChiusura({ pesoConImballo: 6540, pesoImballo: 45, pesoTubolare: null,
    figli: [{ pesoLordo: 4090, pesoTubolare: 40 }], kgResidui: 2450 });
  assert.equal(b.kgFigli, 4050);
  assert.equal(b.disponibile, 6495);
  assert.equal(Number(b.tetto.toFixed(1)), 6624.9);
  assert.equal(b.ok, true);
  assert.equal(b.kgScarto, null);
});
test("bilancioChiusura: secondo giro (caso A con imballo 0, tubolare 60)", () => {
  const b = c.bilancioChiusura({ pesoConImballo: 2500, pesoImballo: 0, pesoTubolare: 60,
    figli: [{ pesoLordo: 2410, pesoTubolare: 40 }], kgResidui: 0 });
  assert.equal(b.kgFigli, 2370);
  assert.equal(b.disponibile, 2440);
  assert.equal(b.ok, true);
  assert.equal(b.kgScarto, 70);
});
test("bilancioChiusura: oltre il tetto → non ok, con l'eccesso in kg", () => {
  const b = c.bilancioChiusura({ pesoConImballo: 1000, pesoImballo: 0, pesoTubolare: 0,
    figli: [{ pesoLordo: 1100, pesoTubolare: 50 }], kgResidui: 0 });
  assert.equal(b.ok, false);
  assert.equal(b.eccesso, 30);   // 1050 − 1020
});
