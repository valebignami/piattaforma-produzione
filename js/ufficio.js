// ============================================================
// ufficio.js — la shell della vista ufficio: sessione, ruolo, tab, interruttore collaudo.
// Ogni tab è un modulo con una sola funzione mostra(ctx). Una schermata, un file.
// ============================================================
import { byId, sb, ruoloCorrente, login, logout } from "./db.js";
import * as magazzino from "./ufficio/magazzino.js";
import * as pianificazione from "./ufficio/pianificazione.js";
import * as impostazioni from "./ufficio/impostazioni.js";

// L'interruttore dei rotoli di collaudo vale per l'elenco del magazzino e per i grezzi
// disponibili della pianificazione. NON per la proposta del numero progressivo, per la sequenza
// della settimana e per l'esportazione: lì servono tutti i rotoli (spec §4, §5.4).
const ctx = { mostraCollaudo: false };

const TAB = [
  { voce: "uff-tab-magazzino",      pannello: "uff-pan-magazzino",      modulo: magazzino },
  { voce: "uff-tab-pianificazione", pannello: "uff-pan-pianificazione", modulo: pianificazione },
  { voce: "uff-tab-impostazioni",   pannello: "uff-pan-impostazioni",   modulo: impostazioni },
];
let tabAttivo = TAB[0];

function apriTab(tab) {
  tabAttivo = tab;
  for (const t of TAB) {
    byId(t.voce).setAttribute("aria-selected", String(t === tab));
    byId(t.pannello).hidden = t !== tab;
  }
  tab.modulo.mostra(ctx);
}

// Tre stati della pagina: login, ruolo sbagliato, applicazione.
// Il tab si ridisegna solo quando lo stato cambia davvero: onAuthStateChange scatta anche al
// rinnovo del gettone (circa ogni ora), e un ridisegno a metà digitazione perderebbe il testo.
let statoPrecedente = null;
async function aggiorna() {
  const { data: { session } } = await sb.auth.getSession();
  const ruolo = session ? await ruoloCorrente() : null;
  const dentro = ruolo === "ufficio";
  byId("uff-login").hidden = !!session;
  byId("uff-negato").hidden = !session || dentro;
  byId("uff-app").hidden = !dentro;
  const stato = `${session?.user?.id ?? "—"}/${ruolo ?? "—"}`;
  if (dentro && stato !== statoPrecedente) apriTab(tabAttivo);
  statoPrecedente = stato;
}

byId("uff-form-login").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  byId("uff-entra").disabled = true;
  byId("uff-messaggio").textContent = "";
  const errore = await login(byId("uff-email").value.trim(), byId("uff-password").value);
  byId("uff-entra").disabled = false;
  if (errore) byId("uff-messaggio").textContent = errore;
  await aggiorna();
});

for (const tasto of ["uff-esci", "uff-negato-esci"]) {
  byId(tasto).addEventListener("click", async () => { await logout(); await aggiorna(); });
}
for (const t of TAB) byId(t.voce).addEventListener("click", () => apriTab(t));

byId("uff-collaudo").addEventListener("change", (ev) => {
  ctx.mostraCollaudo = ev.target.checked;
  tabAttivo.modulo.mostra(ctx);
});

sb.auth.onAuthStateChange(() => aggiorna());
aggiorna();
