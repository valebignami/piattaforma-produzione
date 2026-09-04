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

// Numeri INVENTATI, non i parametri veri delle vasche: il repo è pubblico e i valori di
// processo stanno solo nel Word e in sql/seed_schede.sql, che è gitignorato. Qui contano le
// regole (dentro/fuori, ±10 %, soglie del gloss), non i valori.
const RIF_SAT = { sgrassatura_temp_min: 20, sgrassatura_temp_max: 30, satina_temp_min: 40, satina_temp_max: 50,
  ossido_temp_min: 60, ossido_temp_max: 70, fissaggio_temp_min: 80, fissaggio_temp_max: 90,
  velocita_prevista: 10, ampere_previsti: 1000, micron_previsti: 100, tipo: "satinato" };
const RIF_NAT = { ...RIF_SAT, tipo: "naturale" };

test("fuoriRange: dentro i range → niente fuori", () => {
  const r = c.fuoriRange({ temp_sgrassatura: 25, temp_ossido: 65, velocita_m_min: 10, corrente_a: 1000,
    micron: 100, gloss_perpendicolare: 30, gloss_parallelo: 50 }, RIF_SAT);
  assert.equal(r.n_fuori, 0);
});
test("fuoriRange: temperatura sotto il minimo e sopra il massimo", () => {
  assert.equal(c.fuoriRange({ temp_ossido: 59 }, RIF_SAT).temp_ossido_fuori, true);
  assert.equal(c.fuoriRange({ temp_ossido: 71 }, RIF_SAT).temp_ossido_fuori, true);
  assert.equal(c.fuoriRange({ temp_ossido: 70 }, RIF_SAT).temp_ossido_fuori, false);
});
test("fuoriRange: valore null o range assente → mai fuori", () => {
  assert.equal(c.fuoriRange({ temp_ossido: null }, RIF_SAT).temp_ossido_fuori, false);
  assert.equal(c.fuoriRange({ temp_ossido: 999 }, { ...RIF_SAT, ossido_temp_min: null }).temp_ossido_fuori, false);
});
test("fuoriRange: ±10 % su velocità, ampere, micron", () => {
  assert.equal(c.fuoriRange({ velocita_m_min: 11.5 }, RIF_SAT).velocita_m_min_fuori, true);   // +15 %
  assert.equal(c.fuoriRange({ velocita_m_min: 10.9 }, RIF_SAT).velocita_m_min_fuori, false);  // +9 %
  assert.equal(c.fuoriRange({ corrente_a: 880 }, RIF_SAT).corrente_a_fuori, true);            // −12 %
  assert.equal(c.fuoriRange({ micron: 88 }, RIF_SAT).micron_fuori, true);                    // −12 %
  assert.equal(c.fuoriRange({ micron: 110 }, RIF_SAT).micron_fuori, false);                  // +10 % esatto → dentro
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

// ---------- Fase 1 ----------

test("formattaNumero: separatore delle migliaia sempre, assente → trattino", () => {
  assert.equal(c.formattaNumero(2450), "2.450");
  assert.equal(c.formattaNumero(1250), "1.250");     // sotto i 10.000 l'italiano non separerebbe
  assert.equal(c.formattaNumero(8.1, 1), "8,1");
  assert.equal(c.formattaNumero(0), "0");            // zero è un valore, non un vuoto
  assert.equal(c.formattaNumero(null), "—");
  assert.equal(c.formattaNumero(undefined), "—");
  assert.equal(c.formattaNumero(""), "—");
});

test("lunediDellaSettimana: sempre il lunedì, dai componenti locali", () => {
  assert.equal(c.lunediDellaSettimana("2026-09-07"), "2026-09-07");   // lunedì → se stesso
  assert.equal(c.lunediDellaSettimana("2026-09-09"), "2026-09-07");   // mercoledì
  assert.equal(c.lunediDellaSettimana("2026-09-13"), "2026-09-07");   // domenica: settimana iniziata lunedì 7
  assert.equal(c.lunediDellaSettimana("2026-09-01"), "2026-08-31");   // martedì, il lunedì è il mese prima
  assert.equal(c.lunediDellaSettimana("2027-01-01"), "2026-12-28");   // venerdì, il lunedì è l'anno prima
  assert.equal(c.lunediDellaSettimana(new Date(2026, 8, 9)), "2026-09-07");   // accetta anche una Date
});

test("lunediDellaSettimana: rifiuta una data che non è AAAA-MM-GG", () => {
  assert.throws(() => c.lunediDellaSettimana("07/09/2026"), /Data non valida/);
});

test("settimanaSpostata: avanti e indietro, attraverso mese, anno e ora legale", () => {
  assert.equal(c.settimanaSpostata("2026-09-07", 1), "2026-09-14");
  assert.equal(c.settimanaSpostata("2026-09-07", -1), "2026-08-31");
  assert.equal(c.settimanaSpostata("2026-12-28", 1), "2027-01-04");
  assert.equal(c.settimanaSpostata("2026-10-19", 2), "2026-11-02");   // in mezzo il ritorno all'ora solare
  assert.equal(c.settimanaSpostata("2026-03-23", 2), "2026-04-06");   // in mezzo il passaggio all'ora legale
  assert.equal(c.settimanaSpostata("2026-09-07", 0), "2026-09-07");
});

const SCHEDE = [
  { lavorazione: "OX Naturale 10 my", micron: 10, spessore_min: 1, spessore_max: 3, larghezza_min: 1000, larghezza_max: 1500 },
  { lavorazione: "OX Naturale 5 my",  micron: 5,  spessore_min: 2, spessore_max: 2, larghezza_min: 1500, larghezza_max: 1500 },
  { lavorazione: "OX Satinato 15 my", micron: 15, spessore_min: 0.4, spessore_max: 0.9, larghezza_min: 900, larghezza_max: 1100 },
];

test("schedeCompatibili: dentro i range, bordi compresi, ordinate per micron", () => {
  const r = c.schedeCompatibili(SCHEDE, 2, 1500);
  assert.deepEqual(r.map((s) => s.micron), [5, 10]);          // la satinata è fuori per spessore
});

test("schedeCompatibili: fuori per spessore o per larghezza → esclusa", () => {
  assert.equal(c.schedeCompatibili(SCHEDE, 5, 1500).length, 0);        // spessore oltre ogni max
  assert.equal(c.schedeCompatibili(SCHEDE, 2, 1600).length, 0);        // larghezza oltre ogni max
  assert.equal(c.schedeCompatibili(SCHEDE, 0.5, 1000).length, 1);      // solo la satinata
  assert.equal(c.schedeCompatibili([], 2, 1500).length, 0);
});

test("schedeCompatibili: non tocca l'elenco di partenza", () => {
  const copia = [...SCHEDE];
  c.schedeCompatibili(SCHEDE, 2, 1500);
  assert.deepEqual(SCHEDE, copia);
});

test("valoriUsati: distinti, senza vuoti, in ordine italiano", () => {
  const righe = [{ cliente: "Zeta" }, { cliente: "alfa" }, { cliente: "Zeta" },
                 { cliente: null }, { cliente: "" }, { cliente: "   " }, { cliente: " Beta " }];
  assert.deepEqual(c.valoriUsati(righe, "cliente"), ["alfa", "Beta", "Zeta"]);
  assert.deepEqual(c.valoriUsati([], "cliente"), []);
  assert.deepEqual(c.valoriUsati([{ altro: "x" }], "cliente"), []);
});

test("dataBreveItaliana: una data resta il suo giorno, un timestamp passa al fuso locale", () => {
  assert.equal(c.dataBreveItaliana("2026-09-07"), "07/09/2026");
  assert.equal(c.dataBreveItaliana(null), "—");
  assert.equal(c.dataBreveItaliana(""), "—");
  assert.equal(c.dataBreveItaliana("non una data"), "—");
  // Mezzogiorno UTC è lo stesso giorno in ogni fuso ragionevole: il test non dipende dalla macchina.
  assert.equal(c.dataBreveItaliana("2026-09-07T12:00:00+00:00"), "07/09/2026");
});

test("dataLungaItaliana: mese per esteso", () => {
  assert.equal(c.dataLungaItaliana("2026-09-07"), "7 settembre 2026");
  assert.equal(c.dataLungaItaliana("2026-12-28"), "28 dicembre 2026");
  assert.equal(c.dataLungaItaliana(null), "—");
});

// ---------- Fase 2 ----------

test("minutiDa: minuti interi, null quando non si sa", () => {
  const adesso = new Date(2026, 8, 4, 10, 0, 0);
  assert.equal(c.minutiDa(new Date(2026, 8, 4, 10, 0, 0), adesso), 0);
  assert.equal(c.minutiDa(new Date(2026, 8, 4, 9, 15, 0), adesso), 45);
  assert.equal(c.minutiDa(new Date(2026, 8, 4, 9, 40, 0), adesso), 20);   // soglia: "più di" lo decide chi chiama
  assert.equal(c.minutiDa(new Date(2026, 8, 4, 9, 39, 30), adesso), 20);  // 20,5 min → 20
  assert.equal(c.minutiDa(null, adesso), null);
  assert.equal(c.minutiDa("", adesso), null);
  assert.equal(c.minutiDa("non una data", adesso), null);
  assert.equal(c.minutiDa("2026-09-04T08:00:00+00:00", "non una data"), null);
});

test("oraItaliana: ora locale, non UTC", () => {
  assert.equal(c.oraItaliana(new Date(2026, 8, 4, 8, 12, 0)), "08:12");
  assert.equal(c.oraItaliana(new Date(2026, 8, 3, 23, 30, 0)), "23:30");   // non diventa il giorno dopo
  assert.equal(c.oraItaliana(null), "—");
  assert.equal(c.oraItaliana(""), "—");
  assert.equal(c.oraItaliana("non una data"), "—");
});

test("etichettaScheda: nome, micron e misure per distinguere le omonime", () => {
  assert.equal(
    c.etichettaScheda({ lavorazione: "OX Naturale 3 micron", micron: 3, spessore_min: 0.3, spessore_max: 0.3, larghezza_min: 850, larghezza_max: 850 }),
    "OX Naturale 3 micron · 3 my · 0,3 mm · 850 mm");
  assert.equal(
    c.etichettaScheda({ lavorazione: "OX Satinato Nat 3 micron", micron: 3, spessore_min: 0.5, spessore_max: 2, larghezza_min: 1460, larghezza_max: 1500 }),
    "OX Satinato Nat 3 micron · 3 my · da 0,5 a 2 mm · da 1.460 a 1.500 mm");
  assert.equal(
    c.etichettaScheda({ lavorazione: "OX Satinato Nat 8-10 micron", micron: 9 }),
    "OX Satinato Nat 8-10 micron · 9 my");
  assert.equal(
    c.etichettaScheda({ lavorazione: "prova", micron: 9.5 }), "prova · 9,5 my");
  assert.equal(c.etichettaScheda(null), "—");
  assert.equal(c.etichettaScheda({ micron: 3 }), "scheda senza nome · 3 my");
});
