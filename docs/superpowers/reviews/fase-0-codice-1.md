VERDETTO: NESSUN BLOCCANTE
MODELLO: claude-sonnet-5

# Revisione codice — Fase 0 Fondamenta, giro 1

Metodo: `git diff main...fase-0` letto per intero (14 file, 1568 righe); lettura diretta di
`sql/seed_difetti.sql` (gitignorato, presente su disco); confronto riga per riga fra ogni file
consegnato e i blocchi di codice del piano dettagliato (estratti e diffati con `diff`, non solo
letti a occhio) per `sql/000_setup.sql` (sezioni a-f), `sql/test_regole.sql`,
`sql/seed_collaudo.sql`, `js/comune.js`, `js/db.js`, `js/index.js`, `index.html`, `css/base.css`,
`tests/test-dom-ids.mjs`, `tests/test-comune.mjs`, `package.json`, `.gitignore`, `CLAUDE.md`;
`node --test tests/` eseguito (22/22 verdi); interrogazioni in sola lettura sul progetto
Supabase `nbercxzpjflqfstwrryp` (`list_projects`, `list_tables`, `list_migrations`,
`get_advisors`, `execute_sql` su `information_schema`, `pg_policies`, `pg_proc`,
`pg_publication_tables`, `auth.users`, `utenti_app`); verifica `git log --all --name-only` e
`git ls-files` per il know-how; app aperta in locale (`python -m http.server 8000`).

## PRIMO controllo — c'è qualcosa in più rispetto alla Fase 0?

No. Il diff di ogni file SQL e JS consegnato contro il testo del piano dettagliato è **vuoto**
a parte quattro punti, tutti e quattro già dichiarati nel contesto della revisione e coerenti
con quanto scritto in `STATO_2026-09-03.md`:
1. `index.html` carica `dist/umd/supabase.js` (non `.min.js`) con hash SRI ricalcolato — **verificato
   dall'esterno**: ho scaricato il file due volte da jsDelivr, l'hash SHA-384 è stabile e coincide
   esattamente con quello scritto in `index.html` (`sha384-SR76iDF5vfiuFuYEigF/LOTQIXTU5SrR3Ij29NELtBswNOxcSLM6iMr8OVRzUycq`,
   206.966 byte). Motivazione tecnica valida.
2. Migrazione 003 (ripartenza spostata su un altro fermo): è una **correzione**, non un'aggiunta.
   Il piano assegna al trigger 2 anche il caso `after update on eventi` per le ripartenze
   (spec §2.5 punto 2), ma l'implementazione originale non gestiva il sotto-caso "`fermo_id`
   cambiato" — un difetto reale scoperto dalla revisione bug generici, non una funzionalità
   nuova. **Verificato in produzione**: `pg_proc.prosrc` di `eventi_ripartenza` contiene il ramo
   `old.fermo_id`; `sql/000_setup.sql` sul disco è coerente con la produzione.
3. Commento della sezione d corretto (quali funzioni sono `security definer`) — solo commento,
   nessuna logica cambiata.
4. `CLAUDE.md` ora dice che il test di coerenza JS↔DB arriva con la Fase 3 — corretto: il piano
   dettagliato della Fase 0 non contiene alcun Task che scriva quel test (l'ho cercato, non c'è),
   quindi la frase originale del piano ("coperte dal test di coerenza") era essa stessa
   imprecisa. La correzione in `CLAUDE.md` è quindi un miglioramento della documentazione, non
   uno scostamento sostanziale.

Nessun'altra tabella, colonna, vista, funzione, policy o file è presente oltre a quanto elencato
in PIANO §3 Fase 0 e nel piano dettagliato. Confermato anche lato produzione: `list_tables`
restituisce esattamente le 10 tabelle attese (tutte con RLS attiva), `pg_proc` restituisce
esattamente le 13 funzioni attese, `information_schema.views` restituisce esattamente le 3 viste
attese — nessuna sorpresa.

## Importante

1. **`STATO_2026-09-03.md` (e il contesto della revisione, punto 7) affermano che gli utenti Auth
   `ufficio`/`reparto` "non esistono ancora" ("IN ATTESA DEL COMMITTENTE: Creare i due utenti
   Auth… e comunicarlo: poi la skill li mappa in `utenti_app`"), ma in produzione i due utenti
   esistono già** (`auth.users` contiene `ufficio@overland-ocm.it` e `reparto@overland-ocm.it`,
   2 righe) **e sono già mappati correttamente in `utenti_app`** (`ruolo` = `ufficio`/`reparto`,
   nessuna riga sentinella di test rimasta). Non è un difetto di codice — la mappatura è
   corretta — ma la documentazione di stato (provvisoria) e il contesto fornito per questa
   revisione non rispecchiano lo stato reale del database in questo momento: va aggiornata prima
   di chiudere la fase, altrimenti il committente legge un "in attesa" che non è più vero.

## Minore

1. `sql/000_setup.sql` — le tre funzioni trigger `imposta_modificato()`, `eventi_fermo_durata()`
   ed `eventi_ripartenza()` non hanno mai un `revoke execute … from anon, authenticated`
   esplicito (lo spec richiede il revoke solo per le quattro RPC e per `ruolo_utente`/`e_ufficio`/
   `e_reparto`, non per le funzioni trigger, quindi non è una guardia mancante rispetto allo
   spec). `get_advisors` (security) lo segnala comunque come `anon`/`authenticated` che possono
   "eseguire" queste funzioni via `/rest/v1/rpc/…`. Verificato che non è sfruttabile: sono
   `returns trigger`, e Postgres rifiuta di eseguirle fuori da un trigger ("trigger functions
   can only be called as triggers"). Da valutare un `revoke` esplicito in una fase successiva
   solo per zittire il linter, non per un rischio reale.
2. I Task 7-11 del piano (sezioni SQL a-f di `000_setup.sql`) prescrivono cinque commit
   separati; sono confluiti in un unico commit (`0134e59`). `STATO_2026-09-03.md` dichiara solo
   la fusione dei Task 1-6 di `comune.js` in un commit, non questa. Scostamento di processo,
   nessun effetto sul contenuto (verificato: il contenuto combacia comunque col piano).
3. Il commento in testa a `js/comune.js` ("… sono dichiarate nello spec §2.6/§3.7 e coperte dal
   test di coerenza") non ha la stessa precisazione aggiunta a `CLAUDE.md` (il test arriva in
   Fase 3): può far pensare, leggendo solo il file, che il test esista già.
4. In locale (`http://localhost:8000/index.html`) la console del browser riporta un
   `Failed to load resource: 400` non riconducibile a nessuna delle richieste elencate in
   `read_network_requests` (tutte 200 OK: `db.js`, `index.js`, `base.css`); il form di login si
   renderizza comunque correttamente, senza il messaggio di fallback "Impossibile caricare la
   libreria Supabase", quindi la libreria si è caricata. Probabile artefatto del pannello di
   anteprima (es. `favicon.ico`), da confermare ma non bloccante.
5. Le annotazioni già aperte e dichiarate in `STATO_2026-09-03.md` (`eventi.tipo` aggiornabile
   dal client, `erroreDiRete` per testo, messaggi fissi 23505/23514, `metri` del figlio non
   validato, `grezzi_del` e la `pianificazione`, guardia "fermo aperto" duplicata,
   `rotoli_lavorati.rotolo_grezzo_id` non elencata nell'assert di verifica) le ho riverificate
   una per una: sono descritte correttamente e restano non bloccanti per la Fase 0 (in
   particolare `rotolo_grezzo_id` di `rotoli_lavorati` **non** è comunque scrivibile dal client,
   pur non comparendo nell'assert — l'ho controllato sui grant reali in produzione).

## Verifiche puntuali eseguite (esito positivo, nessun'anomalia)

- `node --test tests/`: 22/22 verdi (21 funzioni pure + 1 id DOM), nessun warning
  `MODULE_TYPELESS_PACKAGE_JSON`.
- Produzione (`nbercxzpjflqfstwrryp`, confermato l'unico progetto con quel nome/ref):
  10 tabelle con RLS attiva su tutte, 3 viste, 13 funzioni, 3 tabelle in `supabase_realtime`
  (`lavorazioni`, `controlli`, `eventi`) — tutto combacia col piano, nessun oggetto extra.
- Rieseguiti a mano gli assert di `000e_verifica` direttamente sulla produzione: 0 colonne
  riservate scrivibili, 0 viste non conformi, 0 privilegi extra su `authenticated`, 0 grant
  `insert`/`delete` su `lavorazioni`/`rotoli_lavorati` fuori dalle RPC, 0 grant di tabella ad
  `anon`, vista reparto senza `fornitore`/`rif_bolla`.
- `pg_policies`: tutte le policy della sezione e presenti col testo esatto dello spec/piano.
- `git ls-files | grep -E "riferimenti|seed_schede|seed_difetti"` → vuoto;
  `git log --all --name-only --format=` → nessuna occorrenza di "riferimenti" né di ".docx":
  la storia è pulita come dichiarato.
- `sql/test_regole.sql` (letto, non eseguito) copre tutti i casi richiesti da spec §5.6 punto 2
  (avvio doppio, avvio su `in_lavorazione`, bilancio oltre tolleranza, residuo/tubolare
  incoerenti, fermo aperto su chiusura e su annullo, ripartenza incrociata fra lavorazioni,
  ripartenza doppia, annullo con controlli che scala `kg_residui`,
  `registra_lavorazione_completa` respinta al reparto, update di `stato` respinto dal grant,
  insert di controllo su lavorazione chiusa dal reparto respinto, `rotoli_grezzi` vuota al
  reparto e piena dalla vista) più il caso aggiunto per la migrazione 003.
- `sql/seed_difetti.sql` (letto da disco, gitignorato): 10 righe, solo fatti/causa/azione dal
  manuale, coerente con quanto descritto.

## Conclusione

Il codice della Fase 0 corrisponde quasi a righe al piano approvato: gli unici scostamenti nel
codice sono i quattro già dichiarati, e li ho controllati uno per uno (compreso ricalcolare
l'hash SRI da internet e rileggere la funzione corretta direttamente dal database in
produzione). Non ho trovato nulla in più rispetto a quanto previsto, né guardie mancanti, né
regole di dominio finite nel front-end. L'unico punto da sistemare prima di chiudere la fase è
allineare `STATO_2026-09-03.md` allo stato reale del database: i due utenti Auth esistono già e
sono già mappati, non sono più "in attesa". Il resto sono annotazioni minori, già in gran parte
note, che non impediscono di considerare la Fase 0 tecnicamente completa.
