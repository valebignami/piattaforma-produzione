// ============================================================
// stampa.js — pagine di stampa (spec §4.7). In questa fase solo tipo=grezzo: le Schede Rotolo
// e le Schede di Produzione arrivano con la Fase 4.
// Tutte le stampe si fanno dall'ufficio (decisione del committente, spec §8): nessuna dal tablet.
// ============================================================
import { byId, sb, ruoloCorrente, login } from "./db.js";
import { formattaNumero } from "./comune.js";

const parametri = new URLSearchParams(location.search);
const tipo = parametri.get("tipo");
const nProg = parametri.get("n_prog");

function errore(testo) {
  byId("stampa-errore").textContent = testo;
}

async function aggiorna() {
  const { data: { session } } = await sb.auth.getSession();
  const ruolo = session ? await ruoloCorrente() : null;
  const dentro = ruolo === "ufficio";
  byId("stampa-login").hidden = !!session;
  byId("stampa-negato").hidden = !session || dentro;
  byId("stampa-contenuto").hidden = !dentro;
  if (dentro) await disegna();
}

async function disegna() {
  if (tipo !== "grezzo") return errore("Questo tipo di stampa arriva con una fase successiva.");
  if (!nProg) return errore("Manca il numero del rotolo da stampare.");

  const { data: grezzo, error } = await sb.from("rotoli_grezzi").select("*").eq("n_prog", nProg).maybeSingle();
  if (error) return errore("Non riesco a leggere il rotolo. Riprova o avvisa chi gestisce l'app.");
  if (!grezzo) return errore("Nessun rotolo con questo numero.");
  errore("");

  document.title = `Scheda grezzo ${grezzo.n_prog}`;
  byId("stampa-n-prog").textContent = grezzo.n_prog;

  // Anagrafica CON fornitore e riferimento bolla: è una stampa d'ufficio (spec §4.7).
  righe("stampa-anagrafica", [
    ["Fornitore", grezzo.fornitore],
    ["Riferimento bolla", grezzo.rif_bolla],
    ["Cliente", grezzo.cliente],
    ["Lega", grezzo.lega],
    ["Finitura", grezzo.finitura],
    ["Spessore", grezzo.spessore_mm == null ? null : `${formattaNumero(grezzo.spessore_mm, 2)} mm`],
    ["Larghezza", grezzo.larghezza_mm == null ? null : `${formattaNumero(grezzo.larghezza_mm)} mm`],
    ["Peso di bolla", `${formattaNumero(grezzo.peso_bolla_kg)} kg`],
    ["Data di arrivo", grezzo.data_arrivo],
    ["Posizione", grezzo.posizione],
    ["Note", grezzo.note],
  ]);

  // I figli già ricavati da questo rotolo. Una sola FK per salto: PostgREST non è ambiguo.
  const figli = await sb.from("rotoli_lavorati")
    .select("codice, peso_netto_kg, lavorazioni(chiusa_il, schede_lavorazione(lavorazione))")
    .eq("rotolo_grezzo_id", grezzo.id).order("codice");
  if (figli.error) return errore("Non riesco a leggere i rotoli già lavorati da questo grezzo.");
  byId("stampa-figli").hidden = figli.data.length === 0;
  const corpo = byId("stampa-figli-corpo");
  corpo.textContent = "";
  for (const f of figli.data) {
    const tr = document.createElement("tr");
    // Le schede di lavorazione si caricano con la Fase 2: fino ad allora la colonna resta "—".
    tr.append(
      cella(f.codice),
      cella(f.lavorazioni?.schede_lavorazione?.lavorazione ?? "—"),
      cella(`${formattaNumero(f.peso_netto_kg)} kg`, "num"),
      cella((f.lavorazioni?.chiusa_il ?? "").slice(0, 10) || "—"),
    );
    corpo.append(tr);
  }

  righe("stampa-residuo", [
    ["Kg residui", grezzo.kg_residui == null ? "mai lavorato" : `${formattaNumero(grezzo.kg_residui)} kg`],
    ["Metri stimati", `${formattaNumero(grezzo.metri_stimati)} m`],
    ["Stato", { grezzo: "a magazzino", in_lavorazione: "in linea", esaurito: "esaurito" }[grezzo.stato]],
  ]);
}

function cella(testo, classe) {
  const td = document.createElement("td");
  td.textContent = testo;
  if (classe) td.className = classe;
  return td;
}

// Le voci senza valore non si stampano: il foglio va in cartelletta, non deve avere righe vuote.
function righe(id, voci) {
  const corpo = byId(id);
  corpo.textContent = "";
  for (const [etichetta, valore] of voci) {
    if (valore == null || valore === "") continue;
    const tr = document.createElement("tr");
    const th = document.createElement("th");
    th.textContent = etichetta;
    tr.append(th, cella(valore));
    corpo.append(tr);
  }
}

byId("stampa-form-login").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  byId("stampa-entra").disabled = true;
  byId("stampa-messaggio").textContent = "";
  const err = await login(byId("stampa-email").value.trim(), byId("stampa-password").value);
  byId("stampa-entra").disabled = false;
  if (err) byId("stampa-messaggio").textContent = err;
  await aggiorna();
});
byId("stampa-avvia").addEventListener("click", () => window.print());

sb.auth.onAuthStateChange(() => aggiorna());
aggiorna();
