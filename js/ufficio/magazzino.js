// ============================================================
// magazzino.js — tab Magazzino grezzi (spec §4.1, PIANO Fase 1 voce 2).
// Il front-end mostra e invia: stato, kg_al_metro, metri_stimati e modificato_* non partono mai
// da qui (non c'è il grant), e la modifica di un rotolo non a magazzino la rifiuta la policy
// grezzi_upd. Qui si disabilita ciò che il database rifiuterebbe, e si mostrano i suoi messaggi.
// ============================================================
import { byId, sb, salva } from "../db.js";
import { prossimoNProg, valoriUsati, formattaNumero } from "../comune.js";

// Colonne su cui l'ufficio ha il grant di insert (sezione e di 000_setup.sql).
const CAMPI = {
  n_prog: "mag-n-prog", fornitore: "mag-fornitore", rif_bolla: "mag-rif-bolla",
  cliente: "mag-cliente", lega: "mag-lega", finitura: "mag-finitura",
  spessore_mm: "mag-spessore", larghezza_mm: "mag-larghezza", peso_bolla_kg: "mag-peso-bolla",
  data_arrivo: "mag-data-arrivo", posizione: "mag-posizione", note: "mag-note",
};
const NUMERICI = ["spessore_mm", "larghezza_mm", "peso_bolla_kg"];

let inModifica = null;   // la riga in modifica, oppure null se il modulo è "Nuovo rotolo"
let codici = [];         // n_prog già usati, per la proposta del numero
let avviato = false;
let contesto = { mostraCollaudo: false };   // ultimo contesto ricevuto dalla shell, per i ricaricamenti

// Un campo vuoto si invia come null, mai come stringa vuota: su una colonna numeric o date
// darebbe 22P02/22007 e un messaggio generico.
const valore = (id, numerico) => {
  const v = byId(id).value.trim();
  if (v === "") return null;
  return numerico ? Number(v) : v;
};

function esito(testo, classe = "") {
  byId("mag-esito").textContent = testo;
  byId("mag-esito").className = "esito " + classe;
}

// ---------- Elenco ----------
export async function mostra(ctx) {
  contesto = ctx;
  collega();
  esito("Carico…");

  // Una sola interrogazione senza filtri per: proposta del numero, lettere in uso e
  // autocompletamento. Le ultime 1000 per n_prog decrescente bastano: con le cifre a quattro
  // fisse il massimo di ogni lettera è sempre nel gruppo di testa.
  const anagrafica = await sb.from("rotoli_grezzi")
    .select("n_prog, cliente, fornitore").order("n_prog", { ascending: false }).limit(1000);
  if (anagrafica.error) return esito("Non riesco a leggere il magazzino. Riprova o avvisa chi gestisce l'app.", "errore");
  codici = anagrafica.data.map((r) => r.n_prog);
  riempiElenco("mag-clienti", valoriUsati(anagrafica.data, "cliente"));
  riempiElenco("mag-fornitori", valoriUsati(anagrafica.data, "fornitore"));
  riempiLettere();

  let q = sb.from("rotoli_grezzi").select("*").order("n_prog");
  const stato = byId("mag-stato").value;
  if (stato === "attivi") q = q.in("stato", ["grezzo", "in_lavorazione"]);
  if (stato === "esauriti") q = q.eq("stato", "esaurito");
  if (!ctx.mostraCollaudo) q = q.not("n_prog", "like", "COLLAUDO%");

  const { data, error } = await q;
  if (error) return esito("Non riesco a leggere il magazzino. Riprova o avvisa chi gestisce l'app.", "errore");
  disegna(data);
  esito("");
}

function riempiElenco(id, valori) {
  const dl = byId(id);
  dl.textContent = "";
  for (const v of valori) {
    const o = document.createElement("option");
    o.value = v;
    dl.append(o);
  }
}

function riempiLettere() {
  const lettere = new Set(["A"]);
  for (const c of codici) { const m = /^([A-Z])\d+$/.exec(c); if (m) lettere.add(m[1]); }
  const sel = byId("mag-lettera");
  const scelta = sel.value;
  sel.textContent = "";
  for (const l of [...lettere].sort()) {
    const o = document.createElement("option");
    o.value = o.textContent = l;
    sel.append(o);
  }
  sel.value = lettere.has(scelta) ? scelta : "A";
}

const cella = (testo, classe) => {
  const td = document.createElement("td");
  td.textContent = testo;
  if (classe) td.className = classe;
  return td;
};

function disegna(righe) {
  const corpo = byId("mag-tabella");
  corpo.textContent = "";
  byId("mag-vuoto").hidden = righe.length > 0;
  for (const r of righe) {
    const tr = document.createElement("tr");
    tr.append(cella(r.n_prog));

    const tdStato = document.createElement("td");
    const pill = document.createElement("span");
    pill.className = "stato " + r.stato;
    pill.textContent = { grezzo: "a magazzino", in_lavorazione: "in linea", esaurito: "esaurito" }[r.stato];
    tdStato.append(pill);
    tr.append(tdStato);

    tr.append(cella(r.fornitore ?? "—"), cella(r.cliente ?? "—"), cella(r.lega ?? "—"), cella(r.finitura ?? "—"),
      cella(formattaNumero(r.spessore_mm, 2), "num"), cella(formattaNumero(r.larghezza_mm), "num"),
      cella(formattaNumero(r.peso_bolla_kg), "num"), cella(formattaNumero(r.kg_residui), "num"),
      cella(formattaNumero(r.metri_stimati), "num"), cella(r.posizione ?? "—"),
      cella(r.data_arrivo ?? "—"), cella(r.note ?? "—"),
      cella(r.modificato_da ? `${r.modificato_da} ${(r.modificato_il ?? "").slice(0, 10)}` : "—"));

    const tdTasti = document.createElement("td");
    const modifica = document.createElement("button");
    modifica.type = "button";
    modifica.textContent = "Modifica";
    modifica.addEventListener("click", () => apriModifica(r));
    const stampa = document.createElement("button");
    stampa.type = "button";
    stampa.className = "secondario";
    stampa.textContent = "Stampa scheda";
    stampa.addEventListener("click", () =>
      window.open(`stampa.html?tipo=grezzo&n_prog=${encodeURIComponent(r.n_prog)}`, "_blank"));
    tdTasti.append(modifica, " ", stampa);
    tr.append(tdTasti);
    corpo.append(tr);
  }
}

// ---------- Modulo ----------
function apriNuovo() {
  inModifica = null;
  byId("mag-form-titolo").textContent = "Nuovo rotolo";
  byId("mag-form").reset();
  byId("mag-riga-lettera").hidden = false;
  byId("mag-riga-kg-residui").hidden = true;      // un rotolo nuovo non è mai stato lavorato
  byId("mag-sola-lettura").hidden = true;
  riempiLettere();
  proponiNumero();
  abilita(true);
  byId("mag-form").hidden = false;
  byId("mag-n-prog").focus();
}

function apriModifica(riga) {
  inModifica = riga;
  byId("mag-form-titolo").textContent = `Rotolo ${riga.n_prog}`;
  byId("mag-form").reset();
  byId("mag-riga-lettera").hidden = true;
  byId("mag-riga-kg-residui").hidden = false;
  for (const [colonna, id] of Object.entries(CAMPI)) byId(id).value = riga[colonna] ?? "";
  byId("mag-kg-residui").value = riga.kg_residui ?? "";
  const modificabile = riga.stato === "grezzo";
  byId("mag-sola-lettura").hidden = modificabile;
  abilita(modificabile);
  byId("mag-form").hidden = false;
  byId("mag-form").scrollIntoView({ block: "nearest" });
}

function abilita(si) {
  for (const id of [...Object.values(CAMPI), "mag-kg-residui", "mag-lettera"]) byId(id).disabled = !si;
  byId("mag-salva").hidden = !si;
}

function proponiNumero() {
  byId("mag-n-prog").value = prossimoNProg(codici, byId("mag-lettera").value);
}

function chiudi() {
  byId("mag-form").hidden = true;
  inModifica = null;
}

async function invia(ev) {
  ev.preventDefault();
  const dati = {};
  for (const [colonna, id] of Object.entries(CAMPI)) dati[colonna] = valore(id, NUMERICI.includes(colonna));
  byId("mag-salva").disabled = true;
  esito("Salvo…");

  const esitoSalva = inModifica
    ? await salva(() => sb.from("rotoli_grezzi")
        .update({ ...dati, kg_residui: valore("mag-kg-residui", true) }).eq("id", inModifica.id))
    : await salva(() => sb.from("rotoli_grezzi").insert(dati));

  byId("mag-salva").disabled = false;
  if (!esitoSalva.ok) return esito(esitoSalva.errore, "errore");
  const messaggio = inModifica ? "Rotolo aggiornato." : "Rotolo inserito.";
  chiudi();                                  // azzera inModifica: il messaggio si legge prima
  await mostra(contesto);
  esito(messaggio, "ok");                    // dopo mostra(), che chiude con esito("")
}

// ---------- Collegamenti (una volta sola) ----------
function collega() {
  if (avviato) return;
  avviato = true;
  byId("mag-nuovo").addEventListener("click", apriNuovo);
  byId("mag-annulla").addEventListener("click", chiudi);
  byId("mag-lettera").addEventListener("change", proponiNumero);
  byId("mag-form").addEventListener("submit", invia);
  byId("mag-stato").addEventListener("change", () => mostra(contesto));
}
