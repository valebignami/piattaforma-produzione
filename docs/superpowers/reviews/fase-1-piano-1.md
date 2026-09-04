VERDETTO: NESSUN BLOCCANTE
MODELLO: claude-fable-5-1

# Revisione indipendente — Fase 1, piano, giro 1

**Oggetto:** `docs/superpowers/specs/fase-1.md` (2026-09-04) contro `PIANO_funzionalita.md` §3 Fase 1,
spec `2026-09-03-ciclo-bobina-design.md` (§4.1, §4.2, §4.6, §4.7, §5.3), `CLAUDE.md`,
`STATO_2026-09-03.md`, e il codice della Fase 0 (`index.html`, `js/*.js`, `css/base.css`, `tests/`,
`sql/000_setup.sql`, `sql/003_*.sql`).
**Modalità:** sola lettura. Sul progetto `nbercxzpjflqfstwrryp` ho eseguito solo `select` su
`information_schema`, `pg_policies`, `pg_proc`, `pg_class`, `pg_constraint`, `pg_publication_tables`
e conteggi sulle tabelle.

## Primo controllo — aggiunte rispetto alla Fase 1 del piano

Nessuna aggiunta fuori fase. I file (`fase-1.md` §1) coincidono con la struttura dello spec §5.2;
i tab sono solo i tre previsti; `stampa.html` fa solo `tipo=grezzo`; nessuna funzione SQL nuova;
niente Excel; niente cancellazione di grezzi; niente `reparto.html`. Le due voci che il piano di
fase dichiara come interpretazione sono giudicate sotto ("I due punti richiesti"). Un dettaglio
non dichiarato (la casella "mostra tutte" nella scheda prevista) è segnalato fra i minori.

## Verifica del "nessuna migrazione" sulla produzione

Confermato: la Fase 1 non ha bisogno di migrazioni. In produzione, per `authenticated`:
- `rotoli_grezzi`: select/insert/update/delete con `grezzi_sel/ins/upd/del` come da §5.3;
  grant di insert su 12 colonne (n_prog, fornitore, rif_bolla, cliente, lega, finitura, spessore_mm,
  larghezza_mm, peso_bolla_kg, data_arrivo, posizione, note), di update sulle stesse 12 +
  `kg_residui` = 13; nessun grant su `stato`, `kg_al_metro`, `metri_stimati`, `modificato_*`.
- `pianificazione`: `pian_sel using (true)`, `pian_ins/upd/del` con `e_ufficio()`; grant insert e
  update su 6 colonne, delete di tabella; `unique (settimana, posizione)`; **nessun check su
  `posizione`** → la posizione di appoggio negativa dello scambio ▲▼ è ammessa.
- `operatori`: grant di tabella insert/update/delete, policy `e_ufficio()`.
- Interrogazione annidata di `stampa.html`
  (`rotoli_lavorati → lavorazioni → schede_lavorazione`): una sola FK per ogni salto
  (`rotoli_lavorati.lavorazione_id`, `lavorazioni.scheda_lavorazione_id`), select concesso su tutte
  e tre le tabelle con policy `using (true)`. Non è ambigua per PostgREST e non richiede grant nuovi.
- Join `pianificazione → rotoli_grezzi` e `pianificazione ← lavorazioni`: una FK per salto; per
  l'ufficio `grezzi_sel` lascia passare le righe.
- Le 13 funzioni hanno `search_path=public`; le 4 RPC sono `security definer`, senza execute per
  `anon`; `_codici_figli`, `_controlla_figli_e_bilancio`, `_inserisci_figli` senza execute per
  `authenticated`. La vista `rotoli_grezzi_reparto` è `security_invoker=false`, sola select, e non
  contiene `fornitore`/`rif_bolla`. Realtime: `lavorazioni, controlli, eventi`.
- Dati: 10 rotoli `COLLAUDO-*` (10 grezzi in tutto), 0 operatori, 0 schede, 0 pianificazioni,
  2 righe in `utenti_app`.

`git ls-files | grep -E "riferimenti|seed_schede|seed_difetti"` → vuoto. `node --test tests/` → verde.

---

## Bloccante

Nessuno.

## Importante

1. **`fase-1.md` §6, verifica preliminare 1 (righe 225-233): i numeri attesi sono sbagliati.**
   Atteso "rotoli_grezzi INSERT 11 / UPDATE 12"; il grant di `000_setup.sql` (righe 708-711) e la
   produzione dicono **12 / 13** (l'autore ha contato senza `n_prog`). Il piano prescrive "se una di
   queste non dà il risultato atteso: fermarsi e fare rapporto": così com'è, la verifica fermerebbe
   la fase per un falso allarme, o peggio indurrebbe a "correggere" i grant con una migrazione che
   non serve. Correggere i numeri attesi in 12 / 13.

2. **"Esporta tutto" (`fase-1.md` §2 voce 5, righe 150-156) rischia un backup incompleto, per due vie.**
   (a) Voce 1 (riga 46) dice che da spento l'interruttore "ogni interrogazione dei grezzi aggiunge
   `.not("n_prog","like","COLLAUDO%")`": applicato all'esportazione, il file `rotoli_grezzi_*.json`
   non conterrebbe i dieci rotoli di collaudo. L'esportazione è il backup dello spec §5.4 e deve
   ignorare l'interruttore, come già fa (esplicitamente) la proposta di `n_prog`. Va scritto.
   (b) PostgREST/Supabase restituisce al massimo 1000 righe per richiesta (impostazione di
   default): `eventi` e `controlli` la supereranno entro il pilota, e il file uscirebbe troncato
   **senza errore**. Il piano deve prevedere la paginazione con `.range()` fino a esaurimento.

3. **Messaggi d'errore fuorvianti su unicità e FK (`fase-1.md` §2 voce 2 riga 82, voce 4 righe
   132-137; `js/db.js` righe 42-44).** Il piano dichiara `js/db.js` intoccato e "i messaggi sono
   quelli che db.js già traduce", ma la Fase 1 introduce violazioni che quel testo fisso descrive
   male: `unique (settimana, posizione)` (aggiunta concorrente o passo fallito dello scambio ▲▼) e
   `operatori.nome unique` produrrebbero "Questo numero è già stato usato: controlla il numero
   progressivo"; la FK `lavorazioni.pianificazione_id` (Togli su una riga con una lavorazione
   **annullata**, che non conta come "già lavorata") darebbe 23503 → messaggio generico. Lo
   `STATO_2026-09-03.md` (riga 74) lo prevedeva: "le pagine delle Fasi 1-4 potranno passare messaggi
   specifici". Consentire a `salva()` un messaggio per codice (parametro opzionale) non è un'aggiunta
   fuori fase: è il modo per rispettare "messaggi d'errore in italiano" (PIANO §1). In alternativa
   tradurre nella pagina; ma va deciso nel piano, non lasciato al caso.

4. **Prove con sessione rimandate al sito pubblicato (`fase-1.md` §5, riga 215).** `git push` su
   `main` è produzione (CLAUDE.md); lo spec §5.6 punto 4 colloca le prove nel browser sui rotoli di
   collaudo in locale (`.claude/launch.json`). Le prove 2-7 vanno fatte prima del push su
   `http://localhost:8000` con il login del committente (la sessione Supabase vale anche per quella
   origine), e ripetute sul sito al passo 8.2. Altrimenti il primo codice che tocca dati va online
   senza mai essere stato provato con una sessione.

## Minore

5. **Casella "mostra tutte" nella scheda prevista (`fase-1.md` §2 voce 4, riga 123)** non è nel
   PIANO §3 Fase 1 né nello spec §4.2 (è nello spec §3.4, per il tablet). È coerente e utile (senza
   di essa un grezzo fuori da ogni range non avrebbe mai una scheda), ma va elencata in §7
   "Interpretazione dichiarata", non lasciata implicita.

6. **Interruttore collaudo e sequenza della settimana (`fase-1.md` §2 voce 1 riga 46, voce 4 righe
   118-119).** "Ogni interrogazione dei grezzi" applicata anche al join della sequenza farebbe
   sparire righe già in programma, lasciando buchi nelle posizioni. Precisare: il filtro vale per
   l'elenco dei disponibili; la sequenza mostra tutte le righe della settimana.

7. **Campi vuoti dei moduli (`fase-1.md` §2 voce 2, righe 60-73).** Non è detto come si inviano i
   campi numerici e di data lasciati vuoti (`kg_residui`, `data_arrivo`, `spessore_mm` …): una
   stringa vuota su `numeric` o `date` dà 22P02/22007 → messaggio generico. Regola da scrivere:
   vuoto → `null` (e per `kg_residui` distinguere "vuoto = mai lavorato" da "0").

8. **`lunediDellaSettimana` e ISO (`fase-1.md` §2 voce 4, righe 109-111; §3 riga 164).** Il lunedì
   è una `Date` a mezzanotte locale; se il codice usa `toISOString()` per la colonna `settimana`
   ottiene il giorno prima (UTC). Il test deve coprire la conversione in `AAAA-MM-GG` dai
   componenti locali, o la funzione deve restituire direttamente la stringa.

9. **`formattaNumero` duplica `fmtM` (`js/comune.js` riga 82).** Stessa `Intl.NumberFormat("it-IT")`
   con `useGrouping: "always"`: farla una sola (`fmtM` espressa con `formattaNumero`).

10. **`stampa.html` con ruolo ≠ ufficio (`fase-1.md` §2 voce 3, riga 87).** `ufficio.html` ha lo
    stato "non autorizzato"; `stampa.html` no. La RLS garantisce che a un utente `reparto` non arrivi
    nulla (né `fornitore` né `rif_bolla`: verificato, `grezzi_sel using (e_ufficio())`), quindi non
    è un varco; ma la pagina mostrerebbe una scheda vuota senza spiegazione. Stesso messaggio di
    `ufficio.html`.

11. **Scambio ▲▼ in tre passi (`fase-1.md` §2 voce 4, righe 132-137).** Difendibile (PostgREST non
    ha transazioni, nessuna funzione SQL è nel piano) e onesto sull'errore a metà. Da aggiungere:
    disabilitare ▲▼ e Togli durante i tre passi, e dire che la riga rimasta a posizione negativa si
    sistema con un altro ▲▼ (o Togli e riaggiungi). Se in Fase 2+ lo scambio dovesse dare fastidio,
    una RPC `scambia_posizioni` sarà la strada, non in questa fase.

12. **`fase-1.md` §2 voce 2, riga 54: "Elenco. `rotoli_grezzi` ordinati per `n_prog`"** — ordinamento
    testuale: `A10000` verrebbe prima di `A9999`. Accettabile oggi (cifre a 4 fisse), da annotare.

---

## I due punti richiesti

### (1) Nessuna cancellazione di un rotolo grezzo — **difendibile, non bloccante**

Il PIANO §3 Fase 1 voce 2 elenca tabella, Nuovo rotolo, modifica, autocompletamento; lo spec §4.1
elenca Tabella, Nuovo rotolo, Stampa, Modifica. Nessuno dei due prevede un tasto di cancellazione.
La frase dello `STATO_2026-09-03.md` (riga 77-78, "da gestire in Fase 1, che costruisce la
cancellazione") è un'annotazione dell'implementatore della Fase 0, non una voce del piano né una
decisione del committente: la gerarchia delle fonti (PIANO §1: "vale lo spec") dà ragione al piano
di fase. Il risultato verificabile ("inserisce i grezzi, li stampa e compone il programma") si
raggiunge senza cancellare: un grezzo sbagliato si corregge con Modifica (`n_prog` compreso, il
grant di update lo consente finché `grezzo`).

Due condizioni perché resti difendibile:
- l'annotazione aperta su `grezzi_del` (non considera `pianificazione`) va **riportata** nello
  STATO della Fase 1, non chiusa né dimenticata, con la nuova formulazione "da gestire nella fase
  che costruirà la cancellazione, se una fase la prevede";
- la scelta va nel RAPPORTO in italiano semplice, perché il committente sappia che un grezzo
  inserito per errore oggi si corregge e non si elimina.

### (2) "Togli dal programma" nella Pianificazione — **difendibile, non bloccante**

Il PIANO §3 Fase 1 voce 4 non nomina la cancellazione di una riga (e nemmeno, alla lettera,
l'aggiunta: "grezzi disponibili a sinistra, sequenza a destra" le sottintende entrambe). Tre
argomenti a favore, nell'ordine di peso:
1. lo spec §5.3 concede all'ufficio il **delete** su `pianificazione`, e nessun'altra schermata
   delle Fasi 2-4 scrive su quella tabella: senza "Togli" la policy `pian_del` e il grant non
   avrebbero mai un consumatore;
2. il risultato verificabile è "compone il programma": un programma a cui si può solo aggiungere
   non si compone, si accumula;
3. è dichiarato in §7 e usa solo ciò che esiste (nessuna migrazione, nessuna regola nuova).

Il contrario (nessun Togli) obbligherebbe il committente a chiedere una cancellazione via
connettore per ogni riga sbagliata, contro lo spirito dello spec. Le condizioni:
- disattivato sulle righe già lavorate (già scritto, riga 130);
- il caso della lavorazione **annullata** che punta la riga (FK, punto 3 sopra) deve dare un
  messaggio in italiano che spieghi ("questa riga ha una lavorazione annullata: resta come storia");
- nessuna conferma modale complicata: un Togli con ricarica basta, la riga si riaggiunge.

Osservo un'asimmetria di ragionamento: per (2) il piano dice "la policy esiste per questo", per
(1) la stessa policy (`grezzi_del`) non basta a giustificare il tasto. La distinzione regge perché
(2) serve al risultato verificabile della fase e (1) no; il piano di fase dovrebbe scriverlo così,
per evitare che la revisione del codice riapra la domanda.

---

## Controlli senza rilievi

- Guardie della Fase 1: `stato` mai in un modulo né inviato; `kg_residui` scritto solo dal modulo
  di modifica su `grezzo` (dentro `grezzi_upd`); nessuna stampa dal tablet; `prossimoNProg` sulla
  lista completa e senza filtro collaudo, i `COLLAUDO-*` ignorati dal formato (`js/comune.js` 43-54).
- Regole di dominio: nessuna nuova nel front-end; `schedeCompatibili` è un filtro di UI previsto
  dallo spec (§3.4, §4.2), non una regola del DB; la "sola lettura se non grezzo" è un riflesso
  della policy, dichiarato come tale (§4 del piano di fase).
- Il reparto non compare in questa fase; nessuna via porta `fornitore`/`rif_bolla` a un tablet.
- Funzioni pure: quattro, in `comune.js`, senza import, con test elencati; coppie di
  `test-dom-ids.mjs` complete (5 nuove) e compatibili con il test esistente (`js/ufficio/...`).
- Italiano ovunque; nessun cache-buster; `index.html`, `db.js`, `base.css`, `sql/` intoccati;
  `supabase.js` UMD con lo stesso `integrity` (`index.html` riga 10-11).
- Voci delegate: nessuna nuova; coerenti con STATO "IN ATTESA DEL COMMITTENTE".

## Conclusione

Il piano della Fase 1 fa solo quello che il piano generale chiede e non ha bisogno di toccare il
database: l'ho verificato direttamente sulla produzione. Le due scelte dichiarate (niente
cancellazione dei grezzi, tasto "Togli" nel programma) sono giuste e motivate; vanno solo scritte
nel rapporto. Prima di partire vanno corretti quattro punti pratici: i numeri attesi della verifica
sui grant (12/13, non 11/12), l'esportazione che deve includere i rotoli di collaudo e leggere oltre
le 1000 righe, i messaggi d'errore per i doppioni nel programma, e le prove con il login fatte in
locale prima di pubblicare.
