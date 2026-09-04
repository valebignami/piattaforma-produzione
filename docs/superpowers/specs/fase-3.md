# Fase 3 — Controlli ed eventi

> Spec di fase, scritta dalla skill `fase-produzione` il 2026-09-04. Riferimenti: piano §3
> Fase 3, disegno `2026-09-03-ciclo-bobina-design.md` §2.5, §2.6, §3.3, §3.5, §3.6, §3.8, §4.3,
> §5.6. In caso di dubbio vale il disegno.
> **Nessun parametro di processo in questo file** (regola di `CLAUDE.md`): dove servirebbe un
> numero vero si scrive un segnaposto (`N`, `A-B`).

## 0. In una frase

Il turno si registra dal tablet: controlli con il colore immediato, i sette tipi di evento,
il fermo e la ripartenza; il capoturno corregge; l'ufficio vede tutto in Live, in tempo reale,
con gli scostamenti in rosso.

## 1. Che cosa cambia nel database

**Niente.** Lo schema della Fase 0 copre già tutta la fase:

| Cosa serve | Dove sta già |
|---|---|
| tabella `controlli` con le sedici colonne di §2.5 | `000_setup.sql` sezione b |
| tabella `eventi` con gli otto tipi, `fermo_id`, `metri_scarto`, `durata_min` | sezione b |
| indice unico `eventi_un_fermo_una_ripartenza` (una ripartenza per fermo) | sezione b |
| i due trigger dei fermi (`before` sul fermo, `after` sulla ripartenza) | sezione b, più la migrazione `003` |
| vista `controlli_scostamenti` con le nove colonne booleane e `n_fuori` | sezione c |
| policy: il reparto inserisce e corregge **solo** su lavorazione `aperta` | sezione e |
| grant per colonna: `durata_min` e `modificato_*` **non** sono scrivibili dal client | sezione e |
| realtime su `lavorazioni`, `controlli`, `eventi` | sezione f |

Quindi:

- **Migrazione additiva: vuota.** Nessun file `sql/NNN_…` da applicare.
- **Migrazione di rimozione: vuota.** La fase non toglie niente.
- Restano le **verifiche preliminari in sola lettura** del §9 qui sotto: se lo schema in
  produzione non corrisponde, ci si ferma prima di scrivere una riga di codice.

Le uniche cose nuove in `sql/` sono un file di **prova**, che non modifica niente e gira in
`begin … rollback`: `sql/test_coerenza.sql` (§6).

## 2. Voce 1 — Controllo (piano §3 Fase 3 voce 1; disegno §3.5)

Una schermata sola, raggiunta dal tasto **Controllo** dell'hub (oggi spento).

- **`momento` proposto**: `inizio` se la lavorazione non ha ancora controlli, `periodico`
  altrimenti. Quattro bottoni (Inizio · Metà · Fine · Periodico), quello proposto già scelto:
  `meta` e `fine` restano a un tocco. Nessun `<select>`.
- **Campi per zona**, nell'ordine: *Linea* (contametri, velocità, corrente, tensione) ·
  *Vasche* (le quattro temperature) · *Qualità* (micron, gloss ⊥, gloss ∥) · *Note*.
- **`placeholder` dal controllo precedente**: ogni campo mostra in grigio il valore dell'ultimo
  controllo della stessa lavorazione. Un `placeholder` non è un valore: se l'operatore non
  scrive, si salva `null` (regola di `CLAUDE.md`: campo vuoto → `null`).
- **Colore immediato** con `fuoriRange` di `comune.js`, a ogni digitazione: il campo fuori
  riferimento diventa rosso e sotto compare la ragione in parole (`sotto il minimo`,
  `sopra il massimo`, `oltre il ±N %`), scritta a **non meno di 18 px**; ogni campo numerico ha
  `inputmode="decimal"`. I riferimenti sono quelli della vista: temperature
  dalla **scheda viva**, velocità/ampere/micron dallo **snapshot della lavorazione**, gloss
  solo se la scheda è `satinato`. Il rosso non blocca il salvataggio: è un avviso.
- **I due campi del gloss ci sono sempre**, anche sulle schede naturali: il disegno §2.6 dice
  che sui naturali il gloss non **si segnala**, non che non si misura, e §3.5 elenca i campi
  senza condizione. Sui naturali restano dunque campi senza colore, come la tensione.
- Salva → `insert into controlli` con `salva()` → "Salvato ✓" → hub. `rilevato_il` **non si
  invia**: lo mette il default del database. `operatore_id` è l'operatore del tablet.

**File**: `js/reparto/controllo.js` (nuovo), sezione `rep-sch-controllo` in `reparto.html`,
regole in `css/reparto.css`.

## 3. Voce 2 — Evento (voce 2; disegno §3.6)

Due schermate, dal tasto **Evento** dell'hub.

1. **Quale evento**: sette bottoni — Difetto · Fermo · Aggiunta · Giunta film · Taglio film ·
   Primi metri non ossidati · Nota. (La ripartenza non è qui: si fa dall'hub, voce 3.)
2. **Il dettaglio**, diverso per tipo:
   - **Difetto**: il catalogo `tipi_difetto` come bottoni in colonna (sono dieci: più di otto,
     quindi non stanno in una griglia, ma restano **bottoni** — sul tablet non esistono
     `<select>`). Scelto il difetto, compaiono in sola lettura la **causa probabile** e
     l'**azione** del catalogo (sono un aiuto a chi guarda, non si salvano: `eventi` non ha
     quelle colonne, e le annotazioni al cliente riportano solo fatti). Poi contametri e
     descrizione.
   - **Fermo**: causa fra cinque bottoni (guasto, bagno, cambio rotolo, esterno, altro) e ora
     modificabile (`<input type="time">`, precompilata con l'ora di adesso). L'istante si
     costruisce **dai componenti locali** (`new Date(anno, mese, giorno, hh, mm)`), mai da una
     stringa `AAAA-MM-GGTHH:MM` senza fuso; se l'ora scritta cade nel futuro si intende quella
     di **ieri** (fermo delle 23:50 registrato alle 00:05). Un fermo nel futuro farebbe
     respingere la ripartenza dal trigger, ed è un errore evitabile.
     Il bottone **Fermo** della prima schermata è **spento se c'è già un fermo aperto**: è
     mostrare ciò che si sa, non decidere — la definizione del fermo aperto resta una sola.
   - **Aggiunta**: prodotto fra tre bottoni (satina, ammoniaca, altro) e litri.
   - **Giunta film**, **Taglio film**, **Primi metri non ossidati**: contametri.
   - **Nota**: descrizione.
   Salva → `insert into eventi` → hub.

**File**: `js/reparto/evento.js` (nuovo), sezione `rep-sch-evento` in `reparto.html`.

## 4. Voce 3 — Fermo e ripartenza dall'hub (voce 3; disegno §3.3)

- Con una lavorazione aperta l'hub mostra un quarto tasto **Fermo**, rosso, sempre visibile
  (disegno §3.3). Porta alla seconda schermata dell'evento già impostata su "fermo": è lo
  stesso salvataggio della voce 2, non una seconda strada.
- **Fermo aperto** = un evento `fermo` che nessuna `ripartenza` punta. È l'unica definizione
  (disegno §2.5) e in JS sta in una funzione pura sola, `fermoAperto`. È una **lettura**, non
  una regola nuova: il giudice resta il database (le RPC di chiusura e di annullo respingono con
  "C'è un fermo aperto"), esattamente come "già lavorata" della Fase 2. Va dichiarata fra le
  interpretazioni del front-end, accanto alle tre duplicazioni dello spec.
- Con un fermo aperto: il banner diventa rosso e dice `FERMO da N min · guasto`; il tasto Fermo
  diventa **Ripartenza**. Il rosso del fermo **vince** su quello del controllo scaduto (oltre i
  20 minuti): il banner del fermo porta la scritta `FERMO`, l'altro no, così i due si
  distinguono a occhio.
- **Ripartenza**: schermata propria con i **metri di scarto proposti 100**, modificabili, e la
  frase del manuale *"Il tratto dalla sgrassatura all'uscita dell'ossido va scartato."* Salva →
  `insert into eventi (lavorazione_id, operatore_id, tipo, fermo_id, metri_scarto)`, con
  `lavorazione_id` uguale a quella del fermo (il trigger le confronta) e `tipo = 'ripartenza'`.
  La `durata_min` del fermo la calcola il trigger: **il client non la invia e non ne ha il
  permesso**.
- Il tasto **Chiudi rotolo** resta spento con la scritta "dalla prossima fase": è la Fase 4.

**File**: `js/reparto/hub.js` (modificato), `js/reparto/ripartenza.js` (nuovo), sezione
`rep-sch-ripartenza` in `reparto.html`, `css/reparto.css` (i tasti dell'hub passano da tre a
quattro, più "Ultimi controlli" per il capoturno: la griglia `.azioni` non è più a tre colonne
fisse e ogni tasto resta ≥ 56 px con testo ≥ 18 px).

## 5. Voce 4 — Capoturno: "Ultimi controlli" (voce 4; disegno §3.8)

- Se l'operatore scelto sul tablet ha `ruolo = 'capoturno'`, nell'hub compare **"Ultimi
  controlli"**. È una **distinzione del solo front-end** (disegno §2.9): il database non
  conosce i capiturno e la policy lascia correggere a chiunque sia del reparto finché la
  lavorazione è aperta.
- La schermata elenca gli ultimi controlli della lavorazione aperta (i più recenti in cima,
  al massimo otto, come bottoni) con momento, ora e i campi fuori riferimento in rosso, letti
  dalla vista `controlli_scostamenti`.
- Toccando un controllo si riapre la **stessa schermata della voce 1**, in modo correzione:
  i campi sono già pieni, il tasto dice "Salva la correzione" e il salvataggio è un `update`
  su `controlli`. `modificato_da` e `modificato_il` li scrive il trigger.
  **`operatore_id` non cambia**: resta chi ha misurato, perché la riga dice chi era in linea;
  che sia stata corretta lo dicono `modificato_da` e `modificato_il` (nessuno storico dei
  valori, disegno §2.9).
- **Decisione del committente del 2026-09-04**: il capoturno è **Marco**; Davide resta
  operatore (PIANO §2). Nessuno dei due ha oggi quel ruolo in tabella: si assegna dall'ufficio,
  in Impostazioni, ed è una voce del rapporto.

**File**: `js/reparto/ultimi.js` (nuovo, l'elenco), `js/reparto/controllo.js` (la correzione),
sezione `rep-sch-ultimi` in `reparto.html`.

## 6. Voce 5 — Live: scostamenti, fermo, nastro della giornata (voce 5; disegno §4.3)

`js/ufficio/live.js` cresce, restando in **sola lettura** (nessun tasto che scriva):

- **Ultimo controllo** nel riquadro della linea: ora, momento e i valori, con **in rosso** i
  campi che la vista `controlli_scostamenti` segna fuori. Il giudizio è della vista, non del
  browser.
- **Fermo aperto**: riga in evidenza `FERMO da N min · causa`, con l'ora di inizio.
- **Nastro cronologico della giornata**: controlli ed eventi di **oggi** — confine calcolato
  dalla **mezzanotte locale** (`new Date(anno, mese, giorno)` passata al filtro), mai da
  `toISOString()` o da `slice(0,10)`, che darebbero il giorno UTC — dal più recente,
  con ora, chi, che cosa e i metri. Comprende anche ciò che è successo su lavorazioni chiuse
  o annullate nella stessa giornata: è il registro del giorno, non della lavorazione.
- **Realtime** esteso a `controlli` ed `eventi` (erano già in publication dalla Fase 0): un
  controllo salvato dal tablet compare in Live senza ricaricare.

**File**: `js/ufficio/live.js` (modificato), pannello `uff-pan-live` in `ufficio.html`,
regole in `css/ufficio.css`.

**Fuori dalle cinque voci, ma toccato dalla fase**: `CLAUDE.md` (il test di coerenza non è più
"in arrivo con la Fase 3": esiste, e gira come `postgres`; struttura dei file aggiornata) e la
frase corrispondente in testa a `js/comune.js`.

## 7. Funzioni pure nuove in `js/comune.js` (e i loro test)

Nessuna regola di dominio nuova: sono etichette e letture, più la definizione del fermo aperto
che il disegno vuole in un punto solo.

| Nome | Che cosa fa | Test in `tests/test-comune.mjs` |
|---|---|---|
| `METRI_SCARTO_RIPARTENZA` | costante 100, valore prudenziale del disegno §2.5 | valore |
| `MOMENTI`, `CAUSE_FERMO`, `TIPI_EVENTO`, `PRODOTTI_AGGIUNTA` | mappe codice → etichetta italiana, usate dal tablet **e** da Live | ogni codice ammesso dal `check` del database ha un'etichetta |
| `CAMPI_CONTROLLO` | l'elenco ordinato dei campi di un controllo: colonna, etichetta, unità, zona, nome della colonna `_fuori` nella vista, "solo satinato" | copre tutte le colonne di `controlli` che si compilano; ogni `fuori` esiste fra quelle di `fuoriRange` |
| `momentoProposto(nControlli)` | `inizio` con zero controlli, `periodico` altrimenti | i due casi |
| `fermoAperto(eventi)` | l'evento `fermo` che nessuna `ripartenza` punta, o `null`; il più recente se più d'uno | nessun fermo; fermo aperto; fermo chiuso; ripartenza che punta un altro fermo |
| `descrizioneEvento(ev)` | una riga in italiano per il nastro di Live e per il banner | un caso per tipo, compresi fermo con durata e ripartenza con metri |
| `elencoFuori(riga)` | le etichette dei campi che una riga di `controlli_scostamenti` segna fuori | riga pulita → vuoto; due campi fuori → due etichette |

`comune.js` resta senza `import` e senza DOM.

## 8. Il test di coerenza JS ↔ DB (disegno §5.6 punto 3, `CLAUDE.md`)

`CLAUDE.md` dice che il test di coerenza arriva con questa fase, e la guardia del piano chiede
"colori del tablet coincidenti con la vista". Si fa così, con **una sola fonte dei dati**:

- `sql/test_coerenza.sql` contiene, dentro un letterale `$fixture$ … $fixture$`, un JSON con i
  casi di prova e il **risultato atteso** di ciascuno: controlli con i loro riferimenti,
  chiusure con i codici attesi, bilanci con l'esito atteso, e l'elenco dei codici ammessi da
  `momento`, `tipo` ed `causa_fermo`. Numeri **inventati**: nel repo pubblico non entra nessun
  parametro di processo.
- Lo stesso file, in `begin … rollback`, costruisce da quel JSON un rotolo grezzo, un operatore,
  una scheda, una lavorazione e i controlli, poi verifica che `controlli_scostamenti` dia
  esattamente i booleani attesi, che `_codici_figli` dia i codici attesi, che
  `_controlla_figli_e_bilancio` accetti o rifiuti come atteso e che i codici del JSON coincidano
  con quelli dei `check` del database (letti da `pg_get_constraintdef`: una fonte sola anche per
  le etichette). Finisce con `TUTTI I TEST DI COERENZA PASSATI`.
- `tests/test-coerenza.mjs` **legge quel file**, ne estrae il JSON e verifica che `fuoriRange`,
  `codiciFigli` e `bilancioChiusura` di `comune.js` diano gli stessi risultati attesi, e che le
  mappe di etichette di `comune.js` coprano esattamente quei codici.

Così i due lati non si confrontano a memoria: leggono gli stessi numeri dallo stesso file, e
`node --test tests/` fallisce da solo se qualcuno cambia il JSON senza cambiare il JS.

**Come gira, e in che cosa è diverso da `test_regole.sql`.** `test_regole.sql` gira come
`authenticated` con i claims impostati, perché prova i permessi. `test_coerenza.sql` prova le
**regole di calcolo**, e per farlo deve chiamare `_codici_figli` e `_controlla_figli_e_bilancio`,
che sono revocate ad `authenticated` (`000_setup.sql` righe 645-646), e deve scrivere
direttamente in `lavorazioni`, dove il client non ha `insert` (le RPC sono l'unico varco):
perciò **gira come `postgres`**, cioè così com'è, senza `set local role`. Va scritto nel file,
in `CLAUDE.md` e qui, perché è l'eccezione.

Tre dettagli di costruzione della fixture, che altrimenti la fanno fallire prima di provare
qualsiasi cosa:

1. `lavorazioni.rotolo_grezzo_id` e `lavorazioni.operatore_avvio_id` sono `not null`: servono un
   rotolo grezzo e un operatore di prova.
2. Il `check` `lavorazioni_caso_c` vale sulle lavorazioni `chiusa`: con
   `kg_residui_dichiarati = 0` il `peso_tubolare_kg` deve essere **non null** (0 va bene).
3. La lavorazione della fixture **non è `aperta`**: l'indice unico `lavorazioni_una_aperta_per_linea`
   respingerebbe la riga se in linea ce ne fosse davvero una aperta.

## 9. Verifiche preliminari (sola lettura, prima di toccare il codice)

Non ci sono migrazioni, quindi non c'è backup dovuto (`CLAUDE.md`: il backup precede una
migrazione). Restano i controlli che dicono se il database è davvero quello che questa fase
suppone. Si eseguono con il connettore, in sola lettura, e il risultato va nello STATO.

| Verifica | Atteso |
|---|---|
| progetto del connettore | il ref scritto in `CLAUDE.md` |
| `ctl_ins`, `ctl_upd`, `ev_ins`, `ev_upd` | ufficio, oppure reparto **e** lavorazione `aperta` |
| `ctl_sel`, `ev_sel` | `using (true)` |
| grant `insert`/`update` per `authenticated` su `durata_min` e `modificato_*` | nessuno |
| sorgente di `eventi_ripartenza` | contiene `old.fermo_id` (migrazione `003` applicata) |
| indice `eventi_un_fermo_una_ripartenza` | presente |
| `controlli_scostamenti` | `security_invoker = true`, solo `select` ad `authenticated`, niente ad `anon` |
| tabelle in realtime | 3 (`lavorazioni`, `controlli`, `eventi`) |
| migrazioni nel progetto | 11 (10 della Fase 0 + `004_seed_schede`) |
| righe in `tipi_difetto` | 10 |
| rotoli `COLLAUDO-*` in stato `grezzo` | almeno 1 |
| operatori attivi, con il loro ruolo | almeno 1 |

E, come ultimo passo prima di dichiarare la fase chiusa, **`sql/test_regole.sql` rieseguito
verde** (`begin … rollback`, esito unico `TUTTI I TEST PASSATI`): è l'unico posto dove si provano
le due guardie del piano che questa fase mette in uso — l'insert del reparto respinto su una
lavorazione chiusa, e `durata_min` che il client non può scrivere.

## 10. Id HTML nuovi

`reparto.html`

```
rep-sch-controllo  rep-ctl-titolo  rep-ctl-momenti  rep-ctl-campi  rep-ctl-note
rep-ctl-salva  rep-ctl-esito  rep-ctl-gloss
rep-sch-evento  rep-ev-1  rep-ev-tipi  rep-ev-2  rep-ev-titolo  rep-ev-scelte
rep-ev-difetto-info  rep-ev-difetto-causa  rep-ev-difetto-azione
rep-ev-campi  rep-ev-salva  rep-ev-esito
rep-sch-ripartenza  rep-rip-titolo  rep-rip-metri  rep-rip-avviso  rep-rip-salva  rep-rip-esito
rep-sch-ultimi  rep-ultimi-elenco  rep-ultimi-vuoto  rep-ultimi-esito
rep-fermo  rep-ultimi-controlli   (tasti nuovi dell'hub)
```

`ufficio.html`

```
live-ultimo  live-ultimo-corpo  live-fermo  live-nastro  live-nastro-vuoto
```

`tests/test-dom-ids.mjs` cresce di quattro coppie (`controllo.js`, `evento.js`,
`ripartenza.js`, `ultimi.js` → `reparto.html`).

## 11. Prove nel browser (rotoli di collaudo, mai un rotolo vero)

Tablet a **1024 × 768**, ufficio a desktop, sul **primo** rotolo `COLLAUDO-*` con stato
`grezzo`.

1. Avvio del rotolo di collaudo con una scheda satinata; l'hub mostra i quattro tasti, con
   Controllo, Evento e Fermo **accesi** e Chiudi rotolo spento.
2. Controllo con momento `inizio`: un valore dentro riferimento resta nero, uno fuori diventa
   rosso subito, prima di salvare. Salvato → il banner dice "ultimo controllo 0 min fa" e i
   metri.
3. Secondo controllo: i `placeholder` mostrano i valori del primo; momento proposto
   `periodico`.
4. Evento difetto: catalogo, causa e azione a video, contametri, descrizione.
5. Fermo (causa a scelta) → banner rosso "FERMO da N min"; il tasto diventa Ripartenza;
   ripartenza con i 100 m proposti → il fermo si chiude e nel database `durata_min` è
   valorizzata **dal trigger**.
6. Con un operatore capoturno: "Ultimi controlli" compare, elenca i due controlli, se ne
   corregge uno e il valore cambia.
7. Ufficio, Live: ultimo controllo con il campo fuori in **rosso**, fermo aperto quando c'è,
   nastro della giornata che si allunga **senza ricaricare** entro un secondo.
8. Con un operatore non capoturno "Ultimi controlli" **non** compare.
9. Pulizia: la lavorazione di prova si **annulla** (i controlli e gli eventi restano, disegno
   §2.7), così il rotolo di collaudo torna a magazzino e non se ne consuma nessuno.
10. Traffico di rete del tablet: `rotoli_grezzi` non deve comparire mai; tutte le chiamate al
    ref di `CLAUDE.md`.

## 12. Voci delegate al committente

1. **Assegnare a Marco il ruolo di capoturno** (deciso dal committente il 2026-09-04, PIANO §2)
   — Ufficio → Impostazioni → riga di Marco → colonna Ruolo → "Capoturno". È una scrittura in
   produzione sulla tabella degli operatori: se la fa la skill, la fa **dalla schermata
   Impostazioni con la sessione del committente**, e nello STATO resta scritto chi l'ha fatta.
2. **Decisione da prendere prima dell'addestramento: la temperatura di fissaggio.** Le 51 schede
   hanno il solo minimo, e la regola del disegno §2.6 segnala una temperatura solo quando la
   scheda ha minimo **e** massimo: quindi la temperatura di fissaggio **non diventerà mai rossa**,
   né sul tablet né in Live. Domanda per il committente: *si parte così, oppure prima si cambia
   la regola in "massimo assente = nessun limite superiore"?* Il secondo caso è una modifica al
   disegno approvato — vista del database, colore del tablet e test di coerenza insieme — e va
   fatta come fase a sé, con un tecnico. Non si decide dentro questa fase.
3. Le voci già in attesa dalla Fase 2, che questa fase non tocca: tablet fissato in linea,
   GitHub Pro e repository privato, Scadenziario, abbonamento del database, data di stop carta.
4. **Presenza in reparto il primo turno** (disegno §7).

## 13. Cosa non faccio e perché

- **Non tocco la regola delle temperature.** Le 51 schede hanno la temperatura di fissaggio con
  il solo minimo, e la vista (come `fuoriRange`) segnala una temperatura fuori solo quando ci
  sono **sia** il minimo **sia** il massimo: la temperatura di fissaggio non verrà mai
  segnalata. Era già scritto nello stato della Fase 2. Trattare "massimo assente" come "nessun
  limite superiore" cambierebbe la regola del disegno §2.6 e la vista già pubblicata: è una
  scelta di disegno, non un difetto da correggere dentro una fase: sta al committente
  (§12 punto 2) e, se dice di sì, sarà una fase a sé.
  **Il colore del tablet e la vista restano d'accordo fra loro**: la guardia del piano è
  rispettata, ed è proprio ciò che il test di coerenza verifica.
- **Non aggiungo colonne a `eventi`** per causa e azione del difetto: il disegno le vuole
  mostrate dal catalogo, non copiate sull'evento, e le annotazioni al cliente devono restare
  "solo fatti" (§3.7).
- **Non metto la chiusura del rotolo**, né le stampe, né "Ultime chiusure" in Live: sono la
  Fase 4. Il tasto Chiudi rotolo resta spento con la sua scritta.
- **Non scrivo `durata_min` dal client**: non ne ha il permesso e non deve averlo.
- **Non aggiungo un recupero dopo la chiusura della pagina**: il disegno §3.9 lo esclude
  esplicitamente; il piano B è la registrazione a posteriori dall'ufficio (Fase 4).
- **Non tolgo il `<select>` dei ruoli in Impostazioni**: è l'ufficio, non il tablet.
- **Non cancello i dati di prova della Fase 2** rimasti in produzione: sono dichiarati nel loro
  stato e le RPC non cancellano. Allo stesso modo i controlli e gli eventi della prova di questa
  fase **restano** attaccati alla lavorazione annullata (disegno §2.7: annullare non cancella) e
  compaiono nel nastro di Live di quel giorno: vanno elencati nello STATO fra i dati di prova.

## 14. Contraddizioni trovate fra piano, disegno e codice

Una sola, ed è risolvibile senza fermarsi:

- Il piano Fase 2 voce 3 elencava **tre** tasti disabilitati (Controllo, Evento, Chiudi) e la
  Fase 2 non ha messo il tasto **Fermo**, che il disegno §3.3 vuole "rosso, sempre visibile".
  Lo stato della Fase 2 lo dichiara come scostamento e lo rimanda qui. La Fase 3 voce 3 è
  "Fermo / Ripartenza dall'hub": il tasto nasce adesso, acceso. Nessuna contraddizione residua.

Nessun'altra: schema, policy e grant della Fase 0 combaciano con quello che la fase chiede.
