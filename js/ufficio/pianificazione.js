// ============================================================
// pianificazione.js — tab Pianificazione (spec §4.2, PIANO Fase 1 voce 4).
// La settimana viaggia sempre come stringa AAAA-MM-GG (mai toISOString: sposterebbe il giorno).
// "Già lavorata" è la definizione dello spec §2.3: una lavorazione non annullata che punta la riga.
// ============================================================
import { byId, sb, salva } from "../db.js";
import { lunediDellaSettimana, settimanaSpostata, schedeCompatibili, formattaNumero } from "../comune.js";

// pianificazione ha unique (settimana, posizione): due righe non possono occupare lo stesso posto.
const DOPPIONE = { 23505: "Questa posizione nella settimana è già occupata: ricarico il programma." };
const COLLEGATA = { 23503: "Questa riga ha già una lavorazione (anche se annullata): resta come storia del programma." };

let settimana = lunediDellaSettimana(new Date());
let schede = [];
let contesto = { mostraCollaudo: false };
let occupato = false;      // vero durante i tre passi di uno scambio: blocca ▲▼ e Togli
let avviato = false;

function esito(testo, classe = "") {
  byId("pian-esito").textContent = testo;
  byId("pian-esito").className = "esito " + classe;
}

const inItaliano = (iso) =>
  new Date(...iso.split("-").map((n, i) => (i === 1 ? Number(n) - 1 : Number(n))))
    .toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });

export async function mostra(ctx) {
  contesto = ctx;
  collega();
  byId("pian-settimana").textContent = `Settimana del lunedì ${inItaliano(settimana)}`;
  esito("Carico…");

  if (schede.length === 0) {
    const r = await sb.from("schede_lavorazione").select("*");
    if (r.error) return esito("Non riesco a leggere le schede di lavorazione.", "errore");
    schede = r.data;
  }

  // Sinistra: i grezzi ancora a magazzino. Qui l'interruttore dei rotoli di collaudo vale.
  let qd = sb.from("rotoli_grezzi").select("*").eq("stato", "grezzo").order("n_prog");
  if (!contesto.mostraCollaudo) qd = qd.not("n_prog", "like", "COLLAUDO%");

  // Destra: TUTTE le righe della settimana, collaudo compreso: nasconderne lascerebbe buchi
  // nelle posizioni e uno scambio ▲▼ salterebbe una riga invisibile.
  const [disponibili, sequenza] = await Promise.all([
    qd,
    sb.from("pianificazione").select("*, rotoli_grezzi(*)").eq("settimana", settimana).order("posizione"),
  ]);
  if (disponibili.error || sequenza.error) return esito("Non riesco a leggere il programma.", "errore");

  const ids = sequenza.data.map((p) => p.id);
  let lavorate = new Set();
  if (ids.length > 0) {
    const l = await sb.from("lavorazioni").select("pianificazione_id").in("pianificazione_id", ids).neq("stato", "annullata");
    if (l.error) return esito("Non riesco a leggere le lavorazioni.", "errore");
    lavorate = new Set(l.data.map((r) => r.pianificazione_id));
  }

  disegnaDisponibili(disponibili.data);
  disegnaSequenza(sequenza.data, lavorate);
  esito("");
}

// ---------- Sinistra: grezzi disponibili ----------
function disegnaDisponibili(righe) {
  const box = byId("pian-disponibili");
  box.textContent = "";
  if (righe.length === 0) {
    box.append(paragrafo("Nessun rotolo a magazzino.", "vuoto"));
    return;
  }
  for (const g of righe) {
    const card = document.createElement("div");
    card.className = "scheda-grezzo";
    card.append(paragrafo(g.n_prog, "titolo"));
    const misure = `${formattaNumero(g.larghezza_mm)} × ${formattaNumero(g.spessore_mm, 2)} mm · ${g.lega ?? "lega non indicata"}`;
    // Un residuo si riconosce dai kg residui valorizzati (spec §3.4).
    const residuo = g.kg_residui == null ? ""
      : ` · residuo ${formattaNumero(g.kg_residui)} kg · ${formattaNumero(g.metri_stimati)} m`;
    card.append(paragrafo(misure + residuo, "dettaglio"));
    const tasto = document.createElement("button");
    tasto.type = "button";
    tasto.textContent = "Aggiungi al programma";
    tasto.disabled = occupato;
    tasto.addEventListener("click", () => aggiungi(g));
    card.append(tasto);
    box.append(card);
  }
}

function paragrafo(testo, classe) {
  const p = document.createElement("p");
  p.textContent = testo;
  if (classe) p.className = classe;
  return p;
}

// ---------- Destra: la sequenza ----------
function disegnaSequenza(righe, lavorate) {
  const box = byId("pian-sequenza");
  box.textContent = "";
  if (righe.length === 0) {
    box.append(paragrafo("Nessun rotolo in programma per questa settimana.", "vuoto"));
    return;
  }
  righe.forEach((p, i) => {
    const g = p.rotoli_grezzi ?? {};
    const lavorata = lavorate.has(p.id);
    const card = document.createElement("div");
    card.className = "riga-programma" + (lavorata ? " lavorata" : "") + (p.posizione < 0 ? " fuori-sequenza" : "");
    card.append(paragrafo(`${i + 1}. ${g.n_prog ?? "rotolo mancante"}`, "titolo"));
    card.append(paragrafo(
      `${formattaNumero(g.larghezza_mm)} × ${formattaNumero(g.spessore_mm, 2)} mm · ${g.cliente ?? "cliente non indicato"}`
      + (lavorata ? " · già lavorata" : ""), "dettaglio"));
    if (p.posizione < 0) {
      card.append(paragrafo("Questa riga è rimasta fuori sequenza: spostala con ▲ ▼ oppure toglila e riaggiungila.", "avviso-riga"));
    }

    const campi = document.createElement("div");
    campi.className = "campi";
    campi.append(
      campoScheda(p, g, lavorata),
      campoTesto(p, "suddivisione_prevista", "Suddivisione prevista", lavorata),
      campoTesto(p, "note", "Nota", lavorata),
      comandiRiga(p, i, righe, lavorata),
    );
    card.append(campi);
    box.append(card);
  });
}

function campoScheda(p, g, lavorata) {
  const div = document.createElement("div");
  const et = document.createElement("label");
  et.textContent = "Scheda prevista";
  const sel = document.createElement("select");
  sel.disabled = lavorata || occupato;
  const compatibili = byId("pian-tutte").checked ? schede : schedeCompatibili(schede, g.spessore_mm, g.larghezza_mm);
  const vuota = document.createElement("option");
  vuota.value = "";
  vuota.textContent = schede.length === 0 ? "— nessuna scheda caricata —" : "— nessuna —";
  sel.append(vuota);
  for (const s of compatibili) {
    const o = document.createElement("option");
    o.value = s.id;
    o.textContent = `${s.lavorazione} (${formattaNumero(s.micron)} my)`;
    sel.append(o);
  }
  // Una scheda già scelta ma non più compatibile resterebbe invisibile: la si aggiunge in coda.
  if (p.scheda_lavorazione_id && !compatibili.some((s) => s.id === p.scheda_lavorazione_id)) {
    const s = schede.find((x) => x.id === p.scheda_lavorazione_id);
    const o = document.createElement("option");
    o.value = p.scheda_lavorazione_id;
    o.textContent = s ? `${s.lavorazione} (fuori misura)` : "scheda non più disponibile";
    sel.append(o);
  }
  sel.value = p.scheda_lavorazione_id ?? "";
  sel.addEventListener("change", () => scrivi(p.id, { scheda_lavorazione_id: sel.value || null }));
  div.append(et, sel);
  return div;
}

function campoTesto(p, colonna, etichetta, lavorata) {
  const div = document.createElement("div");
  const et = document.createElement("label");
  et.textContent = etichetta;
  const inp = document.createElement("input");
  inp.type = "text";
  inp.value = p[colonna] ?? "";
  inp.disabled = lavorata || occupato;
  inp.addEventListener("blur", () => {
    const nuovo = inp.value.trim() || null;
    if (nuovo !== (p[colonna] ?? null)) scrivi(p.id, { [colonna]: nuovo });
  });
  div.append(et, inp);
  return div;
}

function comandiRiga(p, i, righe, lavorata) {
  const div = document.createElement("div");
  div.className = "comandi-riga";
  const su = tastoRiga("▲", i === 0 || occupato, () => scambia(p, righe[i - 1]));
  const giu = tastoRiga("▼", i === righe.length - 1 || occupato, () => scambia(p, righe[i + 1]));
  const togli = tastoRiga("Togli", lavorata || occupato, () => rimuovi(p));
  togli.className = "secondario";
  div.append(su, giu, togli);
  return div;
}

function tastoRiga(testo, disabilitato, azione) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = testo;
  b.disabled = disabilitato;
  b.addEventListener("click", azione);
  return b;
}

// ---------- Scritture ----------
async function scrivi(id, campi, messaggi = DOPPIONE) {
  esito("Salvo…");
  const r = await salva(() => sb.from("pianificazione").update(campi).eq("id", id), { messaggi });
  if (!r.ok) { esito(r.errore, "errore"); await mostra(contesto); return false; }
  esito("Salvato.", "ok");
  return true;
}

async function aggiungi(grezzo) {
  esito("Aggiungo…");
  const { data, error } = await sb.from("pianificazione").select("posizione").eq("settimana", settimana);
  if (error) return esito("Non riesco a leggere il programma.", "errore");
  const posizione = Math.max(0, ...data.map((r) => r.posizione)) + 1;
  const r = await salva(() => sb.from("pianificazione")
    .insert({ settimana, posizione, rotolo_grezzo_id: grezzo.id }), { messaggi: DOPPIONE });
  if (!r.ok) return esito(r.errore, "errore");
  await mostra(contesto);
  esito(`${grezzo.n_prog} aggiunto al programma.`, "ok");
}

async function rimuovi(p) {
  const r = await salva(() => sb.from("pianificazione").delete().eq("id", p.id), { messaggi: COLLEGATA });
  if (!r.ok) return esito(r.errore, "errore");
  await mostra(contesto);
  esito("Riga tolta dal programma.", "ok");
}

// Scambio di posizione in tre passi: unique (settimana, posizione) vieta lo scambio diretto e
// PostgREST non ha transazioni. La posizione di appoggio è negativa, quindi mai occupata.
// Durante i tre passi tutti i comandi della sequenza sono disabilitati; se un passo fallisce si
// ricarica dal database e la riga rimasta a posizione negativa resta visibile, in cima.
async function scambia(a, b) {
  if (!b || occupato) return;
  occupato = true;
  await mostra(contesto);                       // ridisegna con i comandi disabilitati
  esito("Sposto…");
  const passi = [
    [a.id, { posizione: -Math.abs(a.posizione) }],
    [b.id, { posizione: a.posizione }],
    [a.id, { posizione: b.posizione }],
  ];
  let fermo = null;
  for (const [id, campi] of passi) {
    const r = await salva(() => sb.from("pianificazione").update(campi).eq("id", id), { messaggi: DOPPIONE });
    if (!r.ok) { fermo = r.errore; break; }
  }
  occupato = false;
  await mostra(contesto);
  esito(fermo ?? "Spostato.", fermo ? "errore" : "ok");
}

// ---------- Collegamenti (una volta sola) ----------
function collega() {
  if (avviato) return;
  avviato = true;
  byId("pian-prec").addEventListener("click", () => { settimana = settimanaSpostata(settimana, -1); mostra(contesto); });
  byId("pian-succ").addEventListener("click", () => { settimana = settimanaSpostata(settimana, 1); mostra(contesto); });
  byId("pian-tutte").addEventListener("change", () => mostra(contesto));
}
