# Fase 2 — Avvio da tablet

Spec di riferimento: `docs/superpowers/specs/2026-09-03-ciclo-bobina-design.md` (§2.1, §3.1-3.4,
§4.3, §5.2, §5.3). Voci del piano: `PIANO_funzionalita.md` §3 Fase 2, punti 1-5.

**Risultato verificabile del piano:** le 51 schede sono in tabella e tre a campione coincidono
con l'Excel; l'operatore avvia e annulla un rotolo di collaudo; l'ufficio lo vede in Live entro
un secondo.

**Guardie del piano:** il tablet non interroga mai `rotoli_grezzi`; nessuna logica di stato nel
front-end; niente `<select>` per elenchi ≤ 8 voci.

> **Questo documento finisce nel repository, che è pubblico.** Perciò non contiene nessun
> parametro di processo: né temperature, né tolleranze, né correnti, né velocità, né nomi di
> prodotti chimici. Dove servono si usano segnaposto (`N`, `A-B`, `min N`). I valori veri stanno
> solo nel Word di partenza, in `sql/seed_schede.sql` (gitignorato) e nel database.

---

## 1. File toccati

| File | Cosa |
|---|---|
| `tools/importa_schede.py` | **nuovo** — legge il Word e scrive `sql/seed_schede.sql` |
| `sql/seed_schede.sql` | **nuovo, gitignorato** — generato; applicato come migrazione `004_seed_schede` |
| `reparto.html` | **nuovo** — login, ruolo sbagliato, shell tablet, quattro schermate |
| `css/reparto.css` | **nuovo** — ergonomia tablet (spec §3.1) |
| `js/reparto.js` | **nuovo** — shell: sessione, ruolo, operatore, indicatore di stato, cambio schermata |
| `js/reparto/hub.js` | **nuovo** — hub linea libera / lavorazione in corso, "Annulla avvio" |
| `js/reparto/avvio.js` | **nuovo** — "Avvia rotolo" in tre schermate |
| `js/ufficio/live.js` | **nuovo** — tab Live, sola lettura, realtime |
| `ufficio.html` | tab e pannello Live (quarta voce, fra Pianificazione e Impostazioni) |
| `js/ufficio.js` | Live nell'elenco `TAB` |
| `css/ufficio.css` | riquadro della linea in Live |
| `js/comune.js` | tre funzioni pure nuove: `minutiDa`, `oraItaliana`, `etichettaScheda` |
| `js/ufficio/pianificazione.js` | l'etichetta della scheda prevista usa `etichettaScheda` (§11, interpretazione dichiarata) |
| `tests/test-comune.mjs` | test delle tre funzioni nuove |
| `tests/test-dom-ids.mjs` | quattro coppie nuove (`js/reparto.js`, `js/reparto/hub.js`, `js/reparto/avvio.js` → `reparto.html`; `js/ufficio/live.js` → `ufficio.html`) |
| `CLAUDE.md` | pagine, struttura, trappole |

Nessun file della Fase 1 cambia comportamento, tranne l'etichetta di cui al §11. I test della
Fase 1 vanno rieseguiti verdi nello stesso commit.

---

## 2. Voce 1 — `tools/importa_schede.py` e le 51 schede

### 2.1 Confronto Word ↔ Excel (richiesto dal piano, fatto **prima** di importare)

Fonte scelta dal piano (PIANO §2, decisione del 2026-09-04):
`Desktop/Schede di lavorazione/Schede di lavorazione Impianto 1500.docx` (28 luglio 2026, 16:52).
Fonte indicata dallo spec §2.1: `Schede Impianto 1500.xlsx` (27 luglio), fogli `OX NATURALE` e
`OX SATINATO`.

Confronto automatico di **tutte** e 51 le schede, abbinate su (nome della lavorazione, spessore
min/max, larghezza min/max), su **quindici campi**: velocità, corrente dell'ossido, finitura,
prodotto e temperatura di sgrassatura con minimo e massimo, temperatura di satinatura con minimo
e massimo, temperatura di ossido con minimo e massimo, temperatura e minimo di fissaggio.

**Esito: 51 righe nell'Excel, 51 schede nel Word, zero differenze su tutti i quindici campi.**
Le tre schede a campione richieste dal piano (`OX Naturale 3 micron` più stretta;
`OX Naturale 5 micron` più stretta; `OX Satinato Nat 8-10 micron` da 1000 mm) coincidono campo
per campo. La verifica riguarda **i parametri di processo**: non riguarda `Lega`, `Cliente` e le
note, che nel Word non esistono (sotto).

L'Excel **non era indietro**: il Word è una riformattazione, non una correzione. In compenso il
Word ha **meno** colonne dell'Excel:

| Colonna dell'Excel | Valorizzata in | Nel Word |
|---|---|---|
| `Lega` | 51 righe su 51 | assente |
| `Cliente` | 36 su 51 | assente |
| note sull'ossido | 26 su 51 | assente |
| note sulla satinatura | 5 su 51 | assente |

**Decisione del committente (2026-09-04, PIANO §2):** la colonna `lega` resta **vuota**, non si
attinge a due fonti. Lo spec §2.1 la elencava fra le colonne importate: contraddizione posta al
committente prima di caricare le schede e risolta da lui. Per riaverla basta rimetterla nel Word
e rifare l'importazione.

### 2.2 Struttura del Word e regole di conversione

Il documento è: un paragrafo `SCHEDA IMPIANTO 1500`, il nome della lavorazione, una tabella
`FINITURA | SPESSORE | LARGHEZZA`, il paragrafo `Velocità linea: N m/min`, una tabella
`FASE | PRODOTTO / NOTE | T (°C) | TOLLERANZA T | CORRENTE (A)`, e in 29 schede su 51 una
tabella di avviso. La prima tabella del documento è l'indice e si salta.

| Colonna dello schema | Da dove | Regola |
|---|---|---|
| `lavorazione` | paragrafo del titolo | testo così com'è, varianti comprese (`(per tubi)`, `(fissaggio debole)`, `(spazzolato)`) |
| `tipo` | titolo | `satinato` se contiene "Satinato", altrimenti `naturale` → 30 naturali, 21 satinate |
| `micron` | titolo | `N micron` → N. Intervalli `8-10` e `10-12` → **punto medio**, 9 e 11 (§11) |
| `finitura` | tabella dimensioni | due valori distinti in tutto il documento (50 schede l'uno, 1 l'altro) |
| `lega` | — | **null** (§2.1, decisione del committente) |
| `spessore_min/max` | `SPESSORE` | `N mm` → N/N; `da N a M mm` → N/M |
| `larghezza_min/max` | `LARGHEZZA` | `N mm` → N/N; `da N a M mm` → N/M |
| `velocita_m_min` | paragrafo | `Velocità linea: N m/min` → N |
| `ossido_ampere` | riga `OSSIDO`, colonna `CORRENTE (A)` | numero |
| `<vasca>_prodotto` | colonna `PRODOTTO / NOTE` | `—` → null. Solo la sgrassatura ne ha uno |
| `<vasca>_temp` | colonna `T (°C)` | numero |
| `<vasca>_temp_min/max` | colonna `TOLLERANZA T` | `A-B` → A/B; `min N` → N/**null**; `—` → null/null |
| `note` | tabella di avviso | il testo senza il simbolo, spazi normalizzati; null se la tabella manca |

Le quattro vasche del Word sono `SGRASSATURA`, `SATINATURA`, `OSSIDO`, `FISSAGGIO` e vanno nelle
colonne `sgrassatura_*`, `satina_*`, `ossido_*`, `fissaggio_*`. La quinta fase, **`NEUTRO`**
(18 schede, temperatura fissa, nessuna tolleranza), **non si importa**: è la neutralizzazione, non
ha una colonna nello schema e lo spec §2.1 la esclude ("il nitrico non ha set point nel manuale e
non si importa").

Conteggi attesi delle fasi, verificati sul file: `SGRASSATURA` 51, `OSSIDO` 51, `FISSAGGIO` 51,
`SATINATURA` 21, `NEUTRO` 18.

L'importatore riconosce **i formati**, non un elenco di valori: `^\d+([,.]\d+)?-\d+([,.]\d+)?$`,
`^min \d+([,.]\d+)?$`, `^—$`, e per le dimensioni `^da N a M …$` oppure `^N …$`. Se incontra un
formato diverso **si ferma con un errore**: un formato non previsto non si indovina. Così nel
programma non finisce nessun valore di processo.

### 2.3 Cosa scrive l'importatore

`sql/seed_schede.sql`, gitignorato come `seed_difetti.sql` della Fase 0 (contiene i parametri
di processo, e il repo è pubblico):

1. guardia: `if exists (select 1 from schede_lavorazione) then raise exception 'Schede già
   caricate: non rieseguire seed_schede.sql'; end if;`
2. un `insert` con le 51 righe;
3. verifiche finali con `assert`: 51 righe; 30 naturali e 21 satinate; cinque valori distinti di
   `micron`; 51 righe con `sgrassatura_temp`, `ossido_temp`, `fissaggio_temp` e `ossido_ampere`
   non nulli; 21 con `satina_temp` non nulla; 29 con `note`; e i valori delle **tre schede a
   campione** confrontate con l'Excel, scritti per esteso.

**Il file è un'unica transazione.** `apply_migration` esegue la migrazione dentro una
transazione, quindi un `assert` che fallisce dopo l'`insert` annulla anche l'`insert`: non
restano mezze schede e la guardia non scatta al secondo tentativo. Il file lo dice in testa,
perché chi lo eseguisse a mano da `psql` deve saperlo.

`tools/importa_schede.py` va nel repo (spec §5.2 lo elenca): contiene le regole di conversione,
non i parametri. In testa dichiara la versione di Python e la dipendenza (`python-docx`) e come
installarla: è l'unico programma del repo che non gira con `node`. Si esegue a mano, non è nel
percorso di `node --test tests/`.

---

## 3. Voce 2 — `reparto.html`, la shell del tablet

Tre stati di pagina, come `ufficio.html`: login, ruolo sbagliato ("Questa pagina è del reparto"),
applicazione. Dentro solo con `ruolo_utente() = 'reparto'`.

La libreria si carica come nelle altre pagine: stesso `<script>` UMD da jsDelivr, **stessa
versione pinnata `2.110.6` e stesso `integrity` `sha384-SR76iDF5vfiuFuYEigF/LOTQIXTU5SrR3Ij29NELtBswNOxcSLM6iMr8OVRzUycq`**,
`crossorigin="anonymous"`, prima del modulo.

**Ergonomia (spec §3.1), verificata a 1024 × 768:** tasti ≥ 56 px, testo ≥ 18 px, elenchi come
bottoni (**mai `<select>`**, in nessun punto di `reparto.html`), una sola azione principale per
schermata, "Indietro" in alto a sinistra, `inputmode="decimal"` su ogni campo numerico.
`css/base.css` impone già `min-height: 56px` e `font-size: 18px` su `input` e `button`:
`reparto.css` non deve abbassarli.

**Barra in alto:** nome dell'operatore attivo a destra (tap → schermata di scelta), indicatore
`Salvato ✓` / `In attesa di rete… riprovo`, "Esci".

**Operatore (spec §3.2):** letto e scritto in `localStorage` dentro `try/catch` (in navigazione
privata `localStorage` solleva un'eccezione, e il tablet deve restare usabile). Si memorizza il
solo `id`; il nome si rilegge da `operatori` a ogni apertura, così un operatore rinominato o
disattivato non resta appiccicato. Se l'id memorizzato non è più fra gli attivi, si torna alla
scelta. La griglia mostra gli `operatori` con `attivo = true` in ordine alfabetico, come bottoni.
Nessuna password.

**Se non ci sono operatori** la schermata dice: "Nessun operatore: falli inserire dall'ufficio,
in Impostazioni". Senza operatore non si può avviare niente (`avvia_lavorazione` richiede un
`p_operatore_id` di un operatore attivo).

**Schermate** (una visibile per volta, il resto `hidden`): `operatore`, `hub`, `avvio`,
`annullo`. Il cambio schermata è della shell; ogni modulo espone `mostra(ctx)`.

`ctx` = `{ operatore, vaiA(nome), stato(s), ricarica() }`.

**"Indietro"** (`rep-indietro`, della shell) è contestuale e lo decide la schermata attiva: da
`avvio` torna alla schermata precedente del flusso (3 → 2 → 1 → hub) e, dentro la schermata 2,
dal pannello dei parametri torna all'**elenco delle schede**, non alla schermata 1. Da `annullo`
torna all'hub. Nell'hub non compare.

**Id nuovi in `reparto.html`:** `rep-login`, `rep-form-login`, `rep-email`, `rep-password`,
`rep-entra`, `rep-messaggio`, `rep-negato`, `rep-negato-esci`, `rep-app`, `rep-nome-operatore`,
`rep-stato`, `rep-esci`, `rep-indietro`, `rep-titolo`, `rep-sch-operatore`,
`rep-elenco-operatori`, `rep-operatori-vuoto`, `rep-sch-hub`, `rep-hub-libera`,
`rep-hub-avvia`, `rep-hub-programma`, `rep-hub-programma-vuoto`, `rep-hub-corso`,
`rep-banner`, `rep-banner-titolo`, `rep-banner-dettaglio`, `rep-controllo`, `rep-evento`,
`rep-chiudi`, `rep-altro`, `rep-altro-voci`, `rep-annulla-avvio`, `rep-hub-esito`,
`rep-sch-avvio`, `rep-avvio-1`, `rep-avvio-programma`, `rep-avvio-cerca-testo`,
`rep-avvio-cerca-vai`, `rep-avvio-cerca-esiti`, `rep-avvio-2`, `rep-avvio-schede`,
`rep-avvio-tutte`, `rep-avvio-parametri`, `rep-avvio-parametri-titolo`,
`rep-avvio-parametri-corpo`, `rep-avvio-parametri-usa`, `rep-avvio-3`, `rep-avvio-riepilogo`,
`rep-avvio-peso-con`, `rep-avvio-peso-imballo`, `rep-avvio-netto`, `rep-avvio-contametri`,
`rep-avvio-conferma`, `rep-avvio-esito`, `rep-sch-annullo`, `rep-annullo-rotolo`,
`rep-annullo-motivo`, `rep-annullo-metri`, `rep-annullo-conferma`, `rep-annullo-esito`.

---

## 4. Voce 3 — Hub (`js/reparto/hub.js`)

Una sola interrogazione decide quale hub disegnare: `lavorazioni` con `stato = 'aperta'` e
`linea = '1500'` (l'indice unico è per linea e garantisce che ce ne sia al massimo una).

### 4.1 Linea libera

- **"Avvia rotolo"**, il tasto principale.
- **"In programma questa settimana"**: le righe di `pianificazione` con
  `settimana = lunediDellaSettimana(oggi)`, in ordine di `posizione`, **la prima evidenziata**.

**Le letture del grezzo passano dalla vista** (guardia del piano). Niente `select` annidato su
`pianificazione(*, rotoli_grezzi(*))`: la chiave esterna punta alla **tabella**, e su
`rotoli_grezzi` il reparto non ha righe (`grezzi_sel using (e_ufficio())`). Tre interrogazioni
esplicite:

1. `pianificazione` della settimana, ordinata per `posizione`;
2. `rotoli_grezzi_reparto` con `.in("id", <rotolo_grezzo_id delle righe>)`;
3. `lavorazioni` con `.in("pianificazione_id", <id delle righe>)` e `.neq("stato","annullata")`
   → le righe già lavorate si **escludono** (spec §3.3), stessa definizione dello spec §2.3.

Se la prima interrogazione non restituisce righe, la 2 e la 3 **non si eseguono**: niente
`.in()` con una lista vuota. Il messaggio è: "Niente in programma per questa settimana: usa
Avvia rotolo → Cerca altro numero."

### 4.2 Lavorazione in corso

Banner (spec §3.3): rotolo, scheda, ora e operatore di avvio, minuti dall'ultimo controllo,
metri. I dati vengono da `rotoli_grezzi_reparto` (rotolo), `schede_lavorazione` (scheda),
`operatori` (chi ha avviato), `controlli` (l'ultimo per `rilevato_il`).

- **Colore**: il banner diventa rosso se sono passati più di `SOGLIA_CONTROLLO_MIN` (20) minuti
  dall'ultimo controllo; **se controlli non ce ne sono, si contano i minuti dall'avvio** — è il
  caso normale in questa fase, perché i controlli arrivano con la Fase 3.
- **Ultimo controllo**: "ultimo controllo 45 min fa" oppure "nessun controllo".
- **Metri**: `contametri` dell'ultimo controllo − `contametri_inizio`, mostrati **solo se c'è un
  controllo con il contametri**; altrimenti la voce non compare (§11).

Tasti: **Controllo**, **Evento**, **Chiudi rotolo**, tutti e tre **disabilitati** con la scritta
"dalla prossima fase" (piano voce 3). Sotto, **"Altro…"** che apre **"Annulla avvio"**.

### 4.3 Annulla avvio

Schermata propria: rotolo e scheda in chiaro, **motivo** (obbligatorio), **metri di nastro
consumati** (`inputmode="decimal"`, default 0), conferma →
`annulla_lavorazione(p_lavorazione_id, p_operatore_id, p_motivo, p_metri_scarto)`.

Il front-end non decide niente: motivo vuoto → il tasto resta disabilitato (è la stessa cosa che
direbbe la RPC, mostrata prima); metri fuori misura → il messaggio italiano della RPC. A conferma
riuscita si torna all'hub, che mostra di nuovo la linea libera.

---

## 5. Voce 4 — Avvia rotolo, tre schermate (`js/reparto/avvio.js`)

Stato in memoria (`{ grezzo, pianificazione_id, scheda, pesi }`). Se la pagina si chiude prima
della conferma si ricomincia (spec §3.4): nessun salvataggio parziale.

**1. Quale rotolo.** I grezzi in programma della settimana come bottoni, con
`n_prog`, misure, e per i residui "residuo 2.450 kg · 302 m" (`kg_residui` non nullo, spec §3.4).
Un rotolo che non è `grezzo` compare con l'etichetta del suo stato e il bottone **spento**: si
mostra ciò che il database rifiuterebbe, non si duplica la regola. Sotto, **"Cerca altro numero"**:
un campo di testo e un tasto Cerca su `rotoli_grezzi_reparto` (`ilike %testo%` su `n_prog`,
`.order("n_prog")`, massimo 8 risultati come bottoni) — **qui compaiono anche i rotoli di
collaudo**, che non sono in programma.

**2. Quale scheda.** `schedeCompatibili(schede, spessore_mm, larghezza_mm)` del grezzo scelto,
ordinate per micron, come bottoni; casella **"Mostra tutte"** per superare il filtro. L'etichetta
di ogni bottone è `etichettaScheda` (§7): con "Mostra tutte" dodici schede si chiamano tutte allo
stesso modo e senza le misure non si distinguono. Il tap **non** conferma: apre i **parametri per
vasca** (velocità, corrente, e per ogni vasca prodotto, temperatura e tolleranza) con "Usa questa
scheda" e "Indietro" che torna all'elenco. Resta dentro la schermata 2: le schermate restano tre.

**3. Pesate.** `peso con imballo` (> 0, obbligatorio), `peso imballo` (**default 0**, 0 ammesso:
un residuo è già sballato — un campo vuoto darebbe `null` e la RPC risponderebbe "non può essere
negativo", messaggio fuorviante), **netto provvisorio** calcolato a vista, `contametri iniziale`
(default 0). In testa il riepilogo di rotolo e scheda. **"Avvia"** →

```
avvia_lavorazione(p_rotolo_grezzo_id, p_scheda_id, p_operatore_id,
                  p_peso_con_imballo, p_peso_imballo, p_contametri_inizio, p_pianificazione_id)
```

`p_avviata_il` **non si passa**: il reparto non sceglie l'orario, e la RPC lo sovrascrive comunque
con `now()`. `p_pianificazione_id` è valorizzato solo se il rotolo è stato scelto dal programma.
A riuscita si torna all'hub, che ora mostra la lavorazione in corso.

Errori mostrati così come arrivano dalla RPC (spec §5.5): "Il rotolo X è già in lavorazione",
"C'è già una lavorazione aperta sulla linea 1500", "Il peso dell'imballo deve essere minore del
peso con imballo".

---

## 6. Voce 5 — Tab Live (`js/ufficio/live.js`)

Quarta voce di `ufficio.html`, fra Pianificazione e Impostazioni. **Sola lettura**: nessun tasto
che scriva, nessun grant nuovo.

Riquadro della linea 1500 (piano voce 5): stato (**libera** / **in lavorazione**), `n_prog` del
rotolo, nome della scheda, operatore che ha avviato, ora di avvio (`oraItaliana`) e data se non è
oggi. Se la linea è libera: "Linea 1500 libera."

Quattro interrogazioni piccole e distinte, come nell'hub (l'ufficio potrebbe annidare, ma
`lavorazioni` ha **due** chiavi esterne verso `operatori` e l'annidamento andrebbe disambiguato:
non ne vale il rischio): `lavorazioni` aperta della linea 1500, poi `rotoli_grezzi` (qui
l'ufficio **legge la tabella**, non la vista: fornitore e bolla sono suoi), `schede_lavorazione`,
`operatori`.

**Realtime** (spec §2.8, già attivo su `lavorazioni` dalla Fase 0):

```js
canale = sb.channel("live-lavorazioni")
  .on("postgres_changes", { event: "*", schema: "public", table: "lavorazioni" }, () => disegna())
  .subscribe();
```

`mostra(ctx)` chiude il canale precedente prima di aprirne uno nuovo (`sb.removeChannel`), così
non se ne accumulano tornando sul tab. Quando l'ufficio va su un altro tab il canale resta
aperto: non dà fastidio e non si moltiplica. Sotto il riquadro, una riga di servizio: "Aggiornato
alle 14:32" più lo stato del collegamento ("in ascolto" / "collegamento interrotto: ricarica la
pagina"), così un realtime caduto si vede — è il modo per accorgersi che la voce 5 funziona, non
una funzionalità in più.

L'interruttore "Mostra rotoli di collaudo" **non** vale per Live: la linea è una sola e ciò che
ci gira sopra va visto sempre (stessa scelta dell'esportazione e della proposta di `n_prog`,
Fase 1).

Il resto di Live — scostamenti in rosso, nastro cronologico, fermo aperto, Ultime chiusure —
è delle Fasi 3 e 4.

---

## 7. Funzioni pure nuove in `js/comune.js` (con test in `tests/test-comune.mjs`)

| Funzione | Cosa fa | Test |
|---|---|---|
| `minutiDa(quando, adesso = new Date())` | minuti interi trascorsi; `null` se `quando` è null o non è una data | null → null; stessa ora → 0; 45 min prima → 45; 20 min esatti → 20 (la soglia è "più di", il confronto sta in chi chiama); data non valida → null |
| `oraItaliana(valore)` | `"08:12"` dal `timestamptz`, ora **locale**; `"—"` se assente | null → "—"; stringa non valida → "—"; una data costruita localmente alle 8:12 → "08:12"; alle 23:30 del giorno prima non diventa il giorno dopo |
| `etichettaScheda(scheda)` | nome, micron e misure in una riga: `"<nome> · N my · N mm · N mm"`, con `"da N a M mm"` per gli intervalli | valore singolo; intervallo su entrambe le misure; micron con la virgola; scheda senza misure → solo nome e micron |

Nessun `import` in `comune.js`, nessun DOM, nessuna rete (invariante 7).

---

## 8. Regole di dominio: dove stanno

| Regola | Dove |
|---|---|
| Il rotolo dev'essere `grezzo` per essere avviato | `avvia_lavorazione` (RPC). Il tablet **spegne** il bottone, non decide |
| Una sola lavorazione aperta per linea | indice unico `lavorazioni_una_aperta_per_linea` |
| Pesi: con imballo > 0, imballo ≥ 0 e < con imballo | `avvia_lavorazione` + `check` di tabella |
| Orario di avvio | `avvia_lavorazione`: il reparto non lo sceglie |
| Motivo dell'annullo obbligatorio, metri ≤ metri stimati | `annulla_lavorazione` |
| `kg_residui` scalati dopo un annullo con metri consumati | `annulla_lavorazione` |
| Fornitore e bolla invisibili al reparto | vista `rotoli_grezzi_reparto` + `grezzi_sel` |
| `modificato_da/il` | trigger |
| Riga di programma "già lavorata" | interrogazione su `lavorazioni`, definizione dello spec §2.3 |

Nel front-end restano solo **filtri di interfaccia** (`schedeCompatibili`, già della Fase 1) e la
**soglia del colore** del banner (`SOGLIA_CONTROLLO_MIN`, costante dello spec §3.3: è un
promemoria visivo, non una regola di dato).

---

## 9. Prove nel browser

**In locale** (`http://localhost:8000`, passo 5) — senza sessione si verifica il disegno e
l'assenza di errori; con la sessione del committente si provano i flussi:

1. `reparto.html` a **1024 × 768**: login renderizzato, nessun errore in console.
2. Con l'utenza **reparto**: scelta dell'operatore, hub linea libera, "In programma questa
   settimana".
3. `read_network_requests`: tutte le chiamate al ref `nbercxzpjflqfstwrryp`, e **nessuna** verso
   la tabella `rotoli_grezzi` da `reparto.html`. Il confronto è sul nome esatto della risorsa
   (`/rest/v1/rotoli_grezzi?`), non sul prefisso: `/rest/v1/rotoli_grezzi_reparto?` comincia
   allo stesso modo ed è invece quella che **deve** comparire.
4. Avvio di un `COLLAUDO-*` con `stato = 'grezzo'`: schermata 1 → 2 (parametri per vasca) → 3
   (pesate) → Avvia.
5. Hub con lavorazione in corso: banner, tre tasti disabilitati con "dalla prossima fase".
6. `ufficio.html` → Live: il rotolo compare; con il tablet e l'ufficio aperti insieme, l'avvio si
   vede in Live **entro un secondo** senza ricaricare (realtime).
7. "Altro… → Annulla avvio" con motivo e **0 metri**: la linea torna libera, il rotolo torna
   `grezzo` con i `kg_residui` invariati.
8. Misure: nessun tasto sotto 56 px, nessun testo sotto 18 px, nessun `<select>` in
   `reparto.html` (verificato con `read_page` e sul sorgente).

**Sul sito pubblicato** (passo 8.2): gli stessi punti 1-7, con il login del committente prima
come **ufficio** (Live) e poi come **reparto** (tablet). La sessione vale per origine: entrando
come reparto si esce da ufficio, quindi Live si guarda prima o da un'altra finestra.

**Operatore per le prove.** La tabella `operatori` è vuota. **Prima scelta:** il committente
inserisce i nomi veri (Marco e Davide, PIANO §2) da Impostazioni prima delle prove, e la prova si
fa con un operatore vero. **Se non fa in tempo**, si aggiunge un operatore `COLLAUDO - non usare`
e **alla fine lo si disattiva** invece di cancellarlo: la lavorazione annullata di prova lo cita,
e la chiave esterna ne impedirebbe la cancellazione. Disattivato non compare sul tablet. Quale
delle due strade si è presa va scritto nello STATO e nel rapporto.

---

## 10. Migrazioni

### 10.1 Verifiche preliminari (passo 6.2) — già eseguite in sola lettura il 2026-09-04

| Verifica | Atteso | Trovato |
|---|---|---|
| `schede_lavorazione` | 0 righe (seed non applicato) | 0 |
| rotoli di collaudo `grezzo` | ≥ 1 | 10 su 10 |
| `avvia_lavorazione`, `annulla_lavorazione` `security definer` con `search_path=public` | 2 | 2 |
| `execute` sulle due RPC | solo `authenticated` (più `postgres`/`service_role`, lato server) | uguale |
| grant su `rotoli_grezzi_reparto` | `authenticated`: solo SELECT; `anon`: niente | uguale |
| policy `pian_sel`, `lav_sel`, `ctl_sel` | `using (true)` | uguale |
| policy `grezzi_sel` | `e_ufficio()` | uguale |
| tabelle in realtime | 3 (`lavorazioni`, `controlli`, `eventi`) | 3 |
| migrazioni applicate | 10 (Fase 0) | 10 |

**La Fase 2 non ha bisogno di nessun cambiamento di schema**: tabelle, viste, policy, grant, RPC
e realtime della Fase 0 coprono già tutto. L'unica scrittura è il seed delle schede.

### 10.2 Backup (passo 6.1), obbligatorio prima della migrazione

`CLAUDE.md` e PIANO §1: backup via connettore prima di ogni migrazione. Per ognuna delle nove
tabelle leggibili, `select json_agg(t) from <tabella> t` salvato in
`Backup app/<AAAA-MM-GG_HHMM>/<tabella>.json`, più un `README.txt` con il conteggio delle righe
per tabella. I file vanno verificati esistenti e JSON valido. **Senza backup riuscito, niente
migrazione.**

### 10.3 Migrazione additiva (passo 6.3)

`004_seed_schede` = il contenuto di `sql/seed_schede.sql`. Verifiche finali dentro il file
stesso (§2.3), nella stessa transazione. Il codice già pubblicato continua a funzionare durante e
dopo: la Fase 1 legge `schede_lavorazione` e oggi trova zero righe, dopo ne trova 51 — è
esattamente ciò che la pianificazione aspettava ("— nessuna scheda caricata —" sparisce).

### 10.4 Migrazione di rimozione (passo 6.5)

**Vuota, e dichiarata tale.** Non c'è niente da togliere.

---

## 11. Cosa non faccio e perché

1. **`lega`, `cliente`, note dell'ossido e della satina restano fuori.** Sono nell'Excel, non nel
   Word. Lo spec §2.1 elencava `lega` fra le colonne importate: contraddizione **posta al
   committente prima di caricare le schede** e decisa da lui il 2026-09-04 (PIANO §2: casella
   vuota, una sola fonte). Nel rapporto, con i passi per rimetterla nel Word se cambia idea.
2. **`fissaggio_temp_max` resta null** (il Word scrive un minimo, non un intervallo). La vista
   `controlli_scostamenti` segnala una temperatura fuori range solo se **min e max** ci sono
   entrambi: quindi la temperatura di fissaggio **non verrà mai segnalata**. Non tocco la vista:
   i controlli sono la Fase 3, e cambiarla adesso sarebbe un'aggiunta fuori fase. Nello STATO va
   con questa frase esatta: *"temperatura di fissaggio: solo minimo; la vista e `fuoriRange`
   devono trattare `max` null come 'nessun limite superiore', in coerenza (test di coerenza
   JS↔DB)"*.
3. **`micron` degli intervalli diventa il punto medio** (9 e 11): la colonna è un numero solo e
   non ammette null. Con la tolleranza ±10 % la banda non copre tutto l'intervallo dichiarato.
   Il nome della lavorazione mantiene l'intervallo, quindi l'operatore vede la verità. Da tarare
   dopo il pilota, come le altre costanti.
4. **Niente tasto Fermo nell'hub.** Lo spec §3.3 lo vuole rosso e sempre visibile, ma il piano
   voce 3 elenca esattamente tre tasti disabilitati (Controllo, Evento, Chiudi): fermo e
   ripartenza sono la Fase 3, voce 3. Un quarto tasto sarebbe un'aggiunta.
5. **Niente "Ultimi controlli" del capoturno** (spec §3.8): Fase 3, voce 4.
6. **I metri nel banner compaiono solo se c'è un controllo con il contametri.** L'unica fonte del
   contametri corrente sono i controlli, che arrivano con la Fase 3. Inventare una stima sarebbe
   una regola nuova.
7. **Nessuna stampa dal tablet**, in nessuna schermata (decisione del committente, spec §8).
8. **Nessun offline, nessuna coda persistente**: `salva()` ritenta finché la pagina è aperta, poi
   il piano B è la registrazione a posteriori dall'ufficio (Fase 4).
9. **Nessun test automatico dell'importatore Python.** Il comando dei test è `node --test tests/`
   e aggiungere una toolchain Python sarebbe fuori dalle regole del repo (PIANO §1). Le verifiche
   sono gli `assert` dentro il SQL generato e il confronto con l'Excel di §2.1.
10. **`registra_lavorazione_completa` non ha ancora una schermata**: è la Fase 4, voce 4.

### Interpretazioni dichiarate

- **L'etichetta della scheda prevista in Pianificazione (Fase 1) passa a `etichettaScheda`.**
  Non è una funzione nuova: è l'etichetta di un `<option>` che oggi mostra `nome (micron my)`.
  Con le 51 schede caricate da questa fase, dodici si chiamano allo stesso modo. Nella maggior
  parte dei casi `schedeCompatibili` ne lascia una o due, e l'ambiguità non si vede; **si vede con
  la casella "Mostra tutte"** e con intervalli sovrapposti, dove l'elenco diventa illeggibile.
  Il cambio è utile, non dannoso, e riusa una funzione che questa fase deve comunque scrivere.
- **Chi entra in `reparto.html` con l'utenza ufficio vede "riservata al reparto"**, come
  `ufficio.html` fa col reparto. Le policy consentirebbero all'ufficio di scrivere controlli ed
  eventi, ma il tablet è del reparto (spec §3) e l'ufficio ha le sue schermate.
- **Un ritentativo di `salva()` su una RPC dopo un guasto di rete** può trovare l'operazione già
  riuscita: `avvia_lavorazione` risponderebbe "C'è già una lavorazione aperta sulla linea 1500" e
  `annulla_lavorazione` "La lavorazione è già annullata". Sono messaggi italiani corretti e la
  seconda chiamata non fa danno. Comportamento della Fase 0, non toccato.

---

## 12. Voci delegate al committente

1. **Inserire gli operatori veri** in `ufficio.html` → Impostazioni, **prima delle prove** se fa
   in tempo. Senza, sul tablet non c'è nessun nome da scegliere e non si può avviare niente.
   Passi nel rapporto.
2. **Fissare il tablet in linea** con `reparto.html` aperto e l'utenza `reparto` connessa
   (spec §7).
3. **Rimettere la lega nel Word delle schede**, se cambia idea (§11 punto 1): dopo, basta
   rieseguire l'importazione in una fase di correzione.
4. Dai giri precedenti, ancora aperte: repository privato con GitHub Pro; Supabase a pagamento
   dopo il pilota; riattivare il progetto Scadenziario quando serve.
