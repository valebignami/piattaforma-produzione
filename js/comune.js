// ============================================================
// Piattaforma Produzione Overland — comune.js
// Costanti e FUNZIONI PURE. Nessun import, nessun DOM, nessuna rete:
// questo file gira identico nel browser e nei test Node.
// Le tre regole duplicate col DB (fuoriRange, codiciFigli, bilancioChiusura)
// sono dichiarate nello spec §2.6/§3.7 e dalla Fase 3 sono coperte dal test di
// coerenza: sql/test_coerenza.sql e tests/test-coerenza.mjs leggono gli stessi
// numeri dallo stesso file, così i due lati non possono divergere in silenzio.
// ============================================================

export const SOGLIA_CONTROLLO_MIN = 20;   // minuti senza controllo → banner colorato (manuale: ogni 20')
export const SOGLIA_BOLLA_PCT = 3;        // differenza netto/bolla oltre cui avvisare
export const TOLLERANZA_PCT = 10;         // ±10 % su velocità, ampere, micron
export const GLOSS_PERP_MAX = 40;         // manuale: perpendicolare "minore di 40" → fuori se ≥ 40
export const GLOSS_PAR_MAX = 60;          // manuale: parallelo "minore di 60" → fuori se ≥ 60
export const TOLLERANZA_BILANCIO = 1.02;  // Σ figli + residuo ≤ disponibile × 1,02
export const PESO_SPECIFICO_AL = 2.7;     // kg/dm³ — documentativa: la formula sotto usa 27/10000 per restare esatta

// kg al metro = larghezza (mm) × spessore (mm) × 2,7 / 1000. Scritta come ×27/10000 perché
// in virgola mobile 1500·2·2.7/1000 dà 8.100000000000001, mentre 1500·2·27/10000 dà 8.1.
export function kgAlMetro(larghezzaMm, spessoreMm) {
  return (larghezzaMm * spessoreMm * 27) / 10000;
}

export function metriDaKg(kg, larghezzaMm, spessoreMm) {
  return Math.round(kg / kgAlMetro(larghezzaMm, spessoreMm));
}

export function kgDaMetri(metri, larghezzaMm, spessoreMm) {
  return metri * kgAlMetro(larghezzaMm, spessoreMm);
}

// Regola dei codici (spec §2.7). Duplicata in chiudi_lavorazione: la verità è la RPC.
export function codiciFigli(nProg, nFigli, kgResidui, nFigliEsistenti = 0) {
  if (!Number.isInteger(nFigli) || nFigli < 1) throw new Error("Serve almeno un rotolo finito");
  if (nFigliEsistenti + nFigli > 26) throw new Error("Troppi rotoli finiti da questo grezzo");
  if (nFigli === 1 && kgResidui === 0 && nFigliEsistenti === 0) return [nProg];
  return Array.from({ length: nFigli }, (_, i) =>
    `${nProg}/${String.fromCharCode(65 + nFigliEsistenti + i)}`);
}

// Proposta del prossimo numero progressivo (spec §2.2): massimo mai usato con la
// stessa lettera + 1. Scostamento dichiarato da procedure §3.3.
export function prossimoNProg(codici, lettera = "A") {
  if (!/^[A-Z]$/.test(lettera)) throw new Error("La lettera deve essere una maiuscola A-Z");
  const re = new RegExp(`^${lettera}(\\d+)$`);
  let max = 0, cifre = 4;
  for (const cod of codici) {
    const m = re.exec(cod);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    if (n > max) { max = n; cifre = Math.max(4, m[1].length); }
  }
  return lettera + String(max + 1).padStart(cifre, "0");
}

// Scostamenti (spec §2.6). Stessa regola della vista controlli_scostamenti: qui serve
// solo per colorare subito il campo sul tablet; il giudizio vero lo dà la vista.
const fuoriMinMax = (v, min, max) =>
  v != null && min != null && max != null && (v < min || v > max);
const fuoriPct = (v, rif) =>
  v != null && rif != null && rif !== 0 && Math.abs(v - rif) / rif > TOLLERANZA_PCT / 100;

export function fuoriRange(ctl, rif) {
  const satinato = rif.tipo === "satinato";
  const f = {
    temp_sgrassatura_fuori: fuoriMinMax(ctl.temp_sgrassatura, rif.sgrassatura_temp_min, rif.sgrassatura_temp_max),
    temp_satina_fuori:      fuoriMinMax(ctl.temp_satina,      rif.satina_temp_min,      rif.satina_temp_max),
    temp_ossido_fuori:      fuoriMinMax(ctl.temp_ossido,      rif.ossido_temp_min,      rif.ossido_temp_max),
    temp_fissaggio_fuori:   fuoriMinMax(ctl.temp_fissaggio,   rif.fissaggio_temp_min,   rif.fissaggio_temp_max),
    velocita_m_min_fuori:   fuoriPct(ctl.velocita_m_min, rif.velocita_prevista),
    corrente_a_fuori:       fuoriPct(ctl.corrente_a,     rif.ampere_previsti),
    micron_fuori:           fuoriPct(ctl.micron,         rif.micron_previsti),
    gloss_perpendicolare_fuori: satinato && ctl.gloss_perpendicolare != null && ctl.gloss_perpendicolare >= GLOSS_PERP_MAX,
    gloss_parallelo_fuori:      satinato && ctl.gloss_parallelo != null && ctl.gloss_parallelo >= GLOSS_PAR_MAX,
  };
  f.n_fuori = Object.values(f).filter(Boolean).length;
  return f;
}

// Numeri all'italiana. useGrouping "always": l'italiano di default non separa le migliaia sotto
// i 10.000 (1250 → "1250"). Un valore assente si legge "—", non "0".
export function formattaNumero(n, decimali = 0) {
  if (n == null || n === "") return "—";
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: decimali, maximumFractionDigits: decimali, useGrouping: "always",
  }).format(x);
}

// Precompilazione delle annotazioni per il cliente (spec §3.7): solo fatti, mai la diagnosi.
// Qui il "?? 0" resta: un contametri mancante si legge "0 m", non "— m".
const fmtM = (n) => formattaNumero(n ?? 0);

export function annotazioniDaEventi(eventi) {
  const frasi = [...eventi]
    .filter((e) => ["giunta_film", "taglio_film", "primi_metri_non_ossidati", "difetto"].includes(e.tipo))
    .sort((a, b) => (a.contametri ?? 0) - (b.contametri ?? 0))
    .map((e) => {
      switch (e.tipo) {
        case "giunta_film": return `Giunta film a ${fmtM(e.contametri)} m.`;
        case "taglio_film": return `Taglio film a ${fmtM(e.contametri)} m.`;
        case "primi_metri_non_ossidati": return `Primi ${fmtM(e.contametri)} m non ossidati.`;
        case "difetto": return `${e.tipo_difetto_nome ?? "Difetto"} a ${fmtM(e.contametri)} m.`;
      }
    });
  return frasi.join(" ");
}

// Residuo del caso C (spec §2.7): in kg, senza passare dai metri arrotondati.
export function residuoProposto(kgDisponibiliStimati, contametriInizio, contametriFine, larghezzaMm, spessoreMm) {
  const metriLavorati = contametriFine - contametriInizio;
  return Math.round(kgDisponibiliStimati - metriLavorati * kgAlMetro(larghezzaMm, spessoreMm));
}

// Bilancio di chiusura (spec §2.7). Duplicato nella RPC chiudi_lavorazione: la verità è la RPC.
export function bilancioChiusura({ pesoConImballo, pesoImballo, pesoTubolare, figli, kgResidui }) {
  const kgFigli = figli.reduce((s, f) => s + (f.pesoLordo - (f.pesoTubolare ?? 0)), 0);
  const disponibile = pesoConImballo - pesoImballo - (pesoTubolare ?? 0);
  const tetto = disponibile * TOLLERANZA_BILANCIO;
  const totale = kgFigli + (kgResidui ?? 0);
  const ok = totale <= tetto;
  return {
    kgFigli, disponibile, tetto, ok,
    eccesso: ok ? 0 : Math.round(totale - tetto),
    kgScarto: pesoTubolare == null ? null : disponibile - kgFigli - (kgResidui ?? 0),
  };
}

// ============================================================
// Fase 1 — magazzino e pianificazione (ufficio)
// ============================================================

// Le settimane viaggiano SEMPRE come stringhe "AAAA-MM-GG" costruite dai componenti locali:
// toISOString() su una data a mezzanotte locale restituisce il giorno prima a est di Greenwich,
// e il programma finirebbe nella settimana sbagliata.
function aIso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Accetta una Date o una stringa "AAAA-MM-GG" e restituisce la mezzanotte LOCALE di quel giorno.
// new Date("2026-09-09") sarebbe mezzanotte UTC: a ovest di Greenwich cadrebbe il giorno prima.
function aData(v) {
  if (v instanceof Date) return new Date(v.getFullYear(), v.getMonth(), v.getDate());
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v));
  if (!m) throw new Error("Data non valida: attesa AAAA-MM-GG");
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

// Il lunedì della settimana di quella data (spec §2.3: la colonna settimana è il lunedì).
// La domenica appartiene alla settimana che è iniziata il lunedì precedente.
export function lunediDellaSettimana(data) {
  const d = aData(data);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));   // domenica (0) → 6, lunedì (1) → 0
  return aIso(d);
}

// Sposta un lunedì di ±n settimane. setDate lavora sui componenti locali: il cambio d'ora legale
// non sposta il giorno.
export function settimanaSpostata(isoLunedi, settimane) {
  const d = aData(isoLunedi);
  d.setDate(d.getDate() + settimane * 7);
  return aIso(d);
}

// Schede compatibili con le dimensioni del grezzo (spec §3.4, §4.2), ordinate per micron.
// Filtro di interfaccia, non una regola del database: il minimo e il massimo sono compresi.
export function schedeCompatibili(schede, spessoreMm, larghezzaMm) {
  return schede
    .filter((s) =>
      spessoreMm >= s.spessore_min && spessoreMm <= s.spessore_max &&
      larghezzaMm >= s.larghezza_min && larghezzaMm <= s.larghezza_max)
    .sort((a, b) => a.micron - b.micron);
}

// Valori già usati in una colonna, per l'autocompletamento di cliente e fornitore
// (spec §2.2: nessuna anagrafica). Distinti, ripuliti dagli spazi, in ordine alfabetico italiano.
export function valoriUsati(righe, campo) {
  const trovati = new Set();
  for (const r of righe) {
    const s = (r?.[campo] ?? "").toString().trim();
    if (s) trovati.add(s);
  }
  return [...trovati].sort((a, b) => a.localeCompare(b, "it"));
}

// Date da mostrare. Una colonna "date" arriva come "AAAA-MM-GG" e si legge com'è; un
// "timestamptz" arriva con l'ora e va convertito al fuso locale: tagliarne i primi dieci
// caratteri darebbe la data UTC, cioè il giorno prima per tutto ciò che accade dopo le 22.
export function dataBreveItaliana(valore) {
  if (valore == null || valore === "") return "—";
  const s = String(valore);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? aData(s) : new Date(s);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("it-IT");
}

export function dataLungaItaliana(valore) {
  if (valore == null || valore === "") return "—";
  const s = String(valore);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? aData(s) : new Date(s);
  return Number.isNaN(d.getTime()) ? "—"
    : d.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
}

// ============================================================
// Fase 2 — avvio da tablet
// ============================================================

// Minuti interi trascorsi da un istante. Serve al banner del tablet ("ultimo controllo 45 min
// fa") e al confronto con SOGLIA_CONTROLLO_MIN. `adesso` è un parametro perché la funzione
// resti pura e verificabile. Un istante mancante o non valido dà null, non 0: "non lo so" e
// "adesso" sono cose diverse.
export function minutiDa(quando, adesso = new Date()) {
  if (quando == null || quando === "") return null;
  const d = quando instanceof Date ? quando : new Date(String(quando));
  if (Number.isNaN(d.getTime())) return null;
  const ora = adesso instanceof Date ? adesso : new Date(String(adesso));
  if (Number.isNaN(ora.getTime())) return null;
  return Math.floor((ora.getTime() - d.getTime()) / 60000);
}

// L'ora di un timestamptz nel fuso LOCALE ("08:12"). Come dataBreveItaliana: tagliare i
// caratteri della stringa darebbe l'ora UTC, cioè due ore prima in estate.
export function oraItaliana(valore) {
  if (valore == null || valore === "") return "—";
  const d = valore instanceof Date ? valore : new Date(String(valore));
  return Number.isNaN(d.getTime()) ? "—"
    : d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

// Una misura si scrive con i decimali che ha e non uno di più: 0,3 resta "0,3" e 850 resta
// "850". formattaNumero non serve qui, perché fissa il numero di decimali.
const misuraNumero = (n) =>
  new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2, useGrouping: "always" }).format(Number(n));

// "da 0,5 a 2 mm" quando il minimo e il massimo sono diversi, "0,5 mm" quando coincidono.
function misura(min, max, unita) {
  if (min == null && max == null) return null;
  if (min == null || max == null || Number(min) === Number(max)) return `${misuraNumero(min ?? max)} ${unita}`;
  return `da ${misuraNumero(min)} a ${misuraNumero(max)} ${unita}`;
}

// Etichetta di una scheda di lavorazione. Serve perché dodici schede si chiamano tutte allo
// stesso modo e si distinguono solo per le misure a cui si applicano (spec §2.1, §3.4).
export function etichettaScheda(scheda) {
  if (!scheda) return "—";
  const pezzi = [scheda.lavorazione ?? "scheda senza nome"];
  if (scheda.micron != null) pezzi.push(`${misuraNumero(scheda.micron)} my`);
  const sp = misura(scheda.spessore_min, scheda.spessore_max, "mm");
  const la = misura(scheda.larghezza_min, scheda.larghezza_max, "mm");
  if (sp) pezzi.push(sp);
  if (la) pezzi.push(la);
  return pezzi.join(" · ");
}

// ============================================================
// Fase 3 — controlli ed eventi
// ============================================================

// Metri di nastro da scartare dopo un fermo (spec §2.5): 100 è la lunghezza dell'intera linea
// secondo il manuale, quindi un valore PRUDENZIALE. Da tarare dopo il pilota.
export const METRI_SCARTO_RIPARTENZA = 100;

// Codice → etichetta italiana. Le chiavi sono quelle dei check del database: il test di coerenza
// (tests/test-coerenza.mjs) verifica che siano esattamente quelle, né una in più né una in meno.
export const MOMENTI = {
  inizio: "Inizio", meta: "Metà", fine: "Fine", periodico: "Periodico",
};
export const CAUSE_FERMO = {
  guasto: "Guasto", bagno: "Bagno", cambio_rotolo: "Cambio rotolo", esterno: "Esterno", altro: "Altro",
};
export const TIPI_EVENTO = {
  difetto: "Difetto", fermo: "Fermo", ripartenza: "Ripartenza", aggiunta: "Aggiunta",
  giunta_film: "Giunta film", taglio_film: "Taglio film",
  primi_metri_non_ossidati: "Primi metri non ossidati", nota: "Nota",
};
// I tre prodotti dello spec §3.6. Non sono i prodotti delle vasche: quelli stanno solo nel
// database e nel Word delle schede.
export const PRODOTTI_AGGIUNTA = ["satina", "ammoniaca", "altro"];

// I campi di un controllo, in ordine e per zona (spec §3.5). Una fonte sola per il tablet
// (schermata del controllo, correzione del capoturno) e per Live (ultimo controllo, nastro):
// `fuori` è il nome della colonna booleana corrispondente nella vista controlli_scostamenti e
// nel risultato di fuoriRange. I campi senza `fuori` non hanno riferimento (spec §2.6).
export const CAMPI_CONTROLLO = [
  { campo: "contametri",           etichetta: "Contametri",  unita: "m",     zona: "Linea" },
  { campo: "velocita_m_min",       etichetta: "Velocità",    unita: "m/min", zona: "Linea",   fuori: "velocita_m_min_fuori" },
  { campo: "corrente_a",           etichetta: "Corrente",    unita: "A",     zona: "Linea",   fuori: "corrente_a_fuori" },
  { campo: "tensione_v",           etichetta: "Tensione",    unita: "V",     zona: "Linea" },
  { campo: "temp_sgrassatura",     etichetta: "Sgrassatura", unita: "°C",    zona: "Vasche",  fuori: "temp_sgrassatura_fuori" },
  { campo: "temp_satina",          etichetta: "Satinatura",  unita: "°C",    zona: "Vasche",  fuori: "temp_satina_fuori" },
  { campo: "temp_ossido",          etichetta: "Ossido",      unita: "°C",    zona: "Vasche",  fuori: "temp_ossido_fuori" },
  { campo: "temp_fissaggio",       etichetta: "Fissaggio",   unita: "°C",    zona: "Vasche",  fuori: "temp_fissaggio_fuori" },
  { campo: "micron",               etichetta: "Micron",      unita: "my",    zona: "Qualità", fuori: "micron_fuori" },
  { campo: "gloss_perpendicolare", etichetta: "Gloss ⊥",     unita: "",      zona: "Qualità", fuori: "gloss_perpendicolare_fuori" },
  { campo: "gloss_parallelo",      etichetta: "Gloss ∥",     unita: "",      zona: "Qualità", fuori: "gloss_parallelo_fuori" },
];

// Momento proposto per il prossimo controllo (spec §3.5): il primo è l'inizio, gli altri sono
// periodici. "Metà" e "fine" restano a un tocco, ma non si propongono: le sa solo l'operatore.
export function momentoProposto(nControlli) {
  return nControlli > 0 ? "periodico" : "inizio";
}

// Fermo aperto = evento `fermo` che nessuna `ripartenza` punta (spec §2.5, unica definizione).
// È una LETTURA, non una regola: il giudice resta il database, che respinge la chiusura e
// l'annullo con "C'è un fermo aperto". Se per un errore ce ne fosse più d'uno, vince il più
// recente: è quello che l'operatore ha davanti.
export function fermoAperto(eventi) {
  const chiusi = new Set(eventi.filter((e) => e.tipo === "ripartenza" && e.fermo_id).map((e) => e.fermo_id));
  const aperti = eventi.filter((e) => e.tipo === "fermo" && !chiusi.has(e.id));
  if (aperti.length === 0) return null;
  return aperti.reduce((a, b) => (new Date(b.avvenuto_il) > new Date(a.avvenuto_il) ? b : a));
}

// Una riga in italiano per il nastro cronologico di Live e per il banner del tablet.
export function descrizioneEvento(ev) {
  const a = ev.contametri != null ? ` a ${formattaNumero(ev.contametri)} m` : "";
  const coda = ev.descrizione ? ` — ${ev.descrizione}` : "";
  switch (ev.tipo) {
    case "difetto":
      return `Difetto: ${ev.tipo_difetto_nome ?? "non indicato"}${a}${coda}`;
    case "fermo":
      return `Fermo · ${CAUSE_FERMO[ev.causa_fermo] ?? "causa non indicata"} · `
        + (ev.durata_min != null ? `${formattaNumero(ev.durata_min)} min` : "ancora aperto");
    case "ripartenza":
      return `Ripartenza${ev.metri_scarto != null ? ` · ${formattaNumero(ev.metri_scarto)} m di scarto` : ""}`;
    case "aggiunta":
      return `Aggiunta: ${ev.prodotto ?? "prodotto non indicato"}`
        + (ev.litri != null ? ` · ${formattaNumero(ev.litri, 1)} l` : "");
    case "nota":
      return `Nota${coda || ": —"}`;
    default:
      return `${TIPI_EVENTO[ev.tipo] ?? "Evento"}${a}${coda}`;
  }
}

// Le etichette dei campi che una riga di controlli_scostamenti (o un risultato di fuoriRange)
// segna fuori riferimento. Il giudizio è della vista: qui si traduce soltanto.
export function elencoFuori(riga) {
  if (!riga) return [];
  return CAMPI_CONTROLLO.filter((c) => c.fuori && riga[c.fuori]).map((c) => c.etichetta);
}

// La ragione, in parole, per cui un campo di un controllo è fuori riferimento. NON decide
// niente: il fatto lo stabilisce fuoriRange (e prima ancora la vista); qui si sceglie soltanto
// come dirlo all'operatore. `campo` è una voce di CAMPI_CONTROLLO.
export function ragioneFuori(campo, valore, rif) {
  if (campo.campo.startsWith("temp_")) {
    const vasca = campo.campo.replace(/^temp_/, "");
    const min = rif[`${vasca}_temp_min`];
    const max = rif[`${vasca}_temp_max`];
    if (min != null && valore < min) return `sotto il minimo (${formattaNumero(min, 1)})`;
    if (max != null && valore > max) return `sopra il massimo (${formattaNumero(max, 1)})`;
    return "";
  }
  if (campo.campo === "gloss_perpendicolare") return `pari o oltre ${GLOSS_PERP_MAX}`;
  if (campo.campo === "gloss_parallelo") return `pari o oltre ${GLOSS_PAR_MAX}`;
  const previsto = {
    velocita_m_min: rif.velocita_prevista,
    corrente_a: rif.ampere_previsti,
    micron: rif.micron_previsti,
  }[campo.campo];
  if (previsto == null) return "";
  return `oltre il ±${TOLLERANZA_PCT} % del previsto (${formattaNumero(previsto, 1)})`;
}

// La mezzanotte LOCALE di un giorno, per filtrare "quello che è successo oggi". Un confine
// costruito con toISOString() o con slice(0,10) sarebbe la mezzanotte UTC, cioè le 2 del mattino
// in estate: le prime ore del turno finirebbero nel giorno prima.
export function inizioGiornata(data = new Date()) {
  const d = data instanceof Date ? data : new Date(String(data));
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// Un'ora scritta a mano ("23:50") diventa un istante, costruito sui componenti LOCALI. Se cade
// nel futuro si intende quella di ieri: il fermo delle 23:50 registrato alle 00:05 è di ieri, e
// un fermo nel futuro farebbe poi respingere la ripartenza dal trigger.
export function istanteDaOra(hhmm, adesso = new Date()) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm ?? "").trim());
  if (!m) return null;
  const ore = Number(m[1]), minuti = Number(m[2]);
  if (ore > 23 || minuti > 59) return null;
  const d = new Date(adesso.getFullYear(), adesso.getMonth(), adesso.getDate(), ore, minuti, 0, 0);
  if (d.getTime() > adesso.getTime()) d.setDate(d.getDate() - 1);
  return d;
}
