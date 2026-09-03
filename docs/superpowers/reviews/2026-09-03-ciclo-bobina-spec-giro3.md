# Revisione spec ciclo bobina — giro 3

MODELLO: claude-opus-5[1m] (Opus 5, contesto 1M)

Verifica mirata sulla revisione 3, in sola lettura. Riletto lo spec per intero e rifatti i
conti dell'esempio §2.7.

## VERDETTO: BLOCCANTI PRESENTI

**Due bloccanti, entrambi introdotti dalla revisione 3, entrambi da una riga di SQL.** Nessuno
tocca il disegno: sono due dettagli di implementazione scritti in una forma che Postgres
rifiuta o che va in loop. Vanno corretti nello spec perché `000_setup.sql` è il primo file che
si scrive nella Fase 0 e questi due errori lo fermano al primo `create table` e alla prima
ripartenza registrata.

Tutto il resto è a posto: **23 dei 24 punti del giro 2 sono risolti** (uno diversamente ma
meglio), **l'esempio numerico del caso C è corretto in ogni passaggio con i nuovi numeri**
(802, 2.450, 6.500 ≤ 6.625, 302, 2.489, `kg_scarto` 70, `/A` e `/B`: rifatti tutti), e le
cinque verifiche di regressione richieste danno tre esiti puliti e due osservazioni.

Conteggio nuovi: **2 bloccanti · 4 importanti · 5 minori**.

---

## Esito dei punti del giro 2

| Punto | Esito | Nota |
|---|---|---|
| **BN1** guardie `> 0` sui pesi | RISOLTO | `peso_imballo ≥ 0` e `peso_tubolare ≥ 0` in §2.4, §2.7, §3.4, §3.7 e §8; residuo 0 ⇒ tubolare **non null e ≥ 0** (il null resta il segnale del caso C: la regola non perde potere); due nuovi casi in `test_regole.sql` (imballo 0 e tubolare 0 che **riescono**) |
| **IN1** vista reparto scollegata | RISOLTO | riga in §5.3 con `grant select`; §2.2 dice esplicitamente che hub, avvio, chiusura e i join da `pianificazione` e `lavorazioni` passano dalla vista e che il reparto non interroga mai `rotoli_grezzi`; §3.3 lo ripete sul join; test in §5.6 ("select da reparto vuota, dalla vista piena") |
| **IN2** `p_avviata_il ≠ now()` | RISOLTO | sostituito con `if ruolo <> 'ufficio' then p_avviata_il := now()`: nessuna chiamata legittima può fallire |
| **IN3** registrazione a posteriori | RISOLTO | `registra_lavorazione_completa` crea la riga **già `chiusa`**, non passa da `aperta`, non urta l'indice unico; riservata all'ufficio, con test del rifiuto da reparto. Resta un caso di bordo: MN4 |
| **IN4** arrotondamento dei metri | RISOLTO | `metri_stimati` = `round(...)` intero; `residuoProposto` in kg (6.500 − 500 × 8,1 = 2.450) senza passare dai metri; esempio riallineato. **Conti rifatti: tutti corretti.** Ma il modo in cui `metri_stimati` è stato scritto è il bloccante BN2 |
| **IN5** ristampa della scheda del residuo | RISOLTO | "Ultime chiusure" in Live con il tasto Stampa anche per la scheda del residuo nei casi C; messaggio esplicito sul tablet; §4.7 dice che sostituisce la scheda in cartelletta. Manca chi porta la carta: IN-N3 |
| **IN6** pesi non correggibili | RISOLTO | `kg_scarto` non è più memorizzato: lo calcola la vista `lavorazioni_riepilogo`, quindi si aggiorna da solo quando l'ufficio corregge un peso. Grant estesi ai pesi su `lavorazioni` e `rotoli_lavorati`. Effetto collaterale non coperto: IN-N2 |
| **IN7** `kg_residui` non correggibile | RISOLTO | `annulla_lavorazione(p_metri_scarto)` scala `kg_residui` (e con 0 non tocca il null: scritto bene); l'ufficio corregge `kg_residui` finché il rotolo è `grezzo`, con grant e policy coerenti. Il dato dei metri consumati però si perde: IN-N4 |
| **IN8** gloss sui naturali | RISOLTO | limiti 40/60 solo se `tipo = 'satinato'`, per decisione del committente, riportata in §2.6, §3.5, §5.6 e §8 |
| **IN9** rotolo di collaudo monouso | RISOLTO | dieci rotoli in `seed_collaudo.sql`, con la ragione scritta ("ogni ciclo ne consuma uno") |
| **IN10** fornitore sulla Scheda Rotolo | RISOLTO | fornitore e dati bobina su `tipo=rotolo`; nessuna stampa dal tablet (§2.9); Live "Ultime chiusure" come punto di stampa; §7 aggiunge la stampante in ufficio fra le condizioni. Decisione coerente in tutti e sei i punti dove compare |
| **Minore 1** "otto tabelle" | RISOLTO | "Nove tabelle più una di servizio, quattro funzioni SQL, tre viste": ricontato, torna |
| **Minore 2** `kg_scarto` negativo | RISOLTO | etichetta "eccedenza rispetto al peso di partenza" in §2.4 e §3.7 |
| **Minore 3** ricalcolo di `durata_min` | RISOLTO DIVERSAMENTE | trigger bidirezionale `after insert or update`. Copre il caso, ma nella forma scritta si auto-innesca: BN1 |
| **Minore 4** numerazione vs procedure §3.3 | RISOLTO | scostamento dichiarato in §2.2 **e** in §8, con la ragione |
| **Minore 5** colonne di servizio | RISOLTO | `modificato_da/il` su tutte le tabelle di dati (elencate); `durata_min` fra le colonne senza grant in §5.3 |
| **Minore 6** proposta 100 m | RISOLTO | "valore prudenziale = lunghezza dell'intera linea, mentre il tratto da scartare è una sua parte: da tarare dopo il pilota" |
| **Minore 7** confine del gloss | RISOLTO | `≥ 40` / `≥ 60`, con la nota che il manuale dice "minore di" |
| **Minore 8** Fase 2 e le schede | RISOLTO | il risultato verificabile ora cita le ~60 schede e le tre a campione |
| **Minore 9** ruolo di `test_regole.sql` | RISOLTO | `set local role` + `request.jwt.claims`, con la ragione ("altrimenti passano senza provare nulla") |
| **Minore 10** `bilancioChiusura` nel test di coerenza | RISOLTO | aggiunta al punto 3 di §5.6 |
| **Minore 11** annullo con fermo aperto | RISOLTO | stessa guardia della chiusura |
| **Minore 12** unicità della pianificazione | RISOLTO | (`settimana`, `posizione`), con l'esempio del residuo lunedì e giovedì |
| **Semplificazione** `micron_min`/`micron_max` | RISOLTO, e meglio di come l'avevo proposto | colonne tolte, tolleranza costante nella vista **e** confronto contro lo `micron_previsti` dello snapshot invece che contro la scheda viva: così la Scheda di Produzione archiviata e i suoi scostamenti restano coerenti fra loro anche se un domani la scheda cambia |

**Totale: 23 risolti · 1 risolto diversamente · 0 non risolti.**

---

## Bloccanti nuovi

### BN1 — Il trigger su `eventi` si innesca da solo: ricorsione infinita alla prima ripartenza
**Spec §2.5.**

Lo spec descrive **un solo** trigger, `after insert or update on eventi`, con due rami:
(a) se la riga è una ripartenza, scrive `durata_min` **sulla riga del fermo**;
(b) se la riga è un fermo che ha una ripartenza, ricalcola `durata_min` **su sé stesso**.

Il ramo (b) è un `update` sulla riga che ha appena fatto scattare il trigger: l'`update`
rifà scattare il trigger sulla stessa riga, che rifà l'`update`, e così via. Postgres non ha
alcuna protezione automatica contro la ricorsione dei trigger: la transazione muore con
`stack depth limit exceeded`. Anche il ramo (a) contribuisce, perché l'`update` sul fermo fa
scattare il trigger sul fermo, che entra nel ramo (b).

Conseguenza pratica: **la prima ripartenza registrata dal tablet fallisce**, e la ripartenza è
la seconda azione più frequente del turno dopo i controlli. È una regressione: nella revisione
2 il trigger era `before insert` e non aveva il problema; il ramo (b) è stato aggiunto per
chiudere il minore 3 del giro 2, giustamente, ma nella forma sbagliata.

**Correzione (una riga di spec, due trigger invece di uno).**
- ramo fermo: trigger **`before update on eventi`** — assegna `new.durata_min` direttamente,
  senza `update`, quindi senza ricorsione;
- ramo ripartenza: trigger **`after insert or update on eventi`** — fa l'`update` sul fermo,
  che innesca il trigger `before` di sopra una volta sola e si ferma.

In alternativa, un solo trigger con `when (pg_trigger_depth() = 0)` nella dichiarazione. La
prima soluzione è più leggibile e va scritta nello spec, perché è esattamente il genere di
cosa che nessuno indovina leggendo "il trigger ricalcola".

### BN2 — `metri_stimati` è una colonna generata che ne referenzia un'altra: Postgres lo vieta
**Spec §2.2.**

La revisione 3 introduce `kg_al_metro` come **colonna generata**
(`larghezza_mm * spessore_mm * 2.7 / 1000`) — scelta ottima, perché toglie la formula da sei
posti diversi. Ma poi definisce `metri_stimati` come **colonna generata su `kg_al_metro`**:
`round(coalesce(kg_residui, peso_bolla_kg) / kg_al_metro)`.

PostgreSQL non lo permette: l'espressione di una colonna generata non può riferirsi a un'altra
colonna generata. Il `create table` fallisce con
`ERROR: cannot use generated column "kg_al_metro" in column generation expression`.
Il primo file dello schema non parte, cioè la Fase 0 non parte.

**Correzione (una riga).** Ripetere la formula per esteso dentro `metri_stimati`:
`round(coalesce(kg_residui, peso_bolla_kg) / (larghezza_mm * spessore_mm * 2.7 / 1000))`,
tenendo `kg_al_metro` generata per tutti gli altri usi (RPC, tablet, viste). La duplicazione
della formula in due espressioni della stessa tabella è brutta ma innocua: sono nella stessa
`create table`, si leggono a due righe di distanza, e un test in `test_regole.sql` che verifica
`metri_stimati * kg_al_metro ≈ kg` la copre.

---

## Importanti nuovi

### IN-N1 — I grant sui pesi permettono di rompere l'invariante del caso C, e §2.9 non lo copre
**Spec §5.3, §2.4, §2.9.** *(risposta alla verifica 2)*

I grant estesi sono la scelta giusta e la vista `lavorazioni_riepilogo` neutralizza il rischio
principale del giro 2: correggendo un peso, lo scarto si ricalcola da solo. Su questo §2.9 è
onesto e la dichiarazione regge: il bilancio non si rifà, la Scheda di Produzione mostra
`modificato_il`, si accetta.

Ma il grant su `peso_tubolare_kg` fa una cosa in più, che §2.9 **non** dichiara: consente di
portare `peso_tubolare_kg` da null a un valore su una lavorazione di **caso C**. Il null non è
un peso mancante: è **il segno che distingue un caso C da un caso A/B**, ed è usato da
`lavorazioni_riepilogo` (che annulla `kg_disponibili` e `kg_scarto`) e dalla lettura della
Scheda di Produzione. Con un `update` diretto, una lavorazione con residuo dichiarato 2.450 kg
diventa una lavorazione con tubolare noto e uno "scarto" di −65 kg: un caso C travestito da
caso A. Nessuna RPC lo permetterebbe (§2.7 vieta esplicitamente la combinazione), ma il grant sì.

Secondo punto minore dello stesso genere: la policy di update su `lavorazioni` non ha
condizione di riga, quindi l'ufficio può cambiare `peso_con_imballo_kg` **mentre l'operatore
sta lavorando**, e la chiusura userà un numero diverso da quello che l'operatore ha visto e
confermato.

**Correzione (due righe).**
1. Un `check` sulla tabella, che vale anche per gli `update` diretti:
   `check (stato <> 'chiusa' or (kg_residui_dichiarati > 0) = (peso_tubolare_kg is null))`.
   Così l'invariante del caso C sta nel database, non solo dentro la RPC — che è il principio
   dichiarato in §1.
2. Aggiungere alla policy di update su `lavorazioni` la condizione `using (stato = 'chiusa')`:
   le correzioni d'ufficio ai pesi hanno senso dopo la chiusura, non durante il turno.

### IN-N2 — Il caso C sulla carta si chiude, ma nessuno dice chi porta il foglio al rotolo
**Spec §3.7, §4.3, §4.7, §6, §7.** *(risposta alla verifica 3)*

La catena informatica è completa e l'ho seguita tutta: chiusura dal tablet → messaggio
esplicito ("le schede si stampano dall'ufficio") → "Ultime chiusure" in Live con un tasto per
ogni Scheda Rotolo e per la scheda del residuo → §4.7 dice che quella del residuo sostituisce
la scheda in cartelletta → §7 chiede la stampante in ufficio. Su questo la decisione del
committente è recepita bene e in modo coerente.

Manca il **passaggio fisico**, che la decisione "niente stampa dal tablet" ha creato di sana
pianta: qualcuno deve prendere i fogli dalla stampante dell'ufficio, camminare fino al rotolo e
sostituire la carta nella cartelletta. Finché non lo fa, il residuo torna a magazzino con la
scheda vecchia — che è precisamente il difetto che B3 (giro 1) e IN5 (giro 2) hanno corretto —
e nel caso A il rotolo finito esce dall'avvolgitore senza la sua scheda.

Manca anche il modo di sapere **cosa resta da stampare**: "Ultime chiusure" mostra sette giorni
di chiusure senza distinguere quelle già stampate da quelle no. Alla terza chiusura della
giornata l'ufficio non sa più a che punto è.

**Correzione, tutta organizzativa e a costo zero di codice.**
- In §6, colonna "In reparto" della Fase 4 e del Pilota: *"a ogni chiusura l'ufficio stampa da
  Ultime chiusure e porta le schede in reparto; l'operatore le mette in cartelletta prima che
  il rotolo lasci l'avvolgitore"*.
- In §4.3, una colonna `stampata_il` su `lavorazioni` scritta al click su Stampa (una colonna,
  un grant, nessuna regola), oppure — più semplice e sufficiente — le chiusure non ancora
  stampate in grassetto in cima. Senza uno dei due, la lista è inservibile come lista di lavoro.

### IN-N3 — I metri consumati in un annullo non vengono salvati da nessuna parte
**Spec §2.7 (`annulla_lavorazione`), §2.5, §3.3.** *(risposta alla verifica 4)*

Fra `p_metri_scarto` dell'annullo e `metri_scarto` della ripartenza **non c'è contraddizione**:
sono due grandezze diverse con due scopi diversi (l'uno scala il magazzino, l'altro alimenta il
KPI di scarto), e possono coesistere sulla stessa lavorazione. La sovrapposizione contabile —
se durante una lavorazione poi annullata c'è stata una ripartenza, quei metri finiscono sia in
`eventi.metri_scarto` sia nel totale che l'operatore digita nell'annullo — è reale ma innocua,
perché i due numeri non vengono mai sommati fra loro.

Il problema è un altro: **`p_metri_scarto` non viene memorizzato**. La RPC lo usa per scalare
`rotoli_grezzi.kg_residui` e poi lo butta. Non c'è nessuna colonna che lo conservi. Quindi il
nastro bruciato in un avvio fallito — il caso che ha motivato B1 nel giro 1: aggancio che non
tiene, sfiammata al rullo di rame — sparisce dal dato di scarto, che è esattamente ciò che B6
voleva far esistere per il sotto-progetto 2. E non è nemmeno ricostruibile: `kg_residui` è
stato modificato, ma senza sapere di quanto.

**Correzione a costo zero, senza colonne nuove:** `annulla_lavorazione` scrive
`contametri_fine = contametri_inizio + p_metri_scarto`. I metri consumati diventano derivabili
come per ogni altra lavorazione (`contametri_fine − contametri_inizio`), la Scheda di
Produzione di una lavorazione annullata li mostra, e il sotto-progetto 2 li trova dove si
aspetta di trovarli.

### IN-N4 — `registra_lavorazione_completa` non dice cosa fa se il grezzo è andato avanti nel frattempo
**Spec §2.7, §4.4.**

La RPC risolve IN3 nel modo giusto (riga già `chiusa`, niente collisione con l'indice unico) e
questo è il punto chiuso. Ma "con le stesse guardie di avvio e chiusura" include la guardia
*"il grezzo deve essere `grezzo`"*, e nello scenario tipico il grezzo **non lo è più**: la rete
è mancata durante la lavorazione di A5000, quando è tornata l'operatore ha continuato a
lavorare, e quando l'ufficio ricopia il turno A5000 può già essere `in_lavorazione` (ripreso
come residuo) o `esaurito`. La guardia respinge, e il piano B torna a non funzionare — in una
finestra più stretta di prima, ma nello stesso modo.

**Correzione (due righe di spec).** Dire esplicitamente cosa fa la RPC sul grezzo:
*"se il grezzo è ancora `grezzo` la RPC ne aggiorna stato e `kg_residui` come farebbe
`chiudi_lavorazione`; se il grezzo è già andato avanti, la RPC registra comunque la lavorazione
e i suoi figli senza toccare stato e `kg_residui`, e lo dice all'ufficio con un avviso"*.
La generazione dei codici `/A`, `/B` va comunque fatta con la regola di §2.7 sull'insieme dei
figli già esistenti, ed è bene scriverlo: è l'unico punto in cui due lavorazioni dello stesso
grezzo possono essere registrate fuori ordine cronologico.

---

## Minori nuovi

1. **§2.7 — `annulla_lavorazione` non ha limite inferiore su `p_metri_scarto`.** Con un numero
   digitato male `kg_residui` diventa negativo, e `metri_stimati` con lui. Una guardia
   `0 ≤ p_metri_scarto ≤ metri stimati del grezzo` costa una riga.
2. **§2.2 — `metri_stimati` è dichiarata "intero" ma `round()` su `numeric` restituisce
   `numeric`.** Serve il cast, o il tipo va dichiarato `numeric`. Banale, ma è dentro una
   `create table` che deve girare al primo colpo.
3. **§5.3 — le due viste `security_invoker = true` non hanno la riga di `grant select`
   esplicita** che invece la vista del reparto ha ("`grant select`"). Verificato che il
   meccanismo è corretto (vedi sotto), ma la tabella dei permessi è l'unico posto dove un
   implementatore guarda: va scritto anche per loro.
4. **§5.7 / §2.2 — `prossimoNProg` e i codici `COLLAUDO-000x`.** La regola proposta è "massimo
   numero mai usato **con la stessa lettera** + 1"; `COLLAUDO-0001` non ha quella forma. Va
   detto che la funzione ignora i codici che non corrispondono al formato `lettera + cifre`,
   altrimenti il primo `n_prog` proposto dopo il seed è imprevedibile.
5. **§2.7 — la firma di `registra_lavorazione_completa` è "(…)".** È l'unica delle quattro RPC
   senza parametri elencati, ed è quella che ne ha di più (avvio + controlli + eventi +
   chiusura). Va scritta, perché §5.6 la testa e il piano di implementazione la deve stimare.

---

## Verifiche di regressione richieste: gli esiti puliti

Tre delle cinque verifiche non hanno prodotto rilievi, e vale la pena dirlo per iscritto.

- **`lavorazioni_riepilogo` con `security_invoker = true` è corretta, ed è il contrario giusto
  della vista del reparto.** Con `security_invoker = true` la vista gira con i permessi e la
  RLS di chi la interroga: legge `lavorazioni` e `rotoli_lavorati`, che in §5.3 sono in
  `select` a tutti gli autenticati, quindi funziona per ufficio e reparto senza aprire nulla.
  E, cosa importante, **non tocca `rotoli_grezzi`**: nessuna via traversa per far arrivare
  `fornitore` al tablet. `controlli_scostamenti` sta in piedi per la stessa ragione (legge
  `controlli`, `lavorazioni`, `schede_lavorazione`, tutte leggibili). Che `rotoli_grezzi_reparto`
  sia invece `security_invoker = false` non è un'incoerenza: è l'unica vista che **deve**
  scavalcare la RLS della tabella sottostante, ed è l'unica scritta così.
- **L'esempio numerico del caso C torna, con i nuovi numeri.** `kg_al_metro` 8,1;
  `metri_stimati` round(802,47) = 802; primo giro figlio netto 4.050, residuo
  6.500 − 500 × 8,1 = 2.450, bilancio 6.500 ≤ 6.624,9 → 6.625, codice `A5000/A`, `kg_residui`
  2.450, `metri_stimati` round(302,47) = 302; secondo giro figlio netto 2.370, tetto
  (2.500 − 0 − 60) × 1,02 = 2.488,8 → 2.489, `kg_scarto` 2.440 − 2.370 − 0 = 70, codice
  `A5000/B`, esaurito con `kg_residui` 0 e `metri_stimati` 0. Tutto verificato uno per uno.
  Il passaggio da 2.446 a 2.450 è la correzione giusta: ora il residuo si calcola in kg e non
  dipende più da come qualcuno arrotonda i metri.
- **`p_metri_scarto` dell'annullo e `metri_scarto` della ripartenza non si contraddicono**
  (vedi IN-N3): scopi diversi, mai sommati fra loro. L'unico problema è che il primo non viene
  salvato.

---

## Conclusione

Lo spec **non è ancora pronto per il piano di implementazione, ma ci manca pochissimo**: due
righe di SQL scritte male, che ho indicato con la correzione già pronta. Sono errori tecnici
puri — una formula che Postgres rifiuta e un automatismo che gira su sé stesso — non ripensamenti
sul funzionamento: il modo in cui il sistema tratta rotoli, lavorazioni, casi A/B/C, pesi e
schede è deciso, corretto e ora anche verificato sui numeri.

Delle ventiquattro osservazioni del giro precedente ne sono state risolte tutte, e i quattro
punti importanti che aggiungo qui non cambiano niente di ciò che è stato deciso: due sono
righe di codice (l'invariante del caso C messa nel database, i metri di un avvio fallito
salvati invece che buttati), uno è una frase da aggiungere su un caso di bordo, e uno non è
codice per niente — è stabilire **chi porta materialmente le schede stampate dall'ufficio al
rotolo in reparto**, ora che si è deciso che dal tablet non si stampa.

Corrette le due righe e scritta quella regola organizzativa, do il via libera: il documento è
abbastanza preciso perché chi lo implementa non debba inventarsi niente, ed è la terza volta
che lo verifico senza trovare più difetti di sostanza.
