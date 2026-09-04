# Fase 1 — Magazzino e pianificazione (ufficio)

**Data:** 2026-09-04 · **Fonte:** `PIANO_funzionalita.md` §3 Fase 1 · spec §4.1, §4.2, §4.6, §4.7
**Riferimento non in discussione:** `docs/superpowers/specs/2026-09-03-ciclo-bobina-design.md`

Fase di solo front-end: lo schema della Fase 0 copre già tutto ciò che serve.
**Nessuna migrazione additiva, nessuna migrazione di rimozione** (§6 di questo documento).

---

## 1. File toccati

| File | Nuovo? | Cosa |
|---|---|---|
| `ufficio.html` | nuovo | shell a tab, login/logout, interruttore "mostra collaudo" |
| `css/ufficio.css` | nuovo | tab, tabelle, moduli — desktop |
| `js/ufficio.js` | nuovo | shell: sessione, ruolo, tab, interruttore collaudo, avvio dei moduli |
| `js/ufficio/magazzino.js` | nuovo | voce 2 |
| `js/ufficio/pianificazione.js` | nuovo | voce 4 |
| `js/ufficio/impostazioni.js` | nuovo | voce 5 |
| `stampa.html` | nuovo | pagina di stampa, in questa fase **solo** `tipo=grezzo` |
| `css/stampa.css` | nuovo | A4, `@media print` |
| `js/stampa.js` | nuovo | voce 3 |
| `js/comune.js` | modificato | 7 funzioni pure nuove (§3) |
| `js/db.js` | modificato | `salva()` accetta messaggi d'errore per codice (§2 voce 6) |
| `tests/test-comune.mjs` | modificato | test delle 7 funzioni nuove |
| `tests/test-dom-ids.mjs` | modificato | 5 coppie js↔html nuove |

`index.html`, `js/index.js`, `css/base.css`, `sql/` **non si toccano**.

---

## 2. Voci del piano, una per una

### Voce 1 — `ufficio.html`: shell a tab, login, logout, filtro collaudo

- Stessa impalcatura di `index.html`: `<script>` UMD di supabase-js con lo **stesso** `integrity`
  già in `index.html` (versione pinnata 2.110.6, file `dist/umd/supabase.js`), poi
  `<script type="module" src="js/ufficio.js">`.
- Tre stati della pagina: **login** (`#uff-login`), **non autorizzato** (`#uff-negato`),
  **applicazione** (`#uff-app`). Dopo il login `ruoloCorrente()`: se ≠ `ufficio` →
  "Questa pagina è riservata all'ufficio." con il tasto Esci. La RLS lo impedisce comunque
  (`grezzi_sel using (e_ufficio())`): il messaggio evita solo tabelle vuote e inspiegabili.
- Tab: **Magazzino grezzi**, **Pianificazione**, **Impostazioni**. Solo queste tre: Live è la
  Fase 2, Lavorazioni e Rotoli lavorati la Fase 4. Nessun tab segnaposto.
- Interruttore **"Mostra rotoli di collaudo"** (`#uff-collaudo`), spento per default, nella barra
  in alto: vale per tutta la pagina (spec §4). Da spento, aggiunge
  `.not("n_prog", "like", "COLLAUDO%")` a **due sole** interrogazioni: l'elenco del Magazzino e
  l'elenco dei grezzi disponibili della Pianificazione. Cambiarlo ricarica il tab attivo.
  **Non** tocca: la proposta di `n_prog` (che deve vedere tutti i codici), la **sequenza** della
  settimana (nasconderne righe lascerebbe buchi nelle posizioni), l'esportazione JSON (è il
  backup dello spec §5.4 e deve essere completo) e `stampa.html`.
- Esci (`#uff-esci`) → `logout()`.
- La pagina si raggiunge digitando l'indirizzo `…/ufficio.html`: nessun collegamento da
  `index.html` (§7).

### Voce 2 — Tab Magazzino grezzi

**Elenco.** `rotoli_grezzi` ordinati per `n_prog` (ordinamento **testuale**: con le cifre a
quattro fisse dà l'ordine giusto; oltre `A9999` no — annotato, non corretto in questa fase perché
la numerazione a quattro cifre è quella dello spec §2.2). Filtro di stato (`#mag-stato`) con tre
possibilità: **"A magazzino e in linea"** (default: `stato in ('grezzo','in_lavorazione')`),
"Esauriti", "Tutti". Colonne: n. prog., stato, fornitore, cliente, lega, finitura, spessore,
larghezza, peso bolla, kg residui, metri stimati, posizione, data arrivo, note, modificato da/il.
`kg_residui` vuoto = mai lavorato (si mostra "—").

**Nuovo rotolo** (`#mag-nuovo`). Modulo con: `n_prog` (`#mag-n-prog`) **proposto** da
`prossimoNProg` sull'elenco completo di `n_prog` letto dal database (senza filtro di stato e
**senza** filtro collaudo, così la proposta non dipende dagli interruttori), e una scelta della
lettera (`#mag-lettera`) con le lettere già in uso più la A; cambiarla ricalcola la proposta. Il
campo resta modificabile a mano. Gli altri campi sono quelli con il grant di insert:
`fornitore`, `rif_bolla`, `cliente`, `lega`, `finitura`, `spessore_mm`, `larghezza_mm`,
`peso_bolla_kg`, `data_arrivo`, `posizione`, `note`. **`kg_residui` non è nel modulo di
inserimento**: un rotolo nuovo non è mai stato lavorato e il valore resta nullo (spec §2.2), e
il grant di insert non lo comprende.

**Modifica** (`#mag-modifica`). Si apre dalla riga. Se `stato ≠ 'grezzo'` il modulo è in sola
lettura con "Il rotolo è in lavorazione (o esaurito): si modifica solo quando è a magazzino."
Se `stato = 'grezzo'`: gli stessi campi dell'inserimento **più `kg_residui`**. `stato` non
compare in nessun modulo e non viene mai inviato.

**Autocompletamento** di `cliente` e `fornitore`: due `<datalist>` (`#mag-clienti`,
`#mag-fornitori`) riempiti con `valoriUsati()` sui valori già presenti nei grezzi. Nessuna
anagrafica (spec §2.2).

**Campi vuoti.** Regola unica per tutti i moduli della fase: un campo lasciato vuoto si invia come
`null`, mai come stringa vuota (su una colonna `numeric` o `date` darebbe 22P02/22007 e un
messaggio generico). Per `kg_residui` la distinzione conta ed è voluta: **vuoto = mai lavorato**
(`null`), **0 = esaurito** (spec §2.2). Le colonne obbligatorie (`n_prog`, `spessore_mm`,
`larghezza_mm`, `peso_bolla_kg`) hanno `required` nell'HTML.

**Stampa scheda grezzo**: tasto sulla riga → apre `stampa.html?tipo=grezzo&n_prog=<n_prog>` in
una scheda nuova.

Tutte le scritture passano da `salva()` di `js/db.js`, con `onStato` collegato a `#mag-esito`
perché il ritentativo di rete si veda ("In attesa di rete… riprovo", spec §3.9); i messaggi
d'errore sono quelli che `db.js` già traduce in italiano.

### Voce 3 — `stampa.html?tipo=grezzo&n_prog=`

Pagina indipendente con il proprio login e, come `ufficio.html`, lo stato **non autorizzato**
(`#stampa-negato`): con un ruolo diverso da `ufficio` la RLS non farebbe arrivare nulla
(`grezzi_sel using (e_ufficio())`) e la pagina uscirebbe vuota senza spiegazione. Legge i
parametri da `location.search`. Se `tipo` ≠ `grezzo`: "Questo tipo di stampa arriva con una fase
successiva." (i tipi `rotolo` e `produzione` sono la Fase 4). Se il `n_prog` non esiste:
"Nessun rotolo con questo numero."

Contenuto (procedure §8.3, spec §4.7):
1. Intestazione "Scheda rotolo grezzo" e `n_prog` in grande.
2. **"Lavorazione: ______________" sempre vuota**, anche se il rotolo è pianificato o in linea.
3. Anagrafica **con `fornitore` e `rif_bolla`** (è una stampa d'ufficio): cliente, lega,
   finitura, spessore, larghezza, peso di bolla, data di arrivo, posizione, note.
4. Se il grezzo ha figli, tabella **"Già lavorato da questo rotolo"**: codice, lavorazione,
   kg netti, data. Interrogazione unica con relazioni annidate:
   `rotoli_lavorati?select=codice,peso_netto_kg,lavorazioni(chiusa_il,schede_lavorazione(lavorazione))`
   filtrata su `rotolo_grezzo_id`, ordinata per codice. Finché le schede non sono caricate
   (Fase 2) la colonna "lavorazione" mostra "—". Se non ci sono figli, la tabella non compare.
5. In fondo: **`kg_residui`** (o "mai lavorato") e **`metri_stimati`**.

Tasto **Stampa** (`#stampa-avvia`) → `window.print()`; nessuna stampa automatica.
`css/stampa.css`: A4 verticale, margini 15 mm, `@media print` nasconde il tasto e l'intestazione
dello schermo.

### Voce 4 — Tab Pianificazione

**Settimana.** `#pian-prec` ← e `#pian-succ` → una settimana per volta; `#pian-settimana` mostra
"Settimana del lunedì 7 settembre 2026". Il lunedì è **sempre una stringa `AAAA-MM-GG`**:
`lunediDellaSettimana()` la costruisce dai componenti **locali** della data e
`settimanaSpostata()` la sposta di ±1 settimana. Nessun `toISOString()` in nessun punto della
fase: su una data a mezzanotte locale a est di Greenwich restituirebbe il giorno prima, e il
programma finirebbe nella settimana sbagliata.

**Sinistra — grezzi disponibili** (`#pian-disponibili`): `stato = 'grezzo'`, filtro collaudo
applicato, ordinati per `n_prog`. Per ognuno n. prog., dimensioni e, se `kg_residui` non è nullo,
"residuo 2.450 kg · 302 m". Tasto **"Aggiungi al programma"** → insert in `pianificazione` con
`settimana` e `posizione` = massima della settimana + 1 (1 se vuota).

**Destra — sequenza** (`#pian-sequenza`): **tutte** le righe di `pianificazione` della settimana
(l'interruttore collaudo non si applica qui), ordinate per `posizione`, con il grezzo in join.
Per riga:
- **scheda prevista** (`#pian-scheda-<id>`): elenco delle `schede_lavorazione` **compatibili**
  (`schedeCompatibili`: `spessore_min ≤ spessore_mm ≤ spessore_max` e
  `larghezza_min ≤ larghezza_mm ≤ larghezza_max`), ordinate per micron, più la voce vuota
  "— nessuna —"; casella **"mostra tutte"** che toglie il filtro di compatibilità;
- **suddivisione prevista** e **nota**: campi di testo salvati alla perdita di fuoco;
- **▲ ▼**: scambio di `posizione` con la riga sopra/sotto;
- **Togli**: cancella la riga dal programma (§7, interpretazione dichiarata).

**Righe già lavorate**: `lavorazioni` con `pianificazione_id` fra quelle della settimana e
`stato <> 'annullata'` (definizione dello spec §2.3). Quelle righe si mostrano **barrate** e con
i comandi disattivati.

**Scambio ▲▼ senza transazione.** `pianificazione` ha `unique (settimana, posizione)`: uno
scambio diretto violerebbe il vincolo. PostgREST non offre transazioni, quindi lo scambio è in
tre passi su una posizione di appoggio negativa: A(3) → −3, B(4) → 3, A(−3) → 4. Durante i tre
passi **▲▼ e Togli di tutta la sequenza sono disattivati**, così non si sovrappongono due scambi.
Se un passo fallisce, si mostra l'errore e **si ricarica la sequenza dal database**: la riga
rimasta a posizione negativa si ordina per prima e resta visibile, con l'avviso "questa riga è
rimasta fuori sequenza: spostala con ▲▼ oppure toglila e riaggiungila". Nessuna funzione SQL
nuova: non è nel piano. Se in una fase successiva lo scambio desse fastidio, la strada sarà una
RPC `scambia_posizioni`, non questa fase.

**Le schede saranno vuote in questa fase**: `seed_schede.sql` è la Fase 2. Il campo resta
selezionabile e vuoto (`scheda_lavorazione_id` è nullable, spec §2.3); l'elenco mostrerà
"— nessuna —" finché le schede non ci sono. È l'ordine previsto dal piano, non un difetto.

### Voce 5 — Tab Impostazioni

**Operatori** (`#imp-operatori`): elenco per nome. Per riga: nome modificabile, ruolo
(`operatore` | `capoturno`), attivo sì/no. Tasto **"Aggiungi operatore"** (`#imp-nuovo`) con nome
e ruolo. **Nessuna cancellazione**: il piano dice "aggiungi, rinomina, ruolo, attivo", e un
operatore già citato in una lavorazione non si può cancellare comunque.

**Esporta tutto** (`#imp-esporta`): un file JSON **per tabella**, scaricati uno dopo l'altro
(300 ms di pausa fra uno e l'altro), nome `<tabella>_AAAA-MM-GG.json`. Le nove tabelle leggibili:
`operatori`, `schede_lavorazione`, `tipi_difetto`, `rotoli_grezzi`, `pianificazione`,
`lavorazioni`, `rotoli_lavorati`, `controlli`, `eventi`. `utenti_app` **non** è esportabile: non
ha accesso via API per costruzione (spec §5.3), e contiene solo due righe di corrispondenza
utente-ruolo. Il browser chiede una volta di consentire i download multipli. Avanzamento in
`#imp-esito`.

Due regole perché il file sia davvero un backup (spec §5.4):
- **niente filtro collaudo**: l'esportazione legge tutto, interruttore acceso o spento;
- **paginazione obbligatoria**: PostgREST restituisce al massimo 1000 righe per richiesta e
  tronca **senza errore**. Ogni tabella si legge a blocchi di 1000 con `.range(da, a)` finché il
  blocco torna più corto di 1000. `controlli` ed `eventi` supereranno le 1000 righe entro il
  pilota: senza questo, il backup uscirebbe mutilo e nessuno se ne accorgerebbe.

### Voce 6 — Messaggi d'errore delle violazioni nuove (`js/db.js`)

La Fase 1 è la prima a scrivere, e introduce violazioni che il testo fisso del codice 23505 in
`js/db.js` descrive male: `unique (settimana, posizione)` (due aggiunte ravvicinate, o un passo
fallito dello scambio ▲▼) e `operatori.nome` unico produrrebbero entrambe *"Questo numero è già
stato usato: controlla il numero progressivo"*. E la FK `lavorazioni.pianificazione_id` (Togli su
una riga con una lavorazione **annullata**, che non conta come "già lavorata") darebbe un 23503
oggi non tradotto. PIANO §1 impone messaggi d'errore in italiano, e lo `STATO_2026-09-03.md`
prevedeva questo passaggio: *"le pagine delle Fasi 1-4 potranno passare messaggi specifici"*.

Modifica minima e compatibile: `salva(fn, { onStato, messaggi })` accetta una mappa facoltativa
`{ "<codice>": "<testo italiano>" }` che ha la precedenza sui testi fissi; senza la mappa, il
comportamento della Fase 0 non cambia. Si aggiunge il codice **23503** (violazione di chiave
esterna) ai testi fissi, con una frase generica. Chi la usa:

| Chiamata | Codice | Messaggio |
|---|---|---|
| aggiunta / spostamento in pianificazione | 23505 | "Questa posizione nella settimana è già occupata: ricarico il programma." |
| Togli dal programma | 23503 | "Questa riga ha già una lavorazione (anche se annullata): resta come storia del programma." |
| nuovo operatore / rinomina | 23505 | "Esiste già un operatore con questo nome." |
| nuovo rotolo / modifica `n_prog` | 23505 | (testo fisso esistente: è davvero il numero progressivo) |

Nessuna regola di dominio si sposta nel front-end: il database rifiuta come prima, cambia solo la
frase mostrata.

---

## 3. Funzioni pure nuove in `js/comune.js` (con test in `tests/test-comune.mjs`)

| Funzione | Regola | Test |
|---|---|---|
| `dataBreveItaliana(valore)` | `GG/MM/AAAA`; una colonna `date` (`AAAA-MM-GG`) si legge com'è, un `timestamptz` si converte al fuso locale — tagliarne i primi dieci caratteri darebbe la data UTC, cioè il giorno prima per tutto ciò che accade dopo le 22 | una data, un timestamp, nullo, vuoto, testo non valido |
| `dataLungaItaliana(valore)` | `7 settembre 2026`, stesse regole | una data, un mese diverso, nullo |
| `lunediDellaSettimana(data)` | **stringa `AAAA-MM-GG`** del lunedì della settimana della data, costruita dai componenti **locali**; la domenica appartiene alla settimana che inizia il lunedì precedente | un lunedì resta se stesso; un mercoledì; una domenica; un cambio di mese; un cambio d'anno |
| `settimanaSpostata(isoLunedi, settimane)` | sposta una stringa `AAAA-MM-GG` di ±n settimane, restituendo una stringa | avanti, indietro, oltre il cambio di mese e di anno, attraverso il cambio d'ora legale |
| `schedeCompatibili(schede, spessoreMm, larghezzaMm)` | `spessore_min ≤ sp ≤ spessore_max` **e** `larghezza_min ≤ larg ≤ larghezza_max`; ordinate per `micron` crescente | dentro, ai bordi (min e max compresi), fuori per spessore, fuori per larghezza, ordinamento, elenco vuoto |
| `valoriUsati(righe, campo)` | valori distinti, non nulli e non vuoti, ripuliti dagli spazi ai bordi, ordinati alfabeticamente (`localeCompare` italiano) | duplicati, nulli, stringhe vuote e di soli spazi, ordine |
| `formattaNumero(n, decimali = 0)` | `Intl.NumberFormat("it-IT")` con separatore delle migliaia sempre attivo; `null`/`undefined` → `"—"` | 2450 → "2.450"; 8.1 con 1 decimale → "8,1"; null → "—" |

`formattaNumero` **sostituisce** il `fmtM` interno di `annotazioniDaEventi` (stessa
`Intl.NumberFormat("it-IT")` con `useGrouping: "always"`), che diventa
`formattaNumero(n ?? 0)`: il `?? 0` resta, perché per le annotazioni un contametri mancante deve
leggersi "0 m" e non "— m". I test esistenti di `annotazioniDaEventi` non cambiano.

Nessun import in `comune.js`, nessun DOM, nessuna rete: la regola della Fase 0 resta.

`tests/test-dom-ids.mjs`: le coppie diventano `index.js↔index.html`, `ufficio.js↔ufficio.html`,
`ufficio/magazzino.js↔ufficio.html`, `ufficio/pianificazione.js↔ufficio.html`,
`ufficio/impostazioni.js↔ufficio.html`, `stampa.js↔stampa.html`.

---

## 4. Regole di dominio: dove stanno

Nessuna regola di dominio nuova nel front-end. Riepilogo di chi impedisce cosa:

| Regola | Chi la fa rispettare |
|---|---|
| solo l'ufficio vede e scrive i grezzi | policy `grezzi_sel/ins/upd/del` (`e_ufficio()`) |
| un grezzo si modifica solo se `grezzo` | policy `grezzi_upd using (stato = 'grezzo')` |
| `stato` e `modificato_*` non si scrivono dal client | grant per colonna (sezione e) |
| `n_prog` unico | `unique` su `rotoli_grezzi.n_prog` (errore 23505 già tradotto in `db.js`) |
| una sola riga per (settimana, posizione) | `unique (settimana, posizione)` |
| `kg_al_metro`, `metri_stimati` | colonne generate |
| solo l'ufficio scrive operatori e pianificazione | policy con `e_ufficio()` |

Il front-end **mostra e invia**: disabilita ciò che il database rifiuterebbe e mostra i messaggi
che il database restituisce.

---

## 5. Prove nel browser (passo 5 locale, passo 8.2 sul sito)

Desktop (l'ufficio non è il tablet: le regole di ergonomia dello spec §3.1 valgono per
`reparto.html`, che questa fase non tocca).

1. `ufficio.html` senza sessione → compare il modulo di login, nessun errore in console.
2. `ufficio.html` con sessione **ufficio** → i tre tab; il magazzino elenca i grezzi; da spento
   l'interruttore, **nessun `COLLAUDO-*`**; acceso, compaiono i dieci.
3. Nuovo rotolo: la proposta di `n_prog` è coerente con i codici esistenti e ignora i
   `COLLAUDO-*`. Inserimento e ricomparsa nell'elenco.
4. Modifica di un rotolo `grezzo`: cambio di `kg_residui` → `metri_stimati` ricalcolato dal
   database. Su un rotolo `in_lavorazione` il modulo è in sola lettura.
5. `stampa.html?tipo=grezzo&n_prog=COLLAUDO-0001` → "Lavorazione: ______" vuota, fornitore e
   bolla presenti, kg residui e metri stimati in fondo, anteprima di stampa su una pagina A4.
6. Pianificazione: aggiunta di due grezzi, scambio ▲▼, suddivisione e nota salvate, Togli.
7. Impostazioni: aggiunta di un operatore, cambio ruolo, disattivazione; "Esporta tutto" scarica
   nove file JSON.
8. Chiamate di rete: tutte verso `nbercxzpjflqfstwrryp.supabase.co`.

**Prima della pubblicazione (passo 5) si verifica senza sessione**: che le pagine si disegnino,
che non ci siano errori in console, e che le chiamate vadano al progetto giusto. Le prove 2-7
richiedono una sessione e si fanno **sul sito pubblicato** al passo 8.2, con il login del
committente: è l'ordine della procedura, e la rete di sicurezza è il ritorno indietro del passo
8.3 se il sito risulta rotto.

Perché il codice non arrivi online senza che il suo strato dati sia mai stato provato, al passo 5
si aggiunge una **prova delle interrogazioni in sola lettura**, eseguita sul database come farebbe
l'ufficio (`set local role authenticated` con `request.jwt.claims` dell'utente ufficio, dentro
`begin … rollback`, come `sql/test_regole.sql`): le stesse `select` che le tre schede e la pagina
di stampa emettono — elenco dei grezzi con e senza filtro collaudo, elenco dei codici per la
proposta di `n_prog`, sequenza della settimana in join con i grezzi, lavorazioni per le righe
barrate, figli del grezzo con le relazioni annidate della stampa, le nove tabelle
dell'esportazione — devono rispondere senza errore e con le righe attese. Così l'unica cosa che
resta da provare dopo il push è l'interfaccia, non i permessi.

---

## 6. Migrazioni

**Additiva: nessuna. Di rimozione: nessuna.** La Fase 0 ha già creato tabelle, policy e grant che
questa fase usa. Al passo 6.2 si eseguono, in **sola lettura**, queste verifiche preliminari:

```sql
-- 1) i grant di scrittura che la fase usa esistono già
select table_name, privilege_type, count(*) as colonne
from information_schema.column_privileges
where table_schema = 'public' and grantee = 'authenticated'
  and table_name in ('rotoli_grezzi','pianificazione','operatori')
  and privilege_type in ('INSERT','UPDATE')
group by 1, 2 order by 1, 2;
-- atteso: rotoli_grezzi INSERT 12 / UPDATE 13 (le 12 dell'insert più kg_residui);
--         pianificazione INSERT 6 / UPDATE 6;
--         operatori INSERT e UPDATE su tutte le colonne (grant di tabella)

-- 2) nessun grant sulle colonne riservate della fase
select count(*) as violazioni from information_schema.column_privileges
where table_schema = 'public' and grantee = 'authenticated'
  and privilege_type in ('INSERT','UPDATE')
  and ((table_name = 'rotoli_grezzi' and column_name in ('stato','kg_al_metro','metri_stimati'))
       or column_name in ('modificato_da','modificato_il'));
-- atteso: 0

-- 3) la policy che blocca la modifica di un grezzo non a magazzino è quella attesa
select policyname, cmd, qual from pg_policies
where schemaname = 'public' and tablename = 'rotoli_grezzi' and policyname = 'grezzi_upd';
-- atteso: qual contiene e_ufficio() and stato = 'grezzo'

-- 4) i rotoli di collaudo ci sono ancora
select count(*) from rotoli_grezzi where n_prog like 'COLLAUDO-%';
-- atteso: 10
```

Se una di queste non dà il risultato atteso: fermarsi e fare rapporto.
Il backup del passo 6.1 si fa comunque, prima delle verifiche.

---

## 7. Cosa non faccio e perché

1. **Nessuna cancellazione di un rotolo grezzo.** Lo `STATO_2026-09-03.md` annotava che
   `grezzi_del` non considera la `pianificazione` e diceva "da gestire in Fase 1, che costruisce
   la cancellazione". Ma **né il piano (§3 Fase 1) né lo spec (§4.1) prevedono un tasto di
   cancellazione**: il piano elenca tabella, nuovo rotolo, modifica, stampa, autocompletamento.
   Costruirla sarebbe un'aggiunta fuori fase. L'annotazione resta aperta e va rifatta quando una
   fase la prevede davvero. **Contraddizione dichiarata fra STATO e piano/spec: risolta a favore
   del piano e dello spec, come impone la regola "vale lo spec".** L'annotazione aperta su
   `grezzi_del` si riporta nello STATO della Fase 1, riformulata: *"da gestire nella fase che
   costruirà la cancellazione di un grezzo, se una fase la prevederà"*. Nel rapporto va detto al
   committente che oggi un rotolo inserito per sbaglio **si corregge, non si elimina**.
2. **Nessun collegamento da `index.html` a `ufficio.html`.** Il piano non tocca `index.html` in
   questa fase. L'indirizzo della pagina d'ufficio va nel rapporto.
3. **Niente tab Live, Lavorazioni, Rotoli lavorati**, nemmeno disattivati: sono Fasi 2 e 4.
4. **`stampa.html` fa solo `tipo=grezzo`**: `rotolo` e `produzione` sono la Fase 4.
5. **Niente "Esporta Excel"**: lo spec §4 lo mette solo su Lavorazioni e Rotoli lavorati (Fase 4).
   Qui c'è solo "Esporta tutto" in JSON, come dice il piano.
6. **Nessuna funzione SQL nuova per lo scambio ▲▼**: non è nel piano; lo scambio è in tre passi
   dal client, con ricarica in caso di errore (§2 voce 4).
7. **Nessun `reparto.html`, nessuna stampa dal tablet**: Fase 2 e oltre.

### Interpretazioni dichiarate

**a) "Togli dal programma" nella Pianificazione.** Il piano non nomina la cancellazione di una
riga di pianificazione, ma il risultato verificabile della fase è che *"l'ufficio … compone il
programma"*, e un programma a cui si può solo aggiungere non è componibile: un rotolo messo per
sbaglio resterebbe lì per sempre. La policy `pian_del` e il `grant delete` della Fase 0 esistono
già ed esistono per questo: nessun'altra schermata delle Fasi 2-4 scrive su quella tabella.

**Il criterio che distingue questo caso dal punto 1** (niente cancellazione dei grezzi) non è
l'esistenza della policy — esiste anche `grezzi_del` — ma il **risultato verificabile della
fase**: comporre il programma richiede di poter togliere una riga, mentre "inserire i grezzi e
stamparli" non richiede di poterli cancellare (un grezzo sbagliato si corregge con Modifica,
`n_prog` compreso). Dove la policy non serve al risultato della fase, non si costruisce il tasto.

**b) Casella "mostra tutte" accanto alla scheda prevista.** Il filtro di compatibilità è nel
piano ("elenco compatibile per spessore/larghezza"); la casella che lo toglie è nello spec §3.4
per il tablet, non nel §4.2 per l'ufficio. La aggiungo perché senza di essa un grezzo con
dimensioni fuori da ogni range non potrebbe ricevere nessuna scheda, e la riga resterebbe
inutilizzabile. È un filtro di interfaccia, non una regola.

---

## 8. Voci delegate al committente

Nessuna nuova. Restano quelle della Fase 0 (repository privato con GitHub Pro, riattivazione di
`Scadenziario`, Supabase Pro dopo il pilota) e, **prima della Fase 2**, i due operatori del
pilota e la data di stop carta (spec §7). Il committente farà il login come **ufficio** sul sito
pubblicato per provare la fase; la sessione del pannello vale già per quell'origine.
