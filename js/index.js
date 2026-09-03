import { byId, sb, ruoloCorrente, login, logout } from "./db.js";

async function aggiorna() {
  const { data: { session } } = await sb.auth.getSession();
  const ruolo = session ? await ruoloCorrente() : null;
  byId("form-login").hidden = !!session;
  byId("connesso").hidden = !session;
  if (session) {
    byId("ruolo").textContent = ruolo ? `Connesso come ${ruolo}` : "Connesso, ma senza ruolo: avvisa chi gestisce l'app";
  }
}

byId("form-login").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  byId("btn-login").disabled = true;
  byId("messaggio").textContent = "";
  const errore = await login(byId("email").value.trim(), byId("password").value);
  byId("btn-login").disabled = false;
  if (errore) byId("messaggio").textContent = errore;
  await aggiorna();
});
byId("btn-logout").addEventListener("click", async () => { await logout(); await aggiorna(); });
sb.auth.onAuthStateChange(() => aggiorna());
aggiorna();
