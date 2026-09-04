// ============================================================
// evento.js — "Evento", due schermate (spec §3.6, PIANO Fase 3 voce 2).
// 1 quale evento (sette tipi) · 2 il dettaglio, diverso per tipo → insert in `eventi`.
// La ripartenza NON è qui: si fa dall'hub, quando un fermo è aperto (voce 3).
// Nessuna regola di stato: la policy del database respinge un evento su una lavorazione
// che non è aperta, e i trigger dei fermi fanno il resto.
// ============================================================
import { byId, sb, salva } from "../db.js";
import { TIPI_EVENTO, CAUSE_FERMO, PRODOTTI_AGGIUNTA, fermoAperto, istanteDaOra, oraItaliana } from "../comune.js";

// Che cosa chiede ogni tipo di evento. `scelte` è l'elenco di bottoni della seconda schermata
// (mai un <select>, spec §3.1); `campi` sono le caselle sotto.
const MODULI = {
  difetto: {
    titolo: "Quale difetto", scelte: "difetti", obbligo: "Scegli il difetto dall'elenco.",
    campi: [["contametri", "Contametri (m)", "numero"], ["descrizione", "Descrizione", "testo"]],
  },
  fermo: {
    titolo: "Perché la linea si è fermata", scelte: "cause", obbligo: "Scegli la causa del fermo.",
    campi: [["ora", "Ora del fermo", "ora"]],
  },
  aggiunta: {
    titolo: "Che cosa hai aggiunto", scelte: "prodotti", obbligo: "Scegli il prodotto.",
    campi: [["litri", "Litri", "numero"]],
  },
  giunta_film: { titolo: "Giunta film", campi: [["contametri", "Contametri (m)", "numero"]] },
  taglio_film: { titolo: "Taglio film", campi: [["contametri", "Contametri (m)", "numero"]] },
  primi_metri_non_ossidati: { titolo: "Primi metri non ossidati", campi: [["contametri", "Metri non ossidati", "numero"]] },
  nota: { titolo: "Nota", campi: [["descrizione", "Che cosa vuoi annotare", "testo"]] },
};

let contesto = null;
let lav = null;
let difetti = [];
let cFermoAperto = null;     // se c'è, il tasto Fermo della prima schermata è spento
let tipo = null;
let scelta = null;           // difetto scelto, causa del fermo o prodotto dell'aggiunta
let richiesta = null;        // tipo chiesto dall'hub (il tasto Fermo), consumato all'apertura
let avviato = false;
const campi = new Map();

function esito(testo, classe = "") {
  byId("rep-ev-esito").textContent = testo;
  byId("rep-ev-esito").className = "esito " + classe;
}

const rete = (ctx) => ({ onStato: (s) => ctx.stato(s) });

// L'hub apre l'evento già sul tipo giusto (il tasto rosso Fermo, spec §3.3).
export function preparaTipo(t) {
  richiesta = t;
}

export async function mostra(ctx) {
  contesto = ctx;
  collega();
  const chiesto = richiesta;
  richiesta = null;
  tipo = null;
  scelta = null;
  esito("Carico…");
  passo(1);

  const aperta = await sb.from("lavorazioni").select("*")
    .eq("stato", "aperta").eq("linea", "1500").maybeSingle();
  if (aperta.error) return esito("Non riesco a leggere la linea. Riprova.", "errore");
  if (!aperta.data) return esito("Nessuna lavorazione aperta sulla linea.", "errore");
  lav = aperta.data;

  const eventi = await sb.from("eventi").select("*").eq("lavorazione_id", lav.id).order("avvenuto_il");
  if (eventi.error) return esito("Non riesco a leggere gli eventi. Riprova.", "errore");
  cFermoAperto = fermoAperto(eventi.data);

  if (difetti.length === 0) {
    const r = await sb.from("tipi_difetto").select("*").order("ordine");
    if (r.error) return esito("Non riesco a leggere il catalogo dei difetti. Riprova.", "errore");
    difetti = r.data;
  }

  disegnaTipi();
  esito("");
  if (chiesto) scegliTipo(chiesto);
}

function passo(n) {
  byId("rep-ev-1").hidden = n !== 1;
  byId("rep-ev-2").hidden = n !== 2;
  contesto.impostaIndietro(n === 1 ? "hub" : () => { tipo = null; scelta = null; passo(1); });
}

// ---------- 1. Quale evento ----------
function disegnaTipi() {
  const contenitore = byId("rep-ev-tipi");
  contenitore.textContent = "";
  for (const [codice, testo] of Object.entries(TIPI_EVENTO)) {
    if (codice === "ripartenza") continue;          // si registra dall'hub, non da qui
    const tasto = document.createElement("button");
    tasto.type = "button";
    tasto.textContent = testo;
    // Un secondo fermo mentre uno è aperto lascerebbe un fermo senza ripartenza: si mostra
    // quello che si sa già, la regola resta del database.
    if (codice === "fermo" && cFermoAperto) {
      tasto.disabled = true;
      tasto.title = "C'è già un fermo aperto: registra la ripartenza dall'hub.";
    } else {
      tasto.addEventListener("click", () => scegliTipo(codice));
    }
    contenitore.append(tasto);
  }
}

// ---------- 2. Il dettaglio ----------
function scegliTipo(t) {
  tipo = t;
  scelta = null;
  const modulo = MODULI[t];
  byId("rep-ev-titolo").textContent = modulo.titolo;
  byId("rep-ev-difetto-info").hidden = true;
  disegnaScelte(modulo);
  disegnaCampi(modulo);
  byId("rep-ev-salva").disabled = !!modulo.scelte;
  esito(modulo.scelte ? modulo.obbligo : "");
  passo(2);
}

function disegnaScelte(modulo) {
  const contenitore = byId("rep-ev-scelte");
  contenitore.textContent = "";
  if (!modulo.scelte) return;

  const voci = modulo.scelte === "difetti"
    ? difetti.map((d) => ({ chiave: d.id, testo: d.nome, dato: d }))
    : modulo.scelte === "cause"
      ? Object.entries(CAUSE_FERMO).map(([k, v]) => ({ chiave: k, testo: v }))
      : PRODOTTI_AGGIUNTA.map((p) => ({ chiave: p, testo: p }));

  for (const voce of voci) {
    const tasto = document.createElement("button");
    tasto.type = "button";
    const titolo = document.createElement("span");
    titolo.className = "titolo";
    titolo.textContent = voce.testo;
    tasto.append(titolo);
    tasto.addEventListener("click", () => {
      scelta = voce.chiave;
      for (const altro of contenitore.children) altro.classList.remove("scelto");
      tasto.classList.add("scelto");
      mostraAiutoDifetto(voce.dato);
      byId("rep-ev-salva").disabled = false;
      esito("");
    });
    contenitore.append(tasto);
  }
}

// Causa probabile e azione del catalogo: si LEGGONO. Non finiscono sull'evento (`eventi` non ha
// quelle colonne) né nelle annotazioni al cliente, che riportano solo fatti (spec §3.7).
function mostraAiutoDifetto(difetto) {
  const riquadro = byId("rep-ev-difetto-info");
  if (!difetto) return void (riquadro.hidden = true);
  byId("rep-ev-difetto-causa").textContent = difetto.causa_probabile ? `Causa probabile: ${difetto.causa_probabile}` : "";
  byId("rep-ev-difetto-azione").textContent = difetto.azione ? `Che cosa fare: ${difetto.azione}` : "";
  riquadro.hidden = false;
}

function disegnaCampi(modulo) {
  const contenitore = byId("rep-ev-campi");
  contenitore.textContent = "";
  campi.clear();
  for (const [nome, testo, genere] of modulo.campi) {
    const etichetta = document.createElement("label");
    etichetta.htmlFor = `rep-ev-campo-${nome}`;
    etichetta.textContent = testo;
    const input = document.createElement("input");
    input.id = `rep-ev-campo-${nome}`;
    if (genere === "numero") { input.type = "number"; input.inputMode = "decimal"; input.step = "any"; input.min = "0"; }
    else if (genere === "ora") { input.type = "time"; input.value = oraItaliana(new Date()); }
    else input.type = "text";
    contenitore.append(etichetta, input);
    campi.set(nome, input);
  }
}

// ---------- Salvataggio ----------
function numero(nome) {
  const testo = campi.get(nome)?.value.trim() ?? "";
  return testo === "" ? null : Number(testo);
}
function testo(nome) {
  const t = campi.get(nome)?.value.trim() ?? "";
  return t === "" ? null : t;
}

async function conferma() {
  if (!lav || !tipo) return;
  if (!contesto.operatore) return esito("Prima dimmi chi sei: tocca il tuo nome in alto.", "errore");
  const modulo = MODULI[tipo];
  if (modulo.scelte && !scelta) return esito(modulo.obbligo, "errore");

  const riga = { lavorazione_id: lav.id, operatore_id: contesto.operatore.id, tipo };
  if (tipo === "difetto") riga.tipo_difetto_id = scelta;
  if (tipo === "fermo") riga.causa_fermo = scelta;
  if (tipo === "aggiunta") { riga.prodotto = scelta; riga.litri = numero("litri"); }
  if (campi.has("contametri")) riga.contametri = numero("contametri");
  if (campi.has("descrizione")) riga.descrizione = testo("descrizione");
  if (campi.has("ora")) {
    const quando = istanteDaOra(campi.get("ora").value);
    if (!quando) return esito("L'ora del fermo non è valida: scrivila come 14:30.", "errore");
    // toISOString() qui è giusto: si manda un ISTANTE preciso, non un giorno. La trappola di
    // CLAUDE.md è ricavare la DATA da un timestamp (darebbe il giorno UTC): l'istante l'ha già
    // costruito istanteDaOra sui componenti locali.
    riga.avvenuto_il = quando.toISOString();
  }

  byId("rep-ev-salva").disabled = true;
  esito("Salvo…");
  const r = await salva(() => sb.from("eventi").insert(riga), rete(contesto));
  byId("rep-ev-salva").disabled = false;
  if (!r.ok) return esito(r.errore, "errore");
  contesto.vaiA("hub");
}

function collega() {
  if (avviato) return;
  avviato = true;
  byId("rep-ev-salva").addEventListener("click", conferma);
}
