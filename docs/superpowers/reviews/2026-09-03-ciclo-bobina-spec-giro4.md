# Revisione spec ciclo bobina — giro 4 (conferma finale)

MODELLO: claude-opus-5[1m] (Opus 5, contesto 1M)

Verifica sui soli punti aperti del giro 3, sul diff della revisione 4. Nessuna rilettura dei
documenti di riferimento.

## VERDETTO: NESSUN BLOCCANTE

Undici punti su undici risolti. I due bloccanti del giro 3 sono chiusi con la correzione
giusta e ho ripercorso a mano tutte le vie di innesco dei trigger: non ne resta nessuna.

---

## Esito dei punti del giro 3

| Punto | Esito | Verifica |
|---|---|---|
| **BN1** trigger ricorsivo | **RISOLTO** | Ripercorse tutte e quattro le vie: insert/update di una ripartenza → trigger 2 → `update` del fermo → trigger 1 (solo assegnamento su `new`, nessuno statement) e trigger 2 che **non reagisce alle righe `fermo`** → si ferma; insert/update di un fermo → solo trigger 1, che non emette `update` → si ferma. **Nessuna via di ricorsione residua**, e la guardia sul `tipo` in entrambi i trigger è la parte che la chiude |
| **BN2** colonna generata su colonna generata | **RISOLTO** | Formula ripetuta per esteso in `metri_stimati`, `::integer`, e la ragione scritta nella tabella ("Postgres non ammette una colonna generata definita su un'altra colonna generata"): chi legge non è tentato di "semplificarla" reintroducendo l'errore |
| **IN-N1** invariante del caso C aggirabile | **RISOLTO** | Il `check` **regge per `aperta` e `annullata`**: con `stato <> 'chiusa'` il primo termine della disgiunzione è vero e la riga passa comunque, che è il comportamento voluto (su quelle righe tubolare e residuo dichiarato sono null). Ed è **compatibile con `registra_lavorazione_completa`**: quella RPC inserisce la riga già `chiusa` applicando le stesse guardie di §2.7 (residuo > 0 ⇒ tubolare null; residuo 0 ⇒ tubolare non null), quindi soddisfa il `check` per costruzione. La policy `using (stato = 'chiusa')` è coerente col grant, che ora include `stampata_il` |
| **IN-N2** giro fisico della carta | **RISOLTO** | Colonna `stampata_il`, non stampate in cima e in evidenza, il tasto Stampa la scrive, il grant la include, e il giro fisico è scritto nella colonna "In reparto" sia della Fase 4 sia del Pilota. Un solo flag per chiusura copre anche la scheda del residuo, che si stampa dallo stesso tasto: corretto |
| **IN-N3** metri di un annullo persi | **RISOLTO** | `contametri_fine = contametri_inizio + p_metri_scarto`: nessuna colonna nuova, e i metri consumati diventano derivabili come per ogni altra lavorazione |
| **IN-N4** grezzo già andato avanti | **RISOLTO** | Firma completa (sedici parametri), comportamento sul grezzo nei due casi, avviso restituito alla UI, e la regola dei codici `/A`, `/B` esplicitamente indipendente dall'ordine cronologico di registrazione |
| **Minore 1** limite su `p_metri_scarto` | **RISOLTO** | `0 ≤ p_metri_scarto ≤ metri_stimati` con messaggio in italiano |
| **Minore 2** cast di `metri_stimati` | **RISOLTO** | `::integer` |
| **Minore 3** grant sulle viste invoker | **RISOLTO** | `(grant select)` su entrambe, e la riga della vista del reparto ora dichiara anche `security_invoker = false`: il contrasto fra le due scelte è visibile in tabella |
| **Minore 4** `prossimoNProg` e i `COLLAUDO` | **RISOLTO** | "solo i codici nel formato `lettera + cifre`, i `COLLAUDO-000x` sono ignorati" |
| **Minore 5** firma della RPC | **RISOLTO** | scritta per intero |

**11 risolti · 0 non risolti.**

---

## Da tenere presente nel piano (nessuno è bloccante)

- Il `check` di §2.4 passa anche se `kg_residui_dichiarati` è null su una riga `chiusa` (in SQL
  `null > 0` è null e un `check` null passa): metterlo `not null`, o scriverlo con
  `coalesce(kg_residui_dichiarati, 0)`. Oggi non morde, perché la RPC lo valorizza sempre.
- Il trigger 2 assegna `durata_min` nell'`update`, ma il trigger 1 ricalcola lo stesso valore
  sulla riga del fermo un istante dopo: il valore vero lo produce **solo** il trigger 1, il
  trigger 2 deve limitarsi a toccare la riga. Da scrivere come commento nel file SQL,
  altrimenti si finisce per correggere la formula in un posto solo.
- Con la policy `using (stato = 'chiusa')` le `note` di una lavorazione **annullata** non sono
  più scrivibili da nessuno: se serve commentare un annullo, il posto è `motivo_annullo`, che
  la RPC richiede obbligatorio.
- Sommando lo scarto per il sotto-progetto 2, i metri di un annullo (`contametri_fine −
  contametri_inizio`) e i `metri_scarto` delle ripartenze possono riferirsi allo stesso nastro:
  quando si costruirà il KPI, sceglierne una sola come fonte.
- Il residuo del caso C resta ancorato al peso di bolla, che le procedure §3.4 dicono poter
  sbagliare di 200–300 kg: è la conseguenza voluta della decisione "stimato dai metri", e si
  tara guardando i primi casi C del pilota.

---

## Conclusione

**Sì: lo spec è pronto per il piano di implementazione.** I due errori tecnici del giro
precedente — una formula che Postgres avrebbe rifiutato e un automatismo che girava su sé
stesso — sono corretti nel modo giusto, e ho verificato che non ne resti traccia.

In quattro giri di revisione il documento è passato da sei problemi bloccanti a zero, e le
ultime undici correzioni non hanno cambiato nulla di come il sistema funziona: erano dettagli
di scrittura. Le decisioni che contano — il rotolo come entità centrale, una sola scheda di
produzione per ogni entrata in linea, i casi A/B/C, i pesi, le stampe dall'ufficio — sono
ferme dal giro 2 e hanno retto a tre verifiche indipendenti.

Restano cinque annotazioni minori, elencate qui sopra: nessuna richiede una decisione sua, si
risolvono mentre si scrive il codice. Da qui si può passare al piano di implementazione.
