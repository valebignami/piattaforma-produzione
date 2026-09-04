// ============================================================
// Piattaforma Produzione Overland — comune.js
// Costanti e FUNZIONI PURE. Nessun import, nessun DOM, nessuna rete:
// questo file gira identico nel browser e nei test Node.
// Le tre regole duplicate col DB (fuoriRange, codiciFigli, bilancioChiusura)
// sono dichiarate nello spec §2.6/§3.7; il test di coerenza JS↔DB arriva con la
// Fase 3, fino ad allora test-comune.mjs e test_regole.sql usano gli stessi numeri.
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
