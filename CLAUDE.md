# CLAUDE.md — Piattaforma Produzione Overland

## Cos'è
App statica (HTML/CSS/JS, moduli ES) + Supabase per digitalizzare il ciclo bobina della
Linea 1500 di Overland S.r.l. (Mediglia). Spec: `docs/superpowers/specs/2026-09-03-ciclo-bobina-design.md`.
Piano fasi: `PIANO_funzionalita.md`. Stato: l'ultimo `STATO_*.md`. Codice, commenti e UI in italiano.

## Comandi
```bash
node --test tests/                 # funzioni pure + id DOM
python -m http.server 8000         # servire in locale → http://localhost:8000/index.html
```
Nessun bundler, linter o dipendenza npm: `package.json` contiene solo `"type": "module"`.
`supabase-js` arriva da CDN (jsDelivr, file `dist/umd/supabase.js` del pacchetto — non il
`.min.js`, generato al volo — con `integrity` SRI, versione pinnata).

## Dove gira
- Progetto Supabase: `Overland Produzione`, ref `nbercxzpjflqfstwrryp`, eu-central-1
  (URL `https://nbercxzpjflqfstwrryp.supabase.co`). Nessuno staging, nessun branch Supabase.
  Mai scrivere su `tbaagbngpxibllftsgoh` (HR), `cqdmfhdcdvaezmexzxrq` (Scadenziario, in pausa
  dal 2026-09-03 per liberare il posto gratuito), `ftwngogpqxzjmylxziwm` (erp-nastri).
- Repo: https://github.com/valebignami/piattaforma-produzione (pubblico finché GitHub Pro non
  è attivo). Pages: https://valebignami.github.io/piattaforma-produzione/
  Pagine: `/index.html` (login), `/ufficio.html` (ufficio, dalla Fase 1),
  `/stampa.html?tipo=grezzo&n_prog=…` (scheda del grezzo). `index.html` non rimanda a `ufficio.html`.
- Utenti Auth: `ufficio@overland-ocm.it` (ruolo ufficio), `reparto@overland-ocm.it` (ruolo
  reparto), mappati in `utenti_app`. Registrazione libera spenta.
- Backup fuori dal repo: `Desktop\Overland New\12_Progetti e Tecnica\Piattaforma Produzione\Backup app\`.

## Regole operative
- `git push` su `main` = produzione (GitHub Pages). Solo come passo esplicito della skill.
- Le regole di dominio stanno in Postgres: vincoli, trigger, viste, RPC in `sql/`.
  `js/comune.js` contiene solo funzioni pure; le tre duplicate (fuoriRange, codiciFigli,
  bilancioChiusura) sono dichiarate nello spec. Il test di coerenza JS↔DB arriva con la Fase 3
  (spec §5.6 punto 3); fino ad allora `test-comune.mjs` e `test_regole.sql` usano gli stessi
  numeri dell'esempio §2.7.
- `js/db.js` è l'unico file che conosce Supabase (client, `salva()`, sessione). Nel front-end
  va SOLO la chiave publishable; la chiave `service_role` non deve mai comparire.
- Mai rieseguire una sezione di `000_setup.sql` (ogni sezione ha la guardia): le correzioni
  sono migrazioni nuove `sql/NNN_<data>_<voce>.sql` (la prima è la 003). Backup via connettore
  prima di ogni migrazione.
- `modificato_da/il` e `durata_min` le scrive il DB: mai dal client.
- `rotoli_grezzi` non è leggibile dal reparto: il tablet usa la vista `rotoli_grezzi_reparto`
  (senza `fornitore` e `rif_bolla`). Nessuna stampa dal tablet.
- Le `note` di una lavorazione si scrivono solo su lavorazioni `chiuse`; per le annullate il
  posto è `motivo_annullo`.
- Le date: mai `toISOString()` né `slice(0,10)` su un timestamp — darebbero il giorno UTC, cioè
  il giorno prima per tutto ciò che accade dopo le 22. Si usano `dataBreveItaliana`,
  `dataLungaItaliana`, `lunediDellaSettimana`, `settimanaSpostata` di `comune.js`, che lavorano
  sui componenti locali; la colonna `settimana` viaggia come stringa `AAAA-MM-GG`.
- Ogni lettura che deve essere completa (l'esportazione di Impostazioni) va paginata con
  `.range()`: PostgREST si ferma a 1000 righe e tronca **senza errore**.
- Un campo vuoto di un modulo si invia come `null`, mai come stringa vuota. Per `kg_residui`
  vuoto = mai lavorato, 0 = esaurito.
- `pianificazione` ha `unique (settimana, posizione)` e PostgREST non ha transazioni: lo scambio
  ▲▼ è in tre passi su una posizione di appoggio negativa, più bassa di ogni posizione in uso.
- L'interruttore "mostra collaudo" vale per l'elenco del magazzino e per i grezzi disponibili;
  **non** per la proposta di `n_prog`, la sequenza della settimana e l'esportazione.
- Non esiste (e non va aggiunto senza che una fase lo preveda) un tasto per cancellare un rotolo
  grezzo: un rotolo sbagliato si corregge con Modifica finché è `grezzo`.
- `sql/test_regole.sql` gira come `authenticated` con `request.jwt.claims` impostato, in
  `begin … rollback`: l'unico risultato atteso è `TUTTI I TEST PASSATI`.
- Niente cache-buster: Pages serve con max-age=600.
- Know-how fuori dal repo (gitignorato, solo nella cartella locale): `docs/riferimenti/`,
  `sql/seed_schede.sql`, `sql/seed_difetti.sql`. Prima di ogni push:
  `git ls-files | grep -E "riferimenti|seed_schede|seed_difetti"` deve essere vuoto.

## Schema (Fase 0)
- Tabelle: `utenti_app`, `operatori`, `schede_lavorazione`, `tipi_difetto`, `rotoli_grezzi`,
  `pianificazione`, `lavorazioni`, `rotoli_lavorati`, `controlli`, `eventi`.
- Viste: `rotoli_grezzi_reparto` (security_invoker = false, sola lettura),
  `lavorazioni_riepilogo`, `controlli_scostamenti` (security_invoker = true).
- Funzioni: `ruolo_utente()`, `e_ufficio()`, `e_reparto()`, trigger `imposta_modificato`,
  `eventi_fermo_durata` (before, fermi), `eventi_ripartenza` (after, ripartenze); helper
  `_codici_figli`, `_controlla_figli_e_bilancio`, `_inserisci_figli`; RPC `avvia_lavorazione`,
  `chiudi_lavorazione`, `annulla_lavorazione`, `registra_lavorazione_completa`.
- Realtime: `lavorazioni`, `controlli`, `eventi`.
- Seed: 10 tipi di difetto (`seed_difetti.sql`, non nel repo), 10 rotoli `COLLAUDO-0001…0010`.

## Struttura
```
index.html  ufficio.html  stampa.html
css/base.css  css/ufficio.css  css/stampa.css
js/comune.js  js/db.js  js/index.js  js/ufficio.js  js/stampa.js
js/ufficio/magazzino.js  js/ufficio/pianificazione.js  js/ufficio/impostazioni.js
sql/000_setup.sql  sql/003_…  sql/seed_collaudo.sql  sql/test_regole.sql
tests/test-comune.mjs  tests/test-dom-ids.mjs
docs/superpowers/{specs,plans,reviews}/   STATO_*.md   PIANO_funzionalita.md
```
Ogni scheda dell'ufficio è un modulo con una sola funzione `mostra(ctx)`; `js/ufficio.js` è la
shell (sessione, ruolo, schede, interruttore collaudo). La Fase 1 non ha aggiunto migrazioni.
