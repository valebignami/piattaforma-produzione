# Piattaforma Produzione Overland — Sotto-progetto 1: Ciclo bobina

**Data:** 2026-09-03 · **Stato:** approvato in chat sezione per sezione, in attesa di rilettura finale
**Committente e autore delle decisioni:** V. Bignami · **Perimetro:** Linea 1500 (Impiantone)

## 0. In una frase

La Scheda di Produzione della Linea 1500 diventa digitale: l'ufficio inserisce i rotoli grezzi
e la settimana produttiva, l'operatore da tablet avvia il rotolo, registra controlli ed eventi,
lo chiude nei casi A/B/C, e il sistema genera le Schede Rotolo stampabili. Tutto su un unico
database che l'ufficio vede in tempo reale.

## 1. Perché questa fetta per prima

Il progetto completo (documento `docs/riferimenti/Progetto_Piattaforma_Produzione.docx`) ha
quattordici moduli. È stato scomposto in cinque sotto-progetti, ognuno con il proprio ciclo
spec → piano → implementazione:

1. **Ciclo bobina** (questo documento) — Fasi 0, 3, 4, 5, 6 del documento di progetto
2. Vista ufficio completa — Anomalie, KPI (Fase 7)
3. Migrazione delle due app standalone — Schede di Lavorazione, Checklist (Fasi 1, 2)
4. Bagni (Fase 8)
5. Qualità/certificato, difetti avanzati, fermi, manutenzione, depurazione (Fasi 9, 10)

Il ciclo bobina è l'unico che sostituisce carta oggi in uso e produce il dato (rotolo,
lavorazione, controlli, eventi) attorno a cui tutti gli altri moduli si agganciano.

### Obiettivo misurabile del sotto-progetto

La Scheda di Produzione della Linea 1500 è digitale, usata ogni giorno da tutti gli operatori,
e resta in uso per quattro settimane consecutive senza tornare alla carta. Se dopo tre mesi
dall'avvio del pilota questo non è avvenuto, ci si ferma e si ripensa prima di proseguire
con il sotto-progetto 2.

### Decisioni di contesto prese in fase di design

- L'**ERP Nastri** (`Desktop/ERP`, Django) è accantonato: la piattaforma possiede la propria
  anagrafica rotoli. Dall'ERP si riusano solo i concetti (numero progressivo, stati, padre/figlio),
  non il codice né il database.
- Le due app standalone esistenti (Schede di Lavorazione, Checklist Preparazione) **non** si
  migrano in questa fetta. Le schede si importano come dati di riferimento in sola lettura.
- Tablet e Wi-Fi in reparto **esistono già**: niente modalità offline, niente PWA.
- Semplicità e manutenibilità prevalgono su tutto: zero toolchain, un file per schermata,
  regole in un solo posto (Postgres), poche tabelle con nomi italiani.

## 2. Modello dati

Principio: **il rotolo è l'entità centrale, la lavorazione è l'evento.** Nove tabelle più una
di servizio, tre funzioni SQL con tutte le regole di stato, una vista per gli scostamenti.

Convenzioni: chiavi `uuid default gen_random_uuid()`, `creato_il timestamptz default now()`,
nomi di tabelle e colonne in italiano, `snake_case`. Le colonne "chi e quando ha modificato"
si chiamano `modificato_da` (testo: nome operatore o `ufficio`) e `modificato_il`.

### 2.1 Anagrafiche

**`operatori`** — `id`, `nome` (unico), `ruolo` (`operatore` | `capoturno`), `attivo` (bool),
`ordine` (int, per la griglia sul tablet). Scritta dall'ufficio.

**`schede_lavorazione`** — le ~60 schede storiche del file
`Desktop/Schede di lavorazione/Schede Impianto 1500.xlsx` (fogli OX NATURALE e OX SATINATO).
`id`, `lavorazione` (es. "OX Naturale 5 micron"), `tipo` (`naturale` | `satinato`), `micron`,
`finitura`, `lega`, `spessore_min`, `spessore_max`, `larghezza_min`, `larghezza_max`,
`velocita_m_min`, `ossido_ampere`, per ciascuna vasca (`sgrassatura`, `satina`, `nitrico`,
`ossido`, `fissaggio`): `<vasca>_prodotto`, `<vasca>_temp`, `<vasca>_temp_min`, `<vasca>_temp_max`;
`clienti_storici`, `note`, `fonte`, `data_scheda`. In questa fetta **sola lettura**; l'import è
uno script Python eseguito una volta che produce `sql/seed_schede.sql`. Le righe con larghezza
"da 961 a 1080" diventano min/max; le righe con un solo valore hanno min = max.

**`tipi_difetto`** — il catalogo del manuale (`docs/riferimenti/Manuale completo.docx`,
sezione "Difetti tipici"). `codice`, `nome`, `causa_probabile`, `azione`, `ordine`. Seed
iniziale di ~10 righe: segni ciclici, strisce trasversali, chiazze iridescenti, righe e
strisciature, punti bianchi/calcificazioni, nastro ondulato, macchie simili a umido, graffi,
bruciature, altro.

**`utenti_app`** — tabella di servizio per la sicurezza: `uid` (= `auth.users.id`), `ruolo`
(`ufficio` | `reparto`). Due righe. Vedi §5.

### 2.2 Il rotolo grezzo

**`rotoli_grezzi`** — un coil come arriva dal fornitore.

| Colonna | Note |
|---|---|
| `n_prog` | testo, unico, es. `A5000`. Lo digita l'ufficio; l'app propone il successivo (funzione pura `prossimoNProg`) |
| `fornitore`, `cliente` | testo con autocompletamento dai valori già usati; nessuna anagrafica |
| `lega`, `finitura` | testo |
| `spessore_mm`, `larghezza_mm` | numerici, > 0 |
| `peso_bolla_kg` | dichiarato dal fornitore |
| `kg_residui` | null finché non lavorato; dopo un caso C contiene il residuo |
| `data_arrivo`, `rif_bolla`, `posizione`, `note` | |
| `stato` | `grezzo` → `in_lavorazione` → `esaurito`; da `in_lavorazione` può tornare a `grezzo` (caso C o annullo) |
| `metri_stimati` | **colonna generata**: `coalesce(kg_residui, peso_bolla_kg) / (larghezza_mm * spessore_mm * 2.7 / 1000)` |

Il **caso C** (rotolo lavorato in parte) non crea un nuovo rotolo: è la stessa riga che torna
`grezzo` con `kg_residui` aggiornati, come la scheda cartacea che resta sul residuo.

### 2.3 La pianificazione

**`pianificazione`** — `id`, `settimana` (date, il lunedì), `posizione` (int), `rotolo_grezzo_id`,
`scheda_lavorazione_id` (prevista, nullable), `suddivisione_prevista` (testo libero, es.
"2 rotoli da 4000"), `note`, `lavorazione_id` (nullable: si riempie quando la lavorazione parte
da questa riga, così la settimana mostra cosa è stato fatto). Unicità su
(`settimana`, `rotolo_grezzo_id`).

### 2.4 La lavorazione (= Scheda di Produzione)

**`lavorazioni`** — un evento per ogni volta che un grezzo entra in linea. Una sola riga
anche se produce tre rotoli finiti.

| Colonna | Note |
|---|---|
| `rotolo_grezzo_id` | |
| `linea` | testo, `check in ('1500','750')`, default `1500`. Per l'Impiantino basta questo |
| `scheda_lavorazione_id` | la scheda applicata come riferimento |
| `pianificazione_id` | nullable (lavorazione fuori programma) |
| `operatore_avvio_id`, `avviata_il` | |
| `peso_con_imballo_kg`, `peso_imballo_kg` | pesate a inizio linea |
| `contametri_inizio` | |
| `peso_tubolare_kg`, `contametri_fine` | alla chiusura |
| `operatore_chiusura_id`, `chiusa_il` | |
| `peso_netto_kg` | **generato**: `peso_con_imballo_kg - peso_imballo_kg - coalesce(peso_tubolare_kg, 0)` |
| `stato` | `aperta` → `chiusa` \| `annullata` |
| `note`, `modificato_da`, `modificato_il` | |

Vincolo: **una sola lavorazione `aperta` per linea** (indice unico parziale su `linea where
stato = 'aperta'`).

**`rotoli_lavorati`** — i figli, uno per rotolo finito.

| Colonna | Note |
|---|---|
| `codice` | unico. `A5000` nel caso A; `A5000/A`, `/B`, `/C` nei casi B e C |
| `suffisso` | null, `A`, `B`, … |
| `lavorazione_id`, `rotolo_grezzo_id` | |
| `peso_kg`, `metri` | metri calcolati dal peso con la formula del manuale, modificabili |
| `cliente` | precompilato dal grezzo |
| `film` (bool), `tipo_film` | |
| `annotazioni_cliente` | il testo che finisce sulla Scheda Rotolo; precompilato dagli eventi |
| `stato` | `pronto` (unico stato in questa fetta; spedizione fuori perimetro) |
| `modificato_da`, `modificato_il` | |

### 2.5 Durante il turno

**`controlli`** — le letture periodiche. `lavorazione_id`, `rilevato_il`, `operatore_id`,
`momento` (`inizio` | `meta` | `fine` | `periodico`), `contametri`, `velocita_m_min`,
`corrente_a`, `tensione_v`, `temp_sgrassatura`, `temp_satina`, `temp_ossido`, `temp_fissaggio`,
`micron`, `gloss_parallelo`, `gloss_perpendicolare`, `note`, `modificato_da`, `modificato_il`.
Tutti i valori numerici nullable: l'operatore compila ciò che ha misurato.

**`eventi`** — ciò che non è una lettura numerica. `lavorazione_id`, `avvenuto_il`,
`operatore_id`, `tipo` (`difetto` | `fermo` | `ripartenza` | `aggiunta_satina` | `giunta_film`
| `taglio_film` | `primi_metri_non_ossidati` | `nota`), `contametri`, `tipo_difetto_id`
(nullable), `causa_fermo` (`guasto` | `bagno` | `cambio_rotolo` | `esterno` | `altro`, nullable),
`litri` (aggiunte), `fermo_id` (per la ripartenza: l'evento fermo che chiude), `durata_min`
(calcolata alla ripartenza e salvata sulla riga del fermo), `descrizione`,
`rotolo_lavorato_id` (nullable), `modificato_da`, `modificato_il`.

Un fermo è **aperto** finché non esiste una ripartenza con `fermo_id` che lo punta.

### 2.6 La vista degli scostamenti

**`controlli_scostamenti`** (vista) — ogni riga di `controlli` affiancata ai min/max della
scheda applicata alla sua lavorazione, con una colonna booleana per campo
(`temp_ossido_fuori`, `velocita_fuori`, …) e `n_fuori` totale. Nulla è salvato: se cambiano i
range della scheda, cambiano i risultati. Regola di confronto: fuori se il valore non è null e
il range esiste e il valore è `< min` o `> max`; per velocità e ampere, fuori se si scosta di
più del 10 % dal valore della scheda (soglia costante nella vista, documentata).

### 2.7 Le regole: tre funzioni SQL

Tutte `security definer`, `set search_path = public`, controllano il ruolo del chiamante
(§5), lavorano in transazione, e sollevano eccezioni **con messaggi in italiano** che il
front-end mostra così come sono.

**`avvia_lavorazione(p_rotolo_grezzo_id, p_scheda_id, p_linea, p_operatore_id,
p_peso_con_imballo, p_peso_imballo, p_contametri_inizio, p_pianificazione_id)`**
- il grezzo deve essere `grezzo` (altrimenti: "Il rotolo A5000 è già in lavorazione" /
  "è esaurito");
- nessuna lavorazione `aperta` sulla linea;
- pesi > 0 e imballo < con imballo;
- crea la lavorazione `aperta`, mette il grezzo `in_lavorazione`, aggancia la riga di
  pianificazione se passata; restituisce l'id.

**`chiudi_lavorazione(p_lavorazione_id, p_operatore_id, p_peso_tubolare, p_contametri_fine,
p_figli jsonb, p_kg_residui)`**
- la lavorazione deve essere `aperta`;
- `p_figli` è un array di `{peso_kg, cliente, film, tipo_film, annotazioni_cliente}` con
  almeno un elemento;
- netto = con imballo − imballo − tubolare; la somma dei pesi dei figli + residuo non può
  superare il netto oltre una tolleranza del 2 % ("La somma dei pesi supera il netto di X kg");
- **regola dei suffissi**: il codice è `n_prog` senza suffisso (caso A) **solo se** c'è un
  solo figlio, nessun residuo **e** il grezzo non ha figli da lavorazioni precedenti. In ogni
  altro caso i codici sono `n_prog/A`, `/B`, …; se il grezzo ha già figli (secondo giro di un
  caso C), le lettere continuano da dove erano arrivate (es. residuo di `A5000/A` lavorato
  per intero → `A5000/B`);
- crea i `rotoli_lavorati`, chiude la lavorazione, e mette il grezzo `esaurito` se
  residuo = 0, altrimenti `grezzo` con `kg_residui = p_kg_residui`;
- restituisce i codici generati.

**`annulla_lavorazione(p_lavorazione_id, p_operatore_id)`**
- ammessa solo se `aperta` **e** senza controlli né eventi ("Ci sono già 3 controlli
  registrati: la lavorazione non si può annullare, chiudila");
- lavorazione → `annullata`, grezzo → `grezzo`, pianificazione sganciata.

La **ripartenza** dopo un fermo non è una RPC: è un inserimento in `eventi` di tipo
`ripartenza` con `fermo_id`; un trigger calcola `durata_min` sulla riga del fermo.

### 2.8 Realtime

Publication `supabase_realtime` su `lavorazioni`, `controlli`, `eventi`. Nient'altro.

### 2.9 Fuori perimetro (di proposito)

Foto, note vocali, spedizione, bagni, certificato di conformità, KPI, magazzino a posizioni
fisiche, modifica delle schede da ufficio, anagrafiche clienti/fornitori, ruoli oltre
operatore/capoturno/ufficio, storico delle modifiche (bastano `modificato_da/il`).

## 3. Flussi sul tablet (`reparto.html`)

### 3.1 Regole di ergonomia

Tasti alti ≥ 56 px; elenchi fino a 8 voci come **bottoni**, mai `<select>`; campi numerici
con `inputmode="decimal"`; ogni flusso in **massimo tre schermate**; "Indietro" sempre in alto
a sinistra; una sola azione principale per schermata, grande, in basso a destra; contrasto
alto, testo ≥ 18 px; orientamento orizzontale (1024×768 come riferimento, funziona anche a
768×1024).

### 3.2 Chi sei

In alto a destra, sempre visibile, il nome dell'operatore attivo (memorizzato in
`localStorage`, con try/catch). Un tap apre la griglia dei nomi da `operatori` attivi,
nell'`ordine` impostato dall'ufficio. Nessuna password. Ogni scrittura porta `operatore_id`.

### 3.3 Hub

- **Linea libera**: tasto grande **"Avvia rotolo"**; sotto, "In programma questa settimana"
  da `pianificazione` (settimana corrente), nell'ordine dell'ufficio, con il primo non ancora
  lavorato evidenziato.
- **Lavorazione in corso**: banner `A5000 · OX Naturale 5 my · avviato 08:12 da Mario ·
  ultimo controllo 45 min fa · 3.200 m`. Quattro tasti: **Controllo**, **Evento**,
  **Chiudi rotolo**, e **Fermo** (rosso, sempre visibile, non dietro un sottomenù).
  Se l'ultimo controllo è più vecchio di `SOGLIA_CONTROLLO_MIN` (costante in `comune.js`,
  iniziale 30) il banner cambia colore. Nessuna notifica, nessun suono.
- **Fermo aperto**: il banner mostra "FERMO da 12 min · guasto" e il tasto Fermo diventa
  **Ripartenza**.

### 3.4 Avvia rotolo — 3 schermate

1. **Quale rotolo**: i grezzi in programma come bottoni (numero, lega, dimensioni, kg);
   sotto "Cerca altro numero" (campo testo + elenco dei `grezzo` che iniziano così).
   I rotoli `in_lavorazione` o `esaurito` non compaiono.
2. **Quale scheda**: le schede **compatibili** (spessore e larghezza del grezzo dentro i
   min/max), ordinate per micron, con velocità, ampere e micron in evidenza. Tap → riquadro
   con i parametri di riferimento per vasca. "Mostra tutte" toglie il filtro.
3. **Pesate**: peso con imballo, peso imballo → netto provvisorio calcolato a vista;
   contametri iniziale. **"Avvia"** → `avvia_lavorazione` → hub in stato "in corso".

### 3.5 Controllo — 1 schermata

`momento` proposto: il primo controllo della lavorazione è `inizio`, poi `periodico`; `meta` e
`fine` si toccano a mano. Campi in un'unica pagina scorrevole, per zona: *linea* (contametri,
velocità, corrente, tensione), *bagni* (quattro temperature), *qualità* (micron, gloss ∥, ⊥).
Ogni campo ha come `placeholder` il valore del controllo precedente. Se un valore esce dal
min/max della scheda applicata il campo si colora subito (funzione pura `fuoriRange` in
`comune.js`, la stessa regola della vista, solo per il colore). Salva → "Salvato ✓" → hub.

### 3.6 Evento — 2 schermate

1. **Tipo**: Difetto · Fermo · Aggiunta satina · Giunta film · Taglio film · Primi metri non
   ossidati · Nota.
2. **Dettaglio**:
   - *Difetto*: `tipi_difetto` come bottoni; scelto uno, compaiono causa probabile e azione;
     contametri; descrizione facoltativa.
   - *Fermo*: causa (bottoni); ora = adesso, modificabile. Resta aperto.
   - *Ripartenza* (dall'hub, se c'è un fermo aperto): conferma con l'avviso "Il tratto di
     nastro dalla sgrassatura all'uscita dell'ossido va scartato"; salva l'evento con `fermo_id`.
   - *Aggiunta satina*: litri. *Giunta film*, *Taglio film*, *Primi metri non ossidati*:
     contametri. *Nota*: testo.

### 3.7 Chiudi rotolo — 3 schermate

1. **Pesata finale**: peso tubolare, contametri finale → netto reale a vista; se
   `|netto − peso_bolla| / peso_bolla > 3 %` compare "Differenza dalla bolla: −280 kg" in
   evidenza (soglia costante `SOGLIA_BOLLA_PCT`).
2. **Come è stato diviso**: bottoni 1 · 2 · 3 · 4 rotoli; "È rimasto un residuo grezzo?"
   sì/no → kg. Per ogni figlio: peso, cliente (precompilato), film sì/no e tipo,
   **annotazioni per il cliente precompilate** dagli eventi della lavorazione (funzione pura
   `annotazioniDaEventi`: giunte film ai metri X, difetti ai metri Y, primi metri non
   ossidati, tagli film), modificabili. Il totale pesi + residuo si confronta con il netto e
   il tasto "Avanti" resta disabilitato se supera la tolleranza.
3. **Conferma**: riepilogo dei codici che verranno generati (calcolati a vista con la stessa
   regola `codiciFigli` di `comune.js`; la verità la dà la RPC). **"Chiudi lavorazione"** →
   `chiudi_lavorazione` → schermata con un tasto **Stampa** per ogni Scheda Rotolo (apre
   `stampa.html?tipo=rotolo&codice=…` in una nuova scheda). Hub → linea libera.

### 3.8 Capoturno

Se l'operatore selezionato ha `ruolo = capoturno`, nell'hub compare **"Ultimi controlli"**:
i controlli della lavorazione aperta, con possibilità di correggere un valore. La policy RLS
permette a `reparto` l'update solo su righe di lavorazioni `aperta`; il front-end mostra il
tasto solo al capoturno.

### 3.9 Salvataggio

Ogni scrittura passa da `salva()` in `comune.js`: mostra "Salvato ✓" o "In attesa di rete…
riprovo" con ritentativi (1 s, 3 s, 10 s, poi ogni 30 s) finché non riesce; il tasto che ha
lanciato la scrittura resta disabilitato. Nessuna coda persistente. Se la pagina si chiude con
una scrittura in attesa, al riavvio compare "Un dato non è stato salvato" con i valori
(tenuti in `sessionStorage`) da reinserire.

## 4. Vista ufficio (`ufficio.html`)

Login Supabase Auth (email + password, utenza `ufficio`). Tab orizzontali; tabelle dense con
filtri in testa; **"Esporta Excel"** su ogni tabella (SheetJS da CDN, come l'HR). Anomalie e
KPI **non** sono in questa fetta.

### 4.1 Magazzino grezzi
Tabella di `rotoli_grezzi` con filtro stato (default `grezzo` + `in_lavorazione`).
**"Nuovo rotolo"**: form con `n_prog` proposto e i campi §2.2. **"Stampa scheda grezzo"**
(`stampa.html?tipo=grezzo&n_prog=…`). Modifica ammessa finché lo stato è `grezzo`.

### 4.2 Pianificazione
Una settimana per volta (← →). Sinistra: grezzi disponibili. Destra: sequenza della settimana;
aggiungi con un click, scegli la scheda prevista (elenco filtrato per compatibilità), scrivi
suddivisione e nota, riordina con ▲▼. Le righe con `lavorazione_id` compilato restano visibili
barrate.

### 4.3 Live
Sola lettura, realtime. Riquadro per linea: stato, rotolo, scheda, operatore, avvio, metri
all'ultimo controllo, ultimo controllo con i campi fuori range in rosso (da
`controlli_scostamenti`), fermo aperto. Sotto, il nastro cronologico di controlli ed eventi
della giornata.

### 4.4 Lavorazioni
Lista con filtri (periodo, rotolo, scheda, operatore, stato). Dettaglio = **Scheda di
Produzione digitale**: intestazione, tabella controlli in ordine di contametri con scostamenti
evidenziati, cronologia eventi, rotoli lavorati generati. **"Stampa Scheda di Produzione"**
(`stampa.html?tipo=produzione&id=…`). L'ufficio può correggere controlli ed eventi anche di
lavorazioni chiuse: ogni correzione scrive `modificato_da = 'ufficio'`, `modificato_il`.

### 4.5 Rotoli lavorati
Tabella dei figli (codice, peso, metri, cliente, film, annotazioni, lavorazione). Filtri per
cliente e periodo. **"Stampa Scheda Rotolo"** per riga.

### 4.6 Impostazioni
`operatori`: aggiungi, rinomina, ruolo, attivo, ordine. **"Esporta tutto"**: scarica un JSON
per tabella (backup manuale a portata di mano).

### 4.7 Pagine di stampa (`stampa.html`)
Tre tipi: `grezzo`, `rotolo`, `produzione`. HTML con `@media print`, A4 verticale. Il layout
riprende la disposizione dei contenuti descritta nelle procedure (§4.1 e §4.2 di
`Procedure Produzione.docx`); non esiste un file del modulo cartaceo da copiare: si aggiusta
dopo la prima stampa in reparto. Sulla Scheda Rotolo **non compaiono parametri di processo**
(principio delle procedure): solo anagrafica, pesi, metri, annotazioni per il cliente.

## 5. Architettura, sicurezza, file

### 5.1 I tre pezzi
1. **Database**: progetto Supabase nuovo `Overland Produzione`, regione eu-central-1, dedicato.
   Schema in `sql/` come file numerati; `000_setup.sql` crea tutto; le fasi successive
   aggiungono `NNN_<data>_<voce>.sql`. Ogni migrazione ha verifiche preliminari e finali.
2. **Front-end statico**: HTML/CSS/JS con **moduli ES nativi** (`<script type="module">`,
   `import`/`export`). Nessun bundler, nessun `package.json`. `supabase-js` da CDN con SRI,
   versione pinnata. Un file per schermata, ciascuno sotto le 300 righe.
3. **Pubblicazione**: repository **privato** su GitHub con GitHub Pages (piano Pro),
   `git push` su `main` = produzione. **Niente cache-buster**: Pages serve con
   `max-age=600`, la modifica arriva entro dieci minuti. Nel repo privato stanno anche
   `sql/` e tutti i `.md`.

### 5.2 Struttura dei file
```
Piattaforma Produzione/            (root del repo)
  index.html                       due tasti: Reparto · Ufficio
  reparto.html  ufficio.html  stampa.html
  css/    base.css  reparto.css  ufficio.css  stampa.css
  js/
    comune.js                      client Supabase, costanti, salva(), helper DOM/date,
                                   funzioni pure: metriDaKg, pesoNetto, codiciFigli,
                                   fuoriRange, prossimoNProg, annotazioniDaEventi
    reparto/  hub.js  avvio.js  controllo.js  evento.js  chiusura.js
    ufficio/  magazzino.js  pianificazione.js  live.js
              lavorazioni.js  rotoli.js  impostazioni.js
    stampa.js
  sql/    000_setup.sql  seed_schede.sql  seed_difetti.sql  test_regole.sql
  tests/  test-comune.mjs  test-dom-ids.mjs
  tools/  importa_schede.py
  docs/   riferimenti/ (i tre .docx)  superpowers/specs/  superpowers/plans/
  CLAUDE.md  PIANO_funzionalita.md  STATO_*.md
```

### 5.3 Sicurezza
Due utenti Supabase Auth: `ufficio` (PC, condiviso fra le persone dell'ufficio) e `reparto`
(il tablet, sessione persistente). `utenti_app(uid, ruolo)` li mappa; `ruolo_utente()`
(`security definer`, `stable`) la legge.

| Tabelle | select | insert | update | delete |
|---|---|---|---|---|
| operatori, schede_lavorazione, tipi_difetto, rotoli_grezzi, pianificazione | autenticati | ufficio | ufficio | ufficio (rotoli_grezzi: solo se `grezzo` e senza lavorazioni) |
| lavorazioni | autenticati | **solo RPC** | ufficio (note); reparto: nessuno diretto | nessuno |
| controlli, eventi | autenticati | ufficio, reparto | ufficio sempre; reparto solo se la lavorazione è `aperta` | nessuno |
| rotoli_lavorati | autenticati | **solo RPC** | ufficio | nessuno |
| utenti_app | nessuno via API | — | — | — |
| tutto | anonimo: niente | | | |

Le RPC verificano `ruolo_utente() in ('ufficio','reparto')`. La chiave publishable nel codice
è pubblica per design: il muro è RLS. L'`operatore` selezionato sul tablet è un dato, non
un'identità.

### 5.4 Backup
"Esporta tutto" in Impostazioni (JSON per tabella). Il piano gratuito Supabase non ha backup
automatici: il passaggio al piano Pro è la prima spesa consigliata se il pilota regge.
Prima di ogni migrazione in produzione, il meccanismo di esecuzione delle fasi fa un backup
completo via connettore (come `fase-hr`).

### 5.5 Gestione errori
`salva()` gestisce ritentativi e indicatore. Gli errori definitivi (vincoli, RPC) portano un
messaggio in italiano scritto nella RPC (`raise exception 'La somma dei pesi supera il netto
di % kg', …`) e il front-end lo mostra così com'è. Gli errori inattesi mostrano "Qualcosa non
ha funzionato, riprova; se continua avvisa l'ufficio" e finiscono in `console.error`.

### 5.6 Test
1. **Funzioni pure** — `node tests/test-comune.mjs` su `comune.js`: `codiciFigli` (caso A
   senza suffisso; B e C con lettere; continuazione lettere al secondo giro), `pesoNetto`,
   `metriDaKg` (esempi del manuale: 1080×0,45 → 1,31 kg/m; 7000 kg di 2×1500 → 864 m),
   `fuoriRange` (null, senza range, dentro, sotto, sopra, ±10 % su velocità/ampere),
   `prossimoNProg` (A5000 → A5001; lettere diverse; vuoto), `annotazioniDaEventi`.
2. **Regole del DB** — `sql/test_regole.sql`: `begin; … rollback;` con `do $$ … assert … $$`:
   crea un rotolo di collaudo `COLLAUDO-0001`, avvia, chiude nei casi A, B, C, verifica
   codici e stati; prova le guardie (avvio doppio sulla linea, avvio di un `in_lavorazione`,
   chiusura con pesi oltre tolleranza, annullo con controlli presenti, ripartenza che
   calcola la durata). Si esegue via connettore; non lascia dati.
3. **Browser** — `.claude/launch.json` con `python -m http.server 8000`; pannello browser a
   1024×768 (tablet) e desktop: nessun errore in console, i flussi con il rotolo di collaudo.
4. **`tests/test-dom-ids.mjs`** — ogni id cercato dal JS esiste nell'HTML corrispondente.

### 5.7 Rotolo di collaudo
Un `rotoli_grezzi` con `n_prog = 'COLLAUDO-0001'` e `note = 'ROTOLO DI COLLAUDO - non
cancellare'`: le viste ufficio lo nascondono di default (filtro "mostra collaudo"), il tablet
lo mostra solo se l'operatore selezionato si chiama "Collaudo". Serve alle prove in
produzione senza sporcare i dati veri.

## 6. Fasi di realizzazione (indice per il piano)

Il piano di implementazione (`docs/superpowers/plans/`) dettaglierà voce per voce. Ordine:

| Fase | Contenuto | Risultato verificabile |
|---|---|---|
| **0 — Fondamenta** | progetto Supabase, `000_setup.sql` completo (tabelle, vista, RPC, RLS, realtime), seed schede e difetti, `comune.js` con funzioni pure e test, `index.html`, repo privato + Pages, login ufficio e reparto, `test_regole.sql` verde | l'app pubblicata mostra i due tasti e il login; il DB passa i test delle regole |
| **1 — Magazzino e pianificazione** | tab Magazzino grezzi con stampa scheda grezzo; tab Pianificazione; tab Impostazioni (operatori, esporta tutto) | l'ufficio inserisce i grezzi della settimana e compone il programma |
| **2 — Avvio da tablet** | hub, scelta operatore, flusso Avvia rotolo; tab Live in lettura | l'operatore avvia un rotolo e l'ufficio lo vede in Live |
| **3 — Controlli ed eventi** | flussi Controllo, Evento, Fermo/Ripartenza; scostamenti in Live; capoturno | il turno si registra dal tablet, gli scostamenti sono visibili in ufficio |
| **4 — Chiusura e stampe** | flusso Chiudi rotolo con casi A/B/C; `stampa.html` rotolo e produzione; tab Lavorazioni e Rotoli lavorati con correzioni ufficio | ciclo bobina completo end-to-end, schede stampate |
| **Pilota** | due operatori nominati, quattro settimane, stop carta per la Scheda di Produzione dalla data X | criterio §1 |

Fermata obbligatoria dopo la Fase 4: il pilota. Il sotto-progetto 2 (Anomalie, KPI) si
progetta con i dati del pilota davanti.

## 7. Condizioni che dipendono dal committente

- Nominare i due operatori del pilota e la data di stop carta per la Scheda di Produzione
  prima della Fase 2.
- Tablet fissato in linea con la pagina `reparto.html` aperta e l'utenza `reparto` connessa.
- Attivare GitHub Pro per Pages su repo privato (Fase 0).
- Decidere se e quando passare Supabase al piano Pro (backup automatici).

## 8. Domande chiuse durante il design

| Domanda | Decisione |
|---|---|
| Tre pesi (imballo, tubolare, netto)? | Sì, tutti e tre; il tubolare è nullable |
| Caso C con un solo figlio: codici? | residuo resta `A5000`, il lavorato è `A5000/A` |
| Promemoria controllo? | Sì, solo colore sul banner, soglia costante 30 min |
| Layout stampe da un modulo esistente? | No: si disegna dalle procedure e si aggiusta dopo la prima stampa |
| Hosting | Repo privato + GitHub Pages (GitHub Pro) |
| Rapporto con l'ERP Nastri | Nessuno: accantonato, si riusano solo i concetti |
| Offline | No: tablet e Wi-Fi esistono; solo ritentativo con indicatore |
