VERDETTO: NESSUN BLOCCANTE
MODELLO: claude-fable-5-1

# Revisione indipendente — Fase 3, piano, giro 1

**Oggetto:** `docs/superpowers/specs/fase-3.md` (2026-09-04, non ancora committato) contro
`PIANO_funzionalita.md` §3 Fase 3 (voci 1-5, risultato verificabile, guardie), §1 e §2 Decisioni
prese (compresa la riga "Capoturno" ancora non committata), spec
`2026-09-03-ciclo-bobina-design.md` (§2.5, §2.6, §2.7, §2.9, §3.1, §3.3, §3.5, §3.6, §3.8, §3.9,
§4.3, §5.3, §5.6, §8), `CLAUDE.md`, i tre `STATO_*.md` e il codice già pubblicato
(`sql/000_setup.sql`, `sql/003_…`, `sql/test_regole.sql`, `js/comune.js`, `js/db.js`,
`js/reparto.js`, `js/reparto/hub.js`, `js/reparto/avvio.js`, `js/ufficio/live.js`,
`reparto.html`, `ufficio.html`, `css/base.css`, `css/reparto.css`, `tests/*.mjs`, `.gitignore`).
**Modalità:** sola lettura. Sul progetto `nbercxzpjflqfstwrryp` un solo `select` su
`pg_policies`, `information_schema.column_privileges` / `table_privileges`, `pg_proc`,
`pg_indexes`, `pg_publication_tables`, `pg_class`, `supabase_migrations.schema_migrations` e
conteggi sulle tabelle. Nessun file del progetto modificato oltre a questo.

## Primo controllo — aggiunte rispetto alla Fase 3 del piano

**Nessuna aggiunta fuori fase.** Confronto voce per voce:

| Voce del piano | Nel piano di fase | Esito |
|---|---|---|
| 1. Controllo: momento proposto, campi per zona, placeholder dal precedente, colore immediato con `fuoriRange` (gloss solo se satinata) | §2 | coperta; i campi gloss **nascosti** sui naturali sono una sottrazione non dichiarata (importante 3) |
| 2. Evento: sette tipi; difetto con catalogo e causa/azione; fermo con causa; aggiunta con prodotto e litri; giunta/taglio/primi metri con contametri; nota | §3 | coperta |
| 3. Fermo / Ripartenza dall'hub: fermo aperto nel banner; ripartenza con 100 m proposti e testo del manuale; `fermo_id` | §4 | coperta; il tasto Fermo nasce qui, come il §13 spiega |
| 4. Capoturno: "Ultimi controlli" con correzione, solo front-end | §5 | coperta |
| 5. Live: ultimo controllo con fuori range in rosso da `controlli_scostamenti`, fermo aperto, nastro della giornata | §6 | coperta |
| Guardia "colori coincidenti con la vista (test di coerenza)" | §8 | coperta, con i problemi di esecuzione dell'importante 2 |

Nessuna tabella, vista, RPC, policy o grant nuovi (§1, confermato in produzione, sotto). Nessuna
stampa dal tablet. Nessun tab nuovo in `ufficio.html`. Le dieci funzioni pure nuove stanno in
`js/comune.js` con i test (§7). `sql/test_coerenza.sql` e `tests/test-coerenza.mjs` sono il test
che lo spec §5.6 punto 3 e `CLAUDE.md` assegnano a questa fase, non una funzionalità. Il nastro
che comprende anche le lavorazioni chiuse o annullate del giorno (§6 righe 134-135) è una lettura
legittima di "nastro cronologico della giornata" (spec §4.3), non un'aggiunta.

## Verifica del §1 sulla produzione (2026-09-04, sola lettura)

| Affermazione del §1 | Trovato |
|---|---|
| policy: il reparto inserisce e corregge solo su lavorazione `aperta` | `ctl_ins`, `ctl_upd`, `ev_ins`, `ev_upd` = `e_ufficio() or (e_reparto() and exists (… stato = 'aperta'))`; `ctl_sel`, `ev_sel` = `true` |
| `durata_min` e `modificato_*` non scrivibili dal client | 0 grant insert/update su quelle colonne; update di `eventi` concesso su 11 colonne (senza `durata_min`), di `controlli` su 15 |
| due trigger dei fermi + migrazione 003 | `eventi_ripartenza` contiene `old.fermo_id`; indice `eventi_un_fermo_una_ripartenza` presente |
| `controlli_scostamenti` `security_invoker = true`, sola lettura | `security_invoker=true`; `authenticated` solo SELECT, `anon` niente (idem `rotoli_grezzi_reparto`) |
| realtime su tre tabelle | `controlli, eventi, lavorazioni` |
| — | 11 migrazioni (10 della Fase 0 + `004_seed_schede`); 10 tipi di difetto; 10 rotoli `COLLAUDO-*` in stato `grezzo`; 0 controlli, 0 eventi; una sola lavorazione, `annullata` (prova della Fase 2); operatori: `Marco` e `Davide` attivi e **entrambi `operatore`**, `COLLAUDO - non usare` disattivato; **51 schede su 51** con `fissaggio_temp_max` null |
| `_codici_figli`, `_controlla_figli_e_bilancio` | `has_function_privilege('authenticated', …, 'execute')` = **false** su entrambe (vedi importante 2) |

Il "niente cambia nel database" è quindi confermato, e nessun backup è dovuto (`CLAUDE.md`: prima
di ogni migrazione; qui non ce ne sono).

## Guardie del piano

- **`durata_min` mai scritta dal client** — rispettata nel disegno (§4 righe 99-100, §12 riga
  253) e in produzione (nessun grant). `test_regole.sql` righe 80-82 la prova.
- **insert del reparto respinto su lavorazione chiusa** — la policy c'è e `test_regole.sql`
  righe 107-110 la prova, ma il piano di fase **non ha un passo che la verifichi** in questa fase
  (importante 1).
- **colori del tablet coincidenti con la vista (test di coerenza)** — disegno giusto (una sola
  fonte dei numeri, §8), esecuzione da correggere (importante 2).
- **Il tablet non interroga mai `rotoli_grezzi`** — rispettata: le schermate nuove leggono
  `lavorazioni`, `schede_lavorazione`, `controlli`, `eventi`, `tipi_difetto`, `operatori` e la
  vista `controlli_scostamenti`, che unisce `controlli`, `lavorazioni` e `schede_lavorazione`
  (`000_setup.sql` righe 372-374) e non tocca `rotoli_grezzi`. Nessun percorso porta `fornitore`
  o `rif_bolla` al tablet. La prova §10.10 lo conferma sul traffico.
- **Risultato verificabile** — raggiungibile: turno intero (§10.1-10.6), rosso in Live (§10.7),
  durata dal trigger (§10.5).
- `git ls-files | grep -E "riferimenti|seed_schede|seed_difetti"` → vuoto. Nessun parametro di
  processo in `fase-3.md`: gli unici numeri sono i 100 m e i 20 min dello spec e il conteggio 51.

## Importante

1. **Le "verifiche preliminari in sola lettura del §7" non esistono** — `fase-3.md` §1 righe
   34-35 rimandano a un §7 che è "Funzioni pure nuove". Le Fasi 1 e 2 avevano la tabella
   Atteso/Trovato (`fase-2.md` §10.1) ed è quella che la revisione del codice confronta. Va
   scritta con almeno: le quattro policy `ctl_*`/`ev_*` su `stato = 'aperta'`, zero grant su
   `durata_min` e `modificato_*`, migrazione 003 applicata (`old.fermo_id` nel sorgente di
   `eventi_ripartenza`), indice `eventi_un_fermo_una_ripartenza`, realtime su tre tabelle, 11
   migrazioni, 10 `tipi_difetto`, almeno un `COLLAUDO-*` `grezzo`, operatori attivi con ruolo.
   Ho già trovato tutto corrispondente (tabella sopra): basta riportarlo. Nello stesso punto va
   detto che **`sql/test_regole.sql` viene rieseguito verde** all'inizio della fase: è l'unico
   passo che prova le due guardie del piano "insert del reparto respinto su lavorazione chiusa"
   (righe 107-110) e "`durata_min` mai scritta dal client" (righe 80-82), e costa un `begin …
   rollback`.

2. **`sql/test_coerenza.sql` come descritto non gira** — §8 righe 164-171. Tre ostacoli
   concreti: (a) `_codici_figli` e `_controlla_figli_e_bilancio` hanno `revoke execute … from
   authenticated` (`000_setup.sql` righe 645-646, confermato in produzione) e l'insert diretto in
   `lavorazioni` non ha grant (riga 740: solo update di alcune colonne): il file deve girare come
   `postgres`, **a differenza di `test_regole.sql`**, e il documento — e poi `CLAUDE.md` — lo
   devono dire; (b) una lavorazione inserita direttamente come `chiusa` deve rispettare
   `lavorazioni_caso_c` (`000_setup.sql` riga 187): con `kg_residui_dichiarati` a 0 serve
   `peso_tubolare_kg` **non null** (0 va bene), altrimenti il `check` respinge la riga prima di
   qualunque controllo; (c) oltre a "una scheda, una lavorazione chiusa e i controlli" servono un
   rotolo grezzo e un operatore (`rotolo_grezzo_id` e `operatore_avvio_id` sono `not null`, righe
   161 e 168). Il disegno a fonte unica è giusto e va tenuto: sono i tre dettagli di esecuzione
   che mancano.

3. **I campi del gloss nascosti sulle schede non satinate sono una sottrazione non dichiarata**
   — §2 righe 57-58 e `CAMPI_CONTROLLO` "solo satinato" (§7 riga 151). Lo spec §3.5 elenca i
   campi per zona senza condizione; il §2.6 dice che sui naturali il gloss "non si segnala", non
   che non si misura; `controlli` ha le colonne per ogni lavorazione e
   `registra_lavorazione_completa` le accetta su qualunque scheda (`000_setup.sql` righe
   609-614). Non è un'aggiunta, ma è una scelta di disegno che toglie una misura all'operatore.
   O si tengono i campi anche sui naturali (senza colore, come `tensione_v`), o si dichiara come
   interpretazione in §12 e nel rapporto, chiedendo al committente se sulla carta di oggi il gloss
   si scrive anche per i naturali.

4. **La temperatura di fissaggio non sarà mai rossa durante il pilota: è una decisione da porre
   al committente ora, non una riga del rapporto** — §12 righe 239-247. La scelta di non toccare
   la vista è coerente con "solo la fase richiesta" e con lo spec §2.6 ("range presente"): la
   condivido. Ma la conseguenza è concreta e già misurata (51 schede su 51 con
   `fissaggio_temp_max` null): né il tablet né Live segnaleranno mai una temperatura di fissaggio
   fuori. Va spostata in §11 fra le voci delegate, con la domanda secca: "il pilota parte con la
   temperatura di fissaggio mai segnalata, oppure prima si decide con un tecnico la regola
   'massimo assente = nessun limite superiore' (migrazione sulla vista + `fuoriRange` + test di
   coerenza)?". Chi decide è lui, e deve poterlo fare prima dell'addestramento.

## Minore

5. **L'insert della ripartenza è scritto senza `lavorazione_id` e `operatore_id`** — §4 riga 99.
   `lavorazione_id` è `not null` e il trigger la confronta con quella del fermo (`000_setup.sql`
   riga 294): scrivere l'elenco completo, così la revisione del codice ha il riferimento.

6. **Ora del fermo "al giorno di oggi"** — §3 righe 78-80. A cavallo di mezzanotte (fermo alle
   23:50 registrato alle 00:05) il giorno è sbagliato. Regola da scrivere: l'istante si costruisce
   dai componenti locali (`new Date(anno, mese, giorno, hh, mm)`), mai da una stringa
   `AAAA-MM-GGTHH:MM` senza fuso, e se risulta nel futuro si sposta al giorno prima. Un fermo
   messo nel futuro farebbe poi respingere la ripartenza dal trigger ("La ripartenza non può
   precedere il fermo"): messaggio giusto, ma evitabile.

7. **"Di oggi" nel nastro di Live** — §6 riga 133. Il confine del giorno va calcolato dalla
   mezzanotte **locale** (`new Date(a, m, g)` passato al `.gte()`), non da `slice(0,10)` o dal
   giorno UTC: è la regola di `CLAUDE.md` sulle date, e va detta perché è il primo filtro per
   giorno su un `timestamptz`.

8. **`fermoAperto` è una quarta derivazione duplicata** rispetto alle tre dichiarate — §4 righe
   93-94, §7 riga 153. È lettura, non regola (le RPC restano il giudice, `000_setup.sql` righe
   509-512 e 541-543), come "già lavorata" della Fase 2, ma va dichiarata fra le interpretazioni.
   Collegato: dalla schermata Evento (§3) si può aprire un **secondo** fermo mentre uno è aperto;
   la Ripartenza dell'hub chiude "il più recente" e l'altro resta aperto finché non lo si scopre
   alla chiusura. Proposta: nella schermata Evento il bottone Fermo si spegne se c'è un fermo
   aperto (è mostrare, non decidere), oppure dichiarare che due fermi aperti sono ammessi.

9. **Due stati rossi del banner** — §4 righe 95-96 e `hub.js` riga 128 (`scaduto` oltre i 20
   min). Dire quale vince (il fermo) e come si distinguono a occhio.

10. **CSS dell'hub e misure** — `.azioni` è `repeat(3, 1fr)` (`reparto.css` riga 58): con quattro
    tasti più "Ultimi controlli" cambia; §4 elenca solo `hub.js`. La ragione in parole sotto il
    campo rosso (§2 righe 53-54) va a ≥ 18 px, i campi numerici con `inputmode="decimal"`: la
    Fase 2 ha già avuto testi a 15 px, meglio scriverlo.

11. **Il test "ogni codice ammesso dal `check`"** — §7 riga 150. La lista dei codici in JS sarebbe
    copiata a mano dal SQL. Metterla nel JSON di `test_coerenza.sql`, con un `assert` SQL che i
    codici del `check` (`pg_get_constraintdef`) coincidano: una fonte sola, come per i colori.

12. **Dati di prova che restano** — §10.9. Controlli ed eventi della prova restano in produzione
    sull'annullata e compaiono nel nastro di Live per quel giorno: da elencare nello STATO come
    i dati della Fase 2 (l'operatore `COLLAUDO - non usare` è ancora lì, disattivato).

13. **"Lo fa la skill durante la prova"** — §11.1. È una scrittura su `operatori` in produzione:
    dire che si fa da Impostazioni con la sessione del committente e con il suo sì, e che resta
    scritto nello STATO chi l'ha fatto.

14. **Correzione del capoturno: `operatore_id`** — §5 righe 115-117. Dire se resta quello di chi
    ha misurato (proposta: sì) o diventa il capoturno; `modificato_da` dirà solo `reparto`
    (spec §2.9, nessuno storico), quindi la scelta va scritta.

15. **`CLAUDE.md` non è fra i file toccati.** Dovrà cambiare: la frase "il test di coerenza arriva
    con la Fase 3 … fino ad allora" (anche in testa a `comune.js`), il ruolo con cui gira
    `test_coerenza.sql`, la struttura dei file. `fase-2.md` lo elencava.

## Cose controllate e a posto (per non farle ricontrollare)

- Nessuna RPC, policy o grant nuovi; le quattro RPC esistenti hanno `security definer`,
  `search_path`, guardia `coalesce` e revoke da `anon`/`public` (verificate nella Fase 2).
- Il tasto Fermo (§4) è spec §3.3 + piano voce 3; il §13 risolve bene la contraddizione con la
  Fase 2.
- Flussi: Controllo 1 schermata, Evento 2, Ripartenza 1, Ultimi controlli → correzione 2. Nessun
  `<select>`; i dieci difetti come bottoni in colonna sono ammessi (spec §3.1 non vieta i bottoni
  oltre le 8 voci; `CLAUDE.md` vieta i `<select>`). `<input type="time">` non è un `<select>`.
- `rilevato_il` non inviato (default del DB), campo vuoto → `null`, `salva()` con `onStato`:
  coerenti con `CLAUDE.md` e `db.js`.
- La correzione del capoturno è un `update` su `controlli` coperto da `ctl_upd` e dal grant sulle
  15 colonne; `modificato_*` dal trigger.
- `PRODOTTI_AGGIUNTA` (satina, ammoniaca, altro) sono i nomi dello spec approvato §3.6, non
  quelli di `<vasca>_prodotto`: nessuna fuga nuova.
- `comune.js` resta senza `import` e senza DOM; le dieci funzioni sono etichette, letture e
  costanti dello spec, con i test elencati.
- `test-dom-ids.mjs` cerca `byId("…")` letterali: le quattro coppie nuove funzionano se i moduli
  usano stringhe fisse, come `hub.js`.
- La lettura di `controlli_scostamenti` dal tablet (§5) funziona: `security_invoker = true` e il
  reparto ha `select` su `controlli`, `lavorazioni` e `schede_lavorazione`.
- Pulizia con `annulla_lavorazione` a 0 metri dopo la ripartenza: il rotolo di collaudo torna
  `grezzo` con `kg_residui` intatti (`000_setup.sql` riga 561).

## Conclusione

Il piano della Fase 3 fa le cinque cose del PIANO e niente di più, e quello che dice del
database l'ho ritrovato uguale in produzione. Prima di partire vanno sistemate quattro cose: la
tabella delle verifiche preliminari che il documento promette ma non contiene, il test di
coerenza che così com'è non può girare, i campi del gloss tolti ai naturali senza dirlo, e la
temperatura di fissaggio che non sarà mai segnalata — quest'ultima è una domanda per il
committente, da fare adesso. Il resto sono rifiniture.
