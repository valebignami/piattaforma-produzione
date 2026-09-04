VERDETTO: NESSUN BLOCCANTE
MODELLO: claude-fable-5-1

# Revisione indipendente — Fase 2, piano, giro 1

**Oggetto:** `docs/superpowers/specs/fase-2.md` (2026-09-04, non ancora committato) contro
`PIANO_funzionalita.md` §3 Fase 2 (punti 1-5) e §2 Decisioni prese, spec
`2026-09-03-ciclo-bobina-design.md` (§2.1, §2.3, §2.7, §2.8, §3.1-3.4, §4.3, §5.2, §5.3, §5.5,
§5.7, §7, §8), `CLAUDE.md`, `STATO_2026-09-03.md`, `STATO_2026-09-04.md`, e il codice già
pubblicato (`js/comune.js`, `js/db.js`, `js/ufficio.js`, `js/ufficio/pianificazione.js`,
`ufficio.html`, `tests/*.mjs`, `sql/000_setup.sql`).
**Modalità:** sola lettura. Sul progetto `nbercxzpjflqfstwrryp` ho eseguito un solo `select`
su `pg_proc`, `pg_policies`, `pg_publication_tables`, `pg_indexes`, `pg_class`,
`information_schema.columns` / `role_table_grants`, `supabase_migrations.schema_migrations` e
conteggi sulle tabelle. Nessun file del progetto modificato oltre a questo.

## Primo controllo — aggiunte rispetto alla Fase 2 del piano

**Nessuna aggiunta fuori fase.** Confronto voce per voce:

| Voce del piano | Nel piano di fase | Esito |
|---|---|---|
| 1. `importa_schede.py` → `seed_schede.sql`, confronto Word/Excel, applicazione | §2, §10.2 (`004_seed_schede`) | coperta; il confronto è su tutte e 51 le schede invece di tre: più di quanto chiesto, non una funzionalità in più |
| 2. `reparto.html`, shell tablet, operatore in `localStorage`, indicatore | §3 | coperta |
| 3. Hub libero / in corso, tre tasti spenti, "Altro… → Annulla avvio" | §4 | coperta; niente tasto Fermo (§11.4, coerente con l'elenco del piano) |
| 4. Avvia rotolo in tre schermate → `avvia_lavorazione` | §5 | coperta |
| 5. Tab Live, sola lettura, realtime | §6 | coperta |

Nessuna funzione SQL nuova, nessuna tabella, nessun grant, nessuna policy: confermato dal §10.1
e dalla produzione (sotto). Nessuna stampa dal tablet. Nessun tab oltre Live in `ufficio.html`.
Le tre funzioni pure nuove stanno in `js/comune.js` con i test, come richiesto dal PIANO §1.

Due cose non sono voci del piano ma non le giudico aggiunte: la riga di servizio sotto il
riquadro Live ("Aggiornato alle … · in ascolto / collegamento interrotto", §6) è il modo per
vedere se il realtime richiesto dalla voce 5 funziona, non una funzionalità; il ritocco
dell'etichetta in `js/ufficio/pianificazione.js` (§7, interpretazione dichiarata) è discusso fra
gli **importanti** perché la motivazione è più forte di quanto serva.

## Verifica del §10.1 sulla produzione (2026-09-04, sola lettura)

Tutte le affermazioni corrispondono:

| Affermazione del §10.1 | Trovato in produzione |
|---|---|
| `schede_lavorazione` 0 righe | 0 |
| rotoli `COLLAUDO-*` in stato `grezzo` ≥ 1 | 10 su 10 |
| `avvia_lavorazione`, `annulla_lavorazione` `security definer`, `search_path=public` | entrambe `prosecdef = true`, `proconfig = {search_path=public}` |
| `execute` solo ad `authenticated` (+ `postgres`, `service_role`) | acl `{postgres, authenticated, service_role}`, nessun `anon`/`public` |
| `rotoli_grezzi_reparto`: `authenticated` solo SELECT, `anon` niente | `authenticated: SELECT`; `anon` assente; `security_invoker=false`; colonne senza `fornitore` e `rif_bolla` |
| `pian_sel`, `lav_sel`, `ctl_sel` `using (true)` | uguale (anche `ev_sel`) |
| `grezzi_sel` = `e_ufficio()` | uguale |
| realtime su 3 tabelle | `controlli, eventi, lavorazioni` |
| 10 migrazioni | 10 |

In più: `lavorazioni_una_aperta_per_linea` è `unique (linea) where stato = 'aperta'` (il §4
lo cita correttamente); le firme delle due RPC coincidono con quelle scritte in §4.3 e §5;
`operatori`, `lavorazioni`, `pianificazione` sono a 0 righe, coerente con §9 "Operatore per le
prove". Le due RPC hanno la guardia `coalesce(ruolo_utente(),'')` e i messaggi citati in §4.3 e
§5 sono, parola per parola, quelli del sorgente (`sql/000_setup.sql` righe 473-476, 490, 537,
540, 548).

Il **"nessuna migrazione di schema"** è quindi confermato: la sola scrittura è il seed.

## Guardie del piano

- **Il tablet non interroga mai `rotoli_grezzi`** — rispettata nel disegno: §4.1 (tre
  interrogazioni esplicite, niente `select` annidato sulla tabella), §4.2 (banner dalla vista),
  §5 (programma e "Cerca altro numero" dalla vista). Nessun percorso porta `fornitore` o
  `rif_bolla` al tablet: la vista non ha le colonne, `grezzi_sel` blocca la tabella, e non ci
  sono join annidati. Live legge la tabella ma è dell'ufficio (§6).
- **Nessuna logica di stato nel front-end** — rispettata: la tabella del §8 mette ogni regola
  nella RPC, nell'indice o nella policy; il tablet spegne bottoni e mostra i messaggi della RPC.
  `schedeCompatibili` e la soglia del colore sono filtri di interfaccia, come dichiarato.
- **Niente `<select>` per elenchi ≤ 8 voci** — rispettata e rafforzata (nessun `<select>` in
  tutto `reparto.html`, §3). Ergonomia: `css/base.css` già impone `min-height: 56px` e
  `font-size: 18px` su `input` e `button`; `reparto.css` deve solo non abbassarli.
- **Risultato verificabile** — raggiungibile: 51 schede + tre a campione con `assert` nel seed
  (§2.3); avvio e annullo su un `COLLAUDO-*` (§9.4, §9.7); Live entro un secondo (§9.6).
- `git ls-files | grep -E "riferimenti|seed_schede|seed_difetti"` → vuoto. `.gitignore` copre
  `sql/seed_schede.sql`. `tools/` non esiste ancora.

## Importante

1. **`lega` null su 51 schede: è una contraddizione piano/spec da far decidere al committente
   prima di applicare `004`, non dopo** — `fase-2.md` §2.1 righe 69-71 e §11.1 righe 398-403.
   Lo spec §2.1 elenca `lega` fra le colonne importate e l'Excel la valorizza su 51 righe su
   51; la decisione del PIANO §2 (riga 46) dice esplicitamente che vale "solo per il file di
   partenza, non per le regole di conversione". `lega` non è una regola di conversione: è un
   dato che il Word non ha e l'Excel sì. Il PIANO in testa (riga 7) dice "se una voce qui
   contraddice lo spec, fermarsi e dirlo": il piano di fase lo dice ma non si ferma, e
   risolve da solo a favore del piano. Non è bloccante perché null è la scelta reversibile e la
   colonna non entra in nessuna regola (`schedeCompatibili` usa solo le misure), ma il
   committente va interpellato **prima** della migrazione con una domanda secca: "la lega la
   prendo dall'Excel (51 righe) o resta vuota?". Rifare l'importazione dopo costa una
   migrazione di correzione. Da notare anche che il risultato verificabile ("tre a campione
   coincidono con l'Excel") vale per i quindici campi confrontati e non per `Lega`, `Cliente`
   e le note: il rapporto lo deve dire con queste parole.

2. **Valori di processo dentro un documento tracciato nel repo pubblico** — `fase-2.md` §2.2
   righe 89-105 (esempio `Velocità linea: 3,7 m/min`, elenco delle tolleranze `33-39`, `46-60`,
   `50-62`, `52-68`, `min 88`, `min 92`, `NEUTRO 20 °C`), §2.1 riga 67 (testo di un avviso), e
   la lista bianca delle tolleranze che `tools/importa_schede.py` conterrà (§2.2 riga 104).
   `docs/superpowers/specs/fase-1.md` è tracciato, quindi anche `fase-2.md` lo sarà. Le tre
   voci gitignorate di `CLAUDE.md` sono rispettate alla lettera, ma la ragione della regola
   ("contiene i parametri di processo, e il repo è pubblico", §2.3 riga 109) vale anche per
   questi frammenti. Correzione a costo zero: nel documento sostituire i valori con
   segnaposto ("`N m/min`", "`A-B`", "`min N`", "una temperatura fissa") e nell'importatore
   riconoscere i **formati** con espressioni regolari (`^\d+-\d+$`, `^min \d+$`, `—`) invece di
   elencare i valori; l'errore su formato ignoto resta.

3. **Il ritocco di `js/ufficio/pianificazione.js` è accettabile ma la motivazione è
   sovrastimata** — `fase-2.md` §7 righe 430-435 e §1 riga 31. L'`<option>` di oggi
   (`pianificazione.js` riga 149: `${lavorazione} (${micron} my)`) è alimentata da
   `schedeCompatibili` sulle misure del grezzo: delle dodici "OX Naturale 3 micron" ne compaiono
   solo quelle il cui intervallo contiene il rotolo, di norma una o due. L'ambiguità reale c'è
   con "mostra tutte" e con intervalli sovrapposti, quindi il cambio è utile e non dannoso, e
   riusa una funzione che la fase deve comunque scrivere. Va tenuto, ma il §7 deve dire che il
   caso "inservibile" è quello di "mostra tutte", non la voce 4 in generale; e la riga 36 del §1
   ("nessun file della Fase 1 cambia comportamento, tranne l'etichetta") va confermata dai test
   della Fase 1 rieseguiti verdi.

4. **Il backup via connettore prima della migrazione non è scritto** — `fase-2.md` §10 (righe
   364-392). `CLAUDE.md` ("Backup via connettore prima di ogni migrazione") e il PIANO §1 lo
   impongono; lo STATO della Fase 1 lo documenta come passo 6.1. Il §10 va completato con:
   backup in `Backup app/<data>/` prima di `004_seed_schede`, con il conteggio delle tabelle
   nel README. La skill probabilmente lo fa comunque, ma il piano di fase è il documento che
   la revisione del codice confronterà.

## Minore

5. **`004_seed_schede` in tre blocchi: dire che la migrazione è atomica** — §2.3 righe 112-118.
   Guardia (`do $$ … $$`), `insert`, `assert` finali (`do $$ … $$`). Se un `assert` fallisce
   dopo l'`insert`, le 51 righe restano solo se la migrazione non è in una transazione unica.
   `apply_migration` la esegue in una transazione, ma il documento deve dirlo, o mettere tutto
   dentro un solo blocco `do`, così un seed sbagliato non lascia mezze schede e la guardia non
   scatta al secondo tentativo.

6. **Campo `peso imballo` vuoto** — §5 righe 244-246. Con la regola di `CLAUDE.md` (vuoto →
   `null`) la RPC risponderebbe "Il peso dell'imballo non può essere negativo" (`000_setup.sql`
   riga 477), messaggio fuorviante per un campo lasciato vuoto. Il campo deve avere default
   `0` (spec §3.4: "0 ammesso") o `required`, come `contametri iniziale` che ha già default 0.

7. **`.in("id", [])` con programma vuoto** — §4.1 righe 187-190. Con zero righe di
   pianificazione, le interrogazioni 2 e 3 vanno saltate, non eseguite con una lista vuota: si
   evita una chiamata inutile e un'eventuale risposta anomala di PostgREST.

8. **Hub: filtrare `linea = '1500'`** — §4 riga 173. L'indice unico è per linea; oggi esiste
   solo la 1500, ma la lettura "la lavorazione aperta" è più esatta con `.eq("linea","1500")`,
   e costa una clausola.

9. **"Cerca altro numero" senza ordinamento** — §5 righe 233-234. `ilike` con limite 8 senza
   `order` restituisce otto righe qualsiasi: aggiungere `.order("n_prog")`, così "A50" mostra
   A5000, A5001, … e non un campione casuale.

10. **Verifica §9.3 troppo larga** — riga 341. `/rest/v1/rotoli_grezzi_reparto` inizia con
    `/rest/v1/rotoli_grezzi`: il controllo deve cercare `rotoli_grezzi?` (con il punto
    interrogativo) o confrontare il nome della tabella per intero, altrimenti la guardia
    sembra violata dalla vista stessa, o — peggio — un filtro fatto male la dichiara rispettata.

11. **Operatore di prova lasciato disattivato in produzione** — §9 righe 356-360. È coerente
    (la FK impedisce la cancellazione) e il PIANO §2 riga 47 ora nomina Marco e Davide: se il
    committente li inserisce prima delle prove (§12.1), la prova si fa con un operatore vero e
    non resta nessuna riga "COLLAUDO - non usare". Da proporre nel rapporto come prima scelta.

12. **`reparto.html` e lo `<script>` UMD** — §3 non dice che la pagina carica `supabase.js`
    con lo **stesso** `integrity` di `index.html`/`ufficio.html` (2.110.6,
    `sha384-SR76…Ycq`). `fase-1.md` lo scriveva; va scritto anche qui, così la revisione del
    codice ha il valore atteso.

13. **`fissaggio_temp_max` null e vista degli scostamenti** — §11.2. Lettura fedele del Word
    ("min 92" è un minimo) e giusta la scelta di non toccare la vista. Va nello STATO come
    punto aperto **con la frase esatta** per la Fase 3: "temperatura di fissaggio: solo minimo;
    la vista e `fuoriRange` devono trattare `max` null come 'nessun limite superiore', in
    coerenza (test di coerenza JS↔DB)".

14. **PIANO §3 Fase 2 dice ancora "~60 schede"** (riga 115) mentre la fase ha contato 51 in
    entrambe le fonti. Aggiornare la riga del risultato verificabile nel PIANO nello stesso
    commit del piano di fase, altrimenti il rapporto contraddice il piano.

15. **`tools/importa_schede.py`**: indicare in testa la dipendenza (`python-docx`) e la
    versione di Python usata; è l'unico programma del repo che non gira con `node`, e chi
    rifarà l'importazione fra un anno deve saperlo dal file, non dal rapporto.

16. **Sottoschermata dei parametri (schermata 2)** — §5 righe 240-242. "Indietro" in alto a
    sinistra deve tornare all'elenco delle schede, non alla schermata 1: va detto, perché lo
    stesso tasto `rep-indietro` è della shell.

## Cose controllate e a posto (per non farle ricontrollare)

- Le firme `avvia_lavorazione(…, p_pianificazione_id, p_avviata_il default now())` e
  `annulla_lavorazione(p_lavorazione_id, p_operatore_id, p_motivo, p_metri_scarto default 0)`
  coincidono con produzione; non passare `p_avviata_il` è corretto (la RPC lo sovrascrive per
  il reparto, riga 471).
- Annullo con 0 metri: la RPC riporta il grezzo a `grezzo` senza toccare `kg_residui` (riga
  560): il §9.7 è esatto.
- "Già lavorata" nell'hub (§4.1 punto 3) usa la definizione dello spec §2.3.
- Realtime su `lavorazioni` con `lav_sel using (true)`: gli eventi arrivano all'ufficio;
  `removeChannel` prima di riaprire evita l'accumulo.
- Le tre funzioni nuove (§7): nessun import, nessun DOM, date sui componenti locali
  (`oraItaliana`), test per i casi null e non validi. `SOGLIA_CONTROLLO_MIN` esiste già in
  `comune.js` riga 10.
- `test-dom-ids.mjs` cerca `byId("…")` letterali: le quattro coppie nuove (§1 riga 33)
  funzionano solo se i moduli del reparto usano `byId` con stringhe fisse; il piano lo lascia
  intendere, la revisione del codice lo verificherà.
- Micron `8-10` → 9 e `10-12` → 11: la colonna è `numeric not null`; scelta dichiarata,
  visibile nel nome della lavorazione, da tarare dopo il pilota. Accettabile.
- Nessun tasto Fermo, nessun "Ultimi controlli", nessuna stima dei metri senza contametri:
  omissioni giuste, tutte della Fase 3.

## Conclusione

Il piano della Fase 2 fa esattamente le cinque cose del PIANO e niente di più, e quello che
dice della produzione l'ho ritrovato uguale nel database. Prima di caricare le schede c'è una
domanda da fare al committente (la lega delle schede: dall'Excel o vuota?), e i valori di
processo vanno tolti dal documento che finisce nel repo pubblico. Il resto sono rifiniture.
