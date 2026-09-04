// ============================================================
// ripartenza.js — la ripartenza dopo un fermo (spec §3.3, §3.6, PIANO Fase 3 voce 3).
// Si arriva qui dall'hub, dove il tasto rosso diventa "Ripartenza" quando un fermo è aperto.
// È un insert in `eventi` con `fermo_id`: la durata del fermo la calcola il TRIGGER, il client
// non la manda e non ne ha il permesso. Il trigger controlla anche che il fermo sia della stessa
// lavorazione e non successivo alla ripartenza.
// ============================================================
import { byId, sb, salva } from "../db.js";
import { METRI_SCARTO_RIPARTENZA, CAUSE_FERMO, fermoAperto, minutiDa, oraItaliana, formattaNumero } from "../comune.js";

const AVVISO = "Il tratto dalla sgrassatura all'uscita dell'ossido va scartato.";

let contesto = null;
let lav = null;
let fermo = null;
let avviato = false;

function esito(testo, classe = "") {
  byId("rep-rip-esito").textContent = testo;
  byId("rep-rip-esito").className = "esito " + classe;
}

const rete = (ctx) => ({ onStato: (s) => ctx.stato(s) });

export async function mostra(ctx) {
  contesto = ctx;
  collega();
  esito("Carico…");
  byId("rep-rip-avviso").textContent = AVVISO;
  byId("rep-rip-salva").disabled = true;
  fermo = null;

  const aperta = await sb.from("lavorazioni").select("*")
    .eq("stato", "aperta").eq("linea", "1500").maybeSingle();
  if (aperta.error) return esito("Non riesco a leggere la linea. Riprova.", "errore");
  if (!aperta.data) return esito("Nessuna lavorazione aperta sulla linea.", "errore");
  lav = aperta.data;

  const eventi = await sb.from("eventi").select("*").eq("lavorazione_id", lav.id).order("avvenuto_il");
  if (eventi.error) return esito("Non riesco a leggere gli eventi. Riprova.", "errore");
  fermo = fermoAperto(eventi.data);
  if (!fermo) return esito("Non c'è nessun fermo aperto: la linea sta già andando.", "errore");

  const minuti = minutiDa(fermo.avvenuto_il);
  byId("rep-rip-fermo").textContent =
    `Fermo dalle ${oraItaliana(fermo.avvenuto_il)} · ${CAUSE_FERMO[fermo.causa_fermo] ?? "causa non indicata"}`
    + (minuti != null ? ` · ${formattaNumero(minuti)} min` : "");
  byId("rep-rip-metri").value = String(METRI_SCARTO_RIPARTENZA);
  byId("rep-rip-salva").disabled = false;
  esito("");
}

async function conferma() {
  if (!lav || !fermo) return;
  if (!contesto.operatore) return esito("Prima dimmi chi sei: tocca il tuo nome in alto.", "errore");
  const metri = byId("rep-rip-metri").value.trim();

  byId("rep-rip-salva").disabled = true;
  esito("Salvo…");
  const r = await salva(() => sb.from("eventi").insert({
    lavorazione_id: lav.id,                 // la stessa del fermo: il trigger le confronta
    operatore_id: contesto.operatore.id,
    tipo: "ripartenza",
    fermo_id: fermo.id,
    metri_scarto: metri === "" ? null : Number(metri),
  }), rete(contesto));

  byId("rep-rip-salva").disabled = false;
  if (!r.ok) return esito(r.errore, "errore");
  contesto.vaiA("hub");
}

function collega() {
  if (avviato) return;
  avviato = true;
  byId("rep-rip-salva").addEventListener("click", conferma);
}
