// ============================================================
// live.js — tab Live (spec §4.3, PIANO Fase 2 voce 5). SOLA LETTURA: nessun tasto che scriva.
// In questa fase c'è il riquadro della linea: rotolo, scheda, operatore, avvio. Scostamenti,
// nastro cronologico, fermo aperto e "Ultime chiusure" arrivano con le Fasi 3 e 4.
// Realtime su `lavorazioni`, già in publication dalla Fase 0 (spec §2.8).
// ============================================================
import { byId, sb } from "../db.js";
import { formattaNumero, oraItaliana, dataBreveItaliana } from "../comune.js";

let canale = null;

// L'interruttore "Mostra rotoli di collaudo" NON vale qui: la linea è una sola e ciò che ci gira
// sopra va visto sempre, anche in collaudo (come l'esportazione e la proposta di n_prog).
export async function mostra() {
  await disegna();
  ascolta();
}

function riga(etichetta, valore) {
  const tr = document.createElement("tr");
  const th = document.createElement("th");
  th.textContent = etichetta;
  const td = document.createElement("td");
  td.textContent = valore ?? "—";
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
  servizio();
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

function ascolta() {
  if (canale) sb.removeChannel(canale);          // uno solo per volta, anche tornando sul tab
  canale = sb.channel("live-lavorazioni")
    .on("postgres_changes", { event: "*", schema: "public", table: "lavorazioni" }, () => disegna())
    .subscribe((stato) => {
      if (stato === "SUBSCRIBED") servizio();
      if (stato === "CHANNEL_ERROR" || stato === "TIMED_OUT") {
        servizio("Collegamento in tempo reale interrotto: ricarica la pagina.", "errore");
      }
    });
}
