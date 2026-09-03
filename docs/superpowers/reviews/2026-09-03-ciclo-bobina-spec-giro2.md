# Revisione spec ciclo bobina — giro 2

MODELLO: claude-opus-5[1m] (Opus 5, contesto 1M)

Revisore indipendente, secondo giro. Letti per intero: la revisione del giro 1, lo spec
revisione 2, il diff con la revisione 1 (`git diff HEAD~1 HEAD`), e i tre documenti aziendali
(`Procedure Produzione`, `Progetto_Piattaforma_Produzione`, `Manuale completo`).
Nel repository non esiste ancora codice: solo `docs/`.

## VERDETTO: BLOCCANTI PRESENTI

**Un solo bloccante**, ed è un difetto di scrittura da due righe, non di disegno. Il resto del
lavoro è fatto: **45 dei 50 punti del giro 1 sono risolti come chiesto, 4 sono risolti in modo
diverso ma accettabile, 1 è rifiutato con una motivazione che regge, nessuno è ignorato.**
L'esempio numerico del caso C è aritmeticamente corretto in ogni passaggio (l'ho rifatto:
kg/m, metri stimati, bilancio, codici, `kg_scarto`, stati — tutto torna).

Il bloccante: due guardie scritte `> 0` su pesi che nella realtà valgono legittimamente **0**,
una delle quali è violata dall'esempio stesso dello spec — cioè dal fixture del test.
Si chiude cambiando `> 0` in `≥ 0` in due punti.

Conteggio dei nuovi: **1 bloccante · 10 importanti · 12 minori · 1 semplificazione**.

---

## Esito dei punti del giro 1

| Punto | Esito | Nota |
|---|---|---|
| **B1** vicolo cieco della lavorazione | RISOLTO | `annulla_lavorazione(p_motivo)` ammessa con controlli ed eventi presenti; tasto "Annulla avvio" in §3.3, collocato in Fase 2. La guardia "nessun figlio generato" è implicita in `stato = 'aperta'`: corretto |
| **B2** caso C non implementabile | RISOLTO | `kg_residui` = kg netti di alluminio, tubolare escluso (§2.2); tubolare null nel caso C; formula esplicita del bilancio; esempio numerico completo. Vedi però IN4 |
| **B3** scheda del residuo muta | RISOLTO | §4.7 `tipo=grezzo`: "Lavorazione: ______" sempre vuota + tabella "Già lavorato da questo rotolo". Manca solo chi la ristampa: IN5 |
| **B4** RLS non basta per "solo note" | RISOLTO | §5.3 riscritta con grant per colonna + policy `using (stato = 'grezzo')` su `rotoli_grezzi`. Il trigger `modificato_da/il` funziona anche senza grant al client (il controllo di privilegio è sullo statement, non su ciò che fa il trigger): verificato, è corretto |
| **B5** micron e gloss senza soglia | RISOLTO | `micron_min`/`micron_max` (±10 % da decisione committente), gloss 40/60 come costanti assolute della vista. Vedi IN8 sul perimetro dei limiti gloss |
| **B6** scarto non registrato | RISOLTO | `eventi.metri_scarto` (proposto 100) e `lavorazioni.kg_scarto`, mostrato in chiusura. Nel caso C `kg_scarto` resta null: limite dichiarato e coerente |
| **I1** guardia di ruolo con NULL | RISOLTO | `coalesce(ruolo_utente(), '')` + revoke/grant execute, scritto nello spec |
| **I2** insert su lavorazione chiusa | RISOLTO | `with check (lavorazione aperta)` per il reparto; l'ufficio resta libero, coerente con §4.4 |
| **I3** `modificato_da` testo libero | RISOLTO | trigger `before insert or update` con `ruolo_utente()`, nessun grant al client |
| **I4** nessuna registrazione a posteriori | RISOLTO | `p_avviata_il`/`p_chiusa_il` + "Registra lavorazione già avvenuta" in §4.4. Ma la correzione introduce due problemi nuovi: IN2 e IN3 |
| **I5** chiusura con fermo aperto | RISOLTO | guardia esplicita con messaggio in italiano |
| **I6** corsa in avvio | RISOLTO | `for update` come prima istruzione |
| **I7** soglia bolla al secondo giro | RISOLTO | confronto con `coalesce(kg_residui, peso_bolla_kg)` ed etichetta corretta |
| **I8** metri dei figli non modificabili | RISOLTO | `metri` nullable in `p_figli`, calcolati se null; update ufficio su `metri` concesso |
| **I9** guardie sulla ripartenza | RISOLTO | indice unico su `fermo_id` + verifica di tipo, lavorazione e ordine temporale |
| **I10** Scheda di Produzione che cambia | RISOLTO | tre colonne snapshot su `lavorazioni`, usate dalla stampa; la vista continua a leggere la scheda viva, come proposto |
| **I11** `sessionStorage` | RISOLTO DIVERSAMENTE | scelta l'opzione T9: meccanismo di recupero tolto del tutto, resta il ritentativo. Più semplice e coerente con "niente offline": accettabile |
| **I12** completezza inizio/metà/fine | RISOLTO | avviso non bloccante in chiusura |
| **I13** Fase 0 troppo grande | RISOLTO | import schede spostato in testa alla Fase 2; Fase 0 = DB + test + login. Vedi MN8 |
| **I14** niente sull'adozione | RISOLTO | colonna "In reparto" su Fasi 2/3/4, fase "Addestramento", §7 estesa. È la correzione che vale di più |
| **Minore 1** linea di fatto costante | RISOLTO | via T4 |
| **Minore 2** `aggiunta_satina` troppo stretto | RISOLTO | `aggiunta` + `prodotto` con autocompletamento (satina, ammoniaca, altro) |
| **Minore 3** `temp_nitrico` | RISOLTO | il nitrico non si importa più; le zone bagni restano quattro, coerenti con §3.5 |
| **Minore 4** soglia 30 min | RISOLTO | portata a 20, con la fonte citata |
| **Minore 5** `durata_min` non ricalcolata | RISOLTO | trigger `before insert or update`. Sotto-specificato sul lato fermo: MN3 |
| **Minore 6** metri di un esaurito | RISOLTO | `kg_residui = 0` alla chiusura, `metri_stimati` vale 0 |
| **Minore 7** storico dei valori precedenti | RIFIUTATO CON MOTIVAZIONE | §2.9: bastano `modificato_da/il`, `precedente jsonb` solo se una contestazione lo richiederà. **La motivazione regge**, e regge *di più* dopo B4: ora l'ufficio può correggere solo `note` sulle lavorazioni e cinque campi sui figli, quindi la superficie da tracciare è minuscola |
| **Minore 8** quali pesi sulla Scheda Rotolo | RISOLTO | tre pesi del figlio (lordo, tubolare, netto), per decisione del committente |
| **Minore 9** `select` a tutti gli autenticati | RISOLTO DIVERSAMENTE | deciso consapevolmente in §2.9: il reparto vede clienti/schede, non vede fornitore e riferimento bolla. È esattamente ciò che il giro 1 chiedeva ("va deciso, non per default") |
| **T1** `pianificazione.lavorazione_id` | RISOLTO | colonna tolta, sostituita da `exists (…)` |
| **T2** `rotoli_lavorati.stato` | RISOLTO | tolta |
| **T3** `rotoli_lavorati.suffisso` | RISOLTO | tolta |
| **T4** UI multi-linea | RISOLTO | colonna `linea` tenuta, ogni riferimento a più linee tolto dalle schermate |
| **T5** sei colonne inutili su `schede_lavorazione` | RISOLTO | nitrico, `clienti_storici`, `fonte`, `data_scheda` tolte |
| **T6** `eventi.rotolo_lavorato_id` | RISOLTO | tolta |
| **T7** rotolo di collaudo | RISOLTO DIVERSAMENTE | tolta la regola sul nome operatore (la parte che il giro 1 chiedeva di togliere "almeno"); il rotolo resta, motivato da §5.6 (test dei flussi) e dalla fase Addestramento. **La motivazione regge**, ma il rotolo così com'è è monouso: IN9 |
| **T8** `operatori.ordine` | RISOLTO | tolta, ordine alfabetico |
| **T9** recupero da `sessionStorage` | RISOLTO | tolto |
| **T10** Esporta Excel ovunque | RISOLTO | limitato a Lavorazioni e Rotoli lavorati, con la ragione (sostituisce la trascrizione di procedure §4.4) |
| **Ambiguità 1** tubolare in `kg_residui` | CHIARITA | "kg netti di alluminio, tubolare escluso" |
| **Ambiguità 2** riferimento del micron | CHIARITA | `micron_min`/`micron_max` |
| **Ambiguità 3** residuo stimato o ripesato | CHIARITA | stimato dai metri (decisione committente), con la UI descritta |
| **Ambiguità 4** 2 % di che cosa | CHIARITA | formula scritta per esteso |
| **Ambiguità 5** contenuto di `annotazioniDaEventi` | CHIARITA | "solo fatti, mai causa o azione", con esempio di output |
| **Ambiguità 6** `prossimoNProg` | CHIARITA DIVERSAMENTE | "massimo mai usato con la stessa lettera + 1". Sceglie l'opposto di procedure §3.3, ma è la scelta giusta (il vincolo unique non consente il riuso) — va solo dichiarata come scostamento: MN4 |
| **Ambiguità 7** metà/fine obbligatori | CHIARITA | avviso non bloccante |
| **Ambiguità 8** chi corregge i controlli | CHIARITA | §2.9: il capoturno è distinzione del solo front-end. È una delle due risposte che il giro 1 accettava |
| **Ambiguità 9** caso A, chi stampa cosa | CHIARITA | "nel caso A la Scheda Rotolo sostituisce fisicamente la scheda grezzo" |
| **Ambiguità 10** schermate chiuse a metà | CHIARITA | "si ricomincia", scritto sia in §3.4 sia in §3.7 |
| **Ambiguità 11** 300 righe per file | CHIARITA | sostituito da "una schermata, un file" |
| *Duplicazioni segnalate* | RISOLTE | duplicazione `fuoriRange` dichiarata in §2.6 e coperta dal test §5.6 punto 3; `codiciFigli` idem; "fermo aperto" ha ora **una sola** definizione ("`durata_min` è un dato derivato"); la regola "grezzo modificabile solo se grezzo" è passata nella policy. Manca `bilancioChiusura` nel test di coerenza: MN10 |

**Totale: 45 risolti · 4 risolti diversamente (accettabili) · 1 rifiutato con motivazione che regge · 0 non risolti.**

---

## Bloccanti nuovi

### BN1 — Due guardie `> 0` su pesi che nella realtà valgono 0, e l'esempio dello spec viola la prima
**Spec §2.7 (`avvia_lavorazione`, `chiudi_lavorazione`), §3.4, §3.7, §5.6. Manuale
("AGGANCIO NASTRI CON TUBOLARE"), Procedure §3.4.**

**(a) `peso_imballo`.** §2.7 scrive fra le guardie di `avvia_lavorazione`:
`pesi > 0, imballo < con imballo`. Al plurale, "pesi" sono i due pesi passati. Ma:

- §3.4 schermata 3 dice l'opposto, testualmente: *"peso imballo (**0 ammesso** per un residuo
  già sballato)"*;
- **l'esempio numerico di §2.7 stesso lo viola**: *"Secondo giro. Avvio: con imballo 2.500,
  **imballo 0**"*;
- quell'esempio è dichiarato in §5.6 come il contenuto di `sql/test_regole.sql`
  ("l'esempio numerico di §2.7 per intero").

Quindi lo spec, letto alla lettera, prescrive una guardia che rende **impossibile il secondo
giro di ogni caso C** — cioè proprio il flusso per cui il caso C esiste — e fa fallire il
proprio test di accettazione. Due implementatori leggeranno due cose diverse e uno dei due
scriverà un impianto che il committente scopre rotto la prima volta che un residuo torna in
linea senza imballo.

**(b) `peso_tubolare`.** §2.7: *"se `p_kg_residui = 0` allora `p_peso_tubolare` **deve essere
> 0**"*. Esiste un caso reale che la viola: il coil **senza tubolare**. Il manuale lo dice
esplicitamente nella procedura di aggancio — *"chiudere l'espansione del mandrino così da
poter togliere l'**eventuale** tubolare"* — e le procedure §3.4 descrivono la pesata del
tubolare come passaggio del caso normale, non come invariante. Con la regola scritta così,
davanti a un coil senza tubolare l'operatore non può chiudere la lavorazione: o inventa un
peso falso (che finisce in `kg_scarto` e sulla Scheda Rotolo), o dichiara un residuo che non
c'è per aggirare la guardia. Nell'immediato la linea resta occupata.

**Correzione (due righe, nessun impatto sul disegno).**
- `avvia_lavorazione`: `p_peso_con_imballo > 0`, **`p_peso_imballo ≥ 0`**, `p_peso_imballo <
  p_peso_con_imballo`.
- `chiudi_lavorazione`: se `p_kg_residui = 0` allora `p_peso_tubolare` **non null e ≥ 0**
  (resta vietato il null, che è il segnale del caso C: la regola non perde potere).
  In §3.7 schermata 1, ramo *No*, il campo tubolare accetta 0 con l'etichetta
  "senza tubolare".
- Aggiungere ai casi di `test_regole.sql`: chiusura con tubolare 0 e residuo 0 che **riesce**,
  e avvio con imballo 0 che **riesce**.

---

## Importanti nuovi

### IN1 — La vista `rotoli_grezzi_reparto` funziona, ma lo spec non la collega a niente
**Spec §2.2, §5.3, §3.3, §3.7, §4.7.**

Il meccanismo in sé è corretto e l'ho verificato riga per riga: vista con
`security_invoker = false` di proprietà di `postgres`, che è anche il proprietario di
`rotoli_grezzi` — il proprietario di una tabella salta la RLS (salvo `force row level
security`), quindi il reparto legge la vista e non la tabella. È il pattern standard su
Supabase e regge. **Ma manca tutto ciò che lo rende utilizzabile:**

1. **§5.3 non ha una riga per la vista.** Senza `grant select on rotoli_grezzi_reparto to
   authenticated` la vista non esiste per PostgREST e il tablet non legge nulla. Va scritto,
   perché la tabella §5.3 è l'unico posto dove un implementatore va a cercare i permessi.
2. **Solo §3.4 dice di usare la vista.** Ma il grezzo serve anche all'**hub** (§3.3: il banner
   mostra `A5000`, che sta su `rotoli_grezzi`, non su `lavorazioni`), alla **chiusura** (§3.7
   legge `kg_residui`, `peso_bolla_kg`, `metri_stimati`, larghezza e spessore per i kg/m) e
   alla **stampa** aperta dal tablet (§4.7 `tipo=rotolo` riporta lega, finitura, dimensioni,
   che vengono dal grezzo). Se `stampa.js` interroga `rotoli_grezzi`, la Scheda Rotolo stampata
   dal reparto esce vuota a metà, e nessuno se ne accorge finché non si stampa in reparto.
3. **La pianificazione fa join sul grezzo.** L'hub del tablet mostra "In programma questa
   settimana": `pianificazione` è leggibile dagli autenticati, ma la risorsa incorporata
   `rotoli_grezzi` è chiusa dalla RLS e PostgREST restituisce semplicemente **null**, senza
   errore. Va scritto che il join lato reparto si fa su `rotoli_grezzi_reparto` (PostgREST
   inferisce la relazione perché la vista espone `id`), oppure che si fanno due query.

**Correzione.** Una riga in §5.3 (`rotoli_grezzi_reparto | select: autenticati | — | — | —`) e
una frase in §2.2: *"ogni lettura del grezzo lato reparto — hub, avvio, chiusura, stampa,
join dalla pianificazione e dalle lavorazioni — passa da questa vista"*.

### IN2 — `p_avviata_il` "diverso da `now()` solo se ufficio" non è verificabile in modo robusto
**Spec §2.7.**

Funziona **solo se il client omette il parametro**: in quel caso il default `now()` è valutato
nella stessa transazione del corpo, quindi `p_avviata_il = now()` esattamente. Se invece il
tablet passa il parametro esplicitamente — cosa normale con PostgREST, e inevitabile se
qualcuno riusa la stessa funzione di chiamata per entrambi i ruoli — il valore differisce di
millisecondi (e comunque l'orologio del tablet non è quello del server), la condizione scatta e
**il reparto viene respinto con "Non autorizzato" senza capire perché**. Un errore così, in
reparto, si traduce in "il tablet non funziona" e in un ritorno alla carta.

**Correzione, non ambigua e più semplice:** togliere il confronto e scrivere
`if coalesce(ruolo_utente(),'') <> 'ufficio' then p_avviata_il := now(); end if;` (idem per
`p_chiusa_il`). Il reparto non può falsificare l'orario, e nessuna chiamata legittima fallisce.

### IN3 — La registrazione a posteriori si scontra con l'indice unico, proprio quando serve
**Spec §2.7, §2.4, §4.4, §3.9.**

Lo scenario di §4.4 è: la rete è mancata, il turno è finito su carta, l'ufficio ricopia.
Quando l'ufficio ricopia, la rete è tornata — quindi l'operatore ha già avviato normalmente il
rotolo successivo, e **c'è una lavorazione `aperta` sulla linea 1500**. `avvia_lavorazione`
crea la lavorazione `aperta` prima di chiuderla, quindi l'indice unico parziale la respinge:
"C'è già una lavorazione aperta sulla linea 1500". Il piano B dichiarato in §3.9 è
inutilizzabile nelle ore di produzione; resta il sabato.

**Correzione (una delle due).** (a) Una quarta funzione
`registra_lavorazione_completa(...)` che crea la riga **già `chiusa`** con i suoi figli in
un'unica transazione — è anche più onesta rispetto a ciò che quella schermata fa davvero.
(b) In alternativa, scrivere esplicitamente in §4.4 che la registrazione a posteriori si fa
solo a linea libera, e dirlo al committente: è una limitazione, ma dichiarata.

### IN4 — L'esempio del caso C torna solo se `metri_stimati` è arrotondato, e lo spec non lo dice
**Spec §2.2, §2.7, §3.7, §5.6.**

Ho rifatto i conti. Con i metri arrotondati all'intero, l'esempio è corretto in ogni passaggio:
`802 m` → residuo `(802 − 500) × 8,1 = 2.446,2` → **2.446 kg**. Ma `metri_stimati` è una
**colonna generata**, quindi il valore vero è `6500 / 8,1 = 802,469…`, e
`(802,469 − 500) × 8,1 = **2.450 kg**. Quattro chili di differenza fra due letture entrambe
fedeli allo spec.

Non è un numero sbagliato, è un numero **non riproducibile**: `sql/test_regole.sql` deve
riprodurre "l'esempio numerico di §2.7 per intero" e `tests/test-comune.mjs` deve testare
`residuoProposto` sullo stesso esempio. I due test si contraddiranno a seconda di chi
arrotonda.

**Correzione.** Scrivere la regola in §2.2 (`metri_stimati` = `round(...)`, oppure `numeric`
con due decimali) **e** scrivere `residuoProposto` in kg senza passare dai metri:
`kg_residui = kg_disponibili_stimati − (contametri_fine − contametri_inizio) × kg_al_metro`,
che dà 6.500 − 4.050 = 2.450 ed è la stessa cosa detta senza arrotondamenti intermedi.
Poi allineare i numeri dell'esempio alla regola scelta.

*Nota di merito su questo punto:* la domanda "il residuo proposto è calcolabile dal tablet?"
ha risposta sì e per una ragione elegante — durante la lavorazione il grezzo è
`in_lavorazione`, e la policy di update `using (stato = 'grezzo')` impedisce all'ufficio di
toccarne dimensioni e `kg_residui`. Quindi `metri_stimati` **non può cambiare** fra avvio e
chiusura e non serve nessuno snapshot. Va solo detto, perché è un ragionamento che non si fa
da soli.

### IN5 — Nel caso C nessuno ristampa la scheda del grezzo residuo
**Spec §3.7 schermata 3, §4.1, §4.7. Procedure §8.3.**

B3 è stato corretto bene: la scheda del grezzo ora riporta "Già lavorato da questo rotolo" e
l'intestazione "Lavorazione: ______" vuota. Ma dopo la chiusura §3.7 offre *"un tasto Stampa
per ogni **Scheda Rotolo**"* — cioè solo i figli. La scheda aggiornata del residuo, che è la
carta che deve tornare fisicamente in cartelletta sul rotolo che va a magazzino (procedure
§8.3), **non la stampa nessuno**: l'unico tasto sta in §4.1, in ufficio, e nessuno dice
all'ufficio che deve premerlo. Il risultato è il difetto che B3 voleva togliere: il residuo
torna a magazzino con la carta vecchia, che non dice cosa è stato lavorato.

**Correzione.** In §3.7 schermata 3, nel caso C, aggiungere il tasto **"Stampa scheda del
residuo"** accanto a quelli delle Schede Rotolo, con la frase "sostituisci la scheda nella
cartelletta". Costa una riga di spec e chiude il caso C sulla carta.

### IN6 — I pesi, una volta chiusa la lavorazione, non sono correggibili da nessuno
**Spec §5.3, §4.4, §4.5.**

Conseguenza diretta e non dichiarata della correzione di B4 (che resta giusta). I grant per
colonna sono: `lavorazioni` → solo `note`; `rotoli_lavorati` → `cliente, film, tipo_film,
annotazioni_cliente, metri`. Quindi:

- un `peso_lordo_kg` o `peso_tubolare_kg` digitato male su un figlio **è definitivo**, e va
  stampato così sulla Scheda Rotolo che il cliente riceve (procedure §4.1: i pesi sono
  contenuto obbligatorio della scheda);
- un `peso_tubolare_kg` sbagliato sulla lavorazione è definitivo e falsa `kg_scarto`, che è la
  base del KPI di scarto (procedure §10.3);
- `delete` è vietato su entrambe le tabelle, quindi non c'è nemmeno la via "cancella e rifai".

Il bilancio non protegge: un peso digitato **in difetto** passa il controllo `≤`.
L'unica traccia possibile è una nota in fondo alla Scheda di Produzione.

**Correzione.** Una RPC `correggi_chiusura(p_lavorazione_id, p_peso_tubolare, p_figli_pesi,
p_motivo)`, riservata all'ufficio, che ricalcola `kg_scarto` e rifà il bilancio — oppure, più
semplice e sufficiente per il pilota, estendere il grant a `peso_lordo_kg` e
`peso_tubolare_kg` su `rotoli_lavorati` per la sola utenza ufficio, accettando che
`kg_scarto` non si aggiorni e dichiarandolo. Una delle due va scelta prima della Fase 4.

### IN7 — `kg_residui` non è correggibile da nessuno, e l'annullo lo lascia sbagliato
**Spec §5.3, §2.7 (`annulla_lavorazione`), §2.2.**

Stessa famiglia di IN6, ma su un dato di magazzino. `kg_residui` è escluso dai grant e si
scrive solo dentro `chiudi_lavorazione`. Due conseguenze concrete:

1. Il residuo del caso C è una **stima** (decisione del committente, non in discussione).
   Quando alla ripesata successiva si scopre che erano 2.380 e non 2.446, nessuno può
   correggere il magazzino: bisogna aspettare la lavorazione successiva. Per un dato che
   l'ufficio usa per pianificare la settimana (§4.2 mostra i residui con i kg), è una
   rigidità che va almeno dichiarata.
2. `annulla_lavorazione` riporta il grezzo a `grezzo` con **`kg_residui` invariati**. Ma il
   caso che ha motivato B1 — avvio fallito, nastro rotto, sfiammata al rullo di rame — è
   esattamente il caso in cui qualche decina o centinaio di metri sono stati consumati come
   scarto. Il magazzino resta con un numero che sa di essere sbagliato, e nessuno può
   sistemarlo.

**Correzione minima e coerente con B6:** `annulla_lavorazione` accetta un
`p_metri_scarto default 0` e, se valorizzato, scala `kg_residui` (o lo valorizza partendo da
`peso_bolla_kg`). In alternativa, dichiarare esplicitamente in §2.9 che il residuo si corregge
solo alla chiusura successiva.

### IN8 — I limiti gloss 40 / 60 applicati anche alle lavorazioni naturali colorano di rosso metà produzione
**Spec §2.6, §2.1. Manuale, "CONTROLO QUALITÀ".**

Il manuale dà i due limiti in modo assoluto (*"la misura perpendicolare deve essere minore di
40, la parallela minore di 60"*) e lo spec li ha recepiti alla lettera: giusto come lettura del
testo. Ma il gloss misura la brillantezza, e la satinatura serve proprio a **abbassarla**: su
un nastro **naturale**, non satinato, il gloss è alto per costruzione. Le schede sono divise in
due fogli, OX NATURALE e OX SATINATO — cioè metà delle ~60 schede. Applicando i limiti a
tutte, ogni rotolo naturale esce con due campi rossi e `n_fuori ≥ 2`, in Live e sulla Scheda di
Produzione stampata. Dopo tre giorni l'operatore smette di guardare i colori, e con essi smette
di guardare il micron — che è la misura che conta davvero.

Non è un difetto di lettura dei documenti: è una domanda che il committente deve chiudere
prima della Fase 3, ed è a costo zero. `schede_lavorazione.tipo` (`naturale` | `satinato`)
esiste già e oggi non è letto da nessuna schermata: basta condizionare i due limiti a
`tipo = 'satinato'`.

**Correzione.** Chiedere al committente: i limiti gloss valgono anche per i naturali? Se no,
in §2.6: *"gloss: confrontati solo se la scheda applicata ha `tipo = 'satinato'`"*.

### IN9 — Il rotolo di collaudo è monouso, ma l'Addestramento prevede che tutti ci facciano un ciclo completo
**Spec §5.7, §5.6 punto 4, §6 (fase Addestramento), §5.3, §2.7.**

`COLLAUDO-0001` è **una riga sola**. Il primo ciclo completo lo chiude: `chiudi_lavorazione`
con residuo 0 lo porta a `esaurito`, con `kg_residui = 0` e `metri_stimati = 0`. Da quel
momento:

- non è riavviabile (`avvia_lavorazione` richiede `stato = 'grezzo'`);
- non è cancellabile (delete ammesso solo su un grezzo "senza lavorazioni");
- il suo `n_prog` non è riusabile (§2.2: mai un numero già usato);
- `stato` e `kg_residui` non sono scrivibili da nessun grant.

Ma §6 dichiara come risultato verificabile della fase Addestramento: *"**tutti** hanno fatto un
ciclo completo sul rotolo di collaudo"*, e §5.6 punto 4 prevede le prove browser sui flussi con
lo stesso rotolo. Con quindici persone e un rotolo, il secondo operatore trova la strada
chiusa e la mezza giornata di addestramento si blocca. L'unica scappatoia dentro le regole
attuali è chiudere sempre in caso C lasciando un residuo — cioè non addestrare mai su A e B,
che sono i casi normali.

**Correzione.** Seed di dieci rotoli `COLLAUDO-0001 … COLLAUDO-0010` (dieci righe di seed,
già nascoste dal filtro `n_prog like 'COLLAUDO%'`), oppure una funzione d'ufficio
`reset_collaudo()` che cancella lavorazioni e figli del rotolo di collaudo e lo riporta a
`grezzo`. La prima è più semplice e non aggiunge una via di scrittura.

### IN10 — Il fornitore sparisce dalla Scheda Rotolo, che le procedure lo richiedono, e chi la stampa non potrebbe leggerlo
**Spec §4.7 (`tipo=rotolo`), §2.2, §3.7, §5.3. Procedure §4.1.**

Le procedure §4.1 elencano il contenuto della Scheda Rotolo e vi includono
*"**Fornitore del nastro e dati identificativi della bobina**"*. Lo spec §4.7 `tipo=rotolo`
elenca: codice, cliente, lega, finitura, dimensioni, lavorazione applicata, tre pesi, metri,
film, annotazioni. Il fornitore **non c'è**, e lo spec non dichiara lo scostamento.

L'omissione è comprensibile — la decisione del committente nasconde fornitore e riferimento
bolla al reparto — ma le due cose non sono la stessa: la decisione riguarda **cosa vede il
reparto**, non **cosa c'è sulla carta che segue il rotolo dal cliente**. E c'è un nodo tecnico
che rende la questione non rinviabile: in §3.7 è **il tablet** a stampare le Schede Rotolo, e
l'utenza reparto non può leggere `fornitore` in nessun modo. Quindi, se il committente decide
che il fornitore ci va, quella stampa deve passare dall'ufficio o servire da una vista/RPC
dedicata.

**Correzione.** Chiudere la domanda in §8 con una riga esplicita: *"la Scheda Rotolo lavorato
non riporta il fornitore — scostamento voluto da procedure §4.1"*, oppure *"lo riporta, e la
stampa `tipo=rotolo` è riservata all'ufficio"*. Oggi la risposta è implicita, ed è la peggiore
delle tre possibilità.

---

## Minori nuovi

1. **§2 — "Otto tabelle più una di servizio": sono nove.** `operatori`,
   `schede_lavorazione`, `tipi_difetto`, `rotoli_grezzi`, `pianificazione`, `lavorazioni`,
   `rotoli_lavorati`, `controlli`, `eventi`, più `utenti_app` di servizio. La revisione 1
   diceva "nove" e nessuna tabella è stata tolta.
2. **§2.7 — `kg_scarto` può risultare negativo.** Il bilancio ammette
   `Σ figli + residuo ≤ disponibile × 1,02`, quindi `kg_scarto` può scendere fino a −2 % del
   disponibile (circa −130 kg nell'esempio). §3.7 dice solo "mostrato per conferma": va detto
   cosa mostra l'operatore quando esce "−48 kg di scarto", che non significa niente.
   Suggerimento: se negativo, etichettarlo "eccedenza rispetto al peso di partenza" e non
   chiamarlo scarto.
3. **§2.5 — il ricalcolo di `durata_min` è dichiarato ma non descritto per intero.** Il trigger
   è descritto sulla riga di *ripartenza*; la frase "si riesegue anche se l'ufficio corregge
   uno dei due orari" è vera per la ripartenza, non per il fermo: correggendo l'orario del
   *fermo* nessun trigger sulla ripartenza scatta. Serve dire che il trigger è su `eventi` e
   che, se la riga toccata è un fermo, ricalcola dalla sua ripartenza.
4. **§2.2 — la regola di numerazione si scosta dalle procedure §3.3 senza dirlo.** Le procedure
   dicono "ultimo numero attivo a magazzino", lo spec "massimo mai usato". La scelta dello spec
   è quella giusta (col vincolo unique l'altra genera errori), ma va marcata come scostamento
   consapevole, altrimenti chi confronta i due documenti pensa a una svista.
5. **§2.2 / §2 — `rotoli_grezzi` non ha `modificato_da`/`modificato_il`**, benché §2 le presenti
   come convenzione generale scritta da trigger; e `durata_min` (scritta dal trigger) non è
   nell'elenco §5.3 delle colonne senza grant al client, mentre dovrebbe esserlo.
6. **§2.5 — `metri_scarto` proposto 100 m.** Il manuale dà 100 m come **lunghezza dell'intera
   linea 1500**; il tratto da scartare è "dalla sgrassatura all'uscita dell'ossido", cioè una
   parte della linea. 100 è quindi un limite superiore, non una stima. Va scritto che è una
   proposta prudenziale da tarare dopo il pilota, così il dato del sotto-progetto 2 nasce con
   l'avvertenza attaccata.
7. **§2.6 — confine dei limiti gloss.** Il manuale dice "deve essere **minore di** 40"; la
   vista segna fuori solo `> 40`. Il valore esatto 40 è già non conforme e non viene segnalato.
   Cambiare in `≥`, o accettarlo per iscritto.
8. **§6 Fase 2 — il risultato verificabile non nomina le schede.** La fase contiene l'import
   di ~60 schede da Excel (con il parsing dei range testuali e la regola micron ±10 %), ma il
   risultato dichiarato è solo "l'operatore avvia e annulla un rotolo". La fase resta di
   dimensione ragionevole e verificabile, ma il pezzo più insidioso è invisibile: aggiungere
   "le ~60 schede sono in tabella e tre righe a campione coincidono con l'Excel".
9. **§5.6 — come si prova ciò che si vuole provare.** I casi "update di `stato` respinto dal
   grant" e "`ruolo_utente()` null respinto" richiedono che `test_regole.sql` giri come ruolo
   `authenticated` con `request.jwt.claims` impostato (`set local role` / `set_config`),
   non come `postgres`: eseguito come proprietario, quei due test **passano sempre** senza
   provare nulla. Una riga di spec evita un test finto.
10. **§5.6 — `bilancioChiusura` manca dal test di coerenza.** Il punto 3 confronta con il DB
    solo `fuoriRange` e `codiciFigli`, ma `bilancioChiusura` è la terza regola duplicata fra
    `comune.js` e la RPC (§3.7: "Avanti disabilitato finché il bilancio non torna"), ed è
    quella che sbaglia più facilmente per via del `coalesce(tubolare, 0)` nel caso C.
11. **§2.7 — `annulla_lavorazione` non ha la guardia "nessun fermo aperto"**, che
    `chiudi_lavorazione` ha. Una lavorazione annullata può restare con un fermo aperto e
    `durata_min` null per sempre. Costo di aggiungerla: nullo; in alternativa, chiuderlo
    d'ufficio all'annullo.
12. **§2.3 — unicità su (`settimana`, `rotolo_grezzo_id`).** Un residuo lavorato lunedì e
    ripreso giovedì non può comparire due volte nella stessa settimana di pianificazione:
    è proprio il caso C, che questo spec mette al centro. Aggiungere `posizione` alla chiave,
    o togliere il vincolo.

---

## Semplicità: cosa si può ancora togliere

La revisione 2 ha aggiunto sette cose (snapshot, `kg_scarto`, `kg_residui_dichiarati`,
`metri_scarto`, vista reparto, grant per colonna, `micron_min`/`micron_max`). Le ho passate una
per una contro le procedure. **Una sola è superflua.**

- **`schede_lavorazione.micron_min` e `micron_max` si possono togliere.** Sono definite
  dall'import come `micron × 0,9` e `micron × 1,1` — cioè sono una **funzione pura di una terza
  colonna già presente**, con una costante fissa. Le altre tre soglie dello stesso tipo
  (10 % su velocità e ampere, 40 e 60 sul gloss) stanno come **costanti nella vista**, ed è la
  scelta giusta. Trattare il micron allo stesso modo (`fuori se |micron − micron_previsto| /
  micron_previsto > 0,10`) toglie due colonne, una regola d'import da spiegare e mantenere, e
  soprattutto rende la tolleranza tarabile **in un posto solo dopo il pilota** — che è
  esattamente ciò che §2.1 promette ("si tara dopo il pilota") e che con le colonne
  memorizzate richiederebbe invece di rifare l'import di sessanta righe. Nessuna procedura
  chiede min/max per scheda: la decisione del committente è "tolleranza ±10 %", ed è
  rispettata identicamente nelle due forme.
- **`kg_scarto`** è un dato derivabile (`disponibile − Σ figli − residuo`) memorizzato. Al
  limite del superfluo, ma **tenerlo**: non può divergere (nessuno può correggere i pesi, vedi
  IN6) e serve alla stampa e al sotto-progetto 2; una vista che lo ricalcola costerebbe di più
  in lettura di quanto costi la colonna.
- **`kg_residui_dichiarati`** sembra ridondante rispetto a `rotoli_grezzi.kg_residui`, ma non
  lo è: `kg_residui` viene sovrascritto al giro successivo, mentre le procedure §8.3 chiedono
  che sulla scheda del grezzo resti annotato *"cosa è stato lavorato … e i kg residui"* di
  **quella** lavorazione. Tenere.
- **`metri_scarto`, snapshot, vista reparto, grant per colonna**: tutti richiesti
  rispettivamente da Progetto §8 e Procedure §10.4, da Procedure §5.1 e §4.4, dalla decisione
  del committente, e dal fatto che RLS non sa fare permessi per colonna. Niente da togliere.
- Segnalo solo che **`schede_lavorazione.tipo`** oggi non è letto da nessuna schermata: non lo
  toglierei, perché è la colonna che serve a risolvere IN8.

---

## Cosa è fatto bene nella revisione 2

Serve al committente per sapere cosa **non** deve rileggere.

- **Le sei correzioni bloccanti sono state fatte tutte, e fatte bene.** Nessuna è stata
  aggirata con una frase: `annulla_lavorazione` ha davvero cambiato regola, il caso C ha
  davvero una definizione di `kg_residui`, la sicurezza ha davvero i grant per colonna,
  il micron ha davvero un riferimento, lo scarto ha davvero due colonne. È raro.
- **L'esempio numerico del caso C è corretto.** L'ho rifatto passaggio per passaggio, primo e
  secondo giro: kg/m, metri stimati, disponibile, tolleranza, bilancio, `kg_scarto` = 70,
  codici `/A` e `/B`, stati finali. Tutti i numeri tornano. È il pezzo di spec che vale di
  più, perché è l'unico su cui un implementatore non può improvvisare — e ora è anche il
  fixture del test. L'unico difetto è l'arrotondamento (IN4), non l'aritmetica.
- **La coerenza del caso C regge in tutta la catena.** `peso_tubolare_kg` null → bilancio con
  `coalesce(…, 0)` che diventa dichiaratamente un tetto sicuro → `kg_scarto` null invece che
  finto → `kg_residui_dichiarati` che conserva la storia → `metri_stimati` che si ricalcola da
  solo. Non c'è un punto in cui il tubolare ignoto produce un numero inventato: è la cosa più
  difficile di questo spec ed è risolta.
- **Il meccanismo per nascondere fornitore e bolla al reparto è quello giusto.** Vista con
  `security_invoker = false` più policy stretta sulla tabella: funziona davvero su
  Supabase/PostgREST, non richiede codice, e non duplica dati. Mancano solo i collegamenti
  (IN1), non il meccanismo.
- **Il trigger `modificato_da`/`modificato_il` senza grant al client funziona.** È
  controintuitivo (sembra che il trigger debba avere il permesso), ma il controllo di
  privilegio è sullo statement dell'utente, non su ciò che il trigger scrive in `NEW`.
  La combinazione scelta è corretta.
- **Le semplificazioni sono state accettate quasi tutte, e senza combattere.** Nove voci su
  dieci tolte, incluse quelle che costava di più abbandonare. Il modello dati è oggi più
  piccolo di quello del giro 1 pur avendo assorbito sei correzioni bloccanti: è il segno che le
  correzioni sono state fatte pensando, non aggiungendo.
- **Le tre esclusioni consapevoli di §2.9 sono ben motivate e vanno difese.** Nessuno storico
  delle correzioni (con la condizione scritta che la farebbe riaprire), capoturno solo lato
  front-end (detto chiaramente, invece di lasciar credere a una sicurezza che non c'è),
  rotolo di collaudo senza regola magica sul nome. Tutte e tre reggono.
- **La fase "Addestramento" e la colonna "In reparto"** sono la modifica più importante del
  giro 2 e non costano codice. Il rischio dichiarato del progetto è l'adozione: ora il piano
  lo affronta invece di nominarlo soltanto.
