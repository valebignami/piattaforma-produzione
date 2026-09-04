// ============================================================
// avvio.js — "Avvia rotolo" in tre schermate (spec §3.4, PIANO Fase 2 voce 4).
// 1 quale rotolo · 2 quale scheda (col dettaglio dei parametri) · 3 pesate → avvia_lavorazione.
// Lo stato sta in memoria: se la pagina si chiude prima della conferma si ricomincia (spec §3.4).
// Le letture del grezzo passano SEMPRE da rotoli_grezzi_reparto.
// ============================================================
import { byId, sb, salva } from "../db.js";
import { lunediDellaSettimana, schedeCompatibili, etichettaScheda, formattaNumero } from "../comune.js";
import { rigaGrezzo } from "./hub.js";

const VASCHE = [
  ["sgrassatura", "Sgrassatura"], ["satina", "Satinatura"],
  ["ossido", "Ossido"], ["fissaggio", "Fissaggio"],
];

let contesto = null;
let scelta = null;       // { grezzo, pianificazione_id, scheda }
let schede = [];
let avviato = false;

function esito(testo, classe = "") {
  byId("rep-avvio-esito").textContent = testo;
  byId("rep-avvio-esito").className = "esito " + classe;
}

const rete = (ctx) => ({ onStato: (s) => ctx.stato(s) });

function passo(n) {
  for (const [i, id] of [[1, "rep-avvio-1"], [2, "rep-avvio-2"], [3, "rep-avvio-3"]]) byId(id).hidden = i !== n;
  // Tornando al passo 2 si riparte dall'elenco delle schede: il dettaglio dei parametri è di
  // una scheda sola e lasciarlo aperto farebbe credere di averla già scelta.
  if (n === 2) byId("rep-avvio-parametri").hidden = true;
  if (n === 1) contesto.impostaIndietro("hub");
  if (n === 2) contesto.impostaIndietro(() => passo(1));
  if (n === 3) contesto.impostaIndietro(() => passo(2));
}

export async function mostra(ctx) {
  contesto = ctx;
  collega();
  scelta = null;
  byId("rep-avvio-cerca-testo").value = "";
  byId("rep-avvio-cerca-esiti").textContent = "";
  byId("rep-avvio-tutte").checked = false;
  passo(1);
  await disegnaProgramma();
}

// ---------- 1. Quale rotolo ----------
async function disegnaProgramma() {
  const contenitore = byId("rep-avvio-programma");
  contenitore.textContent = "";
  esito("Carico…");
  const settimana = lunediDellaSettimana(new Date());

  const righe = await sb.from("pianificazione").select("id, posizione, rotolo_grezzo_id")
    .eq("settimana", settimana).order("posizione");
  if (righe.error) return esito("Non riesco a leggere il programma della settimana.", "errore");
  if (righe.data.length === 0) {
    contenitore.append(paragrafo("Niente in programma per questa settimana: cerca il numero del rotolo qui sotto.", "vuoto"));
    return esito("");
  }

  const [grezzi, lavorazioni] = await Promise.all([
    sb.from("rotoli_grezzi_reparto").select("*").in("id", righe.data.map((r) => r.rotolo_grezzo_id)),
    sb.from("lavorazioni").select("pianificazione_id").in("pianificazione_id", righe.data.map((r) => r.id)).neq("stato", "annullata"),
  ]);
  if (grezzi.error || lavorazioni.error) return esito("Non riesco a leggere il programma della settimana.", "errore");

  const perId = new Map(grezzi.data.map((g) => [g.id, g]));
  const lavorate = new Set(lavorazioni.data.map((l) => l.pianificazione_id));
  const daFare = righe.data.filter((r) => !lavorate.has(r.id));
  if (daFare.length === 0) {
    contenitore.append(paragrafo("Il programma della settimana è già stato lavorato tutto.", "vuoto"));
  }
  daFare.forEach((r, i) => {
    const g = perId.get(r.rotolo_grezzo_id);
    if (!g) return;
    const tasto = bottoneGrezzo(g, r.id);
    if (i === 0) tasto.classList.add("primo");
    contenitore.append(tasto);
  });
  esito("");
}

// Un rotolo che non è "grezzo" si mostra col suo stato e col bottone spento: è ciò che la RPC
// rifiuterebbe (spec §2.7), mostrato prima invece che dopo. La regola resta nel database.
function bottoneGrezzo(g, pianificazioneId) {
  const tasto = rigaGrezzo(g);
  if (g.stato !== "grezzo") tasto.disabled = true;
  else tasto.addEventListener("click", () => scegliGrezzo(g, pianificazioneId));
  return tasto;
}

function paragrafo(testo, classe) {
  const p = document.createElement("p");
  p.textContent = testo;
  if (classe) p.className = classe;
  return p;
}

async function cerca() {
  const testo = byId("rep-avvio-cerca-testo").value.trim();
  const contenitore = byId("rep-avvio-cerca-esiti");
  contenitore.textContent = "";
  if (!testo) return;
  esito("Cerco…");
  // Qui compaiono anche i rotoli di collaudo, che non sono in programma (spec §3.4, §5.7).
  const { data, error } = await sb.from("rotoli_grezzi_reparto").select("*")
    .ilike("n_prog", `%${testo}%`).order("n_prog").limit(8);
  if (error) return esito("Non riesco a cercare il rotolo. Riprova.", "errore");
  if (data.length === 0) contenitore.append(paragrafo("Nessun rotolo con questo numero.", "vuoto"));
  for (const g of data) contenitore.append(bottoneGrezzo(g, null));
  esito("");
}

// ---------- 2. Quale scheda ----------
async function scegliGrezzo(grezzo, pianificazioneId) {
  scelta = { grezzo, pianificazione_id: pianificazioneId, scheda: null };
  passo(2);
  if (schede.length === 0) {
    esito("Carico le schede…");
    const r = await sb.from("schede_lavorazione").select("*");
    if (r.error) return esito("Non riesco a leggere le schede di lavorazione.", "errore");
    schede = r.data;
  }
  disegnaSchede();
}

function disegnaSchede() {
  const contenitore = byId("rep-avvio-schede");
  contenitore.textContent = "";
  const elenco = byId("rep-avvio-tutte").checked
    ? [...schede].sort((a, b) => a.micron - b.micron)
    : schedeCompatibili(schede, scelta.grezzo.spessore_mm, scelta.grezzo.larghezza_mm);

  if (elenco.length === 0) {
    contenitore.append(paragrafo(
      schede.length === 0 ? "Nessuna scheda caricata: avvisa l'ufficio."
        : "Nessuna scheda per queste misure: usa Mostra tutte.", "vuoto"));
    return esito("");
  }
  for (const s of elenco) {
    const tasto = document.createElement("button");
    tasto.type = "button";
    const titolo = document.createElement("span");
    titolo.className = "titolo";
    titolo.textContent = etichettaScheda(s);
    tasto.append(titolo);
    tasto.addEventListener("click", () => mostraParametri(s));
    contenitore.append(tasto);
  }
  esito("");
}

// Il tap su una scheda non conferma: apre i parametri per vasca (spec §3.4). Resta dentro la
// schermata 2, così le schermate del flusso restano tre.
function mostraParametri(s) {
  scelta.scheda = s;
  byId("rep-avvio-parametri-titolo").textContent = etichettaScheda(s);
  const corpo = byId("rep-avvio-parametri-corpo");
  corpo.textContent = "";
  const voci = [
    ["Velocità di linea", s.velocita_m_min == null ? null : `${formattaNumero(s.velocita_m_min, 1)} m/min`],
    ["Corrente ossido", s.ossido_ampere == null ? null : `${formattaNumero(s.ossido_ampere)} A`],
  ];
  for (const [colonna, nome] of VASCHE) {
    const temp = s[`${colonna}_temp`];
    const min = s[`${colonna}_temp_min`];
    const max = s[`${colonna}_temp_max`];
    if (temp == null && min == null && max == null && !s[`${colonna}_prodotto`]) continue;
    const pezzi = [];
    if (temp != null) pezzi.push(`${formattaNumero(temp, 0)} °C`);
    if (min != null && max != null) pezzi.push(`(da ${formattaNumero(min)} a ${formattaNumero(max)})`);
    else if (min != null) pezzi.push(`(almeno ${formattaNumero(min)})`);
    if (s[`${colonna}_prodotto`]) pezzi.push(`· ${s[`${colonna}_prodotto`]}`);
    voci.push([nome, pezzi.join(" ")]);
  }
  if (s.note) voci.push(["Note", s.note]);
  for (const [etichetta, valore] of voci) {
    if (valore == null || valore === "") continue;
    const tr = document.createElement("tr");
    const th = document.createElement("th");
    th.textContent = etichetta;
    const td = document.createElement("td");
    td.textContent = valore;
    tr.append(th, td);
    corpo.append(tr);
  }
  byId("rep-avvio-parametri").hidden = false;
  byId("rep-avvio-parametri").scrollIntoView({ block: "nearest" });
  // "Indietro" dai parametri torna all'elenco delle schede, non alla schermata 1.
  contesto.impostaIndietro(() => passo(2));
}

// ---------- 3. Pesate ----------
function apriPesate() {
  passo(3);
  byId("rep-avvio-riepilogo").textContent =
    `${scelta.grezzo.n_prog} · ${etichettaScheda(scelta.scheda)}`;
  byId("rep-avvio-peso-con").value = "";
  byId("rep-avvio-peso-imballo").value = "0";
  byId("rep-avvio-contametri").value = "0";
  aggiornaNetto();
  byId("rep-avvio-peso-con").focus();
}

function aggiornaNetto() {
  const con = Number(byId("rep-avvio-peso-con").value);
  const imballo = Number(byId("rep-avvio-peso-imballo").value || 0);
  const valido = Number.isFinite(con) && con > 0 && Number.isFinite(imballo) && imballo >= 0 && imballo < con;
  byId("rep-avvio-netto").textContent = valido
    ? `Netto provvisorio: ${formattaNumero(con - imballo)} kg`
    : "Netto provvisorio: —";
  byId("rep-avvio-conferma").disabled = !valido;
}

async function conferma() {
  if (!scelta?.scheda) return;
  if (!contesto.operatore) return esito("Prima dimmi chi sei: tocca il tuo nome in alto.", "errore");
  byId("rep-avvio-conferma").disabled = true;
  esito("Avvio…");

  const contametri = byId("rep-avvio-contametri").value.trim();
  const r = await salva(() => sb.rpc("avvia_lavorazione", {
    p_rotolo_grezzo_id: scelta.grezzo.id,
    p_scheda_id: scelta.scheda.id,
    p_operatore_id: contesto.operatore.id,
    p_peso_con_imballo: Number(byId("rep-avvio-peso-con").value),
    p_peso_imballo: Number(byId("rep-avvio-peso-imballo").value || 0),
    p_contametri_inizio: contametri === "" ? 0 : Number(contametri),
    p_pianificazione_id: scelta.pianificazione_id,
  }), rete(contesto));

  byId("rep-avvio-conferma").disabled = false;
  if (!r.ok) return esito(r.errore, "errore");
  contesto.vaiA("hub");
}

// ---------- Collegamenti (una volta sola) ----------
function collega() {
  if (avviato) return;
  avviato = true;
  byId("rep-avvio-cerca-vai").addEventListener("click", cerca);
  byId("rep-avvio-cerca-testo").addEventListener("keydown", (ev) => { if (ev.key === "Enter") cerca(); });
  byId("rep-avvio-tutte").addEventListener("change", disegnaSchede);
  byId("rep-avvio-parametri-usa").addEventListener("click", apriPesate);
  byId("rep-avvio-peso-con").addEventListener("input", aggiornaNetto);
  byId("rep-avvio-peso-imballo").addEventListener("input", aggiornaNetto);
  byId("rep-avvio-conferma").addEventListener("click", conferma);
}
