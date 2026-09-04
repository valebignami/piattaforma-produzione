// ============================================================
// ultimi.js — "Ultimi controlli" del capoturno (spec §3.8, PIANO Fase 3 voce 4).
// Elenca gli ultimi controlli della lavorazione aperta e ne apre uno in correzione.
// Il capoturno è una distinzione del SOLO FRONT-END (spec §2.9): il database non lo conosce,
// e la policy lascia correggere a chiunque sia del reparto finché la lavorazione è aperta.
// Chi è fuori range lo dice la vista controlli_scostamenti, non il browser.
// ============================================================
import { byId, sb } from "../db.js";
import { MOMENTI, elencoFuori, oraItaliana, formattaNumero } from "../comune.js";
import * as controllo from "./controllo.js";

const QUANTI = 8;   // elenchi fino a otto voci, come bottoni (spec §3.1)

let contesto = null;

function esito(testo, classe = "") {
  byId("rep-ultimi-esito").textContent = testo;
  byId("rep-ultimi-esito").className = "esito " + classe;
}

export async function mostra(ctx) {
  contesto = ctx;
  const contenitore = byId("rep-ultimi-elenco");
  contenitore.textContent = "";
  byId("rep-ultimi-vuoto").hidden = true;
  esito("Carico…");

  const aperta = await sb.from("lavorazioni").select("id")
    .eq("stato", "aperta").eq("linea", "1500").maybeSingle();
  if (aperta.error) return esito("Non riesco a leggere la linea. Riprova.", "errore");
  if (!aperta.data) return esito("Nessuna lavorazione aperta sulla linea.", "errore");

  const righe = await sb.from("controlli_scostamenti").select("*")
    .eq("lavorazione_id", aperta.data.id)
    .order("rilevato_il", { ascending: false }).limit(QUANTI);
  if (righe.error) return esito("Non riesco a leggere i controlli. Riprova.", "errore");

  if (righe.data.length === 0) {
    byId("rep-ultimi-vuoto").hidden = false;
    return esito("");
  }

  for (const riga of righe.data) contenitore.append(bottone(riga));
  esito("");
}

function bottone(riga) {
  const tasto = document.createElement("button");
  tasto.type = "button";

  const titolo = document.createElement("span");
  titolo.className = "titolo";
  titolo.textContent = `${MOMENTI[riga.momento] ?? riga.momento} · ${oraItaliana(riga.rilevato_il)}`;

  const dettaglio = document.createElement("span");
  dettaglio.className = "dettaglio";
  const fuori = elencoFuori(riga);
  const pezzi = [];
  if (riga.contametri != null) pezzi.push(`${formattaNumero(riga.contametri)} m`);
  pezzi.push(fuori.length === 0 ? "tutto in riferimento" : `fuori: ${fuori.join(", ")}`);
  dettaglio.textContent = pezzi.join(" · ");
  if (fuori.length > 0) tasto.classList.add("fuori");

  tasto.append(titolo, dettaglio);
  tasto.addEventListener("click", () => {
    controllo.preparaCorrezione(riga);
    contesto.vaiA("controllo", "ultimi");
  });
  return tasto;
}
