# Piattaforma Produzione Overland — Sotto-progetto 1: Ciclo bobina

**Data:** 2026-09-03 · **Revisione:** 2 (dopo la revisione indipendente giro 1,
`docs/superpowers/reviews/2026-09-03-ciclo-bobina-spec.md`) · **Stato:** in attesa del giro 2
**Committente e autore delle decisioni:** V. Bignami · **Perimetro:** Linea 1500 (Impiantone)

## 0. In una frase

La Scheda di Produzione della Linea 1500 diventa digitale: l'ufficio inserisce i rotoli grezzi
e la settimana produttiva, l'operatore da tablet avvia il rotolo, registra controlli ed eventi,
lo chiude nei casi A/B/C, e il sistema genera le Schede Rotolo stampabili. Tutto su un unico
database che l'ufficio vede in tempo reale.

## 1. Perché questa fetta per prima

Il progetto completo (`docs/riferimenti/Progetto_Piattaforma_Produzione.docx`) ha quattordici
moduli. È stato scomposto in cinque sotto-progetti, ognuno con il proprio ciclo
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
  anagrafica rotoli. Dall'ERP si riusano solo i concetti (numero progressivo, stati, padre/figlio).
- Le due app standalone esistenti **non** si migrano in questa fetta. Le schede si importano
  come dati di riferimento in sola lettura.
- Tablet e Wi-Fi in reparto **esistono già**: niente modalità offline, niente PWA, niente coda
  persistente di scritture.
- Semplicità e manutenibilità prevalgono su tutto: zero toolchain, un file per schermata,
  regole in un solo posto (Postgres), poche tabelle con nomi italiani.

## 2. Modello dati

Principio: **il rotolo è l'entità centrale, la lavorazione è l'evento.** Otto tabelle più una
di servizio, tre funzioni SQL con tutte le regole di stato, una vista per gli scostamenti, una
vista per il tablet.

Convenzioni: chiavi `uuid default gen_random_uuid()`, `creato_il timestamptz default now()`,
nomi in italiano, `snake_case`. Le colonne `modificato_da` (`'ufficio'` | `'reparto'`) e
`modificato_il` sono scritte **da un trigger** `before insert or update` con `ruolo_utente()`
e `now()`, mai dal client (il client non ha il grant su quelle colonne).

### 2.1 Anagrafiche

**`operatori`** — `id`, `nome` (unico), `ruolo` (`operatore` | `capoturno`), `attivo` (bool).
Sul tablet compaiono in ordine alfabetico. Scritta dall'ufficio.

**`schede_lavorazione`** — le ~60 schede storiche del file
`Desktop/Schede di lavorazione/Schede Impianto 1500.xlsx` (fogli OX NATURALE e OX SATINATO).
`id`, `lavorazione` (es. "OX Naturale 5 micron"), `tipo` (`naturale` | `satinato`), `micron`,
`micron_min`, `micron_max`, `finitura`, `lega`, `spessore_min`, `spessore_max`,
`larghezza_min`, `larghezza_max`, `velocita_m_min`, `ossido_ampere`, per le vasche
`sgrassatura`, `satina`, `ossido`, `fissaggio`: `<vasca>_prodotto`, `<vasca>_temp`,
`<vasca>_temp_min`, `<vasca>_temp_max`; `note`.
In questa fetta **sola lettura**; l'import è `tools/importa_schede.py`, eseguito una volta, che
produce `sql/seed_schede.sql`. Regole di import: "da 961 a 1080" → min/max; valore singolo →
min = max; **`micron_min` = micron × 0,9 e `micron_max` = micron × 1,1** (tolleranza ±10 %
decisa dal committente il 2026-09-03; si tara dopo il pilota). Il nitrico non ha set point nel
manuale e non si importa.

**`tipi_difetto`** — il catalogo del manuale (sezione "Difetti tipici"). `codice`, `nome`,
`causa_probabile`, `azione`, `ordine`. Seed di ~10 righe: segni ciclici, strisce trasversali,
chiazze iridescenti, righe e strisciature, punti bianchi/calcificazioni, nastro ondulato,
macchie simili a umido, graffi, bruciature, altro.

**`utenti_app`** — servizio per la sicurezza: `uid` (= `auth.users.id`), `ruolo`
(`ufficio` | `reparto`). Due righe. Nessun accesso via API. Vedi §5.3.

### 2.2 Il rotolo grezzo

**`rotoli_grezzi`** — un coil come arriva dal fornitore.

| Colonna | Note |
|---|---|
| `n_prog` | testo, unico, es. `A5000`. Lo digita l'ufficio; l'app propone il successivo: **massimo numero mai usato con la stessa lettera + 1** (mai un numero di un rotolo esaurito) |
| `fornitore`, `rif_bolla` | testo; **non visibili al reparto** (decisione del committente, §5.3) |
| `cliente` | testo con autocompletamento dai valori già usati; nessuna anagrafica |
| `lega`, `finitura` | testo |
| `spessore_mm`, `larghezza_mm` | numerici, > 0 |
| `peso_bolla_kg` | dichiarato dal fornitore |
| `kg_residui` | **kg netti di alluminio, tubolare escluso.** Null finché mai lavorato; dopo un caso C il residuo stimato; `0` quando `esaurito` |
| `data_arrivo`, `posizione`, `note` | |
| `stato` | `grezzo` → `in_lavorazione` → `esaurito`; da `in_lavorazione` torna a `grezzo` (caso C o annullo) |
| `metri_stimati` | **colonna generata**: `coalesce(kg_residui, peso_bolla_kg) / (larghezza_mm * spessore_mm * 2.7 / 1000)`. Vale 0 per un esaurito |

Il **caso C** non crea un nuovo rotolo: è la stessa riga che torna `grezzo` con `kg_residui`
aggiornati, come la scheda cartacea che resta sul residuo (procedure §8.3).

**`rotoli_grezzi_reparto`** — vista (`security_invoker = false`, proprietario `postgres`) con
tutte le colonne **tranne** `fornitore` e `rif_bolla`. È l'unica strada di lettura per l'utenza
`reparto`.

### 2.3 La pianificazione

**`pianificazione`** — `id`, `settimana` (date, il lunedì), `posizione` (int),
`rotolo_grezzo_id`, `scheda_lavorazione_id` (prevista, nullable), `suddivisione_prevista` (testo
libero), `note`. Unicità su (`settimana`, `rotolo_grezzo_id`). "Già lavorata" si ricava da
`exists (select 1 from lavorazioni l where l.pianificazione_id = p.id and l.stato <> 'annullata')`:
nessuna colonna inversa.

### 2.4 La lavorazione (= Scheda di Produzione)

**`lavorazioni`** — un evento per ogni volta che un grezzo entra in linea. Una sola riga anche
se produce tre rotoli finiti (procedure §4.2).

| Colonna | Note |
|---|---|
| `rotolo_grezzo_id`, `pianificazione_id` (nullable) | |
| `linea` | testo, `check in ('1500','750')`, default `1500`. Nessuna schermata la sceglie in questa fetta |
| `scheda_lavorazione_id` | la scheda applicata |
| `velocita_prevista`, `ampere_previsti`, `micron_previsti` | **snapshot** dalla scheda al momento dell'avvio: la Scheda di Produzione stampata non cambia se un giorno la scheda viene modificata (procedure §4.4, §5.1) |
| `operatore_avvio_id`, `avviata_il` | |
| `peso_con_imballo_kg`, `peso_imballo_kg`, `contametri_inizio` | pesate a inizio linea (`imballo < con imballo`) |
| `peso_tubolare_kg` | alla chiusura; **null nel caso C** (il tubolare si pesa solo a fine svolgimento, procedure §3.4) |
| `contametri_fine`, `operatore_chiusura_id`, `chiusa_il` | |
| `kg_residui_dichiarati` | il residuo dichiarato **in questa** chiusura (0 nei casi A e B); resta come storia anche quando il grezzo viene rilavorato |
| `kg_scarto` | calcolato dalla RPC in chiusura quando il tubolare è noto (casi A e B); null nel caso C |
| `stato` | `aperta` → `chiusa` \| `annullata` |
| `motivo_annullo`, `note`, `modificato_da`, `modificato_il` | |

Vincolo: **una sola lavorazione `aperta` per linea**: `create unique index … on lavorazioni
(linea) where stato = 'aperta'`.

**`rotoli_lavorati`** — i figli, uno per rotolo finito. Il rotolo finito è avvolto su un nuovo
tubolare e la Scheda Rotolo riporta tre pesi (procedure §4.1; confermato dal committente).

| Colonna | Note |
|---|---|
| `codice` | unico. `A5000` nel caso A puro; `A5000/A`, `/B`, … altrimenti (regola in §2.7) |
| `lavorazione_id`, `rotolo_grezzo_id` | |
| `peso_lordo_kg`, `peso_tubolare_kg` | pesati all'avvolgitore |
| `peso_netto_kg` | **generato**: `peso_lordo_kg - peso_tubolare_kg` |
| `metri` | se non inserito, la RPC lo calcola: `peso_netto_kg / (larghezza × spessore × 2,7 / 1000)` |
| `cliente` | precompilato dal grezzo |
| `film` (bool), `tipo_film` | |
| `annotazioni_cliente` | il testo della Scheda Rotolo; precompilato dagli eventi (§3.7) |
| `modificato_da`, `modificato_il` | |

### 2.5 Durante il turno

**`controlli`** — `lavorazione_id`, `rilevato_il`, `operatore_id`, `momento` (`inizio` | `meta`
| `fine` | `periodico`), `contametri`, `velocita_m_min`, `corrente_a`, `tensione_v`,
`temp_sgrassatura`, `temp_satina`, `temp_ossido`, `temp_fissaggio`, `micron`,
`gloss_parallelo`, `gloss_perpendicolare`, `note`, `modificato_da`, `modificato_il`. Valori
numerici nullable.

**`eventi`** — `lavorazione_id`, `avvenuto_il`, `operatore_id`, `tipo` (`difetto` | `fermo` |
`ripartenza` | `aggiunta` | `giunta_film` | `taglio_film` | `primi_metri_non_ossidati` | `nota`),
`contametri`, `tipo_difetto_id` (difetto), `causa_fermo` (`guasto` | `bagno` | `cambio_rotolo` |
`esterno` | `altro`), `prodotto` e `litri` (aggiunta: satina, ammoniaca, altro — testo con
autocompletamento), `fermo_id` (ripartenza: il fermo che chiude), `durata_min` (sulla riga del
fermo, scritta dal trigger), `metri_scarto` (ripartenza: il tratto scartato, proposto 100 m =
lunghezza della linea 1500 dal manuale, modificabile), `descrizione`, `modificato_da`,
`modificato_il`.

**Fermo aperto** = evento `fermo` senza alcuna `ripartenza` che lo punti. È l'unica definizione;
`durata_min` è un dato derivato. Vincoli e trigger:
- `create unique index on eventi (fermo_id) where fermo_id is not null` (un fermo si chiude una
  volta sola);
- trigger `before insert or update` sulla ripartenza: il `fermo_id` deve puntare un evento
  `tipo = 'fermo'` della **stessa** lavorazione con `avvenuto_il` precedente; scrive
  `durata_min = ripartenza.avvenuto_il − fermo.avvenuto_il` sulla riga del fermo. Si riesegue
  anche se l'ufficio corregge uno dei due orari.

### 2.6 La vista degli scostamenti

**`controlli_scostamenti`** — ogni riga di `controlli` con i riferimenti della scheda applicata e
una colonna booleana per campo, più `n_fuori`. Regole, tutte nella vista:
- temperature: fuori se il valore non è null, il range esiste, e valore `< min` o `> max`;
- `micron`: fuori se `< micron_min` o `> micron_max`;
- `velocita_m_min`, `corrente_a`: fuori se `|valore − riferimento| / riferimento > 0,10`;
- `gloss_perpendicolare`: fuori se `> 40`; `gloss_parallelo`: fuori se `> 60` (limiti assoluti
  dal manuale, costanti nella vista);
- `tensione_v`: nessun riferimento, mai fuori.
Le tre costanti (0,10 · 40 · 60) stanno anche in `comune.js` per il colore immediato sul tablet
(§3.5): duplicazione **accettata e dichiarata**, coperta da un test che confronta le due
implementazioni sugli stessi dati (§5.6).

### 2.7 Le regole: tre funzioni SQL

Tutte `security definer`, `set search_path = public`, `revoke execute … from anon, public`,
`grant execute … to authenticated`. Prima istruzione di ciascuna:
`if coalesce(ruolo_utente(), '') not in ('ufficio','reparto') then raise exception 'Non
autorizzato'; end if;` (il `coalesce` è necessario: `null not in (…)` è null e non solleva).
Messaggi d'errore **in italiano**, mostrati dal front-end così come sono.

**`avvia_lavorazione(p_rotolo_grezzo_id, p_scheda_id, p_operatore_id, p_peso_con_imballo,
p_peso_imballo, p_contametri_inizio, p_pianificazione_id default null, p_avviata_il default now())`**
- `select … from rotoli_grezzi where id = p_rotolo_grezzo_id for update` (niente avvii doppi);
- il grezzo deve essere `grezzo` ("Il rotolo A5000 è già in lavorazione" / "è esaurito");
- pesi > 0, imballo < con imballo;
- `p_avviata_il` diverso da `now()` solo se `ruolo_utente() = 'ufficio'` (registrazione a
  posteriori, §4.4);
- crea la lavorazione `aperta` con lo snapshot dalla scheda, mette il grezzo `in_lavorazione`;
  l'indice unico sulla linea fa il resto ("C'è già una lavorazione aperta sulla linea 1500").

**`chiudi_lavorazione(p_lavorazione_id, p_operatore_id, p_peso_tubolare, p_contametri_fine,
p_figli jsonb, p_kg_residui default 0, p_chiusa_il default now())`**
- lavorazione `aperta`, con lock (`for update`);
- **nessun fermo aperto** ("C'è un fermo aperto: registra la ripartenza prima di chiudere");
- `p_figli`: array di `{peso_lordo_kg, peso_tubolare_kg, metri (nullable), cliente, film,
  tipo_film, annotazioni_cliente}`, **almeno un elemento**, lordo > tubolare ≥ 0;
- `p_kg_residui ≥ 0`. Se `> 0` allora `p_peso_tubolare` **deve essere null** (caso C: il
  tubolare non si pesa); se `= 0` allora `p_peso_tubolare` **deve essere > 0**;
- **bilancio**: `Σ(figli.netto) + p_kg_residui ≤ (peso_con_imballo − peso_imballo −
  coalesce(p_peso_tubolare, 0)) × 1,02` — "La somma dei pesi supera il disponibile di X kg".
  Nel caso C il tubolare ignoto rende il limite un tetto sicuro;
- `kg_scarto = peso_con_imballo − peso_imballo − p_peso_tubolare − Σ(figli.netto)` se il
  tubolare è noto, altrimenti null;
- **regola dei codici**: `n_prog` senza suffisso **solo se** un solo figlio **e** residuo = 0
  **e** il grezzo non ha figli da lavorazioni precedenti. Altrimenti `n_prog/A`, `/B`, …
  continuando dall'ultima lettera già usata da quel grezzo;
- crea i `rotoli_lavorati` (metri calcolati se null), chiude la lavorazione con
  `kg_residui_dichiarati`, e mette il grezzo `esaurito` con `kg_residui = 0` se residuo = 0,
  altrimenti `grezzo` con `kg_residui = p_kg_residui`;
- `p_chiusa_il` diverso da `now()` solo per `ufficio`;
- restituisce i codici generati.

**`annulla_lavorazione(p_lavorazione_id, p_operatore_id, p_motivo)`**
- lavorazione `aperta`; `p_motivo` obbligatorio non vuoto;
- controlli ed eventi già registrati **restano** attaccati (sono dati misurati);
- lavorazione → `annullata` con `motivo_annullo`; grezzo → `grezzo` con `kg_residui` invariati.

La **ripartenza** è un insert in `eventi` (tipo `ripartenza`, `fermo_id`, `metri_scarto`); il
trigger di §2.5 fa il resto.

#### Esempio numerico completo del caso C (da riprodurre in `sql/test_regole.sql`)

Grezzo `A5000`, 1500 × 2 mm → 8,1 kg/m; bolla 6.500 kg → 802 m stimati.
**Primo giro.** Avvio: con imballo 6.540, imballo 45. Lavorati 500 m (contametri 100 → 600).
Un figlio: lordo 4.090, tubolare 40 → netto 4.050. Residuo proposto dal tablet =
(802 − 500) × 8,1 = 2.446 kg, l'operatore conferma. Tubolare null. Bilancio: 4.050 + 2.446 =
6.496 ≤ (6.540 − 45) × 1,02 = 6.625 ✓. `kg_scarto` null. Codice: un figlio **ma** residuo > 0 →
**`A5000/A`**. Grezzo → `grezzo`, `kg_residui` 2.446, `metri_stimati` 302.
**Secondo giro.** Avvio: con imballo 2.500, imballo 0. Lavorato tutto; tubolare 60. Un figlio:
lordo 2.410, tubolare 40 → netto 2.370. Residuo 0. Bilancio: 2.370 ≤ (2.500 − 60) × 1,02 =
2.489 ✓. `kg_scarto` = 2.500 − 0 − 60 − 2.370 = **70**. Codice: un figlio, residuo 0, **ma** il
grezzo ha già `/A` → **`A5000/B`**. Grezzo → `esaurito`, `kg_residui` 0.

### 2.8 Realtime

Publication `supabase_realtime` su `lavorazioni`, `controlli`, `eventi`. Nient'altro.

### 2.9 Fuori perimetro e scelte consapevoli

Fuori: foto, note vocali, spedizione, bagni, certificato, KPI, magazzino a posizioni, modifica
delle schede da ufficio, anagrafiche clienti/fornitori, selezione della linea sul tablet.
Scelte consapevoli, da non riaprire senza motivo:
- **Nessuno storico dei valori precedenti** alle correzioni d'ufficio: bastano
  `modificato_da/il`. Si aggiunge una colonna `precedente jsonb` da trigger solo se una
  contestazione lo renderà necessario.
- Il **capoturno è una distinzione del solo front-end** (chi vede il tasto "correggi"); la
  policy RLS concede la correzione a chiunque usi il tablet, sulla lavorazione aperta.
- Il reparto **vede** clienti, dati tecnici e schede (come oggi su carta e nell'app schede);
  **non vede** fornitore e riferimento bolla (§2.2).

## 3. Flussi sul tablet (`reparto.html`)

### 3.1 Regole di ergonomia

Tasti alti ≥ 56 px; elenchi fino a 8 voci come **bottoni**, mai `<select>`; campi numerici con
`inputmode="decimal"`; ogni flusso in **massimo tre schermate**; "Indietro" sempre in alto a
sinistra; una sola azione principale per schermata; testo ≥ 18 px; riferimento 1024 × 768.

### 3.2 Chi sei

In alto a destra il nome dell'operatore attivo (in `localStorage`, con try/catch). Tap → griglia
alfabetica degli `operatori` attivi. Nessuna password. Ogni scrittura porta `operatore_id`.

### 3.3 Hub

- **Linea libera**: tasto grande **"Avvia rotolo"**; sotto "In programma questa settimana"
  (settimana corrente, ordine dell'ufficio, già lavorati esclusi, primo evidenziato).
- **Lavorazione in corso**: banner `A5000 · OX Naturale 5 my · avviato 08:12 da Mario · ultimo
  controllo 45 min fa · 3.200 m`. Tasti: **Controllo**, **Evento**, **Chiudi rotolo**, **Fermo**
  (rosso, sempre visibile). Se l'ultimo controllo è più vecchio di `SOGLIA_CONTROLLO_MIN`
  (= **20**, dal manuale: controllo difetti ogni 20 minuti) il banner cambia colore. Nessuna
  notifica. Un tasto piccolo **"Annulla avvio"** in un secondo livello ("Altro…") chiede il
  motivo e conferma testuale → `annulla_lavorazione`.
- **Fermo aperto**: il banner mostra "FERMO da 12 min · guasto"; il tasto Fermo diventa
  **Ripartenza**.

### 3.4 Avvia rotolo — 3 schermate

1. **Quale rotolo**: i grezzi in programma come bottoni; sotto "Cerca altro numero" (elenco dei
   `grezzo` che iniziano così, letto da `rotoli_grezzi_reparto`; qui compare anche il rotolo di
   collaudo). Per un residuo il bottone mostra "residuo 2.446 kg · 302 m".
2. **Quale scheda**: le schede compatibili (spessore e larghezza nei min/max), ordinate per
   micron, con velocità, ampere, micron. Tap → parametri per vasca. "Mostra tutte".
3. **Pesate**: peso con imballo, peso imballo (0 ammesso per un residuo già sballato) → netto
   provvisorio a vista; contametri iniziale. **"Avvia"** → `avvia_lavorazione`.
   Lo stato delle tre schermate vive in memoria: se la pagina si chiude prima di "Avvia", si
   ricomincia. Niente è scritto prima.

### 3.5 Controllo — 1 schermata

`momento` proposto: primo controllo = `inizio`, poi `periodico`; `meta` e `fine` a un tocco.
Campi per zona: *linea* (contametri, velocità, corrente, tensione), *bagni* (quattro
temperature), *qualità* (micron, gloss ∥, ⊥). `placeholder` = valore del controllo precedente.
Colore immediato con `fuoriRange` di `comune.js` (stesse regole della vista §2.6).
Salva → "Salvato ✓" → hub.

### 3.6 Evento — 2 schermate

1. **Tipo**: Difetto · Fermo · Aggiunta · Giunta film · Taglio film · Primi metri non ossidati · Nota.
2. **Dettaglio**:
   - *Difetto*: `tipi_difetto` come bottoni → causa probabile e azione; contametri; descrizione.
   - *Fermo*: causa (bottoni); ora = adesso, modificabile. Resta aperto.
   - *Ripartenza* (dall'hub): metri di scarto **proposti 100**, modificabili, con il testo
     "Il tratto dalla sgrassatura all'uscita dell'ossido va scartato"; salva con `fermo_id`.
   - *Aggiunta*: prodotto (bottoni: satina, ammoniaca, altro → testo) e litri.
   - *Giunta film*, *Taglio film*, *Primi metri non ossidati*: contametri. *Nota*: testo.

### 3.7 Chiudi rotolo — 3 schermate

1. **Pesata finale**: "È rimasto un residuo grezzo?" **sì/no** per primo, perché cambia il resto.
   - *No* (casi A/B): peso tubolare, contametri finale → disponibile = con imballo − imballo −
     tubolare, a vista.
   - *Sì* (caso C): contametri finale; **residuo proposto** = (metri stimati del grezzo all'avvio
     − metri lavorati) × kg/m, modificabile, etichettato "stimato"; nessuna pesata del tubolare.
   Confronto con il riferimento: `kg_residui` del grezzo se non null (secondo giro), altrimenti
   `peso_bolla_kg`; se la differenza supera `SOGLIA_BOLLA_PCT` (3 %) compare "Differenza dalla
   bolla / dal residuo dichiarato: −280 kg".
2. **Rotoli finiti**: bottoni 1 · 2 · 3 · 4. Per ogni figlio: peso lordo, peso tubolare →
   netto a vista; metri (proposti dal netto, modificabili); cliente (precompilato); film sì/no e
   tipo; **annotazioni per il cliente precompilate** da `annotazioniDaEventi`: **solo fatti,
   mai causa o azione del catalogo**. Esempio di output:
   `Giunta film a 1.250 m. Graffi a 2.100 m. Primi 15 m non ossidati.` Modificabili.
   Il tasto "Avanti" resta disabilitato finché il bilancio di §2.7 non torna.
   Se mancano i controlli `meta` o `fine`: avviso **non bloccante** "Mancano i controlli di
   metà / fine: vuoi chiudere lo stesso?".
3. **Conferma**: codici che verranno generati (anteprima con `codiciFigli` di `comune.js`; la
   verità è la RPC), `kg_scarto` mostrato per conferma nei casi A/B. **"Chiudi lavorazione"** →
   `chiudi_lavorazione` → un tasto **Stampa** per ogni Scheda Rotolo. Hub → linea libera.
   Come per l'avvio: se la pagina si chiude prima della conferma, si ricomincia.

### 3.8 Capoturno

Se l'operatore selezionato ha `ruolo = capoturno`, nell'hub compare **"Ultimi controlli"**
della lavorazione aperta, con correzione. Distinzione solo di front-end (§2.9).

### 3.9 Salvataggio

Ogni scrittura passa da `salva()` in `comune.js`: "Salvato ✓" oppure "In attesa di rete…
riprovo" con ritentativi (1 s, 3 s, 10 s, poi ogni 30 s) e tasto disabilitato. Nessun recupero
dopo la chiusura della pagina: se la scrittura non è andata, l'operatore la rifà. La
registrazione a posteriori (§4.4) è il piano B per la rete caduta a lungo.

## 4. Vista ufficio (`ufficio.html`)

Login Supabase Auth (utenza `ufficio`). Tab orizzontali; tabelle con filtri in testa.
**"Esporta Excel"** solo su Lavorazioni e Rotoli lavorati (SheetJS da CDN): sostituiscono la
trascrizione manuale nel file Excel di riepilogo (procedure §4.4). Anomalie e KPI **non** sono in
questa fetta. Tutte le viste nascondono per default i rotoli con `n_prog like 'COLLAUDO%'`;
un interruttore "mostra collaudo" li fa vedere.

### 4.1 Magazzino grezzi
Tabella di `rotoli_grezzi` (filtro stato: default `grezzo` + `in_lavorazione`). **"Nuovo
rotolo"** con `n_prog` proposto. **"Stampa scheda grezzo"**. Modifica dell'anagrafica ammessa
solo con stato `grezzo` (policy §5.3, non solo front-end).

### 4.2 Pianificazione
Una settimana per volta. Sinistra: grezzi `grezzo` disponibili (residui inclusi, con kg).
Destra: la sequenza; scheda prevista da elenco compatibile; suddivisione e nota; ▲▼. Le righe
già lavorate restano barrate.

### 4.3 Live
Sola lettura, realtime. Il riquadro della linea: stato, rotolo, scheda, operatore, avvio, metri
all'ultimo controllo, ultimo controllo con i campi fuori range in rosso, fermo aperto. Sotto, il
nastro cronologico di controlli ed eventi della giornata.

### 4.4 Lavorazioni
Lista con filtri (periodo, rotolo, scheda, operatore, stato). Dettaglio = **Scheda di
Produzione digitale**: intestazione con lo snapshot dei parametri previsti, pesi, `kg_scarto`;
controlli in ordine di contametri con scostamenti; eventi con durate dei fermi e metri di
scarto; rotoli lavorati generati. **"Stampa Scheda di Produzione"**. L'ufficio corregge
controlli ed eventi anche di lavorazioni chiuse (trigger scrive `modificato_da = 'ufficio'`).
**"Registra lavorazione già avvenuta"**: il flusso avvio + controlli + chiusura in una pagina,
con orari inseriti a mano (`p_avviata_il`, `p_chiusa_il`): è la strada quando la rete è
mancata e il turno è finito su carta.

### 4.5 Rotoli lavorati
Tabella dei figli (codice, lordo/tubolare/netto, metri, cliente, film, annotazioni,
lavorazione). Filtri cliente e periodo. **"Stampa Scheda Rotolo"**. L'ufficio può correggere
cliente, film, annotazioni, metri.

### 4.6 Impostazioni
`operatori` (aggiungi, rinomina, ruolo, attivo). **"Esporta tutto"**: un JSON per tabella.

### 4.7 Pagine di stampa (`stampa.html`)
HTML con `@media print`, A4 verticale. Tre tipi:
- **`tipo=grezzo&n_prog=`** — la scheda in cartelletta. Intestazione **"Lavorazione: ______"
  sempre vuota** (segnale operativo delle procedure §8.3); anagrafica; bolla; e, se il grezzo
  ha già figli, la tabella **"Già lavorato da questo rotolo"** (codice, lavorazione, kg netti,
  data) con in fondo `kg_residui` e `metri_stimati`.
- **`tipo=rotolo&codice=`** — la Scheda Rotolo lavorato: codice, cliente, lega, finitura,
  dimensioni, lavorazione applicata (nome della scheda), **i tre pesi del figlio** (lordo,
  tubolare, netto) e metri, film, annotazioni per il cliente. **Nessun parametro di processo.**
  Nel caso A sostituisce fisicamente la scheda grezzo sul rotolo.
- **`tipo=produzione&id=`** — la Scheda di Produzione per il raccoglitore.
Il layout riprende i contenuti descritti nelle procedure §4.1 e §4.2; si aggiusta dopo la
prima stampa in reparto.

## 5. Architettura, sicurezza, file

### 5.1 I tre pezzi
1. **Database**: progetto Supabase nuovo `Overland Produzione`, eu-central-1. Schema in `sql/`
   come file numerati con verifiche preliminari e finali.
2. **Front-end statico**: HTML/CSS/JS con moduli ES nativi. Nessun bundler. `supabase-js` da
   CDN con SRI, pinnato. **Una schermata, un file.**
3. **Pubblicazione**: repository privato GitHub + GitHub Pages (piano Pro); `git push` su
   `main` = produzione. Niente cache-buster (Pages: `max-age=600`).

### 5.2 Struttura dei file
```
Piattaforma Produzione/            (root del repo)
  index.html  reparto.html  ufficio.html  stampa.html
  css/    base.css  reparto.css  ufficio.css  stampa.css
  js/
    comune.js                      client Supabase, costanti (SOGLIA_CONTROLLO_MIN=20,
                                   SOGLIA_BOLLA_PCT=3, soglie scostamento), salva(),
                                   helper, funzioni pure: metriDaKg, kgDaMetri, codiciFigli,
                                   fuoriRange, prossimoNProg, annotazioniDaEventi,
                                   residuoProposto, bilancioChiusura
    reparto/  hub.js  avvio.js  controllo.js  evento.js  chiusura.js
    ufficio/  magazzino.js  pianificazione.js  live.js  lavorazioni.js
              rotoli.js  impostazioni.js
    stampa.js
  sql/    000_setup.sql  seed_difetti.sql  seed_schede.sql  test_regole.sql
  tests/  test-comune.mjs  test-dom-ids.mjs
  tools/  importa_schede.py
  docs/   riferimenti/  superpowers/specs/  superpowers/reviews/  superpowers/plans/
  CLAUDE.md  PIANO_funzionalita.md  STATO_*.md
```

### 5.3 Sicurezza
Due utenti Auth: `ufficio` e `reparto`. `utenti_app(uid, ruolo)`; `ruolo_utente()`
(`security definer`, `stable`). Postgres protegge le **righe** con RLS e le **colonne** con i
grant: servono entrambi.

| Tabella | select | insert | update | delete |
|---|---|---|---|---|
| operatori, schede_lavorazione, tipi_difetto | autenticati | ufficio | ufficio | ufficio |
| rotoli_grezzi | **solo ufficio** (il reparto legge `rotoli_grezzi_reparto`) | ufficio | ufficio, **policy `using (stato = 'grezzo')`**, grant solo colonne anagrafiche (mai `stato`, `kg_residui`) | ufficio, solo `grezzo` senza lavorazioni |
| pianificazione | autenticati | ufficio | ufficio | ufficio |
| lavorazioni | autenticati | **solo RPC** | ufficio, **grant solo `note`** | nessuno |
| controlli, eventi | autenticati | ufficio; reparto **`with check (lavorazione aperta)`** | ufficio; reparto solo se lavorazione aperta | nessuno |
| rotoli_lavorati | autenticati | **solo RPC** | ufficio, grant solo `cliente, film, tipo_film, annotazioni_cliente, metri` | nessuno |
| utenti_app | nessuno via API | — | — | — |
| tutto | anonimo: niente | | | |

`modificato_da/il`: nessun grant al client, scritti dal trigger. Le RPC: `revoke execute from
anon, public`, guardia con `coalesce`. La chiave publishable nel codice è pubblica per design.
L'operatore selezionato sul tablet è un dato, non un'identità.

### 5.4 Backup
"Esporta tutto" in Impostazioni. Il piano gratuito Supabase non ha backup automatici: il
passaggio a Pro è la prima spesa consigliata se il pilota regge. Il meccanismo di esecuzione
delle fasi fa un backup completo via connettore prima di ogni migrazione.

### 5.5 Gestione errori
`salva()` gestisce ritentativi e indicatore. Errori definitivi → messaggio italiano della RPC o
del vincolo, mostrato così com'è. Errori inattesi → "Qualcosa non ha funzionato, riprova; se
continua avvisa l'ufficio" + `console.error`.

### 5.6 Test
1. **Funzioni pure** — `node tests/test-comune.mjs`: `codiciFigli` (A puro; B; C; secondo giro
   → `/B`), `metriDaKg` (1080 × 0,45 → 1,31 kg/m; 7000 kg di 2 × 1500 → 864 m),
   `fuoriRange` (null, senza range, dentro, sotto, sopra, ±10 %, gloss), `prossimoNProg`
   (A5000 → A5001; lettere diverse; esaurito non riusato; vuoto), `annotazioniDaEventi`
   (l'esempio di §3.7; mai causa/azione), `residuoProposto`, `bilancioChiusura` (l'esempio di
   §2.7).
2. **Regole del DB** — `sql/test_regole.sql`: `begin; … rollback;` con `assert`: l'esempio
   numerico di §2.7 per intero; caso A e B; guardie (avvio doppio sulla linea, avvio di un
   `in_lavorazione`, bilancio oltre tolleranza, residuo > 0 con tubolare non null, chiusura con
   fermo aperto, ripartenza di un fermo di un'altra lavorazione, ripartenza doppia, annullo con
   controlli presenti che **riesce**, `ruolo_utente()` null respinto, update di `stato` su
   `lavorazioni` respinto dal grant).
3. **Coerenza fra le due implementazioni** — un test che, sugli stessi dati, confronta
   `fuoriRange`/`codiciFigli` di `comune.js` con la vista e la RPC (via connettore).
4. **Browser** — `.claude/launch.json` (`python -m http.server 8000`); pannello browser a
   1024 × 768 e desktop: nessun errore in console, i flussi con il rotolo di collaudo.
5. **`tests/test-dom-ids.mjs`**.

### 5.7 Rotolo di collaudo
Un `rotoli_grezzi` con `n_prog = 'COLLAUDO-0001'`, `note = 'ROTOLO DI COLLAUDO - non
cancellare'`. Le viste ufficio lo nascondono per default (§4); sul tablet si raggiunge solo da
"Cerca altro numero". Nessuna regola sul nome dell'operatore.

## 6. Fasi di realizzazione (indice per il piano)

| Fase | Contenuto | Risultato verificabile | In reparto |
|---|---|---|---|
| **0 — Fondamenta** | progetto Supabase; `000_setup.sql` (tabelle, viste, RPC, trigger, grant, RLS, realtime); `seed_difetti.sql`; `comune.js` con funzioni pure e test; `test_regole.sql` verde; repo privato + Pages; login; `index.html` con "connesso come ufficio / reparto" | il DB passa i test delle regole; l'app pubblicata mostra chi è connesso | — |
| **1 — Magazzino e pianificazione** | Magazzino grezzi con stampa scheda grezzo; Pianificazione; Impostazioni | l'ufficio inserisce i grezzi e compone la settimana | — |
| **2 — Avvio da tablet** | `importa_schede.py` + `seed_schede.sql`; hub; scelta operatore; Avvia rotolo; **Annulla avvio**; Live in lettura | l'operatore avvia (e annulla) un rotolo; l'ufficio lo vede | affiancamento il primo turno; A4 plastificato con il flusso accanto al tablet |
| **3 — Controlli ed eventi** | Controllo; Evento; Fermo/Ripartenza con scarto; scostamenti in Live; capoturno | il turno si registra dal tablet | affiancamento; canale per segnalare problemi (chi risponde, entro quando) |
| **4 — Chiusura e stampe** | Chiudi rotolo A/B/C; `stampa.html` (grezzo, rotolo, produzione); Lavorazioni con correzioni e registrazione a posteriori; Rotoli lavorati | ciclo completo end-to-end, schede stampate | prima stampa confrontata con la scheda cartacea insieme agli operatori |
| **Addestramento** | mezza giornata con tutti gli operatori, i due del pilota per primi; decisione scritta su cosa fare se qualcuno non vuole usarlo | tutti hanno fatto un ciclo completo sul rotolo di collaudo | — |
| **Pilota** | due operatori nominati, quattro settimane, **stop carta** per la Scheda di Produzione dalla data X | criterio §1 | l'ufficio guarda Live ogni giorno e annota cosa manca |

Fermata obbligatoria dopo il Pilota. Il sotto-progetto 2 (Anomalie, KPI) si progetta con i
dati del pilota davanti — che ora includono fermi con durata e scarto.

## 7. Condizioni che dipendono dal committente

- Nominare i due operatori del pilota e la data di stop carta prima della Fase 2.
- Tablet fissato in linea con `reparto.html` aperto e l'utenza `reparto` connessa.
- Essere presente in reparto il primo turno delle Fasi 2, 3 e 4.
- Attivare GitHub Pro (Fase 0). Decidere su Supabase Pro dopo il pilota.

## 8. Domande chiuse durante il design

| Domanda | Decisione |
|---|---|
| Pesi del grezzo | con imballo, imballo, tubolare (nullable, mai nel caso C) |
| Pesi dei rotoli finiti | **tre pesi**: lordo, tubolare, netto (2026-09-03) |
| Residuo del caso C | **stimato dai metri**, netto alluminio senza tubolare, proposto dal tablet e confermato (2026-09-03) |
| Tolleranza micron | **±10 %** del valore della scheda, costante d'import (2026-09-03) |
| Riservatezza verso il reparto | **fornitore e riferimento bolla nascosti**; il resto visibile (2026-09-03) |
| Caso C con un solo figlio | residuo resta `A5000`, il lavorato è `A5000/A`; al secondo giro `/B` |
| Promemoria controllo | solo colore, soglia 20 min (manuale) |
| Layout stampe | dalle procedure, si aggiusta dopo la prima stampa |
| Hosting | repo privato + GitHub Pages (GitHub Pro) |
| ERP Nastri | accantonato; solo concetti |
| Offline | no; ritentativo + registrazione a posteriori dall'ufficio |
| Storico correzioni | no (§2.9) |
