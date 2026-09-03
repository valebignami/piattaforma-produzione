# Revisione spec ciclo bobina — giro 1

MODELLO: claude-opus-5[1m] (Opus 5, contesto 1M)

Revisore indipendente. Letti per intero: lo spec `docs/superpowers/specs/2026-09-03-ciclo-bobina-design.md`,
`Procedure Produzione.docx`, `Progetto_Piattaforma_Produzione.docx`, `Manuale completo.docx`.
Nessun codice esiste ancora: il repository contiene solo `docs/`.

## VERDETTO: BLOCCANTI PRESENTI

Sei bloccanti. Il disegno di fondo è corretto e non va rifatto: il rotolo come entità centrale,
la lavorazione come evento unico, le tre RPC come unico varco di scrittura sugli stati. I sei
bloccanti sono buchi puntuali — quattro sono lacune rispetto alle procedure aziendali, due sono
cose che, come scritte, non si possono realizzare. Tutti si chiudono con correzioni locali:
nessuno richiede di ripensare il modello.

Conteggio: **6 bloccanti · 14 importanti · 9 minori · 10 semplificazioni proposte · 11 ambiguità**.

---

## Bloccanti

### B1 — Una lavorazione può finire in un vicolo cieco e bloccare la linea per sempre
**Spec §2.7 (`chiudi_lavorazione`, `annulla_lavorazione`), §2.4 (indice unico), §6 Fase 2.**

`annulla_lavorazione` è ammessa "solo se `aperta` **e** senza controlli né eventi".
`chiudi_lavorazione` richiede `p_figli` con "almeno un elemento". Combinati, se una lavorazione
ha almeno un controllo o un evento ma non produce alcun rotolo finito, non è né chiudibile né
annullabile. Non è un caso di scuola: il manuale (*Partenza impianto*, *Parametri per agganci*)
descrive un avvio che può fallire — aggancio che non tiene, nastro rotto, sfiammata al rullo di
rame — dopo che l'operatore ha già registrato il controllo di `inizio` e un evento di fermo.
A quel punto l'indice unico parziale su `linea where stato = 'aperta'` impedisce di avviare
qualsiasi altro rotolo: **la linea è ferma finché qualcuno non entra nel database a mano**.

Lo stesso problema colpisce la Fase 2 anche senza incidenti: la Fase 2 consegna l'avvio ma non
la chiusura (Fase 4), quindi dopo il primo avvio nessun secondo rotolo è avviabile. La Fase 2
non è verificabile più di una volta. Va aggiunto che nello spec **nessuna schermata chiama mai
`annulla_lavorazione`**: la RPC esiste in §2.7 ma non compare in §3 né in §4.

**Correzione.** (a) `annulla_lavorazione` accetta un `p_motivo` obbligatorio ed è ammessa anche
con controlli ed eventi presenti: la lavorazione passa a `annullata`, controlli ed eventi
restano attaccati (sono dati reali, misurati), il grezzo torna `grezzo` con `kg_residui`
invariati. La guardia da tenere è solo `stato = 'aperta'` e "nessun `rotolo_lavorato` generato".
(b) Aggiungere in §3.3 (hub) un tasto **"Annulla avvio"** dentro un secondo livello, con
conferma testuale, e collocarlo in Fase 2 non in Fase 4.

---

### B2 — Il caso C non è implementabile: il bilancio dei pesi e il tubolare non sono definiti
**Spec §2.2 (`kg_residui`, `metri_stimati`), §2.4 (`peso_netto_kg`), §2.7 (`chiudi_lavorazione`), §3.7.
Procedure §3.4, §8.3.**

Le procedure §3.4 sono esplicite: il tubolare si pesa **"a fine svolgimento"**. Nel caso C il
rotolo non si svolge fino in fondo — il residuo è ancora avvolto sul suo tubolare. Quindi nel
caso C `peso_tubolare_kg` è necessariamente null. Ma lo spec definisce
`peso_netto_kg = peso_con_imballo − peso_imballo − coalesce(peso_tubolare, 0)`: nel caso C il
"netto" contiene ancora il residuo **e** il tubolare, e su quel valore la RPC verifica
"somma dei pesi dei figli + residuo ≤ netto + 2 %".

Lo spec non dice mai:
- come si determina `p_kg_residui` (stimato dal contametri? ripesato con la vespa? con o senza
  tubolare?);
- se `p_kg_residui` include il tubolare, e quindi se il bilancio torna o è sistematicamente
  sbagliato del peso di un tubolare (decine di kg);
- che `metri_stimati` del residuo, che è una colonna generata su `coalesce(kg_residui,
  peso_bolla_kg)`, restituisce metri gonfiati se `kg_residui` include il tubolare. Quel numero
  finisce sulla scheda del residuo e nel calcolo del manuale *"tempo rimanente all'aggancio"*.

Due implementatori scriveranno due bilanci diversi e nessuno dei due sarà verificabile.

**Correzione.** Fissare la definizione in una riga: **`kg_residui` è peso netto di alluminio,
tubolare escluso**, e va inserito dall'operatore in chiusura come peso ripesato o stimato.
Aggiungere a `lavorazioni` la colonna `peso_tubolare_stimato boolean` (o accettare che nel caso C
l'operatore inserisca il tubolare di riferimento del formato). Riscrivere il bilancio della RPC
come: `somma(figli) + kg_residui + tubolare(reale o stimato) ≤ peso_con_imballo − peso_imballo
+ 2 %`. Scrivere l'esempio numerico completo di un caso C nello spec: è il caso che più spesso
si sbaglia.

---

### B3 — La Scheda del rotolo residuo non riporta cosa è stato lavorato
**Spec §4.7 e §4.1 ("Stampa scheda grezzo"). Procedure §4.1 (tabella scenari, riga 3) e §8.3.**

Le procedure sono precise su due punti, e lo spec non ne recepisce nessuno:

1. §8.3: *"Sulla scheda del grezzo originale si annota cosa è stato lavorato (es. A5000/A in
   lavorazione X, A5000/B in lavorazione Y, kg residui)."* La stampa `tipo=grezzo` descritta in
   §4.1/§4.7 stampa solo l'anagrafica del grezzo. Il residuo torna in magazzino con una scheda
   che non dice nulla della sua storia — esattamente il contrario di quello che la carta fa oggi.
2. §8.3 tabella: *"sulla scheda del residuo l'intestazione «lavorazione» resta vuota. È questo
   il segnale operativo che il rotolo non è ancora stato lavorato, anche se è stato parzialmente
   utilizzato."* Lo spec non menziona questa regola, e il layout della scheda grezzo non è
   descritto abbastanza da garantirla.

Il dato per farlo c'è già (`rotoli_lavorati` filtrati per `rotolo_grezzo_id`, con la scheda di
lavorazione di ciascuno): manca solo il requisito. Senza, il caso C — che è la ragione per cui
il modello tiene la stessa riga invece di crearne una nuova — non è coperto sulla carta che va
fisicamente sul rotolo.

**Correzione.** In §4.7, per `tipo=grezzo`: intestazione **"Lavorazione: ______"** sempre vuota,
e sotto una tabella "Già lavorato da questo rotolo" con `codice`, lavorazione applicata, kg,
data, per ogni `rotoli_lavorati` del grezzo; in fondo `kg_residui` e `metri_stimati`. Se il
grezzo non è mai stato lavorato la tabella semplicemente non compare.

---

### B4 — "update `lavorazioni`: ufficio (solo note)" non è esprimibile con RLS: l'ufficio può aggirare le RPC
**Spec §5.3 (tabella policy, riga `lavorazioni`), §2.7.**

La tabella di §5.3 dichiara per `lavorazioni`: `update` = "ufficio (note)". Una policy RLS opera
sulla **riga**, non sulla colonna: non esiste una policy che permetta di aggiornare solo `note`.
Con la sola policy `update using (ruolo_utente() = 'ufficio')`, l'utenza ufficio può via
PostgREST scrivere `stato = 'aperta'` su una lavorazione chiusa, cambiare `peso_con_imballo_kg`,
riscrivere `avviata_il`. Tutto il muro costruito con "insert **solo RPC**" cade dal lato ufficio.
Lo stesso vale per `rotoli_grezzi`: §5.3 dà `update` = ufficio senza condizioni, mentre §4.1
dice "modifica ammessa finché lo stato è `grezzo`" — regola scritta solo nel front-end.
Con quel permesso l'ufficio può portare a mano un grezzo da `esaurito` a `grezzo`, o cambiare
`kg_residui` senza passare da nessuna RPC.

Questo non è un dettaglio: è la differenza fra "le regole stanno in un solo posto (Postgres)",
principio dichiarato in §1, e "le regole stanno nel front-end".

**Correzione.** Alle policy va affiancato il permesso per colonna, che RLS non sa dare:

- `revoke update on lavorazioni from authenticated;`
  `grant update (note, modificato_da, modificato_il) on lavorazioni to authenticated;`
- `revoke update on rotoli_grezzi from authenticated;` + grant sulle sole colonne anagrafiche
  (mai `stato`, mai `kg_residui`), **più** una policy `using (stato = 'grezzo')` che realizza
  davvero la regola di §4.1.
- Stesso trattamento per `rotoli_lavorati` (mai `codice`, mai `lavorazione_id`).

Va scritto nello spec, perché è controintuitivo e nessuno lo indovina leggendo la tabella §5.3.

---

### B5 — Micron e gloss non hanno alcuna soglia: il controllo qualità principale non è coperto
**Spec §2.6 (vista `controlli_scostamenti`), §2.1 (`schede_lavorazione`), §2.5 (`controlli`).
Manuale, sezione "Controllo qualità". Procedure §7.2.**

La vista definisce: fuori se il valore è fuori dai `min`/`max` della scheda; per velocità e
ampere, fuori se scosta di più del 10 % dal valore della scheda.

- **Micron**: `schede_lavorazione` ha `micron` (valore singolo), **non** `micron_min`/`micron_max`,
  e il micron non è fra le due eccezioni percentuali. Risultato letterale: il micron misurato
  **non è mai fuori range**. È la misura di conformità principale del prodotto — il manuale la
  prescrive tre volte per nastro, le procedure §7.2 la elencano fra i rilievi obbligatori, ed è
  ciò che il cliente compra.
- **Gloss**: `schede_lavorazione` non ha alcun campo gloss. Il manuale dà due limiti espliciti e
  assoluti: *perpendicolare < 40, parallelo < 60*, con l'istruzione operativa *"se le misure si
  discostano segnalarlo sulla scheda e avvertire la direzione"*. Nello spec i due valori si
  registrano e non si confrontano con niente.

Un implementatore scriverà la vista letteralmente e produrrà uno strumento che segnala le
temperature dei bagni ma tace sui due numeri che decidono se il rotolo è buono.

**Correzione.** (a) Aggiungere a `schede_lavorazione` `micron_min` e `micron_max` (l'import da
Excel può derivarli come `micron ± 10 %` se il file non li ha, con la regola documentata).
(b) Portare i due limiti gloss del manuale in due costanti della vista, come già fatto per il
10 %: `GLOSS_PAR_MAX = 60`, `GLOSS_PERP_MAX = 40`; sono assoluti, non dipendono dalla scheda.
(c) Estendere `n_fuori` e la colorazione di §3.5 ai tre campi.

---

### B6 — Lo scarto non viene registrato da nessuna parte
**Spec §2.5 (`eventi`), §3.6 (Ripartenza), §6. Procedure §10.3, §10.4. Manuale, "Procedura per
ripartenza dopo fermo". Progetto §8 ("Fermi e ripartenze").**

Il manuale è categorico: *"Il tratto di nastro che va dalla sgrassatura fino all'uscita
dell'ossido è sempre da scartare."* Le procedure §10.4 elencano fra i dati che la Scheda di
Produzione deve fornire: *"Presenza di scarto e relativa durata"*, e §10.3 costruisce sopra
questo dato la penalizzazione 1,5× del KPI. Il documento di progetto §8 chiede esplicitamente
*"registrazione fermi con causa, durata, metri di scarto. Contabilizzazione automatica dello
scarto sgrassatura-ossido"*.

Lo spec, in §3.6, mostra all'operatore l'avviso *"Il tratto di nastro dalla sgrassatura
all'uscita dell'ossido va scartato"* e **non registra nulla**. Non c'è un campo per i metri o i
kg di scarto, né sull'evento né sulla lavorazione. Il bilancio dei pesi in chiusura ha una
tolleranza del 2 % sul lato "in eccesso" e nessun controllo sul lato "in difetto": tutto ciò che
manca all'appello — cioè lo scarto — sparisce senza traccia.

Conseguenza diretta sullo spec stesso: §6 stabilisce che *"il sotto-progetto 2 (Anomalie, KPI)
si progetta con i dati del pilota davanti"*. Con questo modello, dopo quattro settimane di
pilota il dato di scarto non esiste, e il sotto-progetto 2 non potrà calcolare il KPI di §10
delle procedure sui dati raccolti. Si dovrà tornare in reparto a chiedere di registrarlo, dopo
aver detto agli operatori che il sistema funziona.

**Correzione.** Due colonne, costo trascurabile: `eventi.metri_scarto numeric` (compilata sulla
ripartenza, precompilata a 100 m — la lunghezza della linea 1500 dichiarata nel manuale — e
modificabile) e `lavorazioni.kg_scarto numeric` (calcolata in chiusura come
`netto − somma figli − residuo`, mostrata all'operatore per conferma invece di essere ignorata
dentro la tolleranza). Nient'altro: il KPI resta fuori perimetro, ma il dato c'è.

---

## Importanti

### I1 — La guardia di ruolo delle RPC non scatta per un utente non mappato
**Spec §5.3 ("Le RPC verificano `ruolo_utente() in ('ufficio','reparto')`").**
Se `ruolo_utente()` restituisce NULL (utente autenticato ma assente da `utenti_app`, o `anon`),
`ruolo_utente() not in ('ufficio','reparto')` vale NULL, e `if NULL then raise ...` **non
esegue il raise**. La guardia, scritta nel modo naturale, non protegge proprio il caso che deve
proteggere. Correzione: `if coalesce(ruolo_utente(), '') not in ('ufficio','reparto') then
raise exception '...'; end if;`, più `revoke execute on function ... from anon, public;` e
`grant execute ... to authenticated;` su tutte e tre le RPC. Da scrivere nello spec, non da
lasciare all'implementatore.

### I2 — `reparto` può scrivere controlli ed eventi su lavorazioni chiuse
**Spec §5.3, riga `controlli, eventi`.** L'insert è concesso a "ufficio, reparto" senza alcuna
condizione, mentre l'update per `reparto` è correttamente limitato alle lavorazioni `aperta`.
Un tablet può quindi inserire un controllo su una lavorazione chiusa nel 2026 e alterare una
Scheda di Produzione archiviata (procedure §4.4: raccoglitori per anno, base dei KPI).
Correzione: la policy insert per `reparto` deve avere
`with check (exists (select 1 from lavorazioni l where l.id = lavorazione_id and l.stato = 'aperta'))`.

### I3 — `modificato_da` è testo libero scritto dal client
**Spec §2 (convenzioni), §4.4.** Il tablet può inserire `modificato_da = 'ufficio'`. La
distinzione fra dato di reparto e correzione d'ufficio — che §4.4 usa come unica traccia delle
modifiche, avendo escluso lo storico in §2.9 — non è affidabile. Correzione: `modificato_da` e
`modificato_il` scritti da un trigger `before insert or update` che usa `ruolo_utente()`;
revocare il grant su quelle due colonne al client.

### I4 — Nessuna lavorazione può essere registrata a posteriori: la prima caduta di rete manda in carta
**Spec §2.7 (`avvia_lavorazione`), §3.9, §5.3.** La decisione "niente offline" è legittima, ma
il piano B non esiste. `avvia_lavorazione` non accetta un orario di avvio, l'insert diretto su
`lavorazioni` è vietato a tutti, e quindi una lavorazione fatta con la rete giù **non è
recuperabile nemmeno dall'ufficio**. È il modo più probabile per fallire il criterio di §1
("quattro settimane senza tornare alla carta"). Correzione minima: `avvia_lavorazione` e
`chiudi_lavorazione` accettano `p_avviata_il` / `p_chiusa_il` opzionali (default `now()`),
utilizzabili solo da `ruolo_utente() = 'ufficio'`; l'ufficio ha un tasto "Registra lavorazione
già avvenuta" nel tab Lavorazioni.

### I5 — `chiudi_lavorazione` non verifica che non ci siano fermi aperti
**Spec §2.5, §2.7.** Un fermo senza ripartenza resta aperto per sempre, con `durata_min` null.
L'hub §3.3 mostrerà "FERMO da 12 min" fino alla lavorazione successiva, e il dato ore-fermo
(base del KPI di §10.2 procedure) è perso. Correzione: guardia in chiusura — "C'è un fermo
aperto: registra la ripartenza prima di chiudere" — oppure chiusura automatica del fermo a
`chiusa_il` con `durata_min` calcolata e una nota.

### I6 — Corsa in avvio: due avvii concorrenti sullo stesso grezzo
**Spec §2.7.** L'indice unico parziale protegge "una sola lavorazione aperta per linea", ma
niente protegge "un grezzo può essere avviato una sola volta": due chiamate concorrenti su linee
diverse superano entrambe il check `stato = 'grezzo'`. Correzione: `select ... from rotoli_grezzi
where id = p_rotolo_grezzo_id for update` come prima istruzione della RPC.

### I7 — La soglia sulla bolla è sbagliata al secondo giro di un caso C
**Spec §3.7 punto 1.** La regola è scritta come `|netto − peso_bolla| / peso_bolla > 3 %`.
Al secondo giro di un caso C il netto è quello del residuo, e il confronto con il peso di bolla
del coil intero fa scattare l'avviso **sempre**, con un numero privo di senso. Dopo tre volte
l'operatore smette di leggerlo. Correzione: confrontare con `coalesce(kg_residui, peso_bolla_kg)`,
e mostrare l'etichetta corretta ("differenza dalla bolla" / "differenza dal residuo dichiarato").

### I8 — I metri dei rotoli figli sono dichiarati modificabili ma non lo sono
**Spec §2.4 (`rotoli_lavorati.metri`: "calcolati dal peso [...], modificabili"), §2.7 (`p_figli`
non contiene `metri`), §5.3 (`rotoli_lavorati` update: solo ufficio).** Le tre affermazioni sono
incompatibili: l'operatore non ha alcun modo di correggere i metri, né in chiusura né dopo.
Correzione: aggiungere `metri` (nullable) agli oggetti di `p_figli`; se null la RPC lo calcola
con la formula del manuale.

### I9 — Nessuna guardia sulla ripartenza: un fermo può essere chiuso due volte o da un'altra lavorazione
**Spec §2.5, §2.7 (trigger `durata_min`).** `fermo_id` è una FK libera. Correzioni, entrambe a
costo nullo: `create unique index on eventi (fermo_id) where fermo_id is not null;` e, nel
trigger, verificare che l'evento puntato sia `tipo = 'fermo'` della **stessa** `lavorazione_id`
e con `avvenuto_il` precedente (altrimenti `durata_min` esce negativa, dato che §3.6 permette di
modificare l'ora della ripartenza).

### I10 — La Scheda di Produzione stampata cambia se cambia la scheda di lavorazione
**Spec §2.6 ("se cambiano i range della scheda, cambiano i risultati"), §2.1, §4.4.
Procedure §4.2, §4.4, §5.1.** Le procedure §5.1 dicono che i set point *"devono essere riportati
sulla Scheda di Produzione prima dell'avvio del rotolo"*, e §4.4 che quelle schede si archiviano
per anno e servono a ricostruzioni a posteriori e a contenziosi. Un documento di archivio che si
riscrive quando qualcuno tocca l'anagrafica non serve a quello scopo. In questa fetta le schede
sono in sola lettura, quindi il problema non morde subito — ma la Fase 1 del documento di
progetto prevede esplicitamente la modifica da ufficio. Correzione a costo minimo, da fare ora
perché dopo è una migrazione: tre colonne di snapshot su `lavorazioni` scritte da
`avvia_lavorazione` — `velocita_prevista`, `ampere_previsti`, `micron_previsti` — usate dalla
stampa `tipo=produzione`. La vista scostamenti può continuare a leggere la scheda viva.

### I11 — `sessionStorage` non sopravvive alla chiusura della pagina: il recupero descritto non funziona
**Spec §3.9.** *"Se la pagina si chiude con una scrittura in attesa, al riavvio compare «Un dato
non è stato salvato» con i valori (tenuti in `sessionStorage`)"*. `sessionStorage` si azzera
alla chiusura della scheda: al riavvio non c'è niente da mostrare. O si usa `localStorage`, o —
più coerente con la priorità semplicità — si toglie l'intero meccanismo di recupero e resta il
solo ritentativo (vedi T9).

### I12 — Nessun controllo di completezza dei rilievi inizio / metà / fine
**Spec §2.5 (`momento`), §3.5, §3.7. Procedure §7.2; manuale, "Controllo qualità" (micron: tre
volte per nastro).** Le procedure rendono obbligatori i rilievi a inizio, metà e fine rotolo;
lo spec propone `inizio` automaticamente e lascia `meta` e `fine` a un tocco manuale, senza
alcuna verifica. Una Scheda di Produzione senza il rilievo di fine non serve a risalire alla
causa di una non conformità (procedure §4.2). Correzione: in chiusura, avviso non bloccante
"Mancano i controlli di *metà* / *fine*: vuoi chiudere lo stesso?".

### I13 — La Fase 0 è troppo grande e consegna qualcosa che il committente non può giudicare
**Spec §6.** La Fase 0 contiene: progetto Supabase, nove tabelle, vista, tre RPC, RLS completa,
realtime, script Python di import di ~60 schede da Excel con parsing di range testuali
("da 961 a 1080"), seed difetti, sei funzioni pure con test, repo, Pages, login,
`test_regole.sql`. Il risultato verificabile dichiarato è "due tasti e il login". Un committente
non tecnico non può approvare nulla di tutto ciò, e l'import Excel — un lavoro a sé — serve solo
dalla Fase 2, dove si sceglie la scheda. Correzione: spostare `tools/importa_schede.py` e
`sql/seed_schede.sql` in testa alla Fase 2; lasciare in Fase 0 tabelle, RLS, RPC,
`test_regole.sql`, login, e una pagina che dica "connesso come ufficio / reparto".

### I14 — Il piano non ha nessuna voce sull'adozione, che è il rischio dichiarato del progetto
**Spec §6, §7. Progetto §11 ("in un'azienda di quindici persone il successo dipende più dalle
relazioni che dal codice").** §7 chiede al committente solo di "nominare due operatori" e una
data di stop carta. Non esiste una voce di piano per: affiancamento in reparto il primo giorno
di ogni fase che tocca il tablet, un A4 plastificato con i tre flussi appeso accanto al tablet,
un canale concordato per segnalare i problemi (e chi risponde), la decisione su cosa fare se un
operatore si rifiuta. Sono le uniche attività che decidono l'esito, e non costano codice.
Correzione: aggiungere a §6 una colonna "cosa succede in reparto" per le Fasi 2, 3, 4 e una voce
"Addestramento" prima del pilota.

---

## Minori

1. **§2.4 — `linea` è di fatto una costante.** Nessuna schermata del tablet permette di scegliere
   la linea; il default è `1500` e il perimetro è la sola Linea 1500. Ma §4.3 (Live) parla di
   "riquadro **per linea**" e §3.3 di "linea libera". O si aggiunge un selettore (che il
   perimetro non chiede), o si toglie ogni traccia di multi-linea dalla UI. Vedi T4.
2. **§2.5 — l'evento `aggiunta_satina` è troppo stretto.** Procedure §4.2 chiedono "aggiunte di
   satina **o altri reagenti**"; il manuale ne cita almeno un'altra ricorrente durante la marcia
   (1 litro di ammoniaca ogni 12 ore nel fissaggio). Correzione a costo zero: rinominare in
   `aggiunta` e aggiungere `prodotto` (testo con autocompletamento) accanto a `litri`.
3. **§2.5 / §2.6 — manca `temp_nitrico` nei controlli**, mentre `schede_lavorazione` ha
   `nitrico_temp/_min/_max`. Va tolta la colonna dalla scheda o aggiunta al controllo. Coerente
   col manuale, che non dà un set point per il nitrico: probabilmente vanno tolte (vedi T5).
4. **§3.3 — `SOGLIA_CONTROLLO_MIN = 30` non ha fondamento nei documenti.** Il manuale prescrive
   il controllo visivo dei difetti **ogni 20 minuti**. Allineare a 20, o dire da dove viene 30.
5. **§2.5 — `durata_min` non si ricalcola** se l'ufficio corregge l'orario di un fermo o di una
   ripartenza (il trigger è descritto solo su insert). Estendere il trigger all'update, o
   accettarlo esplicitamente.
6. **§2.2 — `metri_stimati` di un grezzo `esaurito`** resta calcolato su `peso_bolla_kg` (perché
   `kg_residui` è null nei casi A e B) e mostra metri di un rotolo che non esiste più. Cosmetico,
   ma confonde in tabella: filtrarlo in vista o azzerare `kg_residui` a 0 in chiusura.
7. **§4.4 — le correzioni d'ufficio su lavorazioni chiuse non lasciano traccia del valore
   precedente.** §2.9 esclude lo storico ("bastano `modificato_da/il`"), scelta legittima; ma per
   un documento che serve in caso di contestazione col cliente (procedure §4.2) il costo di
   tracciare il solo valore sostituito è una colonna `precedente jsonb` scritta da trigger.
   In alternativa, ancora più semplice: consentire le correzioni solo entro 24 h dalla chiusura.
8. **§4.7 — quali pesi vanno sulla Scheda Rotolo.** Procedure §4.1 chiedono "pesi (lordo con
   tubolare, tubolare, netto) e metri". Quei tre pesi sono della bobina **grezza**, non del
   singolo figlio: nel caso B con tre figli la stessa terna compare su tre schede, più il peso
   del singolo rotolo. Va scritto, altrimenti si stamperanno tre schede con pesi diversi e
   incoerenti fra loro.
9. **§5.3 — `select: autenticati` su tutto** significa che l'utenza `reparto`, con sessione
   persistente su un tablet non presidiato, ha in mano l'intero archivio clienti, fornitori e le
   ~60 schede tecniche (know-how aziendale). Rischio basso in un'azienda di 15 persone, ma va
   deciso consapevolmente, non per default.

---

## Da togliere (semplificazioni proposte)

Il committente ha chiesto semplicità "a prescindere da quello che esiste". Tutte le voci qui
sotto si tolgono senza perdere nulla di ciò che le procedure richiedono.

- **T1 — `pianificazione.lavorazione_id`.** È l'inverso di `lavorazioni.pianificazione_id`, che
  già esiste (§2.3 e §2.4): due chiavi che si puntano, due punti dove la coerenza si può
  rompere. §4.2 ("le righe con `lavorazione_id` compilato restano barrate") si ottiene con
  `exists (select 1 from lavorazioni l where l.pianificazione_id = p.id)`. **Togliere la colonna.**
- **T2 — `rotoli_lavorati.stato`.** Ha un solo valore possibile in questa fetta (`pronto`), e la
  spedizione è dichiarata fuori perimetro in §2.9. Si aggiunge quando servirà. **Togliere.**
- **T3 — `rotoli_lavorati.suffisso`.** Derivabile dal `codice` con una riga; è un secondo posto
  dove la stessa informazione può divergere. **Togliere.**
- **T4 — tutta la UI multi-linea.** §4.3 "un riquadro per linea", §3.3 "linea libera": nel
  perimetro c'è una linea sola e nessuna schermata per sceglierla. Tenere la colonna `linea` in
  `lavorazioni` (costa nulla e serve all'Impiantino, Fase 11 del progetto), **togliere ogni
  riferimento a più linee dalle schermate**.
- **T5 — `schede_lavorazione`: `nitrico_temp`, `nitrico_temp_min`, `nitrico_temp_max`,
  `clienti_storici`, `fonte`, `data_scheda`.** Nessuna schermata e nessuna regola descritta nello
  spec le legge. Sei colonne da importare, mantenere e spiegare per niente. **Togliere** (o
  indicare in §3.4 dove compaiono).
- **T6 — `eventi.rotolo_lavorato_id`.** Non può mai essere valorizzata: gli eventi si registrano
  durante la lavorazione, i `rotoli_lavorati` nascono alla chiusura, e nessuna schermata li
  collega dopo. Colonna morta. **Togliere** (l'associazione difetto → rotolo si ricava dal
  contametri, che è già sull'evento).
- **T7 — il rotolo di collaudo `COLLAUDO-0001` (§5.7).** Costa: un filtro "mostra collaudo" in
  quattro viste ufficio, una regola magica sul **nome** dell'operatore ("il tablet lo mostra solo
  se l'operatore si chiama Collaudo"), e una riga di dati finti in produzione per sempre. Il
  bisogno reale — provare i flussi sul sistema vero — si copre facendo il collaudo prima della
  data di stop carta con un rotolo normale. **Togliere almeno la regola sul nome operatore**, che
  è la parte più fragile e meno spiegabile.
- **T8 — `operatori.ordine` e la UI di riordino in §4.6.** Quindici persone, di cui una parte in
  reparto: l'ordine alfabetico basta. Una colonna, una schermata e due frecce in meno.
- **T9 — il recupero da `sessionStorage` in §3.9.** Non funziona come descritto (vedi I11) e
  contraddice la decisione "niente offline" di §1. Restano il ritentativo e l'indicatore, che
  bastano. **Togliere.**
- **T10 — "Esporta Excel su ogni tabella" (§4).** Serve davvero solo su Lavorazioni e Rotoli
  lavorati, perché sostituisce un lavoro reale (procedure §4.4: la trascrizione a mano nel file
  Excel di riepilogo). Sulle altre tabelle è una dipendenza CDN e una funzione da mantenere per
  nessun bisogno documentato. **Limitare a due tabelle.**

**Duplicazioni segnalate** (stessa regola in due posti — non sempre eliminabili, ma vanno
dichiarate e coperte da test):

- La regola di fuori-range vive **due volte**: nella vista SQL `controlli_scostamenti` (§2.6) e
  nella funzione pura `fuoriRange` di `comune.js` (§3.5). Lo spec lo ammette ma il principio di
  §1 è "regole in un solo posto (Postgres)". Correzione onesta: dichiararla come duplicazione
  accettata, tenere le soglie (10 %, gloss, micron) in **una sola** definizione SQL leggibile dal
  client, e aggiungere a §5.6 un test che confronta i due risultati sugli stessi dati.
- La regola dei codici figli vive **due volte**: `codiciFigli` in `comune.js` (§3.7 schermata 3)
  e dentro `chiudi_lavorazione` (§2.7). Qui lo spec fa la cosa giusta ("la verità la dà la RPC"),
  ma va aggiunto un caso al test di §5.6 che verifica che l'anteprima coincida con il risultato.
- Lo stato "fermo aperto" è espresso **due volte**: come assenza di una ripartenza che lo punta
  (§2.5) e implicitamente come `durata_min is null`. Sceglierne una sola, per iscritto.
- La regola "il grezzo si modifica solo se `grezzo`" è nel front-end (§4.1) e non nella policy
  (§5.3). Vedi B4.

---

## Ambiguità da chiarire

1. **`kg_residui` include il tubolare?** (§2.2, §2.7). Vedi B2. È l'ambiguità più costosa:
   propaga su `metri_stimati`, sul bilancio di chiusura e sulla stampa del residuo.
2. **Con cosa si confronta il micron misurato?** (§2.6). Nessun min/max, nessuna eccezione
   percentuale. Vedi B5.
3. **`p_kg_residui` viene stimato dal contametri o ripesato?** (§3.7 schermata 2). Le due strade
   danno numeri diversi e richiedono UI diverse.
4. **"Tolleranza del 2 %" di che cosa** (§2.7): 2 % del netto o della somma dei figli? Va scritta
   la formula, non la frase.
5. **Cosa contiene esattamente `annotazioniDaEventi`** (§3.7, §2.4). È il testo che finisce in
   mano al cliente. Se include `tipi_difetto.causa_probabile` e `azione` (§2.1), la piattaforma
   consegna al cliente la diagnosi interna del difetto. Serve un esempio scritto di output.
6. **`prossimoNProg`: "ultimo numero attivo a magazzino" o "massimo mai usato"?** (§2.2; procedure
   §3.3 dicono la prima). Se è "attivo a magazzino", l'app proporrà numeri già usati da rotoli
   esauriti, che il vincolo unique rifiuterà.
7. **I rilievi di metà e fine sono obbligatori?** (§3.5 vs procedure §7.2). Vedi I12.
8. **Chi può correggere i controlli, davvero?** (§3.8). Il ruolo `capoturno` esiste solo come
   dato in `operatori`, non lato database: la policy RLS concede l'update a chiunque usi il
   tablet, e il "solo capoturno" è una scelta del front-end. Se la distinzione conta, va detto
   che è cosmetica; se non conta, togliere la frase da §3.8.
9. **Caso A: chi stampa cosa?** (§4.1, §4.5, §4.7). Dopo un caso A esistono `rotoli_grezzi.n_prog
   = 'A5000'` (esaurito) e `rotoli_lavorati.codice = 'A5000'`, e due stampe diverse rispondono
   allo stesso identificativo con parametri diversi (`?tipo=grezzo&n_prog=` e `?tipo=rotolo&codice=`).
   Va detto quale sostituisce l'altra fisicamente sul rotolo.
10. **Cosa succede se le schermate si chiudono a metà di un flusso** (§3.4, §3.7): l'avvio è
    atomico solo all'ultima schermata (bene), ma la chiusura raccoglie tre schermate di dati
    prima di chiamare la RPC. Se il tablet si blocca alla schermata 2, l'operatore rifà tutto?
    Va detto esplicitamente (la risposta "sì, si rifà" è accettabile — ma va scritta).
11. **"Ogni file sotto le 300 righe"** (§5.1): vincolo arbitrario che, applicato alla lettera,
    porta a spezzare `chiusura.js` in pezzi che si capiscono peggio. Trasformarlo in
    "una schermata, un file" senza il numero.

---

## Cosa è fatto bene

Serve al committente per sapere cosa **non** deve preoccuparlo.

- **Il modello centrale è corretto e regge le procedure.** Il rotolo grezzo che resta la stessa
  riga anche dopo un caso C, invece di generare un nuovo rotolo, riproduce esattamente la scheda
  cartacea che resta attaccata al residuo (procedure §8.3). È la decisione più importante dello
  spec ed è quella giusta.
- **Una sola `lavorazione` per ogni entrata in linea, anche se produce tre rotoli finiti**: è
  precisamente ciò che le procedure §4.2 prescrivono per la Scheda di Produzione ("non si duplica
  in funzione del numero di rotoli finiti"). Molti disegni sbagliano proprio qui.
- **La regola dei suffissi, incluso il secondo giro** (§2.7): la continuazione delle lettere
  quando il residuo di un caso C torna in linea è un dettaglio che si scopre di solito in
  produzione, ed è stato previsto in fase di disegno. Provata sui tre casi A/B/C e sul secondo
  giro, funziona.
- **L'indice unico parziale per "una sola lavorazione aperta"** è la soluzione più semplice e
  robusta possibile, e non richiede codice.
- **Insert su `lavorazioni` e `rotoli_lavorati` solo tramite RPC**: il muro è messo nel punto
  giusto. I problemi segnalati (B4, I1, I2) riguardano le crepe intorno al muro, non il muro.
- **La vista scostamenti non salva nulla**: nessun dato duplicato da tenere allineato. Scelta
  matura.
- **Le esclusioni esplicite di §2.9 e le decisioni di §1** (niente offline, niente PWA, niente
  foto, niente note vocali, niente bundler) sono coerenti con la priorità dichiarata e vanno
  difese contro la tentazione di riaggiungerle.
- **Il criterio di fallimento scritto in §1** ("quattro settimane senza tornare alla carta,
  altrimenti ci si ferma") e la **fermata obbligatoria dopo la Fase 4** sono la parte più
  preziosa dello spec: mettono per iscritto il rischio vero, che è l'adozione. Manca solo il
  lavoro concreto per ridurlo (I14).
- **Il principio "niente parametri di processo sulla Scheda Rotolo"** (procedure §4.1) è recepito
  esplicitamente in §4.7 e rispettato dal modello.
- **Errori generati dal database in italiano e mostrati al tablet così come sono** (§2.7, §5.5):
  elimina un livello di traduzione e un posto dove le regole possono divergere.
