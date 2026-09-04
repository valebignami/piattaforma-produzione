// ============================================================
// impostazioni.js — tab Impostazioni (spec §4.6, PIANO Fase 1 voce 5): operatori e backup.
// Nessuna cancellazione degli operatori: il piano dice "aggiungi, rinomina, ruolo, attivo", e un
// operatore già citato in una lavorazione non si potrebbe cancellare comunque.
// ============================================================
import { byId, sb, salva } from "../db.js";

const NOME_DOPPIO = { 23505: "Esiste già un operatore con questo nome." };

// Le nove tabelle leggibili dall'ufficio. utenti_app non c'è: non ha accesso via API per
// costruzione (spec §5.3), e contiene solo la corrispondenza fra utente e ruolo.
const TABELLE = ["operatori", "schede_lavorazione", "tipi_difetto", "rotoli_grezzi",
  "pianificazione", "lavorazioni", "rotoli_lavorati", "controlli", "eventi"];
const BLOCCO = 1000;   // PostgREST non restituisce più di 1000 righe per richiesta, e tronca in silenzio

let avviato = false;

function esito(testo, classe = "") {
  byId("imp-esito").textContent = testo;
  byId("imp-esito").className = "esito " + classe;
}

// ---------- Operatori ----------
export async function mostra() {
  collega();
  esito("Carico…");
  const { data, error } = await sb.from("operatori").select("*").order("nome");
  if (error) return esito("Non riesco a leggere gli operatori.", "errore");
  disegna(data);
  esito("");
}

function disegna(righe) {
  const corpo = byId("imp-operatori");
  corpo.textContent = "";
  for (const o of righe) {
    const tr = document.createElement("tr");

    const nome = document.createElement("input");
    nome.type = "text";
    nome.value = o.nome;
    nome.addEventListener("blur", () => {
      const nuovo = nome.value.trim();
      if (!nuovo || nuovo === o.nome) { nome.value = o.nome; return; }
      scrivi(o.id, { nome: nuovo }, NOME_DOPPIO);
    });

    const ruolo = document.createElement("select");
    for (const [v, t] of [["operatore", "Operatore"], ["capoturno", "Capoturno"]]) {
      const op = document.createElement("option");
      op.value = v;
      op.textContent = t;
      ruolo.append(op);
    }
    ruolo.value = o.ruolo;
    ruolo.addEventListener("change", () => scrivi(o.id, { ruolo: ruolo.value }));

    const attivo = document.createElement("input");
    attivo.type = "checkbox";
    attivo.checked = o.attivo;
    attivo.addEventListener("change", () => scrivi(o.id, { attivo: attivo.checked }));

    for (const campo of [nome, ruolo, attivo]) {
      const td = document.createElement("td");
      td.append(campo);
      tr.append(td);
    }
    corpo.append(tr);
  }
}

async function scrivi(id, campi, messaggi = {}) {
  esito("Salvo…");
  const r = await salva(() => sb.from("operatori").update(campi).eq("id", id), { messaggi });
  if (!r.ok) { esito(r.errore, "errore"); await mostra(); return; }
  await mostra();
  esito("Salvato.", "ok");
}

async function aggiungi(ev) {
  ev.preventDefault();
  const nome = byId("imp-nome").value.trim();
  if (!nome) return;
  byId("imp-aggiungi").disabled = true;
  esito("Aggiungo…");
  const r = await salva(() => sb.from("operatori")
    .insert({ nome, ruolo: byId("imp-ruolo").value }), { messaggi: NOME_DOPPIO });
  byId("imp-aggiungi").disabled = false;
  if (!r.ok) return esito(r.errore, "errore");
  byId("imp-nuovo").reset();
  await mostra();
  esito(`${nome} aggiunto.`, "ok");
}

// ---------- Esporta tutto (spec §5.4) ----------
// Nessun filtro: è un backup, deve contenere anche i rotoli di collaudo.
async function leggiTutto(tabella) {
  const righe = [];
  for (let da = 0; ; da += BLOCCO) {
    // L'ordinamento per id rende la paginazione ripetibile: senza, due blocchi possono
    // sovrapporsi o saltare righe.
    const { data, error } = await sb.from(tabella).select("*").order("id").range(da, da + BLOCCO - 1);
    if (error) throw new Error(`${tabella}: ${error.message}`);
    righe.push(...data);
    if (data.length < BLOCCO) return righe;
  }
}

function scarica(nome, righe) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(righe, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function esporta() {
  byId("imp-esporta").disabled = true;
  // "sv-SE" scrive la data locale come AAAA-MM-GG; toISOString darebbe il giorno UTC.
  const oggi = new Date().toLocaleDateString("sv-SE");
  try {
    for (const t of TABELLE) {
      esito(`Esporto ${t}…`);
      const righe = await leggiTutto(t);
      scarica(`${t}_${oggi}.json`, righe);
      await new Promise((r) => setTimeout(r, 300));   // il browser rifiuta una raffica di download
    }
    esito(`Esportate ${TABELLE.length} tabelle.`, "ok");
  } catch (e) {
    console.error(e);
    esito("L'esportazione si è fermata: riprova, e se continua avvisa chi gestisce l'app.", "errore");
  }
  byId("imp-esporta").disabled = false;
}

// ---------- Collegamenti (una volta sola) ----------
function collega() {
  if (avviato) return;
  avviato = true;
  byId("imp-nuovo").addEventListener("submit", aggiungi);
  byId("imp-esporta").addEventListener("click", esporta);
}
