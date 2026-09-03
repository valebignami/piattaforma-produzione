# Piattaforma Produzione Overland — Sotto-progetto 1: Ciclo bobina

**Data:** 2026-09-03 · **Revisione:** 4 · **Stato: APPROVATO** — quattro giri di revisione
indipendente (`docs/superpowers/reviews/`), verdetto finale "nessun bloccante". Le cinque
annotazioni non bloccanti del giro 4 vanno recepite nel piano di implementazione.
**Committente e autore delle decisioni:** V. Bignami · **Perimetro:** Linea 1500 (Impiantone)

## 0. In una frase

La Scheda di Produzione della Linea 1500 diventa digitale: l'ufficio inserisce i rotoli grezzi
e la settimana produttiva, l'operatore da tablet avvia il rotolo, registra controlli ed eventi,
lo chiude nei casi A/B/C, e l'ufficio stampa le Schede Rotolo. Tutto su un unico database che
l'ufficio vede in tempo reale.

## 1. Perché questa fetta per prima

Il progetto completo (`docs/riferimenti/Progetto_Piattaforma_Produzione.docx`) ha quattordici
moduli. È stato scomposto in cinque sotto-progetti, ognuno con il proprio ciclo
spec → piano → implementazione:

1. **Ciclo bobina** (questo documento) — Fasi 0, 3, 4, 5, 6 del documento di progetto
2. Vista ufficio completa — Anomalie, KPI (Fase 7)
3. Migrazione delle due app standalone — Schede di Lavorazione, Checklist (Fasi 1, 2)
4. Bagni (Fase 8)
5. Qualità/certificato, difetti avanzati, fermi, manutenzione, depurazione (Fasi 9, 10)

Il ciclo bobina è l'unico che sostituisce carta oggi in uso e produce il dato attorno a cui
tutti gli altri moduli si agganciano.

### Obiettivo misurabile del sotto-progetto

La Scheda di Produzione della Linea 1500 è digitale, usata ogni giorno da tutti gli operatori,
e resta in uso per quattro settimane consecutive senza tornare alla carta. Se dopo tre mesi
dall'avvio del pilota questo non è avvenuto, ci si ferma e si ripensa prima di proseguire.

### Decisioni di contesto prese in fase di design

- L'**ERP Nastri** (`Desktop/ERP`, Django) è accantonato: la piattaforma possiede la propria
  anagrafica rotoli. Dall'ERP si riusano solo i concetti.
- Le due app standalone esistenti **non** si migrano in questa fetta. Le schede si importano
  come dati di riferimento in sola lettura.
- Tablet e Wi-Fi in reparto **esistono già**: niente offline, niente PWA, niente coda
  persistente.
- Semplicità e manutenibilità prevalgono su tutto: zero toolchain, un file per schermata,
  regole in un solo posto (Postgres), poche tabelle con nomi italiani.

## 2. Modello dati

Principio: **il rotolo è l'entità centrale, la lavorazione è l'evento.** Nove tabelle più una
di servizio, quattro funzioni SQL con tutte le regole di stato, tre viste.

Convenzioni: chiavi `uuid default gen_random_uuid()`, `creato_il timestamptz default now()`,
nomi in italiano, `snake_case`. Le colonne `modificato_da` (`'ufficio'` | `'reparto'`) e
`modificato_il` esistono su **tutte** le tabelle di dati (`rotoli_grezzi`, `pianificazione`,
`lavorazioni`, `rotoli_lavorati`, `controlli`, `eventi`) e sono scritte **da un trigger**
`before insert or update` con `ruolo_utente()` e `now()`; il client non ha grant su di esse.

### 2.1 Anagrafiche

**`operatori`** — `id`, `nome` (unico), `ruolo` (`operatore` | `capoturno`), `attivo`.
Sul tablet in ordine alfabetico. Scritta dall'ufficio.

**`schede_lavorazione`** — le ~60 schede storiche di
`Desktop/Schede di lavorazione/Schede Impianto 1500.xlsx` (fogli OX NATURALE e OX SATINATO).
`id`, `lavorazione` (es. "OX Naturale 5 micron"), `tipo` (`naturale` | `satinato`), `micron`,
`finitura`, `lega`, `spessore_min`, `spessore_max`, `larghezza_min`, `larghezza_max`,
`velocita_m_min`, `ossido_ampere`, per le vasche `sgrassatura`, `satina`, `ossido`, `fissaggio`:
`<vasca>_prodotto`, `<vasca>_temp`, `<vasca>_temp_min`, `<vasca>_temp_max`; `note`.
Sola lettura in questa fetta; import con `tools/importa_schede.py` → `sql/seed_schede.sql`.
Regole: "da 961 a 1080" → min/max; valore singolo → min = max; il nitrico non ha set point nel
manuale e non si importa. La tolleranza sul micron **non** è una colonna: è una costante della
vista (§2.6).

**`tipi_difetto`** — il catalogo del manuale: `codice`, `nome`, `causa_probabile`, `azione`,
`ordine`. Seed di ~10 righe.

**`utenti_app`** — `uid` (= `auth.users.id`), `ruolo` (`ufficio` | `reparto`). Due righe,
nessun accesso via API.

### 2.2 Il rotolo grezzo

**`rotoli_grezzi`**

| Colonna | Note |
|---|---|
| `n_prog` | testo, unico, es. `A5000`. Lo digita l'ufficio; l'app propone **massimo numero mai usato con la stessa lettera + 1**, considerando solo i codici nel formato `lettera + cifre` (i `COLLAUDO-000x` sono ignorati). *Scostamento dichiarato* da procedure §3.3 ("ultimo numero attivo a magazzino"): con il vincolo di unicità la regola delle procedure proporrebbe numeri già usati |
| `fornitore`, `rif_bolla` | testo; **non visibili al reparto** (§5.3) |
| `cliente` | testo con autocompletamento; nessuna anagrafica |
| `lega`, `finitura`, `spessore_mm`, `larghezza_mm` | dimensioni > 0 |
| `peso_bolla_kg` | dichiarato dal fornitore |
| `kg_residui` | **kg netti di alluminio, tubolare escluso.** Null finché mai lavorato; dopo un caso C il residuo stimato; `0` quando `esaurito`. L'ufficio può correggerlo finché il rotolo è `grezzo` |
| `data_arrivo`, `posizione`, `note`, `modificato_da`, `modificato_il` | |
| `stato` | `grezzo` → `in_lavorazione` → `esaurito`; da `in_lavorazione` torna a `grezzo` (caso C o annullo) |
| `kg_al_metro` | **generato**: `larghezza_mm * spessore_mm * 2.7 / 1000` (formula del manuale) |
| `metri_stimati` | **generato**, `integer`: `round(coalesce(kg_residui, peso_bolla_kg) / (larghezza_mm * spessore_mm * 2.7 / 1000))::integer`. La formula è **ripetuta per esteso** perché Postgres non ammette una colonna generata definita su un'altra colonna generata. Vale 0 per un esaurito |

Il **caso C** non crea un nuovo rotolo: è la stessa riga che torna `grezzo` con `kg_residui`
aggiornati (procedure §8.3). Mentre il rotolo è `in_lavorazione` nessuno può modificarne
dimensioni o `kg_residui` (policy §5.3): i valori letti all'avvio valgono fino alla chiusura,
senza snapshot.

**`rotoli_grezzi_reparto`** — vista `security_invoker = false` (proprietario `postgres`) con
tutte le colonne **tranne** `fornitore` e `rif_bolla`. **Ogni lettura del grezzo lato reparto
— hub, avvio, chiusura, e i join da `pianificazione` e `lavorazioni` — passa da questa vista**;
il front-end del reparto non interroga mai `rotoli_grezzi`.

### 2.3 La pianificazione

**`pianificazione`** — `id`, `settimana` (date, il lunedì), `posizione` (int),
`rotolo_grezzo_id`, `scheda_lavorazione_id` (nullable), `suddivisione_prevista`, `note`,
`modificato_da`, `modificato_il`. Unicità su (`settimana`, `posizione`): lo stesso residuo può
comparire due volte nella stessa settimana (lunedì e giovedì). "Già lavorata" =
`exists (select 1 from lavorazioni l where l.pianificazione_id = p.id and l.stato <> 'annullata')`.

### 2.4 La lavorazione (= Scheda di Produzione)

**`lavorazioni`** — una riga per ogni entrata in linea, anche se produce tre rotoli finiti.

| Colonna | Note |
|---|---|
| `rotolo_grezzo_id`, `pianificazione_id` (nullable) | |
| `linea` | `check in ('1500','750')`, default `1500`; nessuna schermata la sceglie |
| `scheda_lavorazione_id` | |
| `velocita_prevista`, `ampere_previsti`, `micron_previsti` | snapshot dalla scheda all'avvio (procedure §4.4, §5.1) |
| `operatore_avvio_id`, `avviata_il` | |
| `peso_con_imballo_kg` (> 0), `peso_imballo_kg` (**≥ 0**, < con imballo), `contametri_inizio` | |
| `peso_tubolare_kg` | alla chiusura; **≥ 0** ("senza tubolare" = 0); **null nel caso C** |
| `contametri_fine`, `operatore_chiusura_id`, `chiusa_il` | |
| `kg_residui_dichiarati` | `not null default 0`: il residuo dichiarato in **questa** chiusura (0 nei casi A e B); resta come storia |
| `stato` | `aperta` → `chiusa` \| `annullata` |
| `stampata_il` | quando l'ufficio ha premuto Stampa da "Ultime chiusure" (§4.3); null = da stampare |
| `motivo_annullo`, `note`, `modificato_da`, `modificato_il` | |

Vincoli:
- `create unique index … on lavorazioni (linea) where stato = 'aperta'`;
- **invariante del caso C nel database, non solo nella RPC**:
  `check (stato <> 'chiusa' or (kg_residui_dichiarati > 0) = (peso_tubolare_kg is null))` —
  il tubolare null è il segno del caso C, e nessun update diretto può trasformare un caso C in
  un caso A.

**`lavorazioni_riepilogo`** — vista: ogni lavorazione con `kg_disponibili` = con imballo −
imballo − tubolare (null nel caso C), `kg_figli` = Σ netto dei figli, `n_figli`, e
`kg_scarto` = `kg_disponibili − kg_figli − kg_residui_dichiarati` (null nel caso C). Nulla di
memorizzato: se l'ufficio corregge un peso, lo scarto si aggiorna da solo. Se `kg_scarto` è
negativo (il bilancio ammette +2 %), la UI lo etichetta **"eccedenza rispetto al peso di
partenza"**, non "scarto".

**`rotoli_lavorati`** — i figli, avvolti su un nuovo tubolare (tre pesi, procedure §4.1).

| Colonna | Note |
|---|---|
| `codice` | unico. `A5000` nel caso A puro; `A5000/A`, `/B`, … altrimenti (§2.7) |
| `lavorazione_id`, `rotolo_grezzo_id` | |
| `peso_lordo_kg`, `peso_tubolare_kg` (≥ 0) | pesati all'avvolgitore |
| `peso_netto_kg` | **generato**: `peso_lordo_kg - peso_tubolare_kg` |
| `metri` | se non inserito, la RPC lo calcola: `round(peso_netto_kg / kg_al_metro)` |
| `cliente`, `film` (bool), `tipo_film` | |
| `annotazioni_cliente` | il testo della Scheda Rotolo; precompilato dagli eventi (§3.7) |
| `modificato_da`, `modificato_il` | |

### 2.5 Durante il turno

**`controlli`** — `lavorazione_id`, `rilevato_il`, `operatore_id`, `momento` (`inizio` | `meta`
| `fine` | `periodico`), `contametri`, `velocita_m_min`, `corrente_a`, `tensione_v`,
`temp_sgrassatura`, `temp_satina`, `temp_ossido`, `temp_fissaggio`, `micron`,
`gloss_parallelo`, `gloss_perpendicolare`, `note`, `modificato_da`, `modificato_il`.

**`eventi`** — `lavorazione_id`, `avvenuto_il`, `operatore_id`, `tipo` (`difetto` | `fermo` |
`ripartenza` | `aggiunta` | `giunta_film` | `taglio_film` | `primi_metri_non_ossidati` | `nota`),
`contametri`, `tipo_difetto_id`, `causa_fermo` (`guasto` | `bagno` | `cambio_rotolo` | `esterno`
| `altro`), `prodotto` e `litri` (aggiunta), `fermo_id` (ripartenza), `durata_min` (sulla riga
del fermo, **scritta solo dal trigger**, nessun grant al client), `metri_scarto` (ripartenza;
proposto **100 m, valore prudenziale** = lunghezza dell'intera linea 1500 secondo il manuale,
mentre il tratto da scartare è una sua parte: da tarare dopo il pilota), `descrizione`,
`modificato_da`, `modificato_il`.

**Fermo aperto** = evento `fermo` senza alcuna `ripartenza` che lo punti. Unica definizione.
- `create unique index on eventi (fermo_id) where fermo_id is not null`;
- **due trigger distinti**, per evitare che un trigger si richiami da solo:
  1. `before insert or update on eventi`, **solo se `new.tipo = 'fermo'`**: se esiste una
     ripartenza che lo punta, assegna `new.durata_min` dalla sua `avvenuto_il` (assegnamento su
     `new`, nessun `update`: non innesca nulla);
  2. `after insert or update on eventi`, **solo se `new.tipo = 'ripartenza'`**: verifica che
     `fermo_id` punti un evento `tipo = 'fermo'` della **stessa** lavorazione con `avvenuto_il`
     precedente ("La ripartenza non può precedere il fermo"), poi `update eventi set durata_min
     = … where id = new.fermo_id` — che fa scattare il trigger 1 sulla riga del fermo, una volta
     sola, senza ricorsione perché il trigger 2 non reagisce alle righe di tipo `fermo`.
  Così una correzione d'ufficio su uno qualunque dei due orari aggiorna la durata.

### 2.6 La vista degli scostamenti

**`controlli_scostamenti`** — ogni `controllo` con i riferimenti (range dalla scheda **viva**
per le temperature; snapshot della lavorazione per velocità, ampere, micron) e una colonna
booleana per campo, più `n_fuori`. Regole, con le costanti nella vista:
- temperature: fuori se valore non null, range presente, e `< min` o `> max`;
- `velocita_m_min`, `corrente_a`, `micron`: fuori se `|valore − previsto| / previsto > 0,10`
  (micron: tolleranza ±10 % decisa dal committente; tarabile in un punto solo);
- `gloss_perpendicolare` fuori se `≥ 40`, `gloss_parallelo` fuori se `≥ 60` (il manuale dice
  "minore di"), **solo se la scheda applicata ha `tipo = 'satinato'`** (decisione del
  committente 2026-09-03: sui naturali il gloss è alto per natura e non si segnala);
- `tensione_v`: nessun riferimento.
Le stesse costanti stanno in `comune.js` per il colore immediato sul tablet: duplicazione
**accettata e dichiarata**, coperta dal test di coerenza (§5.6).

### 2.7 Le regole: quattro funzioni SQL

Tutte `security definer`, `set search_path = public`, `revoke execute … from anon, public`,
`grant execute … to authenticated`. Prima istruzione:
`if coalesce(ruolo_utente(), '') not in ('ufficio','reparto') then raise exception 'Non
autorizzato'; end if;`. Orari: `if coalesce(ruolo_utente(),'') <> 'ufficio' then p_avviata_il
:= now(); end if;` (idem `p_chiusa_il`): il reparto non può falsificare l'orario e nessuna
chiamata legittima fallisce. Messaggi d'errore **in italiano**, mostrati così come sono.

**`avvia_lavorazione(p_rotolo_grezzo_id, p_scheda_id, p_operatore_id, p_peso_con_imballo,
p_peso_imballo, p_contametri_inizio, p_pianificazione_id default null, p_avviata_il default now())`**
- `select … from rotoli_grezzi where id = … for update`;
- grezzo `grezzo` ("Il rotolo A5000 è già in lavorazione" / "è esaurito");
- `p_peso_con_imballo > 0`, **`p_peso_imballo ≥ 0`**, imballo < con imballo;
- crea la lavorazione `aperta` con lo snapshot, grezzo → `in_lavorazione`; l'indice unico
  respinge una seconda apertura ("C'è già una lavorazione aperta sulla linea 1500").

**`chiudi_lavorazione(p_lavorazione_id, p_operatore_id, p_peso_tubolare, p_contametri_fine,
p_figli jsonb, p_kg_residui default 0, p_chiusa_il default now())`**
- lavorazione `aperta`, `for update`;
- **nessun fermo aperto** ("C'è un fermo aperto: registra la ripartenza prima di chiudere");
- `p_figli`: array di `{peso_lordo_kg, peso_tubolare_kg, metri (nullable), cliente, film,
  tipo_film, annotazioni_cliente}`, **almeno un elemento**, lordo > tubolare ≥ 0;
- `p_kg_residui ≥ 0`. Se `> 0` (caso C) allora `p_peso_tubolare` **deve essere null**; se
  `= 0` allora `p_peso_tubolare` **non null e ≥ 0** (0 = coil senza tubolare);
- **bilancio**: `Σ(figli.netto) + p_kg_residui ≤ (peso_con_imballo − peso_imballo −
  coalesce(p_peso_tubolare, 0)) × 1,02` — "La somma dei pesi supera il disponibile di X kg".
  Nel caso C il tubolare ignoto rende il limite un tetto sicuro;
- **codici**: `n_prog` senza suffisso **solo se** un solo figlio **e** residuo = 0 **e** il
  grezzo non ha figli da lavorazioni precedenti; altrimenti `n_prog/A`, `/B`, … continuando
  dall'ultima lettera usata da quel grezzo;
- crea i figli (metri calcolati se null), chiude con `kg_residui_dichiarati`, grezzo →
  `esaurito` con `kg_residui = 0` se residuo = 0, altrimenti `grezzo` con `kg_residui`;
- restituisce i codici.

**`annulla_lavorazione(p_lavorazione_id, p_operatore_id, p_motivo, p_metri_scarto default 0)`**
- lavorazione `aperta`; `p_motivo` obbligatorio; **nessun fermo aperto** (stessa guardia);
- controlli ed eventi **restano**;
- `0 ≤ p_metri_scarto ≤ metri_stimati` del grezzo ("I metri consumati superano il rotolo");
- lavorazione → `annullata` con `contametri_fine = contametri_inizio + p_metri_scarto` (i
  metri consumati restano derivabili come per ogni altra lavorazione); grezzo → `grezzo`; se
  `p_metri_scarto > 0`: `kg_residui = coalesce(kg_residui, peso_bolla_kg) − p_metri_scarto ×
  kg_al_metro` (il nastro consumato in un avvio fallito non torna a magazzino).

**`registra_lavorazione_completa(p_rotolo_grezzo_id, p_scheda_id, p_operatore_avvio_id,
p_avviata_il, p_peso_con_imballo, p_peso_imballo, p_contametri_inizio, p_controlli jsonb,
p_eventi jsonb, p_operatore_chiusura_id, p_chiusa_il, p_peso_tubolare, p_contametri_fine,
p_figli jsonb, p_kg_residui default 0, p_note default null)`** — riservata all'ufficio
(`ruolo_utente() = 'ufficio'`, altrimenti "Non autorizzato"). Crea la lavorazione **già
`chiusa`** con controlli, eventi e figli in un'unica transazione, con le stesse guardie sui
pesi, sui figli, sul bilancio e sui codici di §2.7, ma **senza** passare dallo stato `aperta`:
così non urta l'indice unico mentre in linea gira il rotolo successivo. Sul grezzo: se è ancora
`grezzo`, ne aggiorna stato e `kg_residui` come farebbe `chiudi_lavorazione`; se nel frattempo
è andato avanti (`in_lavorazione` o `esaurito`), registra comunque la lavorazione e i figli
**senza toccare** stato e `kg_residui`, e restituisce un avviso che la UI mostra ("Il rotolo
è già stato ripreso: controlla i kg residui a magazzino"). I codici `/A`, `/B` seguono la
regola di §2.7 sull'insieme dei figli già esistenti del grezzo, qualunque sia l'ordine
cronologico in cui le lavorazioni sono state registrate. È la strada quando la rete è mancata e
il turno è finito su carta (§4.4).

La **ripartenza** è un insert in `eventi` (tipo `ripartenza`, `fermo_id`, `metri_scarto`).

#### Esempio numerico completo del caso C (fixture di `sql/test_regole.sql` e `test-comune.mjs`)

Grezzo `A5000`, 1500 × 2 mm → `kg_al_metro` 8,1; bolla 6.500 kg → `metri_stimati` = round(802,47) = **802**.
**Primo giro.** Avvio: con imballo 6.540, imballo 45, contametri 100. Lavorati fino a
contametri 600 → 500 m. Un figlio: lordo 4.090, tubolare 40 → netto 4.050.
**Residuo proposto** = `coalesce(kg_residui, peso_bolla_kg) − metri lavorati × kg_al_metro`
= 6.500 − 500 × 8,1 = **2.450 kg** (regola `residuoProposto`, in kg, senza passare dai metri
arrotondati); l'operatore conferma. Tubolare null. Bilancio: 4.050 + 2.450 = 6.500 ≤
(6.540 − 45) × 1,02 = 6.625 ✓. `kg_scarto` (vista) null. Codice: un figlio **ma** residuo > 0 →
**`A5000/A`**. Grezzo → `grezzo`, `kg_residui` 2.450, `metri_stimati` = round(302,47) = **302**.
**Secondo giro.** Avvio: con imballo 2.500, **imballo 0**, contametri 0. Lavorato tutto;
tubolare 60. Un figlio: lordo 2.410, tubolare 40 → netto 2.370. Residuo 0. Bilancio: 2.370 ≤
(2.500 − 0 − 60) × 1,02 = 2.489 ✓. `kg_scarto` = 2.440 − 2.370 − 0 = **70**. Codice: un figlio,
residuo 0, **ma** il grezzo ha già `/A` → **`A5000/B`**. Grezzo → `esaurito`, `kg_residui` 0,
`metri_stimati` 0.

### 2.8 Realtime

Publication su `lavorazioni`, `controlli`, `eventi`.

### 2.9 Fuori perimetro e scelte consapevoli

Fuori: foto, note vocali, spedizione, bagni, certificato, KPI, magazzino a posizioni, modifica
delle schede da ufficio, anagrafiche clienti/fornitori, selezione della linea sul tablet,
stampa dal tablet.
Scelte consapevoli:
- **Nessuno storico dei valori precedenti** alle correzioni d'ufficio: bastano
  `modificato_da/il`. Da riaprire solo se una contestazione lo richiede.
- Le **correzioni d'ufficio ai pesi** dopo la chiusura aggiornano `kg_scarto` (vista) ma **non
  rifanno il bilancio**: si accetta, e la Scheda di Produzione stampata mostra `modificato_il`.
- **Il residuo del caso C è una stima**: l'ufficio lo corregge finché il rotolo è `grezzo`.
- Il **capoturno è una distinzione del solo front-end**.
- Il reparto **vede** clienti, dati tecnici e schede; **non vede** fornitore e riferimento bolla.
- **Nessuna stampa dal tablet**: tutte le schede si stampano dall'ufficio (§4.7, §8).

## 3. Flussi sul tablet (`reparto.html`)

### 3.1 Regole di ergonomia

Tasti ≥ 56 px; elenchi fino a 8 voci come bottoni; `inputmode="decimal"`; massimo tre
schermate per flusso; "Indietro" in alto a sinistra; una sola azione principale per schermata;
testo ≥ 18 px; riferimento 1024 × 768.

### 3.2 Chi sei

Nome dell'operatore attivo in alto a destra (`localStorage`, try/catch). Tap → griglia
alfabetica degli `operatori` attivi. Nessuna password.

### 3.3 Hub

- **Linea libera**: **"Avvia rotolo"**; sotto "In programma questa settimana" (join su
  `rotoli_grezzi_reparto`, già lavorati esclusi, primo evidenziato).
- **Lavorazione in corso**: banner `A5000 · OX Naturale 5 my · avviato 08:12 da Mario · ultimo
  controllo 45 min fa · 3.200 m`. Tasti **Controllo**, **Evento**, **Chiudi rotolo**, **Fermo**
  (rosso, sempre visibile). Colore del banner se l'ultimo controllo è più vecchio di
  `SOGLIA_CONTROLLO_MIN` (**20**, dal manuale). Sotto "Altro…": **"Annulla avvio"** con
  motivo, metri di nastro consumati (default 0) e conferma → `annulla_lavorazione`.
- **Fermo aperto**: "FERMO da 12 min · guasto"; il tasto Fermo diventa **Ripartenza**.

### 3.4 Avvia rotolo — 3 schermate

1. **Quale rotolo**: i grezzi in programma come bottoni; "Cerca altro numero" (da
   `rotoli_grezzi_reparto`; qui compaiono anche i rotoli di collaudo). Un residuo mostra
   "residuo 2.450 kg · 302 m".
2. **Quale scheda**: compatibili per spessore e larghezza, ordinate per micron; tap →
   parametri per vasca; "Mostra tutte".
3. **Pesate**: peso con imballo, peso imballo (**0 ammesso**, residuo già sballato) → netto
   provvisorio; contametri iniziale. **"Avvia"**. Stato in memoria: se la pagina si chiude
   prima, si ricomincia.

### 3.5 Controllo — 1 schermata

`momento` proposto (`inizio` al primo, poi `periodico`; `meta`/`fine` a un tocco). Campi per
zona; `placeholder` = controllo precedente; colore immediato con `fuoriRange` (stesse regole
di §2.6, gloss solo se la scheda è satinata). Salva → "Salvato ✓".

### 3.6 Evento — 2 schermate

1. Difetto · Fermo · Aggiunta · Giunta film · Taglio film · Primi metri non ossidati · Nota.
2. *Difetto*: catalogo come bottoni → causa e azione; contametri; descrizione. *Fermo*: causa,
   ora modificabile. *Ripartenza* (dall'hub): metri di scarto proposti 100, modificabili, con
   "Il tratto dalla sgrassatura all'uscita dell'ossido va scartato". *Aggiunta*: prodotto
   (satina, ammoniaca, altro) e litri. *Giunta/Taglio film*, *Primi metri*: contametri. *Nota*.

### 3.7 Chiudi rotolo — 3 schermate

1. **Pesata finale**: "È rimasto un residuo grezzo?" **sì/no** per primo.
   - *No*: peso tubolare (**0 = "senza tubolare"**), contametri finale → disponibile a vista.
   - *Sì*: contametri finale; **residuo proposto** con `residuoProposto` (in kg, §2.7),
     modificabile, etichettato "stimato"; nessuna pesata del tubolare.
   Riferimento per la differenza: `kg_residui` del grezzo se non null, altrimenti
   `peso_bolla_kg`; oltre `SOGLIA_BOLLA_PCT` (3 %) compare "Differenza dalla bolla / dal residuo
   dichiarato: −280 kg".
2. **Rotoli finiti**: 1 · 2 · 3 · 4. Per figlio: lordo, tubolare → netto; metri (proposti,
   modificabili); cliente; film e tipo; **annotazioni precompilate** da `annotazioniDaEventi`
   — **solo fatti, mai causa o azione**: `Giunta film a 1.250 m. Graffi a 2.100 m. Primi 15 m
   non ossidati.` "Avanti" disabilitato finché `bilancioChiusura` non torna. Avviso non
   bloccante se mancano `meta` o `fine`.
3. **Conferma**: codici in anteprima (`codiciFigli`), scarto o eccedenza a vista nei casi A/B.
   **"Chiudi lavorazione"** → `chiudi_lavorazione` → messaggio **"Chiuso. Le schede di A5000/A
   e del residuo A5000 si stampano dall'ufficio."** Hub → linea libera. Se la pagina si chiude
   prima della conferma, si ricomincia.

### 3.8 Capoturno

Con `ruolo = capoturno`, nell'hub compare **"Ultimi controlli"** con correzione. Solo front-end.

### 3.9 Salvataggio

`salva()` in `comune.js`: "Salvato ✓" o "In attesa di rete… riprovo" (1 s, 3 s, 10 s, poi ogni
30 s), tasto disabilitato. Nessun recupero dopo la chiusura della pagina. La registrazione a
posteriori dall'ufficio (§4.4) è il piano B.

## 4. Vista ufficio (`ufficio.html`)

Login Auth (`ufficio`). Tab; filtri; **"Esporta Excel"** solo su Lavorazioni e Rotoli lavorati.
Anomalie e KPI fuori. Tutte le viste nascondono `n_prog like 'COLLAUDO%'` (interruttore).

### 4.1 Magazzino grezzi
Tabella (default `grezzo` + `in_lavorazione`). **"Nuovo rotolo"** con `n_prog` proposto.
**"Stampa scheda grezzo"**. Modifica (anagrafica e `kg_residui`) solo con stato `grezzo`.

### 4.2 Pianificazione
Una settimana per volta; grezzi disponibili a sinistra (residui con kg); sequenza a destra;
scheda prevista da elenco compatibile; ▲▼; righe lavorate barrate.

### 4.3 Live
Realtime, sola lettura: riquadro della linea (stato, rotolo, scheda, operatore, avvio, metri,
ultimo controllo con fuori range in rosso, fermo aperto); nastro cronologico della giornata;
**"Ultime chiusure"**: le lavorazioni chiuse negli ultimi 7 giorni, **le non ancora stampate
in cima e in evidenza** (`stampata_il` null), con un tasto **Stampa** che apre le Schede
Rotolo dei figli e, nei casi C, la **scheda del residuo**, e scrive `stampata_il`. È qui che
l'ufficio stampa ciò che il tablet ha chiuso; poi porta i fogli in reparto (§6).

### 4.4 Lavorazioni
Lista con filtri. Dettaglio = **Scheda di Produzione digitale** (da `lavorazioni_riepilogo`):
intestazione con parametri previsti, pesi, scarto/eccedenza; controlli con scostamenti;
eventi con durate e metri di scarto; figli. **"Stampa Scheda di Produzione"**. Correzioni
d'ufficio su controlli, eventi, pesi (§2.9). **"Registra lavorazione già avvenuta"** → una
pagina con avvio, controlli, eventi, chiusura e orari a mano → `registra_lavorazione_completa`.

### 4.5 Rotoli lavorati
Tabella dei figli (codice, tre pesi, metri, cliente, film, annotazioni, lavorazione). Filtri.
**"Stampa Scheda Rotolo"**. Correzioni: cliente, film, tipo_film, annotazioni, metri, pesi.

### 4.6 Impostazioni
`operatori`. **"Esporta tutto"** (un JSON per tabella).

### 4.7 Pagine di stampa (`stampa.html`, solo dall'ufficio)
HTML con `@media print`, A4. Tre tipi:
- **`tipo=grezzo&n_prog=`** — **"Lavorazione: ______" sempre vuota** (procedure §8.3);
  anagrafica con fornitore e bolla; se il grezzo ha figli, la tabella **"Già lavorato da questo
  rotolo"** (codice, lavorazione, kg netti, data) con `kg_residui` e `metri_stimati` in fondo.
  Nel caso C sostituisce la scheda nella cartelletta del residuo.
- **`tipo=rotolo&codice=`** — la Scheda Rotolo lavorato: codice, cliente, **fornitore** e dati
  della bobina (procedure §4.1; decisione del committente 2026-09-03), lega, finitura,
  dimensioni, lavorazione applicata, tre pesi del figlio, metri, film, annotazioni.
  **Nessun parametro di processo.** Nel caso A sostituisce la scheda grezzo sul rotolo.
- **`tipo=produzione&id=`** — la Scheda di Produzione per il raccoglitore.

## 5. Architettura, sicurezza, file

### 5.1 I tre pezzi
1. **Database**: Supabase `Overland Produzione`, eu-central-1; `sql/` numerato con verifiche.
2. **Front-end statico**: moduli ES nativi; `supabase-js` da CDN con SRI. **Una schermata, un file.**
3. **Pubblicazione**: repo privato + GitHub Pages (Pro); `git push` su `main`. Niente cache-buster.

### 5.2 Struttura dei file
```
Piattaforma Produzione/
  index.html  reparto.html  ufficio.html  stampa.html
  css/    base.css  reparto.css  ufficio.css  stampa.css
  js/
    comune.js        client, costanti (SOGLIA_CONTROLLO_MIN=20, SOGLIA_BOLLA_PCT=3,
                     TOLLERANZA_PCT=10, GLOSS_PERP_MAX=40, GLOSS_PAR_MAX=60), salva(),
                     helper, funzioni pure: metriDaKg, kgDaMetri, codiciFigli, fuoriRange,
                     prossimoNProg, annotazioniDaEventi, residuoProposto, bilancioChiusura
    reparto/  hub.js  avvio.js  controllo.js  evento.js  chiusura.js
    ufficio/  magazzino.js  pianificazione.js  live.js  lavorazioni.js  rotoli.js  impostazioni.js
    stampa.js
  sql/    000_setup.sql  seed_difetti.sql  seed_collaudo.sql  seed_schede.sql  test_regole.sql
  tests/  test-comune.mjs  test-dom-ids.mjs
  tools/  importa_schede.py
  docs/   riferimenti/  superpowers/{specs,reviews,plans}/
  CLAUDE.md  PIANO_funzionalita.md  STATO_*.md
```

### 5.3 Sicurezza
Due utenti Auth: `ufficio`, `reparto`. `utenti_app(uid, ruolo)`; `ruolo_utente()`. RLS
protegge le **righe**, i grant le **colonne**: servono entrambi.

| Oggetto | select | insert | update | delete |
|---|---|---|---|---|
| operatori, schede_lavorazione, tipi_difetto | autenticati | ufficio | ufficio | ufficio |
| rotoli_grezzi | **solo ufficio** | ufficio | ufficio, policy `using (stato = 'grezzo')`, grant su anagrafica + `kg_residui` (mai `stato`) | ufficio, solo `grezzo` senza lavorazioni |
| **rotoli_grezzi_reparto** (vista, `security_invoker = false`) | **autenticati** (`grant select`) | — | — | — |
| lavorazioni_riepilogo, controlli_scostamenti (viste, `security_invoker = true`) | autenticati (`grant select`) | — | — | — |
| pianificazione | autenticati | ufficio | ufficio | ufficio |
| lavorazioni | autenticati | **solo RPC** | ufficio, **policy `using (stato = 'chiusa')`** (le correzioni ai pesi hanno senso dopo la chiusura, non durante il turno), grant su `note, stampata_il, peso_con_imballo_kg, peso_imballo_kg, peso_tubolare_kg, contametri_inizio, contametri_fine`; il `check` di §2.4 impedisce di trasformare un caso C in un caso A | nessuno |
| controlli, eventi | autenticati | ufficio; reparto `with check (lavorazione aperta)` | ufficio; reparto solo se lavorazione aperta | nessuno |
| rotoli_lavorati | autenticati | **solo RPC** | ufficio, grant su `cliente, film, tipo_film, annotazioni_cliente, metri, peso_lordo_kg, peso_tubolare_kg` | nessuno |
| utenti_app | nessuno via API | — | — | — |
| tutto | anonimo: niente | | | |

Nessun grant al client su `modificato_da`, `modificato_il`, `durata_min`, `stato`, `codice`,
`lavorazione_id`. RPC: `revoke execute from anon, public`; guardia con `coalesce`.

### 5.4 Backup
"Esporta tutto"; backup via connettore prima di ogni migrazione; Supabase Pro dopo il pilota.

### 5.5 Gestione errori
`salva()`; errori definitivi in italiano dalla RPC/vincolo; inattesi → messaggio generico +
`console.error`.

### 5.6 Test
1. **Funzioni pure** — `node tests/test-comune.mjs`: `codiciFigli` (A; B; C; secondo giro
   → `/B`), `metriDaKg` (1080 × 0,45 → 1,31 kg/m; 7000 kg di 2 × 1500 → 864 m), `fuoriRange`
   (null, senza range, dentro, sotto, sopra, ±10 %, gloss solo satinato, soglia `≥`),
   `prossimoNProg`, `annotazioniDaEventi` (mai causa/azione), `residuoProposto` (6.500 − 500 ×
   8,1 = 2.450), `bilancioChiusura` (entrambi i giri dell'esempio).
2. **Regole del DB** — `sql/test_regole.sql`: `begin; … rollback;` con `assert`. **Gira come
   `authenticated` con `request.jwt.claims` impostato via `set_config`** (`set local role`),
   altrimenti i test sui grant e su `ruolo_utente()` null passano senza provare nulla. Casi:
   l'esempio di §2.7 per intero; A e B; imballo 0 che riesce; tubolare 0 con residuo 0 che
   riesce; guardie (avvio doppio, avvio di un `in_lavorazione`, bilancio oltre tolleranza,
   residuo > 0 con tubolare non null, residuo 0 con tubolare null, chiusura o annullo con fermo
   aperto, ripartenza di un fermo di un'altra lavorazione, ripartenza doppia, annullo con
   controlli che riesce e scala `kg_residui`, `registra_lavorazione_completa` da reparto
   respinta, update di `stato` respinto dal grant, insert di controllo su lavorazione chiusa
   da reparto respinto, select di `rotoli_grezzi` da reparto vuota e dalla vista piena).
3. **Coerenza** — sugli stessi dati, `fuoriRange`, `codiciFigli` e `bilancioChiusura` di
   `comune.js` contro vista e RPC.
4. **Browser** — `.claude/launch.json`; 1024 × 768 e desktop; flussi sui rotoli di collaudo.
5. **`tests/test-dom-ids.mjs`**.

### 5.7 Rotoli di collaudo
`sql/seed_collaudo.sql`: **dieci** `rotoli_grezzi` `COLLAUDO-0001 … COLLAUDO-0010`
(1500 × 2 mm, bolla 6.500 kg, `note = 'ROTOLO DI COLLAUDO - non cancellare'`). Nascosti in
ufficio per default; sul tablet solo da "Cerca altro numero". Ne servono dieci perché ogni
ciclo completo ne consuma uno e l'Addestramento ne prevede uno per operatore.

## 6. Fasi di realizzazione (indice per il piano)

| Fase | Contenuto | Risultato verificabile | In reparto |
|---|---|---|---|
| **0 — Fondamenta** | progetto Supabase; `000_setup.sql` (tabelle, viste, RPC, trigger, grant, RLS, realtime); `seed_difetti.sql`, `seed_collaudo.sql`; `comune.js` con funzioni pure e test; `test_regole.sql` verde; repo privato + Pages; login; `index.html` "connesso come …" | DB passa i test; l'app pubblicata mostra chi è connesso | — |
| **1 — Magazzino e pianificazione** | Magazzino con stampa grezzo; Pianificazione; Impostazioni | l'ufficio inserisce i grezzi e compone la settimana | — |
| **2 — Avvio da tablet** | `importa_schede.py` + `seed_schede.sql`; hub; operatore; Avvia rotolo; Annulla avvio; Live in lettura | **le ~60 schede sono in tabella e tre a campione coincidono con l'Excel**; l'operatore avvia e annulla; l'ufficio vede | affiancamento il primo turno; A4 plastificato accanto al tablet |
| **3 — Controlli ed eventi** | Controllo; Evento; Fermo/Ripartenza con scarto; scostamenti in Live; capoturno | il turno si registra dal tablet | affiancamento; canale per i problemi (chi risponde, entro quando) |
| **4 — Chiusura e stampe** | Chiudi rotolo A/B/C; `stampa.html` (tre tipi); Ultime chiusure in Live; Lavorazioni con correzioni e `registra_lavorazione_completa`; Rotoli lavorati | ciclo completo; schede stampate dall'ufficio | prima stampa confrontata con la carta insieme agli operatori; **si concorda il giro fisico**: a ogni chiusura l'ufficio stampa da Ultime chiusure e porta le schede in reparto, l'operatore le mette in cartelletta prima che il rotolo lasci l'avvolgitore |
| **Addestramento** | mezza giornata, tutti gli operatori, un rotolo di collaudo ciascuno; decisione scritta su chi non vuole usarlo | tutti hanno fatto un ciclo completo | — |
| **Pilota** | due operatori nominati, quattro settimane, **stop carta** dalla data X | criterio §1 | l'ufficio guarda Live ogni giorno, stampa le schede da Ultime chiusure e le porta al rotolo |

Fermata obbligatoria dopo il Pilota. Il sotto-progetto 2 si progetta con i dati del pilota.

## 7. Condizioni che dipendono dal committente

- Due operatori del pilota e data di stop carta prima della Fase 2.
- Tablet fissato in linea con `reparto.html` aperto e utenza `reparto` connessa.
- Presenza in reparto il primo turno delle Fasi 2, 3 e 4.
- **Stampante raggiungibile dal PC dell'ufficio**, perché tutte le schede si stampano da lì.
- GitHub Pro (Fase 0). Supabase Pro dopo il pilota.

## 8. Domande chiuse durante il design

| Domanda | Decisione |
|---|---|
| Pesi del grezzo | con imballo (> 0), imballo (≥ 0), tubolare (≥ 0; null nel caso C) |
| Pesi dei rotoli finiti | tre pesi: lordo, tubolare, netto (2026-09-03) |
| Residuo del caso C | stimato in kg dal contametri, netto senza tubolare, confermato dall'operatore, correggibile dall'ufficio (2026-09-03) |
| Tolleranza micron | ±10 % del valore previsto, costante nella vista (2026-09-03) |
| Gloss | limiti 40/60 solo per le schede satinate (2026-09-03) |
| Riservatezza | fornitore e bolla nascosti al reparto (2026-09-03) |
| Fornitore sulla Scheda Rotolo lavorato | **sì**, e per questo **tutte le stampe si fanno dall'ufficio**, nessuna dal tablet (2026-09-03) |
| Caso C con un solo figlio | `A5000` resta il residuo, il lavorato è `A5000/A`; al secondo giro `/B` |
| Numerazione proposta | massimo mai usato + 1 (scostamento dichiarato da procedure §3.3) |
| Promemoria controllo | solo colore, 20 min |
| Layout stampe | dalle procedure, aggiustato dopo la prima stampa |
| Hosting | repo privato + GitHub Pages (Pro) |
| ERP Nastri | accantonato |
| Offline | no; ritentativo + `registra_lavorazione_completa` dall'ufficio |
| Storico correzioni | no (§2.9) |
