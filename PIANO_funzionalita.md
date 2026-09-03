# Piattaforma Produzione Overland — Piano funzionalità, sotto-progetto 1 (Ciclo bobina)

> Indice delle fasi per la skill `fase-produzione`. Ogni fase si implementa da sola, lascia
> l'app usabile, e ha un risultato che il committente può verificare senza leggere codice.
> Il disegno completo è in `docs/superpowers/specs/2026-09-03-ciclo-bobina-design.md`
> (APPROVATO il 2026-09-03 dopo quattro giri di revisione indipendente). In caso di dubbio
> vale lo spec; se una voce qui contraddice lo spec, fermarsi e dirlo.

## §1 Regole che valgono in ogni fase

- **Solo la fase richiesta**, così com'è scritta. Niente aggiunte, niente fasi successive.
- Stack: HTML/CSS/JS statico con moduli ES nativi, nessun bundler, `supabase-js` da CDN con
  SRI pinnato; Supabase (Postgres, PostgREST, Auth, Realtime); repo privato GitHub + Pages.
- **Le regole di dominio vivono in Postgres** (vincoli, trigger, RPC, viste). Il front-end
  mostra e invia. Le uniche regole duplicate in `js/comune.js` sono quelle dichiarate nello
  spec §2.6/§3.7 (`fuoriRange`, `codiciFigli`, `bilancioChiusura`) e sono coperte dal test di
  coerenza.
- Codice, commenti, identificatori, messaggi d'errore e UI **in italiano**.
- **Una schermata, un file.** Funzioni pure in `js/comune.js` con test in `tests/`.
- Migrazioni in `sql/` come file numerati con verifiche preliminari e finali; backup via
  connettore prima di ogni migrazione; nessuno staging.
- Ogni fase chiude con `STATO_<data>.md` (`FASE N: CHIUSA`) e `RAPPORTO_fase-N.md` in italiano.
- Fermata obbligatoria dopo la Fase 4: Addestramento e Pilota (spec §6) prima di qualunque
  sotto-progetto successivo.

## §2 Decisioni prese (dal committente, 2026-09-03)

| Tema | Decisione |
|---|---|
| ERP Nastri | accantonato; nessun riuso di codice o DB |
| Hosting | repo privato + GitHub Pages (GitHub Pro) |
| Progetto Supabase | nuovo e dedicato: `Overland Produzione`, eu-central-1 |
| Tablet e Wi-Fi | esistono già; niente offline |
| Pesi del grezzo | con imballo (> 0), imballo (≥ 0), tubolare (≥ 0, **null nel caso C**) |
| Pesi dei rotoli finiti | tre pesi: lordo, tubolare, netto |
| Residuo del caso C | stimato in kg dal contametri, netto senza tubolare, confermato dall'operatore, correggibile dall'ufficio finché `grezzo` |
| Tolleranza micron | ±10 % del valore previsto (costante nella vista) |
| Gloss | limiti ⊥ ≥ 40 / ∥ ≥ 60 solo per schede `satinato` |
| Riservatezza | fornitore e riferimento bolla nascosti al reparto (vista `rotoli_grezzi_reparto`) |
| Fornitore sulla Scheda Rotolo lavorato | sì → **tutte le stampe dall'ufficio**, nessuna dal tablet |
| Numerazione proposta | massimo `lettera+cifre` mai usato + 1 |
| Promemoria controllo | solo colore sul banner, 20 min |
| Storico correzioni | no; bastano `modificato_da/il` da trigger |
| Capoturno | distinzione del solo front-end |
| Rotoli di collaudo | dieci, `COLLAUDO-0001…0010`, nascosti in ufficio per default |

## §3 Le fasi

### Fase 0 — Fondamenta
Piano dettagliato: `docs/superpowers/plans/2026-09-03-fase-0-fondamenta.md`.
1. Struttura del repo, `.gitignore`, `.claude/launch.json`, `CLAUDE.md`.
2. `js/comune.js`: costanti e funzioni pure `metriDaKg`, `kgDaMetri`, `codiciFigli`,
   `prossimoNProg`, `fuoriRange`, `annotazioniDaEventi`, `residuoProposto`,
   `bilancioChiusura`, con `tests/test-comune.mjs`.
3. Progetto Supabase `Overland Produzione`; `sql/000_setup.sql` in cinque sezioni (a: ruoli,
   helper, trigger `imposta_modificato`, anagrafiche, `rotoli_grezzi` + vista reparto;
   b: `pianificazione`, `lavorazioni`, `rotoli_lavorati`, `controlli`, `eventi` + trigger dei
   fermi; c: viste `lavorazioni_riepilogo`, `controlli_scostamenti`; d: helper interni e RPC
   `avvia_lavorazione`, `chiudi_lavorazione`, `annulla_lavorazione`,
   `registra_lavorazione_completa`; e: RLS, grant per colonna, realtime).
4. `sql/seed_difetti.sql`, `sql/seed_collaudo.sql`.
5. `sql/test_regole.sql` verde, eseguito come `authenticated` con claims impostati.
6. `js/db.js` (client, `salva()`), `index.html` con login e "connesso come ufficio / reparto",
   `css/base.css`, `tests/test-dom-ids.mjs`.
7. Repo privato GitHub, Pages attivo, due utenti Auth (`ufficio`, `reparto`) mappati in
   `utenti_app`.
**Risultato verificabile:** `test_regole.sql` passa; l'app pubblicata mostra il login e, dopo il
login, "Connesso come ufficio" o "Connesso come reparto".
**Guardie:** nessuna tabella fuori spec §2; nessuna policy senza grant per colonna dove lo spec
li prevede (§5.3); nessuna funzione senza `set search_path = public`; `metri_stimati` con la
formula per esteso; due trigger distinti sugli eventi.

### Fase 1 — Magazzino e pianificazione (ufficio)
1. `ufficio.html` con shell a tab, login, logout, filtro "mostra collaudo".
2. Tab **Magazzino grezzi**: tabella (`rotoli_grezzi`, default `grezzo`+`in_lavorazione`),
   "Nuovo rotolo" con `n_prog` proposto da `prossimoNProg`, modifica solo se `grezzo`
   (anagrafica + `kg_residui`), autocompletamento cliente/fornitore dai valori usati.
3. **Stampa scheda grezzo**: `stampa.html?tipo=grezzo&n_prog=` con "Lavorazione: ______"
   vuota, anagrafica con fornitore e bolla, tabella "Già lavorato da questo rotolo" se ci sono
   figli, `kg_residui` e `metri_stimati` in fondo. `css/stampa.css` A4.
4. Tab **Pianificazione**: settimana ← →, grezzi disponibili a sinistra, sequenza a destra,
   scheda prevista da elenco compatibile per spessore/larghezza, suddivisione e nota, ▲▼,
   righe già lavorate barrate (`exists` su `lavorazioni`).
5. Tab **Impostazioni**: `operatori` (aggiungi, rinomina, ruolo, attivo); "Esporta tutto"
   (un JSON per tabella).
**Risultato verificabile:** l'ufficio inserisce i grezzi della settimana, li stampa e compone
il programma; il file JSON di backup si scarica.
**Guardie:** nessuna scrittura diretta su `stato`/`kg_residui` fuori dalla policy; nessuna
stampa dal tablet; `n_prog` proposto ignora i `COLLAUDO-*`.

### Fase 2 — Avvio da tablet
1. `tools/importa_schede.py` → `sql/seed_schede.sql` dalle ~60 righe di
   `Desktop/Schede di lavorazione/Schede Impianto 1500.xlsx` (regole spec §2.1); applicazione.
2. `reparto.html` con shell tablet (≥ 56 px, ≥ 18 px, 1024×768), scelta operatore
   (`localStorage`), indicatore "Salvato ✓ / In attesa di rete".
3. **Hub** linea libera: "Avvia rotolo" + "In programma questa settimana" (join su
   `rotoli_grezzi_reparto`); hub lavorazione in corso: banner con soglia 20 min, tasti
   Controllo/Evento/Chiudi (disabilitati fino alle fasi 3-4 con la scritta "dalla prossima
   fase"), "Altro… → Annulla avvio" con motivo e metri consumati → `annulla_lavorazione`.
4. **Avvia rotolo** in tre schermate (spec §3.4) → `avvia_lavorazione`.
5. Tab **Live** in `ufficio.html`, sola lettura, realtime: riquadro linea con rotolo, scheda,
   operatore, avvio.
**Risultato verificabile:** le ~60 schede sono in tabella e tre a campione coincidono con
l'Excel; l'operatore avvia e annulla un rotolo di collaudo; l'ufficio lo vede in Live entro
un secondo.
**Guardie:** il tablet non interroga mai `rotoli_grezzi`; nessuna logica di stato nel
front-end; niente `<select>` per elenchi ≤ 8 voci.

### Fase 3 — Controlli ed eventi
1. **Controllo** (spec §3.5): momento proposto, campi per zona, placeholder dal precedente,
   colore immediato con `fuoriRange` (gloss solo se scheda satinata).
2. **Evento** (spec §3.6): sette tipi; difetto con catalogo e causa/azione; fermo con causa;
   aggiunta con prodotto e litri; giunta/taglio film e primi metri con contametri; nota.
3. **Fermo / Ripartenza** dall'hub: fermo aperto nel banner; ripartenza con `metri_scarto`
   proposti 100 e testo del manuale; `fermo_id`.
4. **Capoturno**: "Ultimi controlli" con correzione (solo front-end).
5. Live: ultimo controllo con fuori range in rosso (da `controlli_scostamenti`), fermo aperto,
   nastro cronologico della giornata.
**Risultato verificabile:** un turno intero si registra dal tablet sul rotolo di collaudo; gli
scostamenti compaiono in rosso in Live; un fermo chiuso ha la durata calcolata.
**Guardie:** `durata_min` mai scritta dal client; insert del reparto respinto su lavorazione
chiusa; colori del tablet coincidenti con la vista (test di coerenza).

### Fase 4 — Chiusura e stampe
1. **Chiudi rotolo** in tre schermate (spec §3.7): residuo sì/no per primo; `residuoProposto`;
   `bilancioChiusura`; `annotazioniDaEventi`; avviso non bloccante su metà/fine; conferma →
   `chiudi_lavorazione`; messaggio "le schede si stampano dall'ufficio".
2. `stampa.html?tipo=rotolo&codice=` (con fornitore, tre pesi, nessun parametro di processo) e
   `tipo=produzione&id=` (snapshot parametri, controlli con scostamenti, eventi, figli,
   scarto/eccedenza).
3. Live: **Ultime chiusure** (7 giorni, non stampate in cima) con tasto Stampa che scrive
   `stampata_il`.
4. Tab **Lavorazioni**: lista con filtri, dettaglio = Scheda di Produzione digitale
   (`lavorazioni_riepilogo`), correzioni d'ufficio a controlli/eventi/pesi, **"Registra
   lavorazione già avvenuta"** → `registra_lavorazione_completa`, Esporta Excel.
5. Tab **Rotoli lavorati**: tabella, filtri, correzioni, Stampa Scheda Rotolo, Esporta Excel.
**Risultato verificabile:** ciclo completo A, B e C sul collaudo, con il secondo giro del caso C
che genera `/B`; le tre stampe confrontate con le schede cartacee; una lavorazione registrata
a posteriori mentre un'altra è aperta in linea.
**Guardie:** `kg_scarto` mai memorizzato; nessuna stampa dal tablet; il `check` del caso C
regge a un update diretto dell'ufficio.

### Addestramento e Pilota
Non sono fasi di codice: vedi spec §6 e §7. La skill si ferma dopo la Fase 4 e lo scrive nel
rapporto.

## §4 Annotazioni del revisore (giro 4) da recepire nel piano
1. `kg_residui_dichiarati not null default 0` (recepito nello spec).
2. Il valore vero di `durata_min` lo produce solo il trigger sul fermo; il trigger sulla
   ripartenza si limita a toccare la riga (commento nel SQL).
3. Le `note` di una lavorazione annullata non sono scrivibili (policy `stato = 'chiusa'`):
   il posto è `motivo_annullo`.
4. I metri di un annullo e i `metri_scarto` delle ripartenze possono riferirsi allo stesso
   nastro: il sotto-progetto 2 ne sceglie una sola fonte per il KPI.
5. Il residuo del caso C resta ancorato al peso di bolla: da tarare sui primi casi C del pilota.
