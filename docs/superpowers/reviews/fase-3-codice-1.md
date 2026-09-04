VERDETTO: NESSUN BLOCCANTE
MODELLO: claude-fable-5-1

# Revisione indipendente — Fase 3, codice, giro 1

**Oggetto:** `git diff main...fase-3` (9 commit, da `60aa831` a `855da3f`; 20 file, +2037/−37)
contro `PIANO_funzionalita.md` §3 Fase 3 (voci 1-5, risultato verificabile, guardie), §1 e §2,
spec `2026-09-03-ciclo-bobina-design.md` (§2.5-§2.9, §3.1, §3.3, §3.5, §3.6, §3.8, §4.3, §5.3,
§5.6, §8), `docs/superpowers/specs/fase-3.md`, `docs/superpowers/reviews/fase-3-piano-1.md`,
`CLAUDE.md` (versione `fase-3`), i tre `STATO_*.md`. Letti dal disco anche i file gitignorati
`sql/seed_schede.sql` e `sql/seed_difetti.sql` (la fase non li tocca: nessun diff, nessuna
modifica di data oltre quella della Fase 2).
**Modalità:** sola lettura. Sul progetto `nbercxzpjflqfstwrryp` solo `select` su
`information_schema`, `pg_policies`, `pg_proc`, `pg_constraint`, `pg_trigger`, `pg_indexes`,
`pg_publication_tables`, `pg_class`, più conteggi. **Non ho eseguito `sql/test_coerenza.sql`**:
gira in `begin … rollback` ma contiene `insert`, e il mandato era "nessun SQL diverso da select".
Nessun file del progetto modificato oltre a questo.

## Esecuzione dei test

`node --test tests/` sul branch `fase-3` (albero pulito):

```
ℹ tests 83
ℹ suites 0
ℹ pass 83
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 401.1744
```

83 verdi: 38 di `test-comune.mjs` (12 nuovi della Fase 3), 31 di `test-coerenza.mjs` (letti dal
JSON di `sql/test_coerenza.sql`), 14 coppie di `test-dom-ids.mjs` (4 nuove). Nessun warning.

`git ls-files | grep -E "riferimenti|seed_schede|seed_difetti"` → **vuoto**.

## Primo controllo — aggiunte rispetto alla Fase 3 del piano

**Nessuna aggiunta fuori fase.** Confronto commit per commit e voce per voce:

| Voce del piano | Dove sta | Esito |
|---|---|---|
| 1. Controllo: momento proposto, campi per zona, placeholder dal precedente, colore immediato con `fuoriRange` (gloss solo se satinata) | `js/reparto/controllo.js`, `reparto.html` 137-147, `comune.js` 267-305 | coperta; i campi gloss ci sono sempre e si colorano solo sulle satinate (`fuoriRange` riga 65), come il piano di fase §2 aveva deciso dopo la revisione |
| 2. Evento: sette tipi; difetto con catalogo e causa/azione; fermo con causa; aggiunta con prodotto e litri; giunta/taglio/primi metri con contametri; nota | `js/reparto/evento.js`, `reparto.html` 150-171 | coperta: sette bottoni (`TIPI_EVENTO` meno `ripartenza`, riga 96), catalogo in colonna con causa e azione in sola lettura (righe 158-164), ora del fermo da `istanteDaOra` |
| 3. Fermo / Ripartenza dall'hub: fermo aperto nel banner; 100 m proposti e testo del manuale; `fermo_id` | `js/reparto/hub.js` 136-152 e 201-205, `js/reparto/ripartenza.js`, `reparto.html` 80 e 174-182 | coperta: un tasto solo che cambia nome, banner `FERMO da N min · causa`, insert con `lavorazione_id`, `operatore_id`, `tipo`, `fermo_id`, `metri_scarto` (righe 65-70), `durata_min` mai inviata |
| 4. Capoturno: "Ultimi controlli" con correzione, solo front-end | `js/reparto/ultimi.js`, `controllo.js` in modo correzione, `hub.js` 152, `reparto.html` 82 e 185-190 | coperta: il tasto compare solo se `ruolo = 'capoturno'`; la correzione è un `update` su `controlli` senza toccare `operatore_id` |
| 5. Live: ultimo controllo con fuori range in rosso da `controlli_scostamenti`, fermo aperto, nastro della giornata | `js/ufficio/live.js` 100-191, `ufficio.html` 180-191, `css/ufficio.css` | coperta; sola lettura confermata (nessuna scrittura in `live.js`); realtime su tre tabelle in un canale solo, con la coda |
| Guardia "colori coincidenti con la vista (test di coerenza)" | `sql/test_coerenza.sql`, `tests/test-coerenza.mjs` | coperta (vedi sotto) |

Fuori dalle cinque voci, e tutti previsti dal piano di fase o dallo spec: `CLAUDE.md` (test di
coerenza, trigger dei fermi, capoturno, struttura dei file), la riga "Capoturno" in
`PIANO_funzionalita.md` §2 (decisione del committente del 2026-09-04), la spec di fase e la sua
revisione, le dieci costanti e funzioni pure nuove di `comune.js` (§7 del piano di fase, più
`inizioGiornata` e `istanteDaOra` chieste dalla revisione del piano, punti 6 e 7).
Nessuna tabella, vista, RPC, policy, grant o migrazione. Nessun tab nuovo in `ufficio.html`.
Nessuna stampa dal tablet (`grep -i stampa` in `js/reparto*` trova solo il commento di
`reparto.js` riga 4). Il tasto "Chiudi rotolo" resta spento con "dalla prossima fase".

## Verifica del database in produzione (2026-09-04, sola lettura)

La fase dichiara **zero migrazioni**. Confermato: `list_migrations` restituisce le stesse **11**
della chiusura della Fase 2 (10 della Fase 0 + `004_seed_schede`), nessuna dopo il
`20260904103023`. Lo schema copre già tutto ciò che il codice nuovo usa:

| Cosa serve alla fase | Trovato |
|---|---|
| `controlli`, `eventi` con i `check` su `momento`, `tipo`, `causa_fermo` | presenti, identici ai codici di `MOMENTI`, `TIPI_EVENTO`, `CAUSE_FERMO` (e il test di coerenza li confronta con `pg_get_constraintdef`) |
| policy `ctl_ins`, `ctl_upd`, `ev_ins`, `ev_upd` | `e_ufficio() or (e_reparto() and exists (… stato = 'aperta'))`; `ctl_sel`, `ev_sel` = `true` |
| grant `authenticated` su `controlli` | insert 16 colonne, update 15: **senza** `modificato_*`, `creato_il`, `id` |
| grant `authenticated` su `eventi` | insert 12, update 11: **senza** `durata_min` e `modificato_*` |
| colonne riservate (`stato`, `codice`, `modificato_*`, `durata_min`, `lavorazione_id` in update) | nessun grant di scrittura al client |
| trigger | `trg_eventi_fermo` (before, `when new.tipo = 'fermo'`), `trg_eventi_ripartenza` (after, `when new.tipo = 'ripartenza'`), `trg_*_modificato` su `lavorazioni`, `controlli`, `eventi` |
| sorgente di `eventi_ripartenza` | contiene `old.fermo_id` → migrazione 003 applicata; confronta `lavorazione_id` e `avvenuto_il` con messaggi in italiano |
| indice `eventi_un_fermo_una_ripartenza` | `unique (fermo_id) where fermo_id is not null` |
| viste | `controlli_scostamenti` e `lavorazioni_riepilogo` `security_invoker=true`; `rotoli_grezzi_reparto` `security_invoker=false` senza `fornitore` e `rif_bolla`; `authenticated` solo `select`, `anon` niente |
| `controlli_scostamenti` | stesse regole di `fuoriRange`: temperature con `min` **e** `max` non null, ±0,10 con `previsto <> 0`, gloss `>= 40` / `>= 60` solo `tipo = 'satinato'`; unisce `controlli`, `lavorazioni`, `schede_lavorazione` — **non** `rotoli_grezzi` |
| funzioni | 13, tutte con `search_path=public`; le 4 RPC e i trigger `security definer`; `_codici_figli`, `_controlla_figli_e_bilancio`, `_inserisci_figli` **non** eseguibili da `anon`/`authenticated`; le RPC non eseguibili da `anon` |
| RLS | attiva su tutte e 10 le tabelle |
| realtime | `controlli`, `eventi`, `lavorazioni` |
| firme degli helper chiamati dalla fixture | `_codici_figli(text, integer, numeric, integer) → text[]`; `_controlla_figli_e_bilancio(numeric, numeric, numeric, jsonb, numeric) → void`: coincidono con `test_coerenza.sql` righe 249 e 258 |
| colonne `not null` senza default che la fixture deve riempire | `lavorazioni`: `rotolo_grezzo_id`, `scheda_lavorazione_id`, `operatore_avvio_id`, `peso_con_imballo_kg`; `schede_lavorazione`: `lavorazione`, `tipo`, `micron`, `spessore_min/max`, `larghezza_min/max`; `rotoli_grezzi`: `n_prog`, `spessore_mm`, `larghezza_mm`, `peso_bolla_kg` — tutte presenti nella fixture (righe 201-224); `lavorazioni_caso_c` rispettato (`kg_residui_dichiarati 0` con `peso_tubolare_kg 0`) |
| dati | 10 `tipi_difetto`; 10 `COLLAUDO-*` in stato `grezzo`; 51 schede, **51 con `fissaggio_temp_max` null**; operatori `Marco` e `Davide` attivi e **entrambi `operatore`**; `COLLAUDO - non usare` disattivato; 1 lavorazione (`annullata`, prova della Fase 2); **0 controlli, 0 eventi** |

Le ultime tre righe dicono che le prove nel browser del §11 della spec di fase **non sono ancora
state fatte** in produzione (annullare non cancella controlli ed eventi, spec §2.7: se fossero
state fatte, ci sarebbero righe). Vedi importante 1.

## Guardie del piano e regole di `CLAUDE.md`

- **`durata_min` mai scritta dal client** — nessun modulo la invia (`grep durata_min js/reparto*`
  trova solo `descrizioneEvento`, che la legge); nessun grant in produzione.
- **insert del reparto respinto su lavorazione chiusa** — policy in produzione; `test_regole.sql`
  la prova (righe 107-110) ma va rieseguito prima della chiusura (importante 1).
- **colori del tablet coincidenti con la vista** — `sql/test_coerenza.sql` e `tests/test-coerenza.mjs`
  leggono lo **stesso** JSON (righe 24-149 del SQL; regex in `test-coerenza.mjs` 16-18): dieci
  controlli, cinque codici, cinque bilanci, più i codici dei tre `check` letti da
  `pg_get_constraintdef` (SQL 176-190) e confrontati con le mappe di `comune.js` (mjs 27-33) e
  con `CAMPI_CONTROLLO` (mjs 35-38). La metà JS è verde; la metà SQL non l'ho potuta eseguire
  (vedi sopra) ma l'ho letta riga per riga contro lo schema in produzione: firme, `not null`,
  `check` e indici combaciano.
- **Il reparto non interroga mai `rotoli_grezzi`** — `grep rotoli_grezzi js/reparto*` trova solo
  la vista e due commenti; le schermate nuove leggono `lavorazioni`, `schede_lavorazione`,
  `controlli`, `eventi`, `tipi_difetto`, `operatori`, `controlli_scostamenti`. Nessun `select`
  annidato da `pianificazione` o `lavorazioni` verso il grezzo. **`fornitore` e `rif_bolla` non
  arrivano al tablet per nessuna via**: le tre viste interrogate non le contengono.
- **Regole di dominio in Postgres** — il front-end aggiunge solo letture dichiarate: `fermoAperto`
  (spec §2.5, dichiarata in `CLAUDE.md` e in `comune.js` 306-309), `momentoProposto` (una
  proposta, `meta`/`fine` a un tocco), il bottone Fermo spento con un fermo aperto (`evento.js`
  102-105: mostra, non decide; la RPC di chiusura resta il giudice), il tasto "Ultimi controlli"
  per ruolo (`hub.js` 150-152, spec §2.9). Il colore del tablet è un avviso che non blocca il
  salvataggio (`controllo.js` 175-187).
- **RPC** — nessuna nuova; le esistenti già verificate nelle Fasi 0 e 2 (`security definer`,
  `search_path`, guardia `coalesce`, revoke da `anon`/`public`), riconfermate oggi.
- **Tablet** — nessun `<select>` in `reparto.html` (`grep "<select"` vuoto); `<input type="time">`
  per l'ora del fermo non è un `<select>`. `base.css` impone 56 px / 18 px a `input` e `button`,
  gli input costruiti da `controllo.js` li ereditano; `css/reparto.css` non ha nessun
  `font-size` sotto 18 px (`.ragione` 81 e `.riquadro-aiuto p` 90 sono a 18); `label` a 18 px
  (riga 10); `h2` a 1,2 rem = 19,2 px. `.azioni` a `auto-fit minmax(220px)` (riga 60): a 1024 px
  quattro tasti in una riga, il quinto va a capo, tutti a 88 px. Flussi: Controllo 1 schermata,
  Evento 2, Ripartenza 1, Ultimi controlli → correzione 2. "Indietro" gestito dalla shell.
- **Date** — `inizioGiornata` costruisce la mezzanotte **locale** dai componenti (`comune.js`
  349-352) e `live.js` 146 la passa a `.gte()` come istante: uso corretto di `toISOString()`
  (si manda un istante, non si ricava un giorno). `istanteDaOra` (`comune.js` 357-365) idem,
  con la regola "nel futuro → ieri" testata a cavallo di mezzanotte. Nessuno `slice(0,10)`.
- **Campo vuoto → `null`** — `controllo.js` 143-145 e 199, `evento.js` 186-193, `ripartenza.js`
  69. `rilevato_il` non si invia (`controllo.js` 201-206).
- **Funzioni pure in `comune.js` con test** — le dieci nuove hanno test in `test-comune.mjs`
  254-346; `comune.js` resta senza `import` e senza DOM (`grep "^import" js/comune.js` vuoto).
  Un'eccezione piccola: minore 5.
- **Italiano** — codice, commenti, messaggi, `title` in italiano; nessuna parola inglese nel
  diff dei messaggi.
- **Id HTML** — `test-dom-ids.mjs` verde sulle quattro coppie nuove; gli id costruiti a runtime
  (`rep-ctl-<campo>`, `rep-ev-campo-<nome>`) li crea e li usa lo stesso modulo.
- **Nessun parametro di processo nei file tracciati** — la fixture di `test_coerenza.sql` usa
  decine tonde (20-30, 40-50, 60-70, 80-90; velocità 10, ampere 1000, micron 100), `RIF_SAT` di
  `test-comune.mjs` idem; `fase-3.md`, `fase-3-piano-1.md` e `CLAUDE.md` non contengono
  temperature, correnti, velocità né nomi di prodotti di vasca (`grep` su gradi/A/m/min vuoto).
  `PRODOTTI_AGGIUNTA` (satina, ammoniaca, altro) sono i tre nomi dello spec approvato §3.6, già
  tracciato: nessuna fuga nuova. I seed con i parametri veri restano gitignorati.
- **`aggiorna()` delle shell** — non toccata. **Nessun cache-buster** aggiunto.

## Bloccante

Nessuno.

## Importante

1. **Il risultato verificabile non è ancora stato dimostrato, e lo STATO non esiste** — in
   produzione ci sono **0 controlli e 0 eventi** e Marco è ancora `operatore`; nel diff non c'è
   nessuno `STATO_*` né `RAPPORTO_fase-3.md`. Il piano chiede "un turno intero si registra dal
   tablet sul rotolo di collaudo; gli scostamenti compaiono in rosso in Live; un fermo chiuso ha
   la durata calcolata", e la spec di fase §9 e §11 promettono `test_regole.sql` rieseguito verde,
   `test_coerenza.sql` verde (che io non ho potuto eseguire) e le dieci prove nel browser con il
   traffico di rete controllato. È il normale ordine della skill (revisione del codice prima delle
   prove), non un difetto del codice: lo segnalo perché senza quelle tre cose scritte nello STATO
   la fase non è chiudibile, e perché i controlli e gli eventi della prova **resteranno** attaccati
   alla lavorazione annullata e nel nastro di Live di quel giorno (spec §2.7): vanno elencati fra
   i dati di prova, come nella Fase 2.

2. **La correzione del capoturno può dire "Salvato ✓" senza aver salvato** — `js/reparto/controllo.js`
   riga 205: `sb.from("controlli").update(riga).eq("id", daCorreggere.id)` senza `.select()`.
   Se fra l'apertura di "Ultimi controlli" e il tocco su "Salva la correzione" la lavorazione
   viene chiusa o annullata (dall'ufficio con `registra_lavorazione_completa` no, ma da un altro
   tablet o da un annullo sì), la policy `ctl_upd` non trova più la riga: PostgREST risponde
   **204 con zero righe, senza errore**, `salva()` restituisce `ok: true`, la barra scrive
   "Salvato ✓" e si torna all'hub. È lo stesso comportamento silenzioso che `CLAUDE.md` descrive
   per il `range()`, applicato all'update. Per l'`insert` il problema non c'è: `with check`
   respinge con 42501 e il messaggio è in italiano. Correzione minima: `.select("id")` e, se
   `data.length === 0`, "Questo controllo non si può più correggere: la lavorazione è chiusa".
   Finestra stretta, ma è l'unica strada in cui il tablet mente sull'esito.

## Minore

3. **Stato residuo fra una visita e l'altra della stessa schermata** — `js/reparto/evento.js`
   66-71: se una delle tre letture fallisce, `mostra()` esce prima di `disegnaTipi()` (riga 80) e
   i bottoni della visita precedente restano nell'elenco, con `lav` vecchia; toccandone uno si
   arriva al passo 2 e si può tentare un insert su una lavorazione che non è più quella in linea.
   Il database lo respinge (policy `ev_ins`), quindi nessun danno, ma la schermata mostra roba
   vecchia con l'errore sopra. Basta `byId("rep-ev-tipi").textContent = ""` in testa a `mostra()`.
   Lo stesso schema, solo estetico, in `controllo.js` 84 (`costruisciCampi` esce subito alla
   seconda visita e i bordi rossi della volta prima restano finché `aggiornaColori` non gira alla
   fine del caricamento). In `ripartenza.js` e `controllo.js` il tasto di salvataggio è
   disabilitato prima delle letture (righe 28 e 45): lì la protezione c'è.

4. **La ragione del Fermo spento non si vede sul tablet** — `js/reparto/evento.js` 104:
   `tasto.title = "C'è già un fermo aperto: …"`. Un `title` è un tooltip del mouse; su un tablet
   non compare mai. L'operatore vede un bottone grigio senza sapere perché. Meglio la stessa frase
   in `rep-ev-esito`, oppure sotto il bottone, a 18 px.

5. **`comeMai` è una funzione pura fuori da `comune.js`, senza test** — `js/reparto/controllo.js`
   162-173. Non decide niente (il fatto lo dà `fuoriRange`), ma sceglie "sotto il minimo" o
   "sopra il massimo" ricostruendo il confronto, e legge le costanti `TOLLERANZA_PCT`,
   `GLOSS_*_MAX`. O si sposta in `comune.js` con tre righe di test, o si dichiara come testo di
   schermata. Segnalo perché la regola di `PIANO` §1 è "funzioni pure in `comune.js` con test".

6. **Gli id promessi dalla spec di fase non sono quelli del codice** — `fase-3.md` §10 (righe
   256-257) elenca `rep-ctl-titolo` e `rep-ctl-gloss`, che non esistono in `reparto.html`; il
   codice usa `rep-ctl-riepilogo` (riga 138) e `rep-rip-fermo` (riga 176), assenti dall'elenco.
   Solo documentazione: il test degli id è verde. Da allineare quando si chiude la fase.

7. **Un'ora sbagliata nel futuro diventa un fermo di ieri** — `comune.js` 357-365 e
   `evento.js` 207-212, comportamento dichiarato dalla spec di fase §3. Se l'operatore scrive
   15:00 alle 14:30 per un refuso, il fermo va a ieri e la ripartenza gli darà ~24 ore di durata.
   L'indizio è visibile (il banner dirà "FERMO da 1.4xx min") e l'ufficio può correggere
   `avvenuto_il` nella Fase 4. Da dire nell'addestramento: l'ora del fermo non può essere dopo
   l'ora di adesso.

8. **Il nastro della giornata non è paginato** — `js/ufficio/live.js` 148-153: due letture senza
   `.range()`. In una giornata non si arriva a 1000 righe fra controlli ed eventi, e la regola di
   `CLAUDE.md` riguarda le letture che devono essere complete (l'esportazione): va bene, ma una
   riga di commento che lo dica eviterebbe la domanda alla prossima revisione.

## Cose controllate e a posto (per non farle ricontrollare)

- `fermoAperto` (`comune.js` 310-316): unica definizione, usata da `hub.js`, `evento.js`,
  `ripartenza.js`, `live.js`; con due fermi aperti vince il più recente (testato).
- Il rosso del fermo vince su quello del controllo scaduto (`hub.js` 144-145) e si distingue dal
  titolo `FERMO` (`css/reparto.css` 94-97).
- `GIA_RIPARTITA` (`ripartenza.js` 16): il 23505 dell'indice `eventi_un_fermo_una_ripartenza`
  tradotto nella schermata che conosce il contesto, come lo spec §5.5 chiede; senza, `db.js`
  parlerebbe di numero progressivo.
- Ripartenza: `lavorazione_id` uguale a quella del fermo (`ripartenza.js` 66), come il trigger
  esige; `metri_scarto` proposto da `METRI_SCARTO_RIPARTENZA` (100, spec §2.5), modificabile;
  frase del manuale a video (riga 11).
- In correzione il `placeholder` viene dal controllo che precede **per ora** quello corretto
  (`controllo.js` 56-62), non dall'ultimo del rotolo: giusto.
- `operatore_id` non cambia in correzione (`controllo.js` 201-206); `modificato_*` dal trigger.
- `ultimi.js` legge `controlli_scostamenti` con `security_invoker = true`: il reparto ha
  `select` sulle tre tabelle sottostanti, quindi funziona; limite 8 come lo spec §3.1.
- Live: un canale solo per tre tabelle, i ridisegni passano dalla coda (`live.js` 224-231),
  la chiusura del canale precedente è attesa; `live-ultimo`/`live-fermo` nascosti quando la
  linea è libera (`svuotaLavorazione`).
- `evento.js`: sette bottoni (ripartenza esclusa), catalogo dei dieci difetti come bottoni in
  colonna (non `<select>`), causa e azione **non** salvate (`eventi` non ha quelle colonne), fermo
  con `avvenuto_il` esplicito e cinque cause, aggiunta con tre prodotti e litri.
- `hub.js` 152: "Ultimi controlli" nascosto a chi non è capoturno; la shell rilegge `ruolo` a
  ogni apertura (`reparto.js` 76 e 99), quindi il cambio di ruolo dall'ufficio arriva al tablet
  al prossimo ricaricamento.
- `test-coerenza.mjs` si aggancia all'`insert` della fixture, non ai soli delimitatori: i
  commenti in testa al SQL li nominano e uno split secco prenderebbe il pezzo sbagliato.
- `test_coerenza.sql`: temp table `on commit drop`, `rollback` finale, un solo `select` di esito;
  `jsonb_exists` al posto dell'operatore `?` (spiegato in commento); i tre dettagli della
  revisione del piano (grezzo e operatore, `caso_c`, lavorazione `chiusa`) recepiti.
- `CLAUDE.md` versione `fase-3`: dice che `test_coerenza.sql` gira come `postgres` e perché, che
  la Fase 3 non ha migrazioni, che il fissaggio non sarà mai segnalato (limite dichiarato), che
  il capoturno è Marco. `comune.js` riga 6-9 aggiornata di conseguenza.
- Le annotazioni aperte della Fase 0 (`eventi.tipo`, `fermo_id`, `avvenuto_il` aggiornabili dal
  reparto) non cambiano con questa fase e non sono sue.
- La temperatura di fissaggio mai segnalata (51 schede su 51 con `fissaggio_temp_max` null) è
  posta al committente in `fase-3.md` §12.2 e non è stata toccata: giusto così.

## Conclusione

Il codice della Fase 3 fa le cinque cose del piano e niente di più: il tablet registra
controlli, eventi, fermo e ripartenza, il capoturno corregge, l'ufficio vede tutto in Live, e
il database — che non è stato toccato — copre già tutto quello che serve.
Prima di chiudere vanno fatte le prove vere sul rotolo di collaudo e scritte nello STATO
(oggi in produzione non c'è ancora nessun controllo né evento), e va sistemata una riga: la
correzione del capoturno può dire "Salvato" anche quando la lavorazione è stata chiusa nel
frattempo. Il resto sono rifiniture da poco.
