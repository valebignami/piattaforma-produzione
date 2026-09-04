VERDETTO: NESSUN BLOCCANTE
MODELLO: claude-fable-5-1

# Revisione indipendente — Fase 2, codice, giro 1

**Oggetto:** `git diff main...fase-2` (5 commit, 17 file, +2062/−5) contro
`PIANO_funzionalita.md` §3 Fase 2 (punti 1-5) e §2 Decisioni prese, la spec di fase
`docs/superpowers/specs/fase-2.md`, lo spec `2026-09-03-ciclo-bobina-design.md` (§2.1, §2.2,
§2.7, §2.8, §3.1-3.4, §4.3, §5.2, §5.3, §5.5, §5.7, §8), `CLAUDE.md`, `STATO_2026-09-03.md`,
`STATO_2026-09-04.md`, la revisione del piano `fase-2-piano-1.md`. Letti dal disco anche i
file gitignorati che la fase tocca: `sql/seed_schede.sql` (generato da
`tools/importa_schede.py`, 90 righe, 51 tuple).
**Modalità:** sola lettura. Sul progetto `nbercxzpjflqfstwrryp` solo `select` su
`pg_proc`, `pg_policies`, `pg_publication_tables`, `pg_class`, `information_schema.columns`,
`role_table_grants`, `role_column_grants`, `supabase_migrations.schema_migrations` e conteggi.
La migrazione `004_seed_schede` **non è stata applicata** e non l'ho applicata:
`schede_lavorazione` è a 0 righe. Nessun file del progetto modificato oltre a questo.
Questo documento finisce nel repo pubblico: non riporta nessun valore di processo.

## `node --test tests/` (branch `fase-2`)

```
ℹ tests 44   ℹ pass 44   ℹ fail 0   ℹ cancelled 0   ℹ skipped 0   ℹ todo 0
```

34 test di funzioni pure (31 della Fase 0-1 + `minutiDa`, `oraItaliana`, `etichettaScheda`)
e 10 coppie di id DOM (le 6 precedenti + `js/ufficio/live.js` → `ufficio.html`,
`js/reparto.js`, `js/reparto/hub.js`, `js/reparto/avvio.js` → `reparto.html`). Nessun warning.
I test della Fase 1 restano verdi dopo il ritocco di `js/ufficio/pianificazione.js`.

## Primo controllo — aggiunte rispetto alla Fase 2 del piano

**Nessuna aggiunta fuori fase.** Confronto voce per voce:

| Voce del piano | Dove | Esito |
|---|---|---|
| 1. `importa_schede.py` → `seed_schede.sql` (51 schede dal Word), confronto Word/Excel, applicazione | `tools/importa_schede.py`; `sql/seed_schede.sql` (gitignorato); confronto descritto in `fase-2.md` §2.1 | coperta nel codice; **applicazione ancora da fare** (0 righe in produzione: è il passo che manca, non un difetto) |
| 2. `reparto.html`, shell tablet, operatore in `localStorage`, indicatore di rete | `reparto.html`, `css/reparto.css`, `js/reparto.js` | coperta |
| 3. Hub libero / in corso, tre tasti spenti "dalla prossima fase", "Altro… → Annulla avvio" → `annulla_lavorazione` | `js/reparto/hub.js`, `reparto.html` righe 57-86, 134-143 | coperta; nessun tasto Fermo (Fase 3, come deciso nel piano di fase §11.4) |
| 4. Avvia rotolo in tre schermate → `avvia_lavorazione` | `js/reparto/avvio.js`, `reparto.html` righe 89-131 | coperta: 1 quale rotolo, 2 quale scheda (parametri dentro la 2), 3 pesate |
| 5. Tab Live, sola lettura, realtime | `js/ufficio/live.js`, `ufficio.html` righe 42 e 172-181 | coperta; nessun tasto che scrive, nessun grant nuovo |

Cose in più esaminate e **non** giudicate aggiunte:
- `etichettaScheda` nell'`<option>` della Pianificazione (`pianificazione.js` righe 149-151,
  159): interpretazione dichiarata nel piano di fase (§11) e già accettata dalla revisione del
  piano; una sola etichetta cambia, nessun comportamento.
- La riga di servizio sotto il riquadro Live ("Aggiornato alle … · in ascolto") — è il modo
  per vedere che il realtime della voce 5 funziona.
- Il riquadro Live mostra, oltre a rotolo/scheda/operatore/avvio, anche misure, cliente, peso
  con imballo e contametri iniziale (`live.js` righe 61-73): righe di lettura della stessa
  lavorazione, dentro il perimetro dello spec §4.3.
- PIANO §2: tre righe di decisioni del committente (lega vuota, operatori del pilota, stop
  carta non deciso) e il "51" al posto di "~60" nel risultato verificabile: chiesto dalla
  revisione del piano (punto 14), documentazione e non codice.

Nessuna migrazione di schema, nessuna tabella, funzione, policy o grant nuovi (confermato in
produzione, sotto). Nessuna stampa dal tablet: `stampa` non compare in nessun file del reparto.

## Produzione (2026-09-04, sola lettura) contro `fase-2.md` §10.1

| Verifica | Atteso | Trovato |
|---|---|---|
| `schede_lavorazione` | 0 righe (004 non applicata) | **0** |
| rotoli `COLLAUDO-*` in `grezzo` | 10 | 10 (su 10 rotoli totali) |
| `operatori`, `lavorazioni`, `pianificazione`, `controlli`, `eventi`, `rotoli_lavorati` | vuote | 0 / 0 / 0 / 0 / 0 / 0 |
| migrazioni | 10 | 10 |
| `avvia_lavorazione`, `annulla_lavorazione` | `security definer`, `search_path=public`, execute solo `authenticated` | `prosecdef=true`, `{search_path=public}`, acl `{postgres, authenticated, service_role}` — nessun `anon`/`public`; idem `chiudi_lavorazione`, `registra_lavorazione_completa`, `ruolo_utente` |
| helper `_codici_figli`, `_controlla_figli_e_bilancio`, `_inserisci_figli` | nessun execute a `authenticated` | acl `{postgres, service_role}` |
| `rotoli_grezzi_reparto` | `security_invoker=false`; senza `fornitore`, `rif_bolla`; `authenticated` solo SELECT | uguale: 16 colonne, mancano proprio quelle due; `anon` assente |
| `grezzi_sel` | `e_ufficio()` | uguale |
| `lav_sel`, `pian_sel`, `ctl_sel`, `ev_sel`, `schede_sel`, `operatori_sel` | `true` | uguale |
| grant per colonna su `lavorazioni`, `rotoli_grezzi`, `rotoli_lavorati`, `controlli`, `eventi` | mai `stato`, `codice`, `modificato_*`, `durata_min`, `kg_al_metro`, `metri_stimati` in insert/update | confermato (in update di `lavorazioni` le sette colonne dello spec §5.3, esatte) |
| realtime | `controlli, eventi, lavorazioni` | uguale |
| RLS spenta su qualche tabella | nessuna | nessuna |

Le firme delle due RPC chiamate dal tablet coincidono con `hub.js` riga 153 e `avvio.js`
riga 225; `p_avviata_il` non si passa (la RPC lo sovrascrive per il reparto,
`000_setup.sql`: `if coalesce(ruolo_utente(),'') <> 'ufficio' then p_avviata_il := now()`).

## Guardie del piano

- **Il tablet non interroga mai `rotoli_grezzi`.** `git grep` sul branch: la stringa
  `"rotoli_grezzi"` (senza `_reparto`) compare in un solo file JS, `js/ufficio/live.js` riga
  48, che è dell'ufficio. `hub.js` (righe 61, 104) e `avvio.js` (righe 65, 109) leggono solo
  `rotoli_grezzi_reparto`; nessun `select` annidato da `pianificazione` o `lavorazioni` verso
  la tabella. Nessuna via porta `fornitore` o `rif_bolla` al tablet: la vista non le ha, e la
  policy `grezzi_sel` chiude la tabella.
- **Nessuna logica di stato nel front-end.** Le regole stanno nelle RPC (stato del grezzo,
  pesi, orario, motivo, metri ≤ stimati) e nell'indice unico. Il tablet spegne il bottone di
  un rotolo non `grezzo` (`avvio.js` riga 90) e abilita "Avvia" solo con pesi coerenti
  (`avvio.js` riga 211): filtri di interfaccia dichiarati in `fase-2.md` §8, il messaggio
  finale è quello della RPC (`avvio.js` riga 236, `hub.js` riga 162).
- **Niente `<select>`** in `reparto.html` (nessuna occorrenza). Elenchi come bottoni:
  operatori, programma, risultati della ricerca (max 8), schede.
- **Ergonomia:** tasti 56-88 px (`reparto.css` righe 17, 32, 36, 40, 56, 65); flussi:
  avvio 3 schermate, annullo 1; "Indietro" in alto a sinistra e contestuale (`reparto.js`
  righe 32-35, 130-133); `inputmode="decimal"` sui numerici. **Un testo sotto i 18 px c'è**
  (importante 1).
- **Risultato verificabile:** raggiungibile. Il seed ha guardia, 51 tuple, `assert` finali e
  transazione unica dichiarata in testa; avvio e annullo su un `COLLAUDO-*` sono i flussi
  costruiti; Live riceve `postgres_changes` su `lavorazioni`. Le prove nel browser (§9 della
  spec di fase) non sono ancora documentate: non esiste uno `STATO` della Fase 2 nel branch,
  quindi qui giudico il codice, non il collaudo.
- **Know-how:** `git ls-files | grep -E "riferimenti|seed_schede|seed_difetti"` → vuoto;
  `git log --all --name-only` → vuoto anche nella storia. `.gitignore` copre
  `sql/seed_schede.sql`. `tools/importa_schede.py` e `fase-2.md` riconoscono **formati**
  (`intervallo`, `tolleranza`, `micron_dal_nome`, righe 90-126) e non contengono valori;
  i conteggi (51/30/21/18/29) non sono parametri. Un'eccezione ereditata: importante 2.
- **CLAUDE.md:** nessuna regola violata nel codice (date sui componenti locali con
  `oraItaliana`/`minutiDa`; campi vuoti → 0 dichiarato o `null`; `db.js` unico a conoscere
  Supabase; nessuna cache-buster; stesso `integrity` SRI `sha384-SR76…Ycq` in `reparto.html`
  riga 11). Il file stesso però non è aggiornato (minore 4).

## Importante

1. **Le etichette dei campi sul tablet sono a 15,2 px, sotto i 18 px dello spec §3.1** —
   `css/base.css` riga 7: `label { font-size: .95rem }`. Il `rem` si misura sulla radice
   (`html`), che nessun foglio imposta: 0,95 × 16 = **15,2 px**. `body.reparto { font-size:
   19px }` (`reparto.css` riga 7) non c'entra, perché `rem` non guarda il `body`. Colpisce le
   otto `label` di `reparto.html`: Email, Password (righe 19, 21), "Peso con imballo (kg)",
   "Peso dell'imballo (kg)", "Contametri iniziale" (122, 124, 127), "Perché lo annulli?",
   "Metri di nastro consumati" (137, 139) — proprio i testi che l'operatore legge mentre pesa.
   Il commento di `reparto.css` righe 4-5 dice che `base.css` garantisce i 18 px: vale per
   `input` e `button`, non per `label`. Correzione a una riga: in `reparto.css`,
   `body.reparto label { font-size: 18px; }` (o `.schermata label`). Da controllare anche
   `.esito`/`.vuoto` non ne hanno bisogno (18 e 19 px, a posto).

2. **Valori di processo reali in un file tracciato** — `tests/test-comune.mjs` righe 56 e 60
   (fixture di `fuoriRange`): due set point di temperatura di vasca, una velocità di linea e
   una corrente che coincidono con righe vere di `sql/seed_schede.sql` (verificato sul file
   gitignorato; qui non li riporto). Le righe **vengono da `main`** (Fase 0), non da questa
   fase, e le due revisioni precedenti le hanno lasciate passare; ma il file è tracciato, la
   Fase 2 lo tocca (righe 210-246) e il repo è pubblico. I test non dipendono dai valori veri:
   basta sostituirli con numeri di fantasia (per esempio riferimenti 100 / 50 / 10 / 1000 con
   range altrettanto inventati) e rieseguire `node --test tests/`. La fixture nuova di
   `etichettaScheda` (righe 232-245) contiene solo nomi di lavorazione e misure di spessore e
   larghezza, che non sono parametri di processo: va bene così.

3. **"Tre schede a campione" promesse, una sola scritta** — `fase-2.md` §2.3 punto 3 ("i
   valori delle **tre schede a campione** confrontate con l'Excel, scritti per esteso") e
   PIANO §3 Fase 2 ("tre a campione coincidono con l'Excel"); `tools/importa_schede.py` riga
   237: `campione = sorted(...)[:1]` — **una** scheda, e l'`assert` (righe 284-297) confronta
   11 campi, non i quindici del §2.1 (mancano `finitura`, i prodotti e le temperature di
   satinatura). `sql/seed_schede.sql` righe 85-89 lo confermano: un solo `assert` a campione.
   Il confronto automatico Word↔Excel di §2.1 ("zero differenze su 51") non è nel repo, quindi
   l'unica prova che resta eseguibile è quella dentro il seed. Due strade, entrambe piccole:
   `[:3]` con tre schede scelte come nel §2.1 (la più stretta di due lavorazioni e una
   satinata) e i 15 campi; oppure correggere la spec di fase e il rapporto dicendo che
   l'`assert` copre una scheda e il confronto a tre è stato fatto fuori dal repo. La prima è
   quella che fa tornare i conti con il risultato verificabile del piano.

## Minore

4. **`CLAUDE.md` non aggiornato** — `fase-2.md` §1 lo elenca fra i file toccati ("pagine,
   struttura, trappole") ma il diff non lo contiene: "Pagine" cita solo `index`, `ufficio`,
   `stampa`; "Struttura" non ha `reparto.html`, `css/reparto.css`, `js/reparto.js`,
   `js/reparto/`, `js/ufficio/live.js`, `tools/`. In Fase 1 l'aggiornamento è arrivato nel
   commit di chiusura ("stato definitivo e CLAUDE.md aggiornato"): va fatto anche qui, con la
   trappola nuova (`rem` e `label`, punto 1) e la regola "il reparto legge solo la vista".

5. **`test-dom-ids.mjs` non vede gli id passati per variabile** — `reparto.js` riga 55
   `byId(s.pannello)` (`rep-sch-operatore/hub/avvio/annullo`) e `avvio.js` riga 29
   `byId(id)` (`rep-avvio-1/2/3`). Esistono tutti in `reparto.html` (righe 48, 57, 89, 134,
   93, 105, 119), ma il test non lo prova. Non serve cambiare il test: basta che una riga dei
   moduli li nomini come letterali, o si accetta il buco sapendolo.

6. **Il quadratino "Mostra tutte" è 32 × 32 px** — `reparto.css` riga 62. Il bersaglio
   dichiarato è l'etichetta a 56 px (riga 61, commento alla riga 60) e funziona; chi mira al
   quadratino tocca 32 px. Coerente con lo spec se si considera la label il tasto.

7. **Le schede si leggono una volta per vita della pagina** — `avvio.js` righe 121-126
   (`if (schede.length === 0)`). Un tablet aperto da giorni non vede una scheda aggiunta
   dall'ufficio. In questa fetta le schede sono in sola lettura (spec §2.1) e la 004 si applica
   una volta: oggi non fa danno, ma va annotato nello STATO per la fase in cui le schede
   diventeranno modificabili.

8. **Dall'hub, il tap su una riga "In programma" apre la schermata 1 senza preselezionare il
   rotolo** — `hub.js` riga 76 (`contesto.vaiA("avvio")`): l'operatore tocca lo stesso rotolo
   due volte. Conforme allo spec §3.3-3.4 (la schermata 1 *è* "quale rotolo"), e mantiene la
   scelta in un posto solo; da tarare dopo il primo turno in affiancamento, se dà fastidio.

9. **`avvio.js` importa `rigaGrezzo` da `hub.js`** (riga 9): una schermata che dipende da
   un'altra. È una funzione di DOM (non può stare in `comune.js`) e l'alternativa sarebbe un
   quarto file; accettabile, ma è l'unico import incrociato fra schermate del progetto.

10. **`salva()` in `db.js` riga 17 classifica l'errore di rete per testo del messaggio** —
    annotazione aperta dalla Fase 0; la Fase 2 è il primo consumatore con un ritentativo che
    ha effetti (`avvia_lavorazione`): il caso "riuscita ma senza risposta" è descritto in
    `fase-2.md` §11 (interpretazioni) con i messaggi italiani giusti. Resta da vedere in un
    guasto vero.

11. **Prove nel browser e STATO della fase assenti dal branch** — `fase-2.md` §9 elenca otto
    prove (fra cui `read_network_requests` senza `/rest/v1/rotoli_grezzi?` dal tablet e le
    misure a 1024 × 768). Nel branch non c'è `STATO_*` della Fase 2 né il rapporto: sono
    attesi al commit di chiusura, e la prova di rete andrà **rifatta dopo** la correzione del
    punto 1, che cambia il CSS.

## Cose controllate e a posto (per non farle ricontrollare)

- `sql/seed_schede.sql` (gitignorato): intestazione che dichiara la transazione unica e
  l'uso da `psql`; guardia `if exists (select 1 from schede_lavorazione)`; un solo `insert`
  con 51 tuple sulle 28 colonne, tutte presenti in `schede_lavorazione` (confrontate con
  `information_schema.columns` in produzione); `lega` sempre `null` come deciso (PIANO §2);
  `assert` finali su 51 / 30 / 21 / 5 micron distinti / 21 satinature / 29 note / velocità
  mai nulla. I vincoli di tabella (`tipo` in naturale/satinato, `micron > 0`,
  `spessore_max ≥ spessore_min`, `larghezza_max ≥ larghezza_min`) sono rispettati dalle
  regole dell'importatore (`intervallo` rifiuta max < min, riga 100).
- `tools/importa_schede.py`: testa con versione di Python e dipendenza; regex sui formati,
  errore su formato ignoto (righe 99, 116, 123, 156, 168, 184); `NEUTRO` letto, contato, non
  importato (righe 45, 188-189); `micron` degli intervalli → punto medio, dichiarato; conteggi
  attesi come sentinella (riga 48). Italiano ovunque, anche nell'`argparse`.
- `reparto.html`: tre stati di pagina (login / "Questa pagina è del reparto" / app); stesso
  `<script>` UMD 2.110.6 con `integrity` identico a `index.html`, `ufficio.html`,
  `stampa.html`; tutti i 62 id elencati in `fase-2.md` §3 presenti.
- `reparto.js`: `localStorage` sempre in `try/catch` (righe 38-43); memorizza solo l'id, il
  nome si rilegge (`riprendiOperatore`, filtro `attivo = true`); operatore disattivato →
  torna alla scelta; "Nessun operatore…" quando l'elenco è vuoto; ridisegno solo al cambio
  reale di sessione (righe 101-114).
- `hub.js`: una sola interrogazione decide l'hub (`stato = 'aperta'` e `linea = '1500'`);
  con zero righe di programma niente `.in()` vuoto (righe 54-58); "già lavorata" con la
  definizione dello spec §2.3 (`neq("stato","annullata")`, riga 62); primo evidenziato;
  banner rosso oltre `SOGLIA_CONTROLLO_MIN` contando dall'avvio se non ci sono controlli
  (righe 118-128); metri solo con un contametri; il messaggio di riuscita si scrive dopo il
  ridisegno (righe 38-40); "Annulla avvio" con motivo obbligatorio (tasto spento finché vuoto)
  e metri default 0.
- `avvio.js`: "Cerca altro numero" su `rotoli_grezzi_reparto` con `ilike`, `.order("n_prog")`,
  `.limit(8)` (riga 110); schede compatibili ordinate per micron con "Mostra tutte";
  parametri per vasca dentro la schermata 2 con "Indietro" che torna all'elenco (riga 193);
  imballo default 0 e contametri default 0; netto provvisorio a vista; `p_pianificazione_id`
  solo se scelto dal programma (`null` dalla ricerca, riga 113); errori della RPC mostrati
  così come arrivano; nessun salvataggio parziale.
- `live.js`: legge la tabella `rotoli_grezzi` (è ufficio); quattro letture distinte per
  evitare l'ambiguità delle due FK verso `operatori`; `removeChannel` **atteso** prima di
  riaprire (riga 95); stati `CHANNEL_ERROR`/`TIMED_OUT` → messaggio; l'interruttore collaudo
  non filtra Live, come dichiarato e coerente con la Fase 1.
- `comune.js`: nessun `import`, nessun DOM; `minutiDa` con `adesso` iniettabile;
  `oraItaliana` sui componenti locali (nessun `toISOString`/`slice`); `etichettaScheda` con
  `Intl.NumberFormat` it-IT. Test per null, stringa vuota, data non valida, ora legale, virgola.
- `ufficio.js`/`ufficio.html`: Live è la quarta voce fra Pianificazione e Impostazioni;
  `.esito` e `.vuoto` esistono già in `ufficio.css` (righe 34-37).
- Messaggi d'errore e UI tutti in italiano; identificatori in italiano (`rete`, `esito`,
  `servizio`, `passo`, `scelta`…).
- `PIANO_funzionalita.md`: "tre a campione coincidono con l'Excel **sui parametri di
  processo**" — la precisazione chiesta dalla revisione del piano c'è.

## Conclusione

Il codice fa le cinque cose della Fase 2 e niente di più; il database in produzione è quello
che la spec di fase dichiara, le schede non sono ancora caricate come richiesto, e nessun file
di know-how è nel repo né nella sua storia. Prima di pubblicare vanno sistemate tre cose
piccole: le scritte sopra i campi del tablet sono più piccole del minimo stabilito, un vecchio
test contiene quattro numeri veri di processo da sostituire con numeri inventati, e il
caricamento delle schede verifica una scheda a campione invece delle tre promesse.
