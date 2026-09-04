// ============================================================
// hub.js — l'hub del tablet (spec §3.3, PIANO Fase 2 voce 3) e l'annullo dell'avvio.
// Il reparto NON interroga mai rotoli_grezzi: ogni lettura del grezzo passa da
// rotoli_grezzi_reparto, che non ha fornitore né riferimento bolla.
// Nessuna regola di stato qui dentro: l'hub mostra, e le regole le fa rispettare la RPC.
// ============================================================
import { byId, sb, salva } from "../db.js";
import {
  lunediDellaSettimana, formattaNumero, oraItaliana, minutiDa, fermoAperto,
  CAUSE_FERMO, SOGLIA_CONTROLLO_MIN,
} from "../comune.js";
import * as evento from "./evento.js";

let contesto = null;
let inCorso = null;         // la lavorazione aperta, con i dati già letti per il banner
let fermo = null;           // il fermo aperto, se c'è (spec §2.5: fermo senza ripartenza)
let messaggioDopo = null;   // il messaggio da mostrare DOPO il ricaricamento dell'hub
let avviato = false;

function esito(testo, classe = "") {
  byId("rep-hub-esito").textContent = testo;
  byId("rep-hub-esito").className = "esito " + classe;
}

// salva() ritenta da sola quando la rete manca (spec §3.9): l'indicatore in barra lo dice.
const rete = (ctx) => ({ onStato: (s) => ctx.stato(s) });

export async function mostra(ctx) {
  contesto = ctx;
  collega();
  esito("Carico…");
  byId("rep-altro-voci").hidden = true;

  const aperta = await sb.from("lavorazioni").select("*")
    .eq("stato", "aperta").eq("linea", "1500").maybeSingle();
  if (aperta.error) return esito("Non riesco a leggere la linea. Riprova.", "errore");

  byId("rep-hub-libera").hidden = !!aperta.data;
  byId("rep-hub-corso").hidden = !aperta.data;
  if (aperta.data) await disegnaInCorso(aperta.data);
  else await disegnaLibera();

  // Il messaggio di riuscita si scrive SOLO qui, alla fine: disegnaLibera e disegnaInCorso
  // chiudono con esito(""), e scriverlo prima lo cancellerebbe senza che nessuno lo legga.
  if (messaggioDopo) { esito(messaggioDopo, "ok"); messaggioDopo = null; }
}

// ---------- Linea libera: il programma della settimana ----------
async function disegnaLibera() {
  inCorso = null;
  fermo = null;
  const contenitore = byId("rep-hub-programma");
  contenitore.textContent = "";
  const settimana = lunediDellaSettimana(new Date());

  const righe = await sb.from("pianificazione").select("id, posizione, rotolo_grezzo_id, suddivisione_prevista, note")
    .eq("settimana", settimana).order("posizione");
  if (righe.error) return esito("Non riesco a leggere il programma della settimana.", "errore");

  // Con zero righe non si interroga niente altro: .in() su una lista vuota è una chiamata inutile.
  if (righe.data.length === 0) {
    byId("rep-hub-programma-vuoto").hidden = false;
    return esito("");
  }

  const [grezzi, lavorazioni] = await Promise.all([
    sb.from("rotoli_grezzi_reparto").select("*").in("id", righe.data.map((r) => r.rotolo_grezzo_id)),
    sb.from("lavorazioni").select("pianificazione_id").in("pianificazione_id", righe.data.map((r) => r.id)).neq("stato", "annullata"),
  ]);
  if (grezzi.error || lavorazioni.error) return esito("Non riesco a leggere il programma della settimana.", "errore");

  const perId = new Map(grezzi.data.map((g) => [g.id, g]));
  const lavorate = new Set(lavorazioni.data.map((l) => l.pianificazione_id));
  const daFare = righe.data.filter((r) => !lavorate.has(r.id));   // già lavorate escluse (spec §3.3)

  byId("rep-hub-programma-vuoto").hidden = daFare.length > 0;
  daFare.forEach((r, i) => {
    const g = perId.get(r.rotolo_grezzo_id);
    if (!g) return;
    const tasto = rigaGrezzo(g, r.suddivisione_prevista);
    if (i === 0) tasto.classList.add("primo");
    tasto.addEventListener("click", () => contesto.vaiA("avvio"));
    contenitore.append(tasto);
  });
  esito("");
}

// Un bottone che descrive un grezzo. I residui mostrano i kg e i metri (spec §3.4).
export function rigaGrezzo(g, extra = null) {
  const tasto = document.createElement("button");
  tasto.type = "button";
  const titolo = document.createElement("span");
  titolo.className = "titolo";
  titolo.textContent = g.n_prog;
  const dettaglio = document.createElement("span");
  dettaglio.className = "dettaglio";
  const pezzi = [`${formattaNumero(g.larghezza_mm)} × ${formattaNumero(g.spessore_mm, 2)} mm`];
  if (g.lega) pezzi.push(g.lega);
  if (g.kg_residui != null) pezzi.push(`residuo ${formattaNumero(g.kg_residui)} kg · ${formattaNumero(g.metri_stimati)} m`);
  if (g.stato !== "grezzo") pezzi.push(g.stato === "in_lavorazione" ? "già in linea" : "esaurito");
  if (extra) pezzi.push(extra);
  dettaglio.textContent = pezzi.join(" · ");
  tasto.append(titolo, dettaglio);
  return tasto;
}

// ---------- Lavorazione in corso: il banner ----------
async function disegnaInCorso(lav) {
  const [grezzo, scheda, operatore, controllo, eventi] = await Promise.all([
    sb.from("rotoli_grezzi_reparto").select("*").eq("id", lav.rotolo_grezzo_id).maybeSingle(),
    sb.from("schede_lavorazione").select("lavorazione, micron").eq("id", lav.scheda_lavorazione_id).maybeSingle(),
    sb.from("operatori").select("nome").eq("id", lav.operatore_avvio_id).maybeSingle(),
    sb.from("controlli").select("rilevato_il, contametri").eq("lavorazione_id", lav.id)
      .order("rilevato_il", { ascending: false }).limit(1).maybeSingle(),
    sb.from("eventi").select("*").eq("lavorazione_id", lav.id).order("avvenuto_il"),
  ]);
  if (grezzo.error || scheda.error || operatore.error || controllo.error || eventi.error) {
    return esito("Non riesco a leggere la lavorazione in corso. Riprova.", "errore");
  }
  inCorso = { lav, grezzo: grezzo.data, scheda: scheda.data };
  fermo = fermoAperto(eventi.data);

  const rotolo = `${grezzo.data?.n_prog ?? "rotolo"} · ${scheda.data?.lavorazione ?? "scheda"}`;

  // Minuti dall'ultimo controllo; senza controlli si contano dall'avvio.
  const minuti = minutiDa(controllo.data?.rilevato_il ?? lav.avviata_il);
  const pezzi = [`avviato ${oraItaliana(lav.avviata_il)} da ${operatore.data?.nome ?? "operatore"}`];
  pezzi.push(controllo.data ? `ultimo controllo ${formattaNumero(minuti)} min fa` : "nessun controllo");
  // I metri si sanno solo dal contametri di un controllo: senza, la voce non compare.
  if (controllo.data?.contametri != null) {
    pezzi.push(`${formattaNumero(controllo.data.contametri - (lav.contametri_inizio ?? 0))} m`);
  }

  // Il rosso del FERMO vince su quello del controllo scaduto: la linea ferma è la cosa più
  // importante da vedere, e si distingue perché il titolo comincia con "FERMO".
  if (fermo) {
    const da = minutiDa(fermo.avvenuto_il);
    byId("rep-banner-titolo").textContent =
      `FERMO da ${da != null ? formattaNumero(da) : "?"} min · ${CAUSE_FERMO[fermo.causa_fermo] ?? "causa non indicata"}`;
    pezzi.unshift(rotolo);
  } else {
    byId("rep-banner-titolo").textContent = rotolo;
  }
  byId("rep-banner-dettaglio").textContent = pezzi.join(" · ");
  byId("rep-banner").className = "banner"
    + (fermo ? " fermo" : (minuti != null && minuti > SOGLIA_CONTROLLO_MIN ? " scaduto" : ""));

  byId("rep-fermo").textContent = fermo ? "Ripartenza" : "Fermo";
  esito("");
}

// ---------- Annulla avvio ----------
function apriAnnullo() {
  if (!inCorso) return;
  byId("rep-annullo-rotolo").textContent =
    `${inCorso.grezzo?.n_prog ?? "rotolo"} · ${inCorso.scheda?.lavorazione ?? "scheda"}`;
  byId("rep-annullo-motivo").value = "";
  byId("rep-annullo-metri").value = "0";
  byId("rep-annullo-conferma").disabled = true;
  byId("rep-annullo-esito").textContent = "";
  byId("rep-annullo-esito").className = "esito";
  contesto.vaiA("annullo", "hub");
}

async function confermaAnnullo() {
  const motivo = byId("rep-annullo-motivo").value.trim();
  if (!motivo || !inCorso) return;
  const metri = byId("rep-annullo-metri").value.trim();
  byId("rep-annullo-conferma").disabled = true;
  byId("rep-annullo-esito").textContent = "Annullo…";
  byId("rep-annullo-esito").className = "esito";

  const r = await salva(() => sb.rpc("annulla_lavorazione", {
    p_lavorazione_id: inCorso.lav.id,
    p_operatore_id: contesto.operatore?.id ?? null,
    p_motivo: motivo,
    p_metri_scarto: metri === "" ? 0 : Number(metri),
  }), rete(contesto));

  byId("rep-annullo-conferma").disabled = false;
  if (!r.ok) {
    byId("rep-annullo-esito").textContent = r.errore;
    byId("rep-annullo-esito").className = "esito errore";
    return;
  }
  messaggioDopo = "Avvio annullato: la linea è di nuovo libera.";
  contesto.vaiA("hub");
}

// ---------- Collegamenti (una volta sola) ----------
function collega() {
  if (avviato) return;
  avviato = true;
  byId("rep-hub-avvia").addEventListener("click", () => contesto.vaiA("avvio"));
  byId("rep-controllo").addEventListener("click", () => contesto.vaiA("controllo", "hub"));
  byId("rep-evento").addEventListener("click", () => contesto.vaiA("evento", "hub"));
  // Un tasto solo: fermo se la linea va, ripartenza se è ferma (spec §3.3).
  byId("rep-fermo").addEventListener("click", () => {
    if (fermo) return contesto.vaiA("ripartenza", "hub");
    evento.preparaTipo("fermo");
    contesto.vaiA("evento", "hub");
  });
  byId("rep-altro").addEventListener("click", () => {
    byId("rep-altro-voci").hidden = !byId("rep-altro-voci").hidden;
  });
  byId("rep-annulla-avvio").addEventListener("click", apriAnnullo);
  byId("rep-annullo-motivo").addEventListener("input", (ev) => {
    byId("rep-annullo-conferma").disabled = ev.target.value.trim() === "";
  });
  byId("rep-annullo-conferma").addEventListener("click", confermaAnnullo);
}
