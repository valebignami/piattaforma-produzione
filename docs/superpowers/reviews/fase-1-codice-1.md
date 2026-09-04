VERDETTO: NESSUN BLOCCANTE
MODELLO: claude-fable-5-1

# Revisione indipendente — Fase 1, codice, giro 1

**Oggetto:** `git diff main...fase-1` (4 commit: `3d384d4`, `4cf275c`, `ec4df32`, `2abee29`) contro
`PIANO_funzionalita.md` §3 Fase 1, spec `2026-09-03-ciclo-bobina-design.md` (§2.2, §2.3, §4.1, §4.2,
§4.6, §4.7, §5.3), `docs/superpowers/specs/fase-1.md` (aggiornata dopo la revisione del piano),
`docs/superpowers/reviews/fase-1-piano-1.md`, `CLAUDE.md`, `STATO_2026-09-03.md`.
**Modalità:** sola lettura. Sul progetto `nbercxzpjflqfstwrryp` solo `select` su
`information_schema.column_privileges`, `pg_policies`, `pg_proc`/`routine_privileges`,
`pg_constraint`, `information_schema.columns` e conteggi; `list_migrations`.
File gitignorati letti dal disco: `sql/seed_collaudo.sql` (tracciato), `sql/seed_difetti.sql`
(non tracciato). `sql/seed_schede.sql` non esiste ancora (è la Fase 2, come previsto).

## Esiti dei comandi

- `git ls-files | grep -E "riferimenti|seed_schede|seed_difetti"` → **vuoto** (exit 1 del grep).
- `node --test tests/` sul branch `fase-1` → **35 test, 35 pass, 0 fail** (26 funzioni pure +
  6 coppie id DOM, comprese le 5 nuove `ufficio.js`, `ufficio/magazzino.js`,
  `ufficio/pianificazione.js`, `ufficio/impostazioni.js`, `stampa.js`). Nessun warning.
- `list_migrations` in produzione: le 10 della Fase 0 (`000a`…`000f`, `001`, `002`,
  `000e_verifica`, `003_ripartenza_ripuntata`), **nessuna nuova**. Il diff non tocca `sql/`.

## Primo controllo — aggiunte rispetto alla Fase 1 del piano

**Nessuna aggiunta fuori fase.** Verificato voce per voce:
1. `ufficio.html`: tre tab (Magazzino, Pianificazione, Impostazioni), login, logout, interruttore
   collaudo. Niente Live, Lavorazioni, Rotoli lavorati, nemmeno come segnaposto.
2. Magazzino: elenco con filtro di stato (default `grezzo`+`in_lavorazione`), Nuovo rotolo con
   `prossimoNProg` (e la scelta della lettera, che è il parametro della funzione prevista),
   modifica solo se `grezzo` con `kg_residui`, `<datalist>` da `valoriUsati`.
3. Stampa: solo `tipo=grezzo`; "Lavorazione: ______" sempre vuota; fornitore e bolla; tabella
   dei figli se esistono; `kg_residui` e `metri_stimati` in fondo. Gli altri tipi rispondono
   "arriva con una fase successiva".
4. Pianificazione: ← →, disponibili a sinistra, sequenza a destra, scheda compatibile per
   spessore/larghezza (`schedeCompatibili`), suddivisione e nota, ▲▼, righe lavorate barrate
   con `neq("stato","annullata")` (definizione spec §2.3). Le due interpretazioni dichiarate
   in §7 (Togli, casella "mostra tutte") sono esattamente quelle e non vanno oltre: nessuna
   conferma modale, nessuna funzione SQL, nessun'altra scrittura.
5. Impostazioni: operatori (aggiungi, rinomina, ruolo, attivo, **nessuna cancellazione**);
   "Esporta tutto" un JSON per tabella.
6. `js/db.js`: solo la mappa `messaggi` e il codice 23503, come deciso in `fase-1.md` voce 6
   a seguito della revisione del piano. `index.html`, `js/index.js`, `css/base.css`, `sql/`
   intoccati (confermato dal diff).

Unico dettaglio non dichiarato: la riga "Stato" in fondo al foglio di stampa (vedi minore 9).
È un campo di presentazione dentro la voce 3, non una funzionalità: non lo considero
un'aggiunta fuori fase.

## Le correzioni chieste dalla revisione del piano (`fase-1-piano-1.md`)

| # | Richiesta | Esito nel codice / in `fase-1.md` |
|---|---|---|
| 1 | numeri attesi 12/13 | `fase-1.md` §6 riga 307: 12 / 13. Produzione: insert 12 colonne, update 13 (`kg_residui` in più). **Fatto** |
| 2a | export senza filtro collaudo | `impostazioni.js` 97-107 `leggiTutto` non filtra. **Fatto** |
| 2b | paginazione | `leggiTutto` a blocchi di 1000 con `.order("id").range()`. **Fatto**, vedi analisi sotto |
| 3 | messaggi per codice | `db.js` 23-49; `DOPPIONE`, `COLLEGATA`, `NOME_DOPPIO`. **Fatto** |
| 4 | prove 2-7 con sessione **in locale prima del push** | **Non recepito**: `fase-1.md` §5 righe 276-280 le lascia sul sito pubblicato (passo 8.2) e aggiunge una prova SQL in sola lettura. Vedi importante 2 |
| 5 | "mostra tutte" in §7 | §7 b). **Fatto** |
| 6 | collaudo: solo disponibili, non la sequenza | `pianificazione.js` 41-48, `ufficio.js` 10-13. **Fatto** |
| 7 | campi vuoti → null | vedi sotto. **Fatto** |
| 8 | lunedì come stringa locale | `comune.js` 137-170, `tests/test-comune.mjs` 143-163. **Fatto** |
| 9 | `fmtM` via `formattaNumero` | `comune.js` 93. **Fatto** |
| 10 | `stampa.html` non autorizzato | `stampa.html` 29-32, `stampa.js` 21-29. **Fatto** |
| 11 | ▲▼/Togli bloccati durante lo scambio, testo di recupero | `occupato` (`pianificazione.js` 16, 188-190, 247-266). **Fatto**, ma il testo di `fase-1.md` riga 158 non coincide più con il codice (minore 8) |
| 12 | annotare l'ordinamento testuale | `fase-1.md` voce 2 righe 59-62. **Fatto** |

## Verifica in produzione (sola lettura)

Lo schema corrisponde a ciò che la fase usa e non serve nessuna migrazione:
- `rotoli_grezzi`: `grezzi_sel/ins` con `e_ufficio()`, `grezzi_upd` `using/with check (e_ufficio()
  and stato = 'grezzo')`; grant insert sulle 12 colonne inviate da `CAMPI` (`magazzino.js` 11-16),
  update sulle stesse + `kg_residui`. **Nessun grant** su `stato`, `kg_al_metro`, `metri_stimati`,
  `modificato_da/il`. Vincoli: `n_prog` unico, `spessore/larghezza/peso_bolla > 0`,
  `kg_residui ≥ 0`.
- `pianificazione`: `pian_sel using (true)`, `ins/upd/del` con `e_ufficio()`; grant sulle 6 colonne
  non riservate; `unique (settimana, posizione)`; `posizione integer not null` **senza check di
  segno** → la posizione di appoggio negativa è ammessa.
- `operatori`: grant di tabella, `nome` unico, check sul ruolo.
- 13 funzioni tutte con `search_path=public`; le 4 RPC `security definer`, execute solo a
  `authenticated`/`service_role`; le tre helper `_…` senza execute per `authenticated`. Le tre
  funzioni trigger hanno execute per PUBLIC (annotazione aperta della Fase 0, non di questa fase).
- `rotoli_grezzi_reparto`: select su 16 colonne, senza `fornitore` né `rif_bolla`.
- Dati: 10 grezzi (tutti `COLLAUDO-*`), 0 operatori, 0 schede, 0 pianificazioni, 2 `utenti_app`.

## Guardie della Fase 1

- **Nessuna scrittura diretta su `stato`/`kg_residui` fuori dalla policy.** Il front-end invia
  solo le colonne di `CAMPI` (`magazzino.js` 11-16) e, nella modifica, `kg_residui`
  (`magazzino.js` 189); la modifica è disabilitata nel modulo se `stato ≠ 'grezzo'`
  (`magazzino.js` 159-161) e comunque respinta da `grezzi_upd`. `stato`, `kg_al_metro`,
  `metri_stimati`, `modificato_da`, `modificato_il` **non compaiono in nessun payload** dei tre
  moduli (verificato in `magazzino.js`, `pianificazione.js` 159, 173-177, 210, 221-222,
  252-256, `impostazioni.js` 74, 86-87).
- **Nessuna stampa dal tablet.** `stampa.html` disegna solo con ruolo `ufficio`
  (`stampa.js` 21-29); il reparto vede "Le schede si stampano dall'ufficio"; la RLS
  `grezzi_sel` non gli darebbe comunque nessuna riga. Nessun `reparto.html` nel diff.
- **`n_prog` proposto ignora i `COLLAUDO-*`.** `prossimoNProg` accetta solo `^A(\d+)$`
  (`comune.js` 43-54, `tests/test-comune.mjs` 46); la lista dei codici è letta senza filtro collaudo e senza
  filtro di stato (`magazzino.js` 46-48).
- **Risultato verificabile raggiungibile nel codice:** inserimento e modifica dei grezzi,
  stampa in scheda nuova, composizione del programma (aggiungi, scheda, suddivisione, nota,
  ▲▼, Togli), nove JSON scaricati. Non ho potuto provarlo nel browser con una sessione:
  è il punto importante 2.
- **Campi vuoti → null.** `magazzino.js` 26-30 (`valore`: `""` → `null`, numerici con
  `Number`), `pianificazione.js` 173 (`trim() || null`), 159 (`sel.value || null`),
  `impostazioni.js` 43-44, 79-80 (nome obbligatorio e ripulito). `kg_residui` vuoto = `null`
  (mai lavorato), `0` = esaurito, come dichiarato. Nessuna stringa vuota parte verso colonne
  `numeric`/`date`.

---

## Bloccante

Nessuno.

## Importante

1. **Pianificazione: ▲▼ attivi sulle righe già lavorate, e una riga lavorata rimasta fuori
   sequenza non ha via d'uscita** (`js/ufficio/pianificazione.js` 186-190, 247-266).
   `fase-1.md` voce 4 riga 150 dice "quelle righe si mostrano barrate e con i comandi
   disattivati": la scheda e i campi di testo lo sono (righe 138, 171), Togli lo è (190), ma
   `su`/`giu` (188-189) controllano solo `bloccato` e i vicini, non `lavorata`. Conseguenza
   pratica: se uno scambio che coinvolge una riga lavorata si interrompe dopo il primo passo
   (chiusura della pagina, sessione scaduta, errore al terzo passo), quella riga resta a
   posizione negativa; l'avviso della riga 117 dice "toglila e riaggiungila", ma Togli è
   disabilitato sulle lavorate (e la FK di `lavorazioni.pianificazione_id` lo vieterebbe
   comunque). Si sistema solo via connettore. Correzione minima: aggiungere `lavorata` alla
   condizione di `su`/`giu`. Correzione migliore, sempre senza SQL nuovo: per la riga fuori
   sequenza un tasto "Rimetti in coda" che fa un solo `update posizione = max + 1` (la stessa
   regola di `aggiungi`, riga 218-220), valido anche per le lavorate.

2. **Le prove con sessione restano rimandate al sito pubblicato** (`fase-1.md` §5 righe
   276-290). La revisione del piano (punto importante 4) chiedeva le prove 2-7 in locale su
   `http://localhost:8000` con il login del committente **prima del push**, perché `git push`
   su `main` è produzione (`CLAUDE.md`) e lo spec §5.6 punto 4 colloca le prove nel browser
   sui rotoli di collaudo. La spec aggiornata ha scelto un sostituto (le `select` della fase
   eseguite come `authenticated` in `begin … rollback`) che prova i **permessi in lettura**, ma
   non le **scritture** che questa fase introduce per prima: insert/update/delete con i payload
   reali della UI (null nei campi vuoti, `kg_residui`, lo scambio in tre passi, Togli con FK,
   i messaggi per codice). Il ritorno indietro del passo 8.3 è la rete di sicurezza dichiarata,
   ma con questo ordine il primo codice che scrive dati arriva online senza che una sessione
   l'abbia mai esercitato. Prima del push: prove 2-7 in locale con il login del committente
   (la sessione Supabase vale anche per l'origine `localhost`), poi ripetute sul sito.

## Minore

3. **Ripristino dopo un passo fallito: giusto al passo 1 e 2, silenziosamente inefficace al
   passo 3** (`pianificazione.js` 263). Se fallisce il terzo passo, B occupa già la vecchia
   posizione di A: l'`update` di ripristino viola l'unicità e il suo errore è ignorato (nessun
   controllo su `error`). Il risultato finale è comunque coerente (nessun doppione: A negativa
   e segnalata, B spostata di uno) e il commento alle righe 245-246 lo dichiara onestamente.
   Sarebbe più solido, in caso di fallimento al passo 3, rimettere prima B a `b.posizione` e
   poi A a `a.posizione`; e in ogni caso leggere l'errore del ripristino invece di scartarlo.
   Per il resto la logica corretta in `2abee29` regge: l'appoggio `-(1 + max|posizione|)`
   (riga 252) è strettamente sotto ogni posizione della settimana, comprese quelle già
   negative, quindi libera; ▲▼ sono disabilitati sulla riga negativa e sulle sue vicine
   (188-189), così nessuno scambio coinvolge una posizione negativa; `occupato` blocca tutto
   il pannello durante i tre passi. Un caso residuo: `righe` e `a`/`b` sono gli oggetti del
   disegno precedente al `mostra()` della riga 250, quindi uno scambio contro dati cambiati
   da un'altra sessione dell'ufficio finisce nel 23505 → messaggio `DOPPIONE` → ricarica.
   Accettabile.

4. **`salva()` chiamata senza `onStato` in tutti i moduli** (`magazzino.js` 188-190,
   `pianificazione.js` 210, 221, 229, 260, `impostazioni.js` 74, 86). Durante un'assenza di
   rete i ritentativi (1 s, 3 s, 10 s, poi 30 s, spec §3.9) avvengono, ma l'ufficio vede
   "Salvo…"/"Sposto…" senza fine, mai "In attesa di rete… riprovo". In Pianificazione, dove i
   campi si salvano alla perdita di fuoco e nessun tasto viene disabilitato, l'utente può
   continuare a scrivere e accumulare più cicli di ritentativo concorrenti. `fase-1.md` voce 2
   riga 95 cita un indicatore `#mag-stato-salva` che nell'HTML non esiste (il codice usa
   `#mag-esito`): allineare spec e codice e passare un `onStato` che scriva "In attesa di
   rete…" nell'esito.

5. **Funzione pura fuori da `comune.js` e senza test:** `inItaliano` (`pianificazione.js`
   24-26) trasforma `AAAA-MM-GG` in "7 settembre 2026" costruendo la `Date` dai componenti
   (corretta, evita `new Date("AAAA-MM-GG")` in UTC). È l'unica; per la regola "funzioni pure
   in `comune.js` con test" andrebbe lì, accanto a `aIso`/`aData`. Stesso tema, più piccolo:
   `impostazioni.js` 123 ottiene la data locale con il trucco `toLocaleDateString("sv-SE")`
   mentre `comune.js` ha già `aIso` (non esportata).

6. **Proposta del numero: il limite di 1000 righe in ordine decrescente** (`magazzino.js`
   44-48). Il commento dice "il massimo di ogni lettera è sempre nel gruppo di testa": vero
   solo finché le righe con lettere successive sono meno di 1000 (l'ordinamento testuale
   decrescente mette tutte le `B…` prima di tutte le `A…`). Oggi non è un problema; se un
   giorno lo diventa, il DB rifiuta il doppione (23505) e il messaggio è quello giusto. Basta
   riscrivere il commento con questa condizione, o leggere solo `n_prog` senza limite.

7. **Re-disegno del tab attivo a ogni evento di autenticazione** (`ufficio.js` 62-63,
   `stampa.js` 117-118). `aggiorna()` parte due volte al caricamento (chiamata diretta più
   `onAuthStateChange`) e a ogni `TOKEN_REFRESHED`/`SIGNED_IN` successivo, e ogni volta
   `apriTab` rifà `mostra()`: in Pianificazione le card vengono ricostruite e un testo in corso
   di digitazione in "Suddivisione" o "Nota" si perde. Raro (rinnovo del token circa ogni
   ora, o ritorno del fuoco sulla finestra). Stesso schema di `index.js` della Fase 0, dove
   però non c'era niente da perdere. Rimedio semplice: in `aggiorna()` rifare `apriTab` solo
   se lo stato (sessione/ruolo) è cambiato.

8. **`fase-1.md` non coincide più con il codice in due punti:** riga 158 ("spostala con ▲▼
   oppure toglila e riaggiungila") mentre il codice disabilita ▲▼ sulla riga fuori sequenza e
   dice solo "toglila e riaggiungila" (`pianificazione.js` 117); riga 95 `#mag-stato-salva`
   (vedi minore 4). Da aggiornare nella spec di fase, che è il documento che la revisione
   successiva leggerà.

9. **Foglio di stampa:** la riga "Stato" (`stampa.js` 81) e l'intestazione "Overland S.r.l. —
   Linea 1500" (`stampa.html` 43) non sono elencate né nello spec §4.7 né in `fase-1.md`
   voce 3. Innocue, ma da dichiarare. Inoltre le date escono in formato ISO grezzo:
   "Data di arrivo" (`stampa.js` 53) e la colonna "Data" dei figli con
   `chiusa_il.slice(0, 10)` (`stampa.js` 73), che è la data **UTC** del timestamp: una
   chiusura fra mezzanotte e le due di notte ora legale stampa il giorno prima. Stesso
   `slice(0, 10)` in `magazzino.js` 117 per "Modificato". Da formattare in italiano
   dai componenti locali (una funzione pura in `comune.js`, con test).

10. **Numerazione delle righe con una riga fuori sequenza** (`pianificazione.js` 112): la
    riga negativa si ordina per prima e prende "1.", spostando di uno la numerazione delle
    altre. Cosmetico; l'avviso rosso spiega.

11. **Identificatori in inglese** nel codice nuovo: `card`, `box`, `pill`, `ctx`, `sel`,
    `inp`, `op` (`pianificazione.js` 67-110, `magazzino.js` 106-109, `ufficio.js` 11).
    Nomi locali di poche lettere; i nomi delle funzioni, delle costanti e dei messaggi sono
    tutti in italiano.

## Controlli senza rilievi

- Regole di dominio: nessuna nuova nel front-end. `schedeCompatibili` è il filtro di UI
  previsto (spec §3.4/§4.2); `posizione = max + 1` è la regola del piano di fase, protetta dal
  vincolo unico; "modifica solo se grezzo" è il riflesso della policy; i messaggi per codice
  cambiano solo la frase, il rifiuto resta nel DB.
- Reparto: nessun codice di reparto in questa fase; nessuna via porta `fornitore`/`rif_bolla` a
  un tablet (`rotoli_grezzi` è letta solo da pagine d'ufficio, e la RLS non la mostra al reparto).
- Migrazioni: nessuna, ed è corretto così (verificato in produzione). Nulla rompe il codice
  già pubblicato: `index.html`, `index.js`, `base.css` intoccati; `db.js` cambia in modo
  compatibile (parametro facoltativo).
- Tablet: `css/ufficio.css` è collegato solo da `ufficio.html`, `css/stampa.css` solo da
  `stampa.html`; `base.css` intoccato; nessuna regola nuova ricade su `index.html` né su una
  futura `reparto.html`. I `<select>` (stato, lettera, ruolo, scheda) sono su pagine desktop.
- `comune.js`: nessun import, nessun DOM, nessuna rete; le 5 funzioni nuove hanno test
  (compresi bordi, cambio di mese/anno, ora legale, Date in ingresso, formato rifiutato).
- Messaggi: tutti in italiano; l'unico `Error` in inglese-neutro (`impostazioni.js` 103) va in
  `console.error`, non all'utente.
- `tests/test-dom-ids.mjs`: 6 coppie, verde; tutti gli accessi al DOM passano da `byId("…")`.
- `CLAUDE.md`: niente cache-buster; `integrity` SRI in `ufficio.html` e `stampa.html`
  identico a `index.html` (`sha384-SR76iDF5…Uycq`, stesso file `dist/umd/supabase.js`
  2.110.6); `js/db.js` unico file con URL, chiave e client; solo la chiave `sb_publishable_…`.
- Esportazione: nove tabelle, nessun filtro, paginazione con `.order("id").range(da, da+999)`
  finché il blocco è più corto di 1000 (il caso N×1000 esatto fa una richiesta vuota in più e
  termina). Tutte le tabelle hanno `id`. `utenti_app` esclusa per costruzione.
- Sicurezza del DOM: solo `textContent`, nessun `innerHTML` con dati; `encodeURIComponent`
  sul `n_prog` nell'URL della stampa.
- Know-how: `seed_difetti.sql` e `docs/riferimenti/` non tracciati; `seed_collaudo.sql`
  (tracciato) non contiene parametri di processo.

## Conclusione

Il codice fa solo quello che la Fase 1 chiede, non tocca il database e rispetta le guardie:
stato e kg residui restano protetti da Postgres, nessuna stampa dal tablet, i rotoli di collaudo
non influenzano la numerazione. Prima di pubblicare vanno sistemate due cose: le frecce ▲▼ non
devono muovere le righe già lavorate (altrimenti una di esse può restare bloccata fuori
programma), e le prove con il login vanno fatte in locale, non direttamente sul sito.
