// ============================================================
// reparto.js — la shell del tablet: sessione, ruolo, operatore, indicatore di rete, schermate.
// Ogni schermata è un modulo con una sola funzione mostra(ctx). Una schermata, un file.
// Nessuna stampa da qui (spec §8) e nessuna lettura di rotoli_grezzi: solo la vista del reparto.
// ============================================================
import { byId, sb, ruoloCorrente, login, logout } from "./db.js";
import * as hub from "./reparto/hub.js";
import * as avvio from "./reparto/avvio.js";

const CHIAVE_OPERATORE = "produzione.operatore";   // localStorage: solo l'id, il nome si rilegge

const SCHERMATE = {
  operatore: { pannello: "rep-sch-operatore", titolo: "Chi sei?", modulo: null },
  hub:       { pannello: "rep-sch-hub",       titolo: "Linea 1500", modulo: hub },
  avvio:     { pannello: "rep-sch-avvio",     titolo: "Avvia rotolo", modulo: avvio },
  annullo:   { pannello: "rep-sch-annullo",   titolo: "Annulla avvio", modulo: null },
};

let attiva = "hub";
let operatore = null;        // { id, nome, ruolo } dell'operatore scelto

// Il contesto che i moduli ricevono. `indietro` lo imposta la schermata attiva: solo lei sa
// dove si torna (dalla schermata 2 dell'avvio, per esempio, si torna alla 1, non all'hub).
export const ctx = {
  get operatore() { return operatore; },
  vaiA, stato, impostaIndietro, ricarica: () => vaiA(attiva),
  indietro: null,
};

// "Indietro" è un tasto solo, in alto a sinistra (spec §3.1): dove porta lo decide la schermata
// attiva, che è l'unica a sapere se si torna a un passo precedente o all'hub.
export function impostaIndietro(dove) {
  ctx.indietro = dove;
  byId("rep-indietro").hidden = dove == null;
}

// ---------- localStorage, sempre dentro try/catch: in navigazione privata solleva ----------
function idRicordato() {
  try { return localStorage.getItem(CHIAVE_OPERATORE); } catch { return null; }
}
function ricorda(id) {
  try { if (id) localStorage.setItem(CHIAVE_OPERATORE, id); else localStorage.removeItem(CHIAVE_OPERATORE); } catch { /* pazienza */ }
}

// ---------- Indicatore di rete (spec §3.9) ----------
export function stato(s) {
  const campo = byId("rep-stato");
  campo.textContent = { salvato: "Salvato ✓", attesa: "In attesa di rete… riprovo", errore: "" }[s] ?? "";
  campo.className = "stato-rete " + (s === "salvato" ? "ok" : s === "attesa" ? "attesa" : "");
}

// ---------- Schermate ----------
export function vaiA(nome, indietro = null) {
  attiva = nome;
  for (const [chiave, s] of Object.entries(SCHERMATE)) byId(s.pannello).hidden = chiave !== nome;
  byId("rep-titolo").textContent = SCHERMATE[nome].titolo;
  impostaIndietro(indietro);
  SCHERMATE[nome].modulo?.mostra(ctx);
}

// ---------- Operatore ----------
async function scegliOperatore() {
  const contenitore = byId("rep-elenco-operatori");
  contenitore.textContent = "";
  byId("rep-operatori-vuoto").hidden = true;
  vaiA("operatore", operatore ? "hub" : null);

  const { data, error } = await sb.from("operatori").select("id, nome, ruolo").eq("attivo", true).order("nome");
  if (error) { byId("rep-operatori-vuoto").textContent = "Non riesco a leggere gli operatori. Riprova."; byId("rep-operatori-vuoto").hidden = false; return; }
  if (data.length === 0) { byId("rep-operatori-vuoto").hidden = false; return; }

  for (const o of data) {
    const tasto = document.createElement("button");
    tasto.type = "button";
    tasto.textContent = o.nome;
    tasto.addEventListener("click", () => {
      operatore = o;
      ricorda(o.id);
      byId("rep-nome-operatore").textContent = o.nome;
      vaiA("hub");
    });
    contenitore.append(tasto);
  }
}

// Riprende l'operatore ricordato: il NOME si rilegge dal database, così un operatore rinominato
// o disattivato non resta appiccicato al tablet.
async function riprendiOperatore() {
  const id = idRicordato();
  if (!id) return false;
  const { data, error } = await sb.from("operatori").select("id, nome, ruolo").eq("id", id).eq("attivo", true).maybeSingle();
  if (error || !data) { ricorda(null); return false; }
  operatore = data;
  byId("rep-nome-operatore").textContent = data.nome;
  return true;
}

// ---------- Sessione ----------
// Come in ufficio.js: si ridisegna solo quando lo stato cambia davvero, perché
// onAuthStateChange scatta anche al rinnovo del gettone (circa ogni ora).
let statoPrecedente = null;
async function aggiorna() {
  const { data: { session } } = await sb.auth.getSession();
  const ruolo = session ? await ruoloCorrente() : null;
  const dentro = ruolo === "reparto";
  byId("rep-login").hidden = !!session;
  byId("rep-negato").hidden = !session || dentro;
  byId("rep-app").hidden = !dentro;
  // Il confronto e l'aggiornamento di statoPrecedente stanno ATTACCATI, prima di qualunque
  // altra attesa: al caricamento aggiorna() parte due volte (una diretta e una da
  // onAuthStateChange, che emette subito la sessione iniziale). Se il segno si scrivesse dopo il
  // disegno, tutte e due le esecuzioni lo troverebbero ancora vuoto e disegnerebbero l'elenco
  // degli operatori due volte, con ogni nome doppio.
  const chiave = `${session?.user?.id ?? "—"}/${ruolo ?? "—"}`;
  const cambiato = dentro && chiave !== statoPrecedente;
  statoPrecedente = chiave;
  if (cambiato) {
    if (await riprendiOperatore()) vaiA("hub"); else await scegliOperatore();
  }
}

byId("rep-form-login").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  byId("rep-entra").disabled = true;
  byId("rep-messaggio").textContent = "";
  const errore = await login(byId("rep-email").value.trim(), byId("rep-password").value);
  byId("rep-entra").disabled = false;
  if (errore) byId("rep-messaggio").textContent = errore;
  await aggiorna();
});

for (const tasto of ["rep-esci", "rep-negato-esci"]) {
  byId(tasto).addEventListener("click", async () => { operatore = null; ricorda(null); await logout(); await aggiorna(); });
}
byId("rep-nome-operatore").addEventListener("click", scegliOperatore);
byId("rep-indietro").addEventListener("click", () => {
  const dove = ctx.indietro;
  if (typeof dove === "function") dove(); else if (dove) vaiA(dove);
});

sb.auth.onAuthStateChange(() => aggiorna());
aggiorna();
