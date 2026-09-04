// ============================================================
// live.js — tab Live (spec §4.3, PIANO Fase 2 voce 5 e Fase 3 voce 5). SOLA LETTURA: nessun
// tasto che scriva. Riquadro della linea, ultimo controllo con i fuori riferimento in rosso,
// fermo aperto, nastro cronologico della giornata.
// Il giudizio sui fuori riferimento è della vista `controlli_scostamenti`: qui si colora e basta.
// "Ultime chiusure" arriva con la Fase 4.
// Realtime su `lavorazioni`, `controlli` ed `eventi`, già in publication dalla Fase 0 (spec §2.8).
// ============================================================
import { byId, sb } from "../db.js";
import {
  formattaNumero, oraItaliana, dataBreveItaliana, minutiDa, inizioGiornata,
  fermoAperto, descrizioneEvento, elencoFuori, CAMPI_CONTROLLO, MOMENTI, CAUSE_FERMO,
} from "../comune.js";

let canale = null;
let coda = Promise.resolve();   // le aperture del tab si mettono in fila, non si sovrappongono

// L'interruttore "Mostra rotoli di collaudo" NON vale qui: la linea è una sola e ciò che ci gira
// sopra va visto sempre, anche in collaudo (come l'esportazione e la proposta di n_prog).
//
// Le chiamate si SERIALIZZANO: la shell può chiamare mostra() due volte di fila (al caricamento
// aggiorna() parte una volta da sola e una da onAuthStateChange), e due esecuzioni sovrapposte
// aprirebbero due canali in tempo reale con lo stesso nome.
export function mostra() {
  coda = coda.then(disegna).then(ascolta).catch((e) => console.error(e));
  return coda;
}

function riga(etichetta, valore, classe = "") {
  const tr = document.createElement("tr");
  const th = document.createElement("th");
  th.textContent = etichetta;
  const td = document.createElement("td");
  td.textContent = valore ?? "—";
  if (classe) td.className = classe;
  tr.append(th, td);
  return tr;
}

async function disegna() {
  const corpo = byId("live-riquadro-corpo");
  const titolo = byId("live-riquadro-titolo");

  const aperta = await sb.from("lavorazioni").select("*")
    .eq("stato", "aperta").eq("linea", "1500").maybeSingle();
  if (aperta.error) return servizio("Non riesco a leggere la linea. Riprova o ricarica la pagina.", "errore");

  if (!aperta.data) {
    titolo.textContent = "Linea 1500 libera";
    byId("live-riquadro").className = "riquadro-linea libera";
    corpo.textContent = "";
    svuotaLavorazione();
    await disegnaNastro();
    return servizio();
  }
  const lav = aperta.data;

  // Quattro letture distinte invece di un select annidato: lavorazioni ha DUE chiavi esterne
  // verso operatori (avvio e chiusura) e l'annidamento andrebbe disambiguato a mano.
  const [grezzo, scheda, operatore] = await Promise.all([
    sb.from("rotoli_grezzi").select("n_prog, cliente, lega, finitura, spessore_mm, larghezza_mm, kg_residui")
      .eq("id", lav.rotolo_grezzo_id).maybeSingle(),
    sb.from("schede_lavorazione").select("lavorazione, micron, tipo").eq("id", lav.scheda_lavorazione_id).maybeSingle(),
    sb.from("operatori").select("nome").eq("id", lav.operatore_avvio_id).maybeSingle(),
  ]);
  if (grezzo.error || scheda.error || operatore.error) {
    return servizio("Non riesco a leggere la lavorazione in corso.", "errore");
  }

  titolo.textContent = `Linea 1500 — in lavorazione`;
  byId("live-riquadro").className = "riquadro-linea in-corso";
  corpo.textContent = "";
  const oggi = new Date().toDateString() === new Date(lav.avviata_il).toDateString();
  corpo.append(
    riga("Rotolo", grezzo.data?.n_prog),
    riga("Misure", grezzo.data
      ? `${formattaNumero(grezzo.data.larghezza_mm)} × ${formattaNumero(grezzo.data.spessore_mm, 2)} mm`
      + (grezzo.data.lega ? ` · ${grezzo.data.lega}` : "") : null),
    riga("Cliente", grezzo.data?.cliente),
    riga("Scheda", scheda.data?.lavorazione),
    riga("Operatore", operatore.data?.nome),
    riga("Avviato", oggi ? oraItaliana(lav.avviata_il)
      : `${oraItaliana(lav.avviata_il)} del ${dataBreveItaliana(lav.avviata_il)}`),
    riga("Peso con imballo", `${formattaNumero(lav.peso_con_imballo_kg)} kg`),
    riga("Contametri iniziale", formattaNumero(lav.contametri_inizio)),
  );

  await Promise.all([disegnaUltimoControllo(lav), disegnaFermo(lav)]);
  await disegnaNastro();
  servizio();
}

function svuotaLavorazione() {
  byId("live-ultimo").hidden = true;
  byId("live-fermo").hidden = true;
}

// ---------- Ultimo controllo, con i fuori riferimento in rosso ----------
async function disegnaUltimoControllo(lav) {
  const corpo = byId("live-ultimo-corpo");
  corpo.textContent = "";
  const r = await sb.from("controlli_scostamenti").select("*")
    .eq("lavorazione_id", lav.id).order("rilevato_il", { ascending: false }).limit(1).maybeSingle();
  if (r.error) { byId("live-ultimo").hidden = true; return; }

  byId("live-ultimo").hidden = false;
  byId("live-ultimo-vuoto").hidden = !!r.data;
  if (!r.data) return;

  const c = r.data;
  const minuti = minutiDa(c.rilevato_il);
  corpo.append(riga("Rilevato", `${oraItaliana(c.rilevato_il)}`
    + (minuti != null ? ` · ${formattaNumero(minuti)} min fa` : "")
    + ` · ${MOMENTI[c.momento] ?? c.momento}`));
  for (const campo of CAMPI_CONTROLLO) {
    if (c[campo.campo] == null) continue;
    const fuori = campo.fuori ? c[campo.fuori] === true : false;
    corpo.append(riga(campo.etichetta,
      `${formattaNumero(c[campo.campo], 1)}${campo.unita ? " " + campo.unita : ""}`,
      fuori ? "fuori" : ""));
  }
  if (c.note) corpo.append(riga("Note", c.note));
}

// ---------- Fermo aperto ----------
async function disegnaFermo(lav) {
  const box = byId("live-fermo");
  const r = await sb.from("eventi").select("*").eq("lavorazione_id", lav.id).order("avvenuto_il");
  if (r.error) { box.hidden = true; return; }
  const fermo = fermoAperto(r.data);
  if (!fermo) { box.hidden = true; return; }
  const da = minutiDa(fermo.avvenuto_il);
  box.textContent = `FERMO da ${da != null ? formattaNumero(da) : "?"} min · `
    + `${CAUSE_FERMO[fermo.causa_fermo] ?? "causa non indicata"} · dalle ${oraItaliana(fermo.avvenuto_il)}`;
  box.hidden = false;
}

// ---------- Nastro cronologico della giornata ----------
// Comprende anche ciò che è successo su lavorazioni già chiuse o annullate oggi: è il registro
// del giorno, non della lavorazione. Il confine del giorno è la mezzanotte LOCALE (inizioGiornata):
// ricavarlo dal testo di un timestamp darebbe il giorno UTC, cioè le prime ore nel giorno prima.
async function disegnaNastro() {
  const contenitore = byId("live-nastro");
  contenitore.textContent = "";
  const da = inizioGiornata().toISOString();

  // Niente .range(): la regola di CLAUDE.md vale per le letture che devono essere COMPLETE
  // (l'esportazione). Qui è una giornata sola di una linea sola, molto sotto le 1000 righe con
  // cui PostgREST tronca; se un giorno le superasse, si vedrebbero le prime 1000 del giorno.
  const [controlli, eventi, operatori, difetti] = await Promise.all([
    sb.from("controlli_scostamenti").select("*").gte("rilevato_il", da),
    sb.from("eventi").select("*").gte("avvenuto_il", da),
    sb.from("operatori").select("id, nome"),
    sb.from("tipi_difetto").select("id, nome"),
  ]);
  if (controlli.error || eventi.error || operatori.error || difetti.error) {
    byId("live-nastro-vuoto").hidden = false;
    byId("live-nastro-vuoto").textContent = "Non riesco a leggere quello che è successo oggi.";
    return;
  }
  const nomeOperatore = new Map(operatori.data.map((o) => [o.id, o.nome]));
  const nomeDifetto = new Map(difetti.data.map((d) => [d.id, d.nome]));

  const voci = [
    ...controlli.data.map((c) => ({
      quando: c.rilevato_il,
      operatore: nomeOperatore.get(c.operatore_id),
      testo: `Controllo ${MOMENTI[c.momento] ?? c.momento}`
        + (c.contametri != null ? ` a ${formattaNumero(c.contametri)} m` : ""),
      fuori: elencoFuori(c),
    })),
    ...eventi.data.map((e) => ({
      quando: e.avvenuto_il,
      operatore: nomeOperatore.get(e.operatore_id),
      testo: descrizioneEvento({ ...e, tipo_difetto_nome: nomeDifetto.get(e.tipo_difetto_id) }),
      fuori: [],
    })),
  ].sort((a, b) => new Date(b.quando) - new Date(a.quando));

  byId("live-nastro-vuoto").hidden = voci.length > 0;
  for (const v of voci) {
    const p = document.createElement("p");
    p.className = "voce-nastro" + (v.fuori.length > 0 ? " fuori" : "");
    const ora = document.createElement("strong");
    ora.textContent = oraItaliana(v.quando);
    const testo = document.createElement("span");
    testo.textContent = ` ${v.testo}`
      + (v.fuori.length > 0 ? ` · fuori: ${v.fuori.join(", ")}` : "")
      + (v.operatore ? ` · ${v.operatore}` : "");
    p.append(ora, testo);
    contenitore.append(p);
  }
}

// La riga di servizio dice quando si è aggiornato e se il collegamento in tempo reale regge:
// senza, un realtime caduto lascerebbe un riquadro fermo che sembra aggiornato.
function servizio(errore = null, classe = "") {
  const campo = byId("live-servizio");
  if (errore) {
    campo.textContent = errore;
    campo.className = "esito " + classe;
    return;
  }
  const collegato = canale?.state === "joined";
  campo.textContent = `Aggiornato alle ${oraItaliana(new Date())} · `
    + (collegato ? "in ascolto" : "collegamento in corso…");
  campo.className = "esito";
}

async function ascolta() {
  // Si ASPETTA la chiusura del canale precedente: aprirne un altro con lo stesso nome mentre
  // il primo sta ancora uscendo lascerebbe due iscrizioni, o farebbe cadere quella nuova.
  if (canale) { await sb.removeChannel(canale); canale = null; }
  canale = sb.channel("live-linea");
  // Anche i ridisegni del tempo reale passano dalla CODA: tre tabelle in ascolto vogliono dire
  // più notifiche ravvicinate, e due disegna() sovrapposte svuoterebbero e riempirebbero
  // gli stessi elenchi a metà l'una dell'altra.
  for (const tabella of ["lavorazioni", "controlli", "eventi"]) {
    canale.on("postgres_changes", { event: "*", schema: "public", table: tabella },
      () => { coda = coda.then(disegna).catch((e) => console.error(e)); });
  }
  canale.subscribe((stato) => {
    if (stato === "SUBSCRIBED") servizio();
    if (stato === "CHANNEL_ERROR" || stato === "TIMED_OUT") {
      servizio("Collegamento in tempo reale interrotto: ricarica la pagina.", "errore");
    }
  });
}
