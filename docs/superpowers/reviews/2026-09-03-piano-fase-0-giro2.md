# Revisione piano Fase 0 — giro 2

MODELLO: claude-opus-5[1m]

Rilette per intero la working copy di `docs/superpowers/plans/2026-09-03-fase-0-fondamenta.md`
(2097 righe, commit `0ae4df9`) e le differenze rispetto al giro 1
(`git diff HEAD~1 HEAD -- docs/superpowers/plans/`: 412 righe modificate). Riferimento invariato:
lo spec approvato e `PIANO_funzionalita.md`. Nessun file del progetto è stato modificato; nessun
SQL è stato eseguito contro alcun database. Le verifiche JavaScript sono state eseguite davvero,
su copie usa-e-getta in cartella temporanea, con Node v26.8.1: l'output è riportato più sotto.

## VERDETTO: BLOCCANTI PRESENTI

**3 bloccanti · 10 punti da tenere presente in esecuzione (nessuno bloccante).**

I sei bloccanti del giro 1 sono **tutti chiusi e verificati**: la vista del reparto ora è in sola
lettura, la formula `27/10000` dà `8.1` esatto, `useGrouping: "always"` produce `1.250`, nessuna
delle venti sentinelle contiene più il testo che il `like` cerca, il test sulla policy del grezzo
in lavorazione ora agisce su un rotolo davvero in lavorazione, e lo step non eseguibile del Task 8
è stato rimosso. Le aggiunte del giro 2 (caso A puro, caso B, annullo con fermo aperto,
ripartenza prima del fermo, ripartenza incrociata, rifiuto delle ripartenze a posteriori,
registrazione con la linea occupata, grezzo già avanzato) sono la parte migliore del piano.

Restano **tre punti che fanno fallire l'esecuzione**: due sono regressioni introdotte dalle
correzioni di questo giro, uno è un difetto che **ho mancato io al giro 1** e che è rimasto
identico — lo dichiaro come mio errore, non come nuovo. Tutti e tre hanno una correzione di una
o due righe.

---

## Bloccanti

### BL2-1 · Task 11, sezione e — la verifica finale fallisce su `tipi_difetto.codice` e fa abortire la migrazione `000e`

**Dove:** Task 11, Step 1, righe 1428-1430 (assert) contro riga 1332 (grant) e riga 644 (colonna).

L'assert è stato irrobustito aggiungendo `'stato'` e `'codice'` alla lista delle colonne vietate:

```sql
assert not exists (select 1 from information_schema.column_privileges
                   where table_schema = 'public' and grantee = 'authenticated'
                     and privilege_type in ('INSERT','UPDATE')
                     and column_name in ('modificato_da','modificato_il','durata_min','stato','codice')),
       'il client ha grant su colonne riservate';
```

Nello stesso giro le anagrafiche hanno guadagnato un grant **di tabella** (riga 1332):

```sql
grant insert, update, delete on operatori, schede_lavorazione, tipi_difetto to authenticated;
```

E `tipi_difetto` ha una colonna che si chiama `codice` (riga 644):

```sql
create table tipi_difetto (
  id              uuid primary key default gen_random_uuid(),
  codice          text not null unique,
  ...
```

`information_schema.column_privileges` **espande i grant di tabella su ogni colonna** — la
documentazione di PostgreSQL lo dice esplicitamente: *"If a privilege has been granted on an
entire table, it will show up in this view as a grant for each column, but only for the privilege
types where column granularity is available: SELECT, INSERT, UPDATE, REFERENCES."* È esattamente
la proprietà che rendeva questo assert utile al giro 1.

Quindi la riga `('tipi_difetto', 'codice', 'authenticated', 'INSERT')` esiste, l'`exists` trova
qualcosa, **l'assert fallisce** e la migrazione `000e` si interrompe alla sua ultima istruzione,
dopo aver già emesso tutte le `revoke`, le `grant`, le `alter table … enable row level security`
e le ventitré `create policy`. Il messaggio che l'agente riceve — *"il client ha grant su colonne
riservate"* — è per giunta **fuorviante**: non c'è nessun grant sbagliato, è l'assert a essere
scritto male.

Verificato che la collisione è una sola: `stato` esiste su `rotoli_grezzi` (riga 667) e
`lavorazioni` (riga 777), entrambe con `revoke all` e solo grant di colonna, quindi non collide;
`codice` esiste su `rotoli_lavorati` (riga 795), anch'essa senza grant di tabella; `operatori` e
`schede_lavorazione` non hanno nessuna delle cinque colonne dell'elenco. Il punto di rottura è
uno e uno solo: `tipi_difetto.codice`.

**Correzione** — legare ogni colonna vietata alla sua tabella, che è comunque più corretto (il
divieto su `lavorazione_id` vale per `rotoli_lavorati` ma non per `controlli` ed `eventi`, dove
il grant serve):

```sql
  assert not exists (
    select 1 from information_schema.column_privileges
    where table_schema = 'public' and grantee = 'authenticated'
      and privilege_type in ('INSERT','UPDATE')
      and ( (table_name in ('rotoli_grezzi','pianificazione','lavorazioni','rotoli_lavorati','controlli','eventi')
             and column_name in ('modificato_da','modificato_il','durata_min','stato'))
         or (table_name = 'rotoli_lavorati' and column_name in ('codice','lavorazione_id')) )
  ), 'il client ha grant su colonne riservate';
```

**Correzione strutturale che consiglio insieme a questa** (vale anche per i due assert nuovi delle
righe 1432-1436): spostare l'intero blocco `do $$ … assert … $$` finale in una **migrazione
separata** `000e_verifica`, applicata subito dopo `000e_rls_grant`. Oggi un assert sbagliato fa
saltare in aria l'applicazione dei permessi; se `apply_migration` non avvolge in transazione, i
grant restano applicati a metà **e** la guardia di riga 1313 (`if exists … policyname =
'grezzi_sel'`) impedisce di rientrare, lasciando l'agente senza una strada pulita. Separando le
verifiche, un assert sbagliato è solo un assert sbagliato.

---

### BL2-2 · Task 13 — il test della "ripartenza incrociata" usa una variabile che punta a una lavorazione annullata dal rollback: fallisce con una violazione di chiave esterna

**Dove:** `sql/test_regole.sql`, blocco UFFICIO, righe 1700-1704 e 1749-1755.

```sql
  begin  -- metri oltre il rotolo
    lav := avvia_lavorazione(gz, sch, op, 6000, 0, 0);      -- ← lav viene RIASSEGNATA qui dentro
    perform annulla_lavorazione(lav, op, 'prova', 99999);
    raise exception 'ATTESO ERRORE (metri oltre il rotolo)';
  exception when others then assert sqlerrm like '%superano il rotolo%', 'msg: ' || sqlerrm; end;
  -- (l'avvio dentro il blocco exception è stato annullato con l'errore: la linea è di nuovo libera)
```

Il commento è giusto sul database e sbagliato sulla variabile. Un blocco `begin … exception … end`
di PL/pgSQL è una **sottotransazione**: l'errore annulla l'`insert into lavorazioni`, ma **non
annulla l'assegnamento a `lav`**, che vive in memoria. Da qui in avanti `lav` contiene l'UUID di
una lavorazione **che non esiste più**.

Ottanta righe dopo:

```sql
  insert into eventi (lavorazione_id, tipo, causa_fermo, avvenuto_il) values (lav2, 'fermo', 'esterno', now() - interval '3 minutes') returning id into f_u;
  begin
    insert into eventi (lavorazione_id, tipo, fermo_id) values (lav, 'ripartenza', f_u);   -- lav è l'annullata T5002, f_u è di lav2
    raise exception 'ATTESO ERRORE (ripartenza incrociata)';
  exception when others then assert sqlerrm like '%altra lavorazione%', 'msg incrociata: ' || sqlerrm; end;
```

Il commento *"lav è l'annullata T5002"* si riferisce alla `lav` della riga 1693, sovrascritta alla
riga 1701. L'`insert` viola quindi `eventi_lavorazione_id_fkey`.

Quale errore arriva davvero? Il vincolo di chiave esterna è realizzato da un trigger AFTER ROW di
nome `RI_ConstraintTrigger_c_<oid>`; il trigger utente si chiama `trg_eventi_ripartenza`. Postgres
ordina i trigger di pari fase **per nome**, e `'R'` (0x52) viene prima di `'t'` (0x74): scatta
prima il controllo della chiave esterna. Il messaggio è
`insert or update on table "eventi" violates foreign key constraint "eventi_lavorazione_id_fkey"`,
che **non** contiene `altra lavorazione` → l'assert fallisce → l'intero file di test si ferma qui,
con un messaggio che non ha niente a che vedere con la regola che si voleva provare.

Anche nel caso migliore (se per qualsiasi ragione vincesse il trigger utente) il test passerebbe
"per caso" su una riga fantasma: resterebbe comunque non deterministico.

**Correzione** — non riusare `lav` per l'avvio usa-e-getta. Due righe:

```sql
-- nella declare del blocco ufficio, aggiungi:
declare … lav_ko uuid; …

  begin  -- metri oltre il rotolo
    lav_ko := avvia_lavorazione(gz, sch, op, 6000, 0, 0);
    perform annulla_lavorazione(lav_ko, op, 'prova', 99999);
    raise exception 'ATTESO ERRORE (metri oltre il rotolo)';
  exception when others then assert sqlerrm like '%superano il rotolo%', 'msg: ' || sqlerrm; end;
```

Così `lav` continua a puntare alla T5002 annullata, come il commento della riga 1753 dichiara, e
il trigger arriva a confrontare `f.lavorazione_id <> new.lavorazione_id` come previsto. Ho
verificato che questa è **l'unica** riassegnazione di variabile dentro un blocco `exception` in
tutto il file: nel blocco reparto tutte le assegnazioni a `lav`, `lav2`, `gz`, `gz2`, `f`, `f2`
sono fuori dai blocchi `exception`.

Vale la pena aggiungere una riga di guardia subito prima, che rende il difetto impossibile da
ripetere:

```sql
  assert exists (select 1 from lavorazioni where id = lav and stato = 'annullata'), 'lav deve essere la T5002 annullata';
```

---

### BL2-3 · Task 13 — `select * into g from rotoli_grezzi_reparto` con `g` dichiarata `rotoli_grezzi`: la riga della vista finisce nei campi sbagliati (difetto mio, mancato al giro 1)

**Dove:** `sql/test_regole.sql`, blocco REPARTO: dichiarazione a riga 1553, usi alle righe 1572,
1629, 1665. Presente identico nel giro 1: **me lo sono perso, e me lo assegno.**

```sql
declare op uuid; … n int; g rotoli_grezzi;
…
  select * into g from rotoli_grezzi_reparto where id = gz;    assert g.stato = 'in_lavorazione', 'grezzo in lavorazione';
```

`g` è una variabile di tipo composito `rotoli_grezzi`, che ha **20 campi**. La vista
`rotoli_grezzi_reparto` (riga 683-686) ne restituisce **16**, e in un ordine diverso, perché
`fornitore` e `rif_bolla` — che nella tabella sono in terza e quarta posizione — non ci sono.
`SELECT … INTO` di PL/pgSQL assegna **per posizione**, mai per nome. L'allineamento reale è:

| pos. | la vista dà | finisce in (campo della tabella) | effetto |
|---|---|---|---|
| 3 | `cliente` | `fornitore` | valore spostato |
| 6 | `spessore_mm` (numeric) | `lega` (text) | `'2'` |
| 13 | `stato` | `posizione` | il valore che serve finisce altrove |
| **15** | **`metri_stimati`** (integer) | **`stato`** (text) | `g.stato` vale `'802'`, non `'in_lavorazione'` |
| **16** | **`creato_il`** (timestamptz) | **`kg_al_metro`** (numeric) | conversione impossibile |

Non esiste una lettura in cui questo funzioni:

- se PL/pgSQL applica la regola documentata (*"the query's result columns must exactly match the
  structure of the target as to number and data types, or else a run-time error occurs"*),
  l'istruzione fallisce subito;
- se invece riempie per posizione con conversione di I/O, la posizione 16 tenta
  `timestamptz → numeric` e solleva `invalid input syntax for type numeric`;
- e anche se quella conversione passasse, `assert g.stato = 'in_lavorazione'` confronterebbe
  `'802'` con `'in_lavorazione'` e fallirebbe.

Il test si ferma quindi al **primo** assert del blocco reparto (riga 1572), cioè quasi subito, e
porta con sé anche gli assert delle righe 1630 (`g.kg_residui = 2450`, `g.metri_stimati = 302`) e
1666 (`grezzo esaurito`), che sono fra i più importanti del file.

**Correzione** — una parola. Nel blocco reparto la variabile non deve essere tipata sulla tabella:

```sql
declare op uuid; sch uuid; gz uuid; gz2 uuid; lav uuid; lav2 uuid; codici text[]; f uuid; f2 uuid; n int;
        g record;                       -- oppure: g rotoli_grezzi_reparto;
```

`record` è la scelta a prova di errore: si adatta a qualunque forma della query e continua a
permettere `g.stato`, `g.kg_residui`, `g.metri_stimati`. `rotoli_grezzi_reparto` (le viste hanno
un tipo composito come le tabelle) va altrettanto bene ed è più esplicito.

**Attenzione a non cambiare gli altri:** `g rotoli_grezzi` è **corretto** e va lasciato dov'è nelle
quattro RPC (righe 1074, 1096, 1130, 1162, 1203) e nel blocco UFFICIO (riga 1684), perché lì il
`select * ` legge la **tabella**, i cui 20 campi corrispondono uno a uno.

---

## Da tenere presente in esecuzione

Nessuno di questi ferma la fase: sono cose da sapere mentre si esegue, o da sistemare con una riga
se capita di passare di lì. **Non aprono un altro giro di revisione.**

1. **Manca un controllo positivo accanto al test della policy sul grezzo** (righe 1712-1714). Ora
   il test è vero — T5005 è davvero `in_lavorazione` e l'update tocca 0 righe — ma nessun assert
   del file prova mai che un update **legittimo** su un grezzo `grezzo` **riesca**. Se domani
   l'elenco di colonne di `grant update (…) on rotoli_grezzi` (riga 1356) fosse sbagliato, l'update
   fallirebbe sempre e questo test passerebbe lo stesso, per il motivo sbagliato. Due righe, da
   mettere prima che `gz` venga riassegnata a T5003 alla riga 1722 (a quel punto `gz` è ancora
   T5002, ed è `grezzo`):
   ```sql
   update rotoli_grezzi set cliente = 'OK' where id = gz;
   assert (select cliente from rotoli_grezzi where id = gz) = 'OK', 'l''ufficio deve poter correggere un grezzo';
   ```

2. **`_inserisci_figli` si fida dell'ordine di `jsonb_array_elements`** (riga 1077), e il nuovo
   assert del caso B (riga 1657, `peso_netto_kg` del figlio `T5001/A` = 3200) lo dà per scontato.
   In pratica Postgres emette gli elementi nell'ordine dell'array e non c'è nodo di piano che
   possa riordinarli, quindi il test è affidabile; se si vuole renderlo garantito basta
   `for f in select value from jsonb_array_elements(p_figli) with ordinality o(value, n) order by o.n loop`.
   Buon assert comunque: è l'unico che lega il primo codice al primo figlio.

3. **Il codice `T5005/A` con grezzo già avanzato è giusto** (domanda (c) del coordinatore). Il
   residuo fittizio `1` di riga 1226 fa sì che la registrazione a posteriori prenda il suffisso
   `/A`; quando `lav2` chiuderà, `n_esistenti` sarà 1 e il suo figlio prenderà `/B`, senza il
   codice nudo `T5005` accanto a uno suffissato. Coerente con spec §2.7. Resta un caso di bordo
   non coperto, che **non** vale la pena chiudere ora: registrando **due** lavorazioni passate
   sullo stesso rotolo, la prima (che lo porta a `esaurito`) prende il codice nudo `T5005` e la
   seconda `T5005/B`. È comunque conforme alla lettera dello spec (al momento della prima
   registrazione il grezzo non aveva figli), ed è unico e leggibile: basta saperlo.

4. **`service_role` conserva tutti i privilegi** su tutte le tabelle e le viste (default di
   Supabase): non è revocato né verificato, ed è giusto così, perché è la chiave di servizio. Va
   però scritto in `CLAUDE.md` fra le trappole: **la chiave `service_role` non deve mai comparire
   nel front-end**; in `db.js` va la publishable key (riga 1849 lo dice già, ma solo lì).

5. **PostgreSQL 17 ha un privilegio `MAINTAIN`** che l'assert di riga 1435-1436 non elenca. Non è
   un problema, perché `revoke all` (righe 1322-1323) lo toglie comunque e `information_schema`
   non espone i privilegi fuori standard: è solo un limite di copertura dell'assert, da ricordare
   se un giorno si sostituisse la `revoke all` con revoche selettive.

6. **La sezione f non ha la guardia "già applicata"** che il Global Constraint di riga 26 impone a
   ogni sezione. In questo caso è meglio così: il `if not exists … then alter publication` la rende
   idempotente per costruzione, e il piano B della riga 1460 prevede proprio di rieseguire il solo
   assert. Basta allineare la frase del vincolo ("tranne la f, idempotente per costruzione").

7. **Il template dello STATO (riga 2024) elenca "migrazioni 000a-000e, 001, 002"**: manca `000f`,
   nata in questo giro. Una parola.

8. **`registra_lavorazione_completa`: la guardia sulle ripartenze presuppone che `p_eventi` sia un
   array.** Se arrivasse un oggetto (`'{}'::jsonb`), `jsonb_array_elements` solleva *"cannot
   extract elements from an object"* in inglese, prima di qualunque messaggio italiano. Idem per
   `p_controlli` nel ciclo. Una riga risolve, se si vuole:
   `if jsonb_typeof(coalesce(p_eventi,'[]'::jsonb)) <> 'array' then raise exception 'Gli eventi devono essere un elenco'; end if;`

9. **`if p_chiusa_il <= p_avviata_il` è falso quando uno dei due è null** (riga 1206): la guardia
   non scatta e l'errore arriva più tardi dal `not null` di `avviata_il`, in inglese. Innocuo
   dall'interfaccia della Fase 4, che li compila sempre.

10. **Resta l'assunzione, non verificabile prima di provarla, che `execute_sql` esegua l'intero
    `test_regole.sql` in una sola sessione** (nota di riga 1778). Se il connettore avvolgesse il
    testo in una transazione propria, il `begin` interno emetterebbe un warning e il `rollback`
    finale annullerebbe comunque tutto — che è l'esito voluto — ma il risultato `TUTTI I TEST
    PASSATI` va comunque letto prima del rollback: se non compare, non dare per scontato che i
    test siano passati.

---

## Verifiche eseguite, e cosa hanno detto

Non sono affermazioni di lettura: sono comandi eseguiti.

**Il JavaScript del piano, copiato riga per riga (Tasks 1-6) più i test dei Task 1-6, in una
cartella con il solo `package.json` `{ "type": "module" }`:**

```
ℹ tests 21
ℹ pass 21
ℹ fail 0
```

Nessun warning `MODULE_TYPELESS_PACKAGE_JSON` (con `package.json` sparisce, come lo Step 4 del
Task 1 si aspetta). In particolare, e a conferma diretta delle correzioni del giro 1:

- `kgAlMetro(1500, 2) === 8.1` → **true** con `(l*s*27)/10000`; con la vecchia `(l*s*2.7)/1000`
  dava `8.100000000000001`;
- `kgDaMetri(500, 1500, 2) === 4050` → **true**;
- `annotazioniDaEventi` → `"Primi 15 m non ossidati. Giunta film a 1.250 m. Graffi a 2.100 m."`,
  esattamente la stringa attesa, grazie a `useGrouping: "always"` (senza, l'italiano dà `1250`);
- `codiciFigli("A5000", 2, 0, 25)` solleva `Troppi rotoli finiti da questo grezzo` ✓;
- `prossimoNProg` con la guardia sulla lettera resta corretto sui quattro casi.

**Il comando dell'hash SRI (Task 14, Step 3)**, che era una mia obiezione del giro 1 sul `curl |
openssl`: verificato che `node -e "…require('crypto')…"` funziona **anche** dentro una cartella con
`"type": "module"` (`-e` resta CommonJS per default) e che `process.argv[1]` è davvero il primo
argomento utente:

```
argv: ["C:\\Program Files\\nodejs\\node.exe","https://esempio/uno"]
require ok
```

Il comando è quindi eseguibile così com'è, e `if(!r.ok) throw` più il controllo sulla dimensione
minima chiudono il buco del 404 silenzioso.

**Audit completo delle sentinelle** (domanda (a) del coordinatore): venti `raise exception 'ATTESO
ERRORE (…)'` contro undici `assert sqlerrm like` e nove gestori a condizione specifica
(`insufficient_privilege`, `unique_violation`, `check_violation`). Le ho confrontate una per una:
**nessuna sentinella contiene il testo che il proprio `like` cerca**. I due casi difficili del
giro 1 sono risolti bene — `(chiusura con fermo non chiuso)` contro `%fermo aperto%`, e
`(avvio su rotolo occupato)` contro `%già in lavorazione%` — e anche i due nuovi:
`(metri oltre il rotolo)` contro `%superano il rotolo%` e `(ripartenza incrociata)` contro
`%altra lavorazione%`. Il difetto BL-4 del giro 1 è chiuso.

**Ordine e coerenza dei rotoli di prova** (domanda (a)): T5000 → caso C poi secondo giro `/B` poi
esaurito; T5001 → fermo/ripartenza e caso B con `/A` e `/B`; T5004 → caso A puro senza suffisso;
T5002 → annullo con metri; T5003 → registrazione a posteriori; T5005 → linea occupata e grezzo
avanzato. Tutte le variabili usate sono dichiarate in entrambi i blocchi (`gz2`, `lav2`, `f2`,
`n`, `f_u` sono nuove e presenti). Ho rifatto i conti di tutti i bilanci nuovi: caso A puro
6300 ≤ 6440 × 1,02 ✓; caso B 6320 ≤ 6500 × 1,02 e `kg_scarto` 180 = 6500 − 3200 − 3120 ✓; grezzo
avanzato 900 ≤ 1000 × 1,02 ✓; a posteriori 6260 ≤ 6440 × 1,02 ✓. Le durate dei fermi tornano
(12 e 5 minuti) perché dentro una transazione `now()` è costante.

**Le tre domande di dettaglio del coordinatore, in breve:**

- **(b) i nomi nei nuovi assert sui privilegi sono giusti?** Sì per
  `information_schema.table_privileges` (`table_schema`, `table_name`, `grantee`,
  `privilege_type`), che **include anche le viste** e che `postgres`, in quanto concedente, vede
  per intero. Sì anche per i nomi in `column_privileges` — è il **contenuto** a essere sbagliato,
  per l'espansione dei grant di tabella (BL2-1).
- **(b bis) `revoke all on all tables in schema public from anon` copre anche le viste?** Sì: la
  forma `ON ALL TABLES IN SCHEMA` di GRANT/REVOKE agisce su tabelle, **viste** e foreign table.
  Quindi la parte `anon` dell'assert delle viste passerà.
- **(c) `T5005/A` è giusto?** Sì, con il ragionamento del punto 3 qui sopra.

---

## Cosa è fatto bene

- **Il test che prova la chiusura del buco della vista** (righe 1565-1568) è costruito nel modo
  giusto: cattura `insufficient_privilege`, e se il `revoke` sparisse l'update riuscirebbe, la
  sentinella `P0001` **non** verrebbe catturata da quel gestore e il test esploderebbe. È una prova
  vera, non una formalità.
- **`revoke all … from authenticated` su tutte e nove le tabelle, poi grant esplicito** (righe
  1322-1325) è la forma corretta e chiude anche il `TRUNCATE` che avevo segnalato: ora
  `authenticated` non ha nemmeno `REFERENCES` e `TRIGGER`, e c'è un assert che lo verifica.
- **Le due nuove guardie sui fermi** (annullo con fermo aperto, ripartenza precedente al fermo)
  chiudono la lista dello spec §5.6 punto 2, e la seconda è collocata **prima** della ripartenza
  buona, così il rollback della sottotransazione libera l'indice unico su `fermo_id` — dettaglio
  facile da sbagliare, qui giusto.
- **Il caso B con due figli** non si limita a controllare i codici: verifica anche che il primo
  codice finisca sul primo elemento dell'array (`peso_netto_kg` = 3200) e che `kg_scarto` torni.
  È il test che mancava.
- **La registrazione a posteriori è ora provata a linea occupata davvero**, con
  `assert count(aperte) = 1` a fare da testimone: la proprietà dello spec §2.7 (`stato = 'chiusa'`
  non urta l'indice parziale) è finalmente dimostrata invece che affermata.
- **La sezione f separata con piano B** è la risposta giusta a un'operazione che può fallire per
  ragioni fuori dal controllo del piano: se `alter publication` non passa, RLS e grant restano
  acquisiti e la dashboard fa il resto.
- **Il `RAPPORTO_fase-0.md`** è scritto per una persona che non apre i file: cosa è stato fatto,
  cosa deve fare lei con l'URGENTE in cima, i costi, cosa non è riuscito. Con l'istruzione di
  riportarlo per intero in chat. È esattamente ciò che serviva.
- **I tre scostamenti dichiarati** (`db.js` separato, `package.json` di una riga, ripartenze
  rifiutate a posteriori) sono tutti motivati e tutti annotati nel Self-review e nello STATO.
  Il `package.json` di sola `"type": "module"` è la soluzione più semplice possibile: nessuna
  dipendenza, nessun `npm install`, e i test partono su qualunque Node ≥ 20 invece che solo su
  ≥ 22.7.
- **La nota sulle policy di update senza `with check`** (righe 1374-1377) e quella sulle `note`
  delle lavorazioni annullate (righe 1380-1381) mettono nel SQL, dove verranno rilette, due cose
  che altrimenti si sarebbero perse fra un giro di revisione e la Fase 4.

---

## Conclusione

Il piano è migliorato molto: tutti e sei i problemi gravi del giro scorso sono stati corretti, e
li ho riprovati uno per uno — i calcoli e i test in JavaScript ora passano davvero, ventuno su
ventuno.

Restano **tre inciampi** che fermerebbero l'esecuzione al primo tentativo: due sono nati proprio
dalle correzioni di questo giro (un controllo di sicurezza scritto in modo troppo largo, che si
allarma da solo su una colonna innocente; e un test che si riferisce per sbaglio a una prova
cancellata poco prima), il terzo è un errore che avevo lasciato passare io la volta scorsa e che
va sistemato ora. Tutti e tre si correggono con una o due righe, già scritte qui sopra.

Il mio consiglio è: applicare le tre correzioni, leggere una volta l'elenco "da tenere presente in
esecuzione" — nessuno di quei punti va sistemato prima di partire — e poi cominciare, senza un
altro giro di revisione.
