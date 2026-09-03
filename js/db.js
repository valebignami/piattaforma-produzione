// ============================================================
// db.js — l'unico file che conosce Supabase. Client, salva(), sessione.
// La libreria è caricata come <script> UMD in ogni pagina (window.supabase), PRIMA del modulo.
// ============================================================
const SUPABASE_URL = "https://nbercxzpjflqfstwrryp.supabase.co";   // ref del progetto Overland Produzione (Task 7)
const SUPABASE_KEY = "sb_publishable_ku0fNfoc62mLCjf6dz08lA_xzToAd94";   // da get_publishable_keys; pubblica per design
export const byId = (id) => document.getElementById(id);

if (!window.supabase?.createClient) {
  document.body.innerHTML = '<main><p class="messaggio">Impossibile caricare la libreria Supabase (CDN bloccato?). Ricarica la pagina.</p></main>';
  throw new Error("supabase-js non disponibile");
}
export const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Ritentativi per gli errori di rete (spec §3.9): 1 s, 3 s, 10 s, poi ogni 30 s.
const ATTESE_MS = [1000, 3000, 10000];
const erroreDiRete = (e) => !e?.code && /fetch|network|rete|Failed/i.test(String(e?.message ?? e));

// salva(fn, { onStato }) — fn è una funzione che ritorna la Promise di supabase-js ({data, error}).
// onStato riceve "attesa" | "salvato" | "errore" per aggiornare l'indicatore.
export async function salva(fn, { onStato = () => {} } = {}) {
  let tentativo = 0;
  for (;;) {
    try {
      const { data, error } = await fn();
      if (!error) { onStato("salvato"); return { ok: true, data }; }
      if (!erroreDiRete(error)) { onStato("errore"); return { ok: false, errore: messaggio(error) }; }
    } catch (e) {
      if (!erroreDiRete(e)) { onStato("errore"); return { ok: false, errore: messaggio(e) }; }
    }
    onStato("attesa");
    await new Promise((r) => setTimeout(r, ATTESE_MS[tentativo] ?? 30000));
    tentativo++;
  }
}

// Gli errori delle RPC arrivano già in italiano (spec §5.5); i vincoli del DB parlano inglese e
// vanno tradotti qui; tutto il resto diventa una frase generica.
function messaggio(e) {
  const m = e?.message ?? String(e);
  if (e?.code === "P0001") return m;                                                      // raise exception nelle RPC (italiano)
  if (e?.code === "23505") return "Questo numero è già stato usato: controlla il numero progressivo.";   // unicità
  if (e?.code === "23514") return "I dati inseriti non rispettano una regola del sistema: controlla pesi e residuo."; // check
  if (e?.code === "42501") return "Operazione non consentita per questa utenza.";          // RLS / grant
  console.error(e);
  return "Qualcosa non ha funzionato, riprova; se continua avvisa l'ufficio.";
}

export async function ruoloCorrente() {
  const { data, error } = await sb.rpc("ruolo_utente");
  return error ? null : data;
}
export async function login(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email, password });
  return error ? "Email o password non corretti" : null;
}
export async function logout() { await sb.auth.signOut(); }
