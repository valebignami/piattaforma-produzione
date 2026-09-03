# Revisione piano Fase 0 — giro 3 (conferma dei tre bloccanti del giro 2)

MODELLO: claude-opus-5[1m]

Verifica mirata sulle sole parti cambiate (`git diff HEAD~1 HEAD`, commit `bd0f8ca`, rev. 3 del
piano): Task 11 Step 2/2b, dichiarazioni dei due blocchi di `test_regole.sql`, test "metri oltre il
rotolo". Sola lettura; nessun SQL eseguito.

## VERDETTO: NESSUN BLOCCANTE

**3 bloccanti su 3 risolti · 0 nuovi bloccanti · 0 regressioni.**

---

## (a) I tre bloccanti

**BL2-1 — verifiche della sezione e.** Risolto, e nel modo migliore dei due che avevo proposto: le
verifiche sono una migrazione separata `000e_verifica` (Step 2b), quindi un assert scritto male non
travolge più i permessi già concessi né lascia la guardia `grezzi_sel` a bloccare il rientro. Il
commento in testa al blocco spiega **perché** le colonne vanno legate alla tabella
(`column_privileges` espande i grant di tabella): è l'informazione che serviva a non ripetere
l'errore.

**BL2-2 — `lav` che puntava a una riga annullata dal rollback.** Risolto. L'avvio usa-e-getta ora
usa `lav_ko` (righe 1721-1722), `lav` resta l'annullata T5002, e l'assert aggiunto subito dopo il
blocco `exception` lo certifica invece di darlo per scontato. Verificato che alla riga 1779
(`insert into eventi … values (lav, 'ripartenza', f_u)`) `lav` punta ora a una lavorazione che
**esiste**: la chiave esterna è soddisfatta, l'errore arriva dal trigger e il messaggio contiene
`altra lavorazione`, come il `like` si aspetta. Il commento della riga 1779 è finalmente vero.

**BL2-3 — riga della vista in una variabile tipata sulla tabella.** Risolto: nel blocco reparto
`g` è ora `record` (riga 1571), con la nota che spiega il perché. I tre usi (righe 1590, 1647-1648,
1683-1684) leggono la vista e `g.stato` / `g.kg_residui` / `g.metri_stimati` si risolvono per nome
a runtime. Verificato che il blocco **ufficio** ha giustamente conservato `g rotoli_grezzi`
(riga 1704), perché lì il `select *` legge la tabella: 20 campi contro 20.

## (b) L'assert sulle colonne riservate collide ancora con qualche grant legittimo? No

Ripassati uno per uno tutti i grant concessi ad `authenticated` nella sezione e, contro le cinque
clausole dell'assert:

| Grant concesso | Colonne toccate | Collide? |
|---|---|---|
| `grant insert, update, delete on operatori, schede_lavorazione, tipi_difetto` (di **tabella**, si espande su ogni colonna) | tutte, compresa `tipi_difetto.codice` | **No**: `codice` è ora vietato solo su `rotoli_lavorati`. Nessuna delle tre ha `modificato_da/il`, `durata_min` o `stato` |
| `grant select on` le nove tabelle (di tabella) | tutte | No: l'assert guarda solo INSERT/UPDATE |
| `rotoli_grezzi` insert/update (12 e 13 colonne) | anagrafica + `kg_residui` | No: né `stato` né `modificato_*` |
| `pianificazione` insert/update (6 colonne) | — | No |
| `lavorazioni` update (7 colonne) | `note, stampata_il`, quattro pesi, due contametri | No: né `stato` né `modificato_*` |
| `rotoli_lavorati` update (7 colonne) | `cliente, film, tipo_film, annotazioni_cliente, metri`, due pesi | No: né `codice` né `lavorazione_id` |
| `controlli` insert (16 colonne, **incluso `lavorazione_id`**) | — | No: `lavorazione_id` è vietato solo su `rotoli_lavorati` |
| `eventi` insert (12 colonne, incluso `fermo_id`) / update (11) | — | No: `durata_min` non è concessa |
| `grant delete on rotoli_grezzi`, `on pianificazione` | — | No: DELETE non ha granularità di colonna e non compare in `column_privileges` |
| `grant select` sulle tre viste | `lavorazioni_riepilogo` e `controlli_scostamenti` sono `select l.*` / `c.*` e quindi **espongono `modificato_da/il`** | No: privilegio SELECT, filtrato dall'assert. Se un giorno qualcuno concedesse UPDATE su quelle viste, l'assert lo prenderebbe — ed è giusto così |

Nessuna collisione. La migrazione `000e_verifica` passa.

## (c) L'assert su INSERT/DELETE di `lavorazioni` e `rotoli_lavorati` è vero? Sì

Dopo la sezione e le due tabelle hanno, nell'ordine: `revoke all … from authenticated`
(righe 1322-1323), `grant select` (righe 1324-1325), e **solo** un `grant update (elenco di
colonne)`. Nessun `grant insert`, nessun `grant delete`.

Il punto che rende l'assert affidabile: `information_schema.table_privileges` è costruita sul solo
ACL di tabella, quindi i grant **di colonna** non vi compaiono. Per `authenticated` su
`lavorazioni` e `rotoli_lavorati` resta perciò la sola riga `SELECT` — l'`exists` non trova nulla e
l'assert passa. (Le due viste non si chiamano `lavorazioni` né `rotoli_lavorati`, quindi non
inquinano il filtro.)

Ed è vero anche il presupposto: le RPC non hanno bisogno di quei grant. `avvia_lavorazione`,
`chiudi_lavorazione`, `registra_lavorazione_completa` e l'helper `_inserisci_figli` sono tutte
`security definer` di proprietà di `postgres`, che è il proprietario delle tabelle: inseriscono
come proprietario, scavalcando sia i grant sia la RLS.

## (d) Il controllo positivo su T5002 è nel punto giusto? Sì

Tracciato lo stato di T5002 fino a lì: creato `grezzo` (riga 1712) → `in_lavorazione` con
`avvia_lavorazione` → **torna `grezzo`** con l'`annulla_lavorazione` di 50 m (`kg_residui` 6095,
già verificato dall'assert successivo) → il blocco "metri oltre il rotolo" lo rimette in
lavorazione ma viene **annullato dal rollback della sottotransazione**, quindi resta `grezzo`.

Alla riga 1730 `gz` è ancora T5002 (viene riassegnato a T5003 solo alla riga 1748) ed è `grezzo`:

- la policy `grezzi_upd` (`using`/`with check` = `e_ufficio() and stato = 'grezzo'`) lascia passare
  la riga in entrambe le direzioni;
- `cliente` è nell'elenco di `grant update` (riga 1356);
- `stato` non ha grant, quindi la riga nuova resta `grezzo` e il `with check` regge.

L'update riesce e l'assert `= 'Cliente corretto'` passa. Insieme al test negativo di sei righe
dopo — `update … where id = gz2` su T5005 `in_lavorazione`, che tocca 0 righe — la coppia ora
distingue davvero "la policy ha bloccato" da "il client non può comunque scrivere". Verificato che
il valore lasciato su T5002 non ha effetti collaterali: quel rotolo non viene mai chiuso con figli,
quindi il `coalesce(f->>'cliente', g.cliente)` di `_inserisci_figli` non lo tocca.

## Resta aperto (invariato, non bloccante)

I punti 2-10 di "da tenere presente in esecuzione" del giro 2 restano validi e restano non
bloccanti; il punto 1 (controllo positivo sul grezzo) è stato recepito. Il più concreto è il
template dello STATO (riga ~2050) che elenca ancora "migrazioni 000a-000e, 001, 002": ora le
migrazioni sono `000a`-`000e`, `000e_verifica`, `000f`, `001`, `002`. Una riga, da sistemare
quando si compila lo STATO.

## Conclusione

Le tre correzioni chiedono e le tre correzioni funzionano: le ho ricontrollate una per una, e non
ne ho trovate di nuove.

Il controllo automatico sui permessi ora è una verifica a sé, così se un giorno si sbaglia il
controllo non si rovinano i permessi; e i due test che prima si appoggiavano a un dato sbagliato
ora si appoggiano a quello giusto, con un controllo in più che se ne accorgerebbe.

Per me il piano è pronto: si può iniziare a eseguirlo, senza altri giri di revisione.
