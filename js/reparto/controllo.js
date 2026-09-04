// ============================================================
// controllo.js — "Controllo", una schermata sola (spec §3.5, PIANO Fase 3 voce 1).
// Serve a due cose: registrare un controllo nuovo e correggerne uno già salvato (il capoturno,
// spec §3.8). È la stessa schermata perché sono gli stessi campi: cambia solo il tasto.
// Il colore è un AVVISO calcolato con fuoriRange di comune.js: il giudizio vero lo dà la vista
// controlli_scostamenti, e il test di coerenza verifica che dicano la stessa cosa.
// ============================================================
import { byId, sb, salva } from "../db.js";
import {
  CAMPI_CONTROLLO, MOMENTI,
  fuoriRange, ragioneFuori, momentoProposto, etichettaScheda, formattaNumero,
} from "../comune.js";

let contesto = null;
let lav = null;              // la lavorazione su cui si registra
let scheda = null;           // la scheda viva: i range delle temperature vengono da qui
let precedente = null;       // il controllo precedente, per i placeholder
let momento = "periodico";
let richiesta = null;        // impostato da "Ultimi controlli" appena prima di aprire la schermata
let daCorreggere = null;     // il controllo da correggere, oppure null (controllo nuovo)
let avviato = false;
const campi = new Map();     // nome della colonna → <input>
const ragioni = new Map();   // nome della colonna → <p> con la ragione in parole

function esito(testo, classe = "") {
  byId("rep-ctl-esito").textContent = testo;
  byId("rep-ctl-esito").className = "esito " + classe;
}

const rete = (ctx) => ({ onStato: (s) => ctx.stato(s) });

// Il capoturno arriva qui da "Ultimi controlli": la schermata si apre in modo correzione.
// La richiesta si consuma all'apertura, così arrivando dall'hub la schermata è sempre nuova.
export function preparaCorrezione(controllo) {
  richiesta = controllo;
}

export async function mostra(ctx) {
  contesto = ctx;
  daCorreggere = richiesta;
  richiesta = null;
  collega();
  costruisciCampi();
  esito("Carico…");
  byId("rep-ctl-salva").disabled = true;

  const aperta = await sb.from("lavorazioni").select("*")
    .eq("stato", "aperta").eq("linea", "1500").maybeSingle();
  if (aperta.error) return esito("Non riesco a leggere la linea. Riprova.", "errore");
  if (!aperta.data) return esito("Nessuna lavorazione aperta sulla linea.", "errore");
  lav = aperta.data;

  // In correzione il "precedente" è quello che viene prima PER ORA del controllo corretto, non
  // il più recente del rotolo: correggendo un controllo vecchio, i suggerimenti in grigio
  // arriverebbero da uno fatto dopo.
  const prima = sb.from("controlli").select("*").eq("lavorazione_id", lav.id)
    .order("rilevato_il", { ascending: false }).limit(1);
  const [sch, quanti, ultimi] = await Promise.all([
    sb.from("schede_lavorazione").select("*").eq("id", lav.scheda_lavorazione_id).maybeSingle(),
    sb.from("controlli").select("id", { count: "exact", head: true }).eq("lavorazione_id", lav.id),
    daCorreggere ? prima.lt("rilevato_il", daCorreggere.rilevato_il) : prima,
  ]);
  if (sch.error || quanti.error || ultimi.error) {
    return esito("Non riesco a leggere la scheda o i controlli. Riprova.", "errore");
  }
  scheda = sch.data;
  precedente = ultimi.data[0] ?? null;

  byId("rep-ctl-riepilogo").textContent = daCorreggere
    ? `Correzione di un controllo già salvato · ${etichettaScheda(scheda)}`
    : etichettaScheda(scheda);
  byId("rep-ctl-salva").textContent = daCorreggere ? "Salva la correzione" : "Salva il controllo";
  byId("rep-ctl-salva").disabled = false;

  momento = daCorreggere ? daCorreggere.momento : momentoProposto(quanti.count ?? 0);
  disegnaMomenti();
  riempiCampi();
  aggiornaColori();
  esito("");
}

// ---------- I campi, disegnati una volta sola da CAMPI_CONTROLLO ----------
function costruisciCampi() {
  // Alla seconda visita i campi ci sono già: si ripuliscono i rossi della volta prima, che
  // altrimenti resterebbero a video per tutto il caricamento.
  if (campi.size > 0) {
    for (const [nome, input] of campi) { input.className = ""; ragioni.get(nome).hidden = true; }
    return;
  }
  const contenitore = byId("rep-ctl-campi");
  contenitore.textContent = "";
  let zona = null;
  for (const c of CAMPI_CONTROLLO) {
    if (c.zona !== zona) {
      zona = c.zona;
      const h = document.createElement("h2");
      h.textContent = zona;
      contenitore.append(h);
    }
    const etichetta = document.createElement("label");
    etichetta.htmlFor = `rep-ctl-${c.campo}`;
    etichetta.textContent = c.unita ? `${c.etichetta} (${c.unita})` : c.etichetta;
    const input = document.createElement("input");
    input.id = `rep-ctl-${c.campo}`;
    input.type = "number";
    input.inputMode = "decimal";
    input.step = "any";
    input.addEventListener("input", aggiornaColori);
    const ragione = document.createElement("p");
    ragione.className = "ragione";
    ragione.hidden = true;
    contenitore.append(etichetta, input, ragione);
    campi.set(c.campo, input);
    ragioni.set(c.campo, ragione);
  }
}

function disegnaMomenti() {
  const contenitore = byId("rep-ctl-momenti");
  contenitore.textContent = "";
  for (const [codice, testo] of Object.entries(MOMENTI)) {
    const tasto = document.createElement("button");
    tasto.type = "button";
    tasto.textContent = testo;
    if (codice === momento) tasto.classList.add("scelto");
    tasto.addEventListener("click", () => { momento = codice; disegnaMomenti(); });
    contenitore.append(tasto);
  }
}

function riempiCampi() {
  for (const c of CAMPI_CONTROLLO) {
    const input = campi.get(c.campo);
    // Il placeholder è il valore del controllo precedente: si vede, ma non è un valore.
    // Se l'operatore non scrive, si salva null (mai la stringa vuota).
    input.placeholder = precedente?.[c.campo] != null ? formattaNumero(precedente[c.campo], 1) : "—";
    input.value = daCorreggere?.[c.campo] != null ? String(daCorreggere[c.campo]) : "";
  }
  byId("rep-ctl-note").value = daCorreggere?.note ?? "";
  byId("rep-ctl-note").placeholder = precedente?.note ?? "";
}

// ---------- Il colore immediato ----------
function valori() {
  const v = {};
  for (const c of CAMPI_CONTROLLO) {
    const testo = campi.get(c.campo).value.trim();
    v[c.campo] = testo === "" ? null : Number(testo);
  }
  return v;
}

function riferimenti() {
  return {
    tipo: scheda?.tipo,
    sgrassatura_temp_min: scheda?.sgrassatura_temp_min, sgrassatura_temp_max: scheda?.sgrassatura_temp_max,
    satina_temp_min: scheda?.satina_temp_min,           satina_temp_max: scheda?.satina_temp_max,
    ossido_temp_min: scheda?.ossido_temp_min,           ossido_temp_max: scheda?.ossido_temp_max,
    fissaggio_temp_min: scheda?.fissaggio_temp_min,     fissaggio_temp_max: scheda?.fissaggio_temp_max,
    velocita_prevista: lav?.velocita_prevista,
    ampere_previsti: lav?.ampere_previsti,
    micron_previsti: lav?.micron_previsti,
  };
}

function aggiornaColori() {
  if (!scheda || !lav) return;
  const v = valori();
  const rif = riferimenti();
  const f = fuoriRange(v, rif);
  for (const c of CAMPI_CONTROLLO) {
    const fuori = c.fuori ? f[c.fuori] === true : false;
    campi.get(c.campo).className = fuori ? "fuori" : "";
    const ragione = ragioni.get(c.campo);
    ragione.hidden = !fuori;
    ragione.textContent = fuori ? ragioneFuori(c, v[c.campo], rif) : "";
  }
}

// ---------- Salvataggio ----------
async function conferma() {
  if (!lav) return;
  if (!daCorreggere && !contesto.operatore) {
    return esito("Prima dimmi chi sei: tocca il tuo nome in alto.", "errore");
  }
  byId("rep-ctl-salva").disabled = true;
  esito(daCorreggere ? "Salvo la correzione…" : "Salvo…");

  const note = byId("rep-ctl-note").value.trim();
  const riga = { momento, ...valori(), note: note === "" ? null : note };

  // rilevato_il NON si invia: lo mette il default del database. In correzione non si tocca
  // nemmeno operatore_id: la riga dice chi ha misurato, e che sia stata corretta lo dicono
  // modificato_da e modificato_il, scritti dal trigger.
  // In correzione si chiede indietro la riga con .select(): senza, un update che la policy non
  // fa passare (lavorazione chiusa nel frattempo) tornerebbe 204 SENZA errore, e il tablet
  // direbbe "Salvato ✓" avendo salvato niente. È la stessa trappola silenziosa del range().
  const r = await salva(() => (daCorreggere
    ? sb.from("controlli").update(riga).eq("id", daCorreggere.id).select("id")
    : sb.from("controlli").insert({ ...riga, lavorazione_id: lav.id, operatore_id: contesto.operatore.id })
  ), rete(contesto));

  byId("rep-ctl-salva").disabled = false;
  if (!r.ok) return esito(r.errore, "errore");
  if (daCorreggere && (r.data?.length ?? 0) === 0) {
    return esito("Questo controllo non si può più correggere: la lavorazione è chiusa.", "errore");
  }
  daCorreggere = null;
  contesto.vaiA("hub");
}

function collega() {
  if (avviato) return;
  avviato = true;
  byId("rep-ctl-salva").addEventListener("click", conferma);
}
