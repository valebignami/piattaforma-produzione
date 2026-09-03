# Fase 0 — Fondamenta: piano di implementazione

> **Stato: APPROVATO** il 2026-09-03 dopo tre giri di revisione indipendente
> (`docs/superpowers/reviews/2026-09-03-piano-fase-0*.md`). Le annotazioni non bloccanti del
> giro 2 (punti 2-10) sono da tenere presenti in esecuzione.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mettere in piedi database, regole, funzioni pure con test, login e pubblicazione della Piattaforma Produzione, così che le Fasi 1-4 costruiscano solo schermate.

**Architecture:** Front-end statico (HTML/CSS/JS, moduli ES nativi, nessun bundler) su GitHub Pages da repo privato; Supabase (Postgres + PostgREST + Auth + Realtime) come unico backend; **tutte le regole di dominio in Postgres** (vincoli, trigger, viste, quattro RPC `security definer`); in `js/comune.js` solo funzioni pure testate in Node, in `js/db.js` il client e `salva()`.

**Tech Stack:** Postgres 17 su Supabase (eu-central-1), `supabase-js` 2.x UMD da jsDelivr con SRI, Node ≥ 20 per i test (`node --test`, con un `package.json` di sola `"type": "module"`), Python 3 per `http.server`, git, GitHub Pages (piano Pro, repo privato).

**Spec:** `docs/superpowers/specs/2026-09-03-ciclo-bobina-design.md` (APPROVATO 2026-09-03). Indice fasi: `PIANO_funzionalita.md`.

## Global Constraints

- Codice, identificatori, commenti, messaggi d'errore, UI: **in italiano** (spec §5, PIANO §1).
- Nomi DB in `snake_case` italiano; chiavi `uuid default gen_random_uuid()`; `creato_il timestamptz default now()` (spec §2).
- `modificato_da` / `modificato_il` su `rotoli_grezzi`, `pianificazione`, `lavorazioni`, `rotoli_lavorati`, `controlli`, `eventi`, **scritte solo dal trigger** `imposta_modificato`; nessun grant al client (spec §2, §5.3).
- Ogni funzione SQL: `set search_path = public`; le RPC `security definer`, `revoke execute … from anon, public`, `grant execute … to authenticated`, guardia `if coalesce(ruolo_utente(),'') not in ('ufficio','reparto') then raise exception 'Non autorizzato'; end if;` (spec §2.7).
- Messaggi d'errore delle RPC in italiano, mostrati dal front-end così come sono (spec §5.5).
- Colonne generate: `metri_stimati` con la formula **ripetuta per esteso** (Postgres non ammette generata su generata) e `::integer` (spec §2.2).
- **Due trigger distinti** su `eventi` per i fermi (spec §2.5).
- Costanti: `SOGLIA_CONTROLLO_MIN = 20`, `SOGLIA_BOLLA_PCT = 3`, `TOLLERANZA_PCT = 10`, `GLOSS_PERP_MAX = 40`, `GLOSS_PAR_MAX = 60`, tolleranza bilancio `× 1,02` (spec §2.6, §2.7, §5.2).
- Nessun cache-buster; nessun bundler; nessuna dipendenza npm (spec §5.1). **Scostamento dichiarato:** esiste un `package.json` di **una sola riga** `{ "type": "module" }`, senza dipendenze né script, perché Node ≥ 20 senza di esso tratta `js/comune.js` come CommonJS e i test non partono (dal 22.7 partono con un warning). Non è una toolchain: niente `npm install`, mai.
- `git add` sempre di file espliciti, mai `.`/`-A`; `git push` solo al Task 15; commit in italiano.
- Backup prima di ogni migrazione (spec §5.4): in Fase 0 **un solo backup all'inizio** (Task 7, Step 3), perché il database nasce vuoto e nessuna delle migrazioni 000a-002 tocca dati preesistenti; dalla Fase 1 il backup torna a essere per migrazione.
- **Ogni sezione SQL ha in testa la propria guardia** "già applicata → errore": nessuna sezione di `000_setup.sql` si riesegue mai; le correzioni sono nuove migrazioni `003_fix_<voce>.sql`.
- Progetto Supabase: **`Overland Produzione`** (eu-central-1). Prima di ogni scrittura verificare con `get_project`/`list_projects` che il ref sia quello creato al Task 7; mai scrivere su `tbaagbngpxibllftsgoh` (HR) né su `cqdmfhdcdvaezmexzxrq` (Scadenziario).

---

## Struttura dei file creati in questa fase

```
Piattaforma Produzione/                (root del repo, già inizializzato con docs/)
  .gitignore                           .claude/, RAPPORTO_*.md, Backup app/, *.tmp, ~$*
  package.json                         { "type": "module" } — una riga, nessuna dipendenza
  .claude/launch.json                  python -m http.server 8000  (non committato)
  index.html                           login + "Connesso come …"
  css/base.css                         reset, tipografia, bottoni
  js/comune.js                         costanti + funzioni pure (nessun import)
  js/db.js                             client Supabase + salva()
  js/index.js                          logica della pagina di login
  sql/000_setup.sql                    schema completo (sezioni a-e, concatenate)
  sql/seed_difetti.sql                 catalogo difetti (~10 righe)
  sql/seed_collaudo.sql                dieci rotoli COLLAUDO-0001…0010
  sql/test_regole.sql                  test delle regole, begin…rollback
  tests/test-comune.mjs                node --test
  tests/test-dom-ids.mjs               id cercati dal JS esistono nell'HTML
  CLAUDE.md                            regole operative del repo
  STATO_<data>.md                      stato di fine fase (es. STATO_2026-09-04.md)
  RAPPORTO_fase-0.md                   rapporto per il committente (gitignorato)
```

Responsabilità: `comune.js` non importa nulla e non tocca il DOM né la rete (è testabile in Node); `db.js` è l'unico file che conosce Supabase; ogni pagina ha il suo `js/<pagina>.js`.

---

### Task 0: Struttura del repo e strumenti

**Files:**
- Modify: `.gitignore`
- Create: `.claude/launch.json`, `CLAUDE.md`, `package.json`

- [ ] **Step 1: Verifica lo stato del repo**

Run: `git status --short && git log --oneline | head -3`
Expected: working tree pulito; l'ultimo commit contiene il piano della Fase 0 (`docs: PIANO_funzionalita …` o successivo).

- [ ] **Step 2: Completa `.gitignore`**

Contenuto finale del file:
```
.claude/
RAPPORTO_*.md
Backup app/
*.tmp
~$*
.playwright-mcp/
```

- [ ] **Step 3: Crea `.claude/launch.json`**

```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "produzione-locale",
      "runtimeExecutable": "python",
      "runtimeArgs": ["-m", "http.server", "8000"],
      "port": 8000
    }
  ]
}
```

- [ ] **Step 4: Crea `package.json`** (una riga: serve solo a dire a Node che i `.js` sono moduli ES)

```json
{ "type": "module" }
```

- [ ] **Step 5: Crea `CLAUDE.md` iniziale** (il blocco è delimitato da quattro backtick perché contiene un blocco `bash`)

````markdown
# CLAUDE.md — Piattaforma Produzione Overland

## Cos'è
App statica (HTML/CSS/JS, moduli ES) + Supabase per digitalizzare il ciclo bobina della
Linea 1500 di Overland S.r.l. (Mediglia). Spec: `docs/superpowers/specs/2026-09-03-ciclo-bobina-design.md`.
Piano fasi: `PIANO_funzionalita.md`. Codice, commenti e UI in italiano.

## Comandi
```bash
node --test tests/                 # funzioni pure + id DOM
python -m http.server 8000         # servire in locale → http://localhost:8000/index.html
```
Nessun bundler, linter o dipendenza npm: `package.json` contiene solo `"type": "module"`.
`supabase-js` arriva da CDN (UMD, SRI, pinnato).

## Regole operative
- `git push` su `main` = produzione (GitHub Pages, repo privato). Solo come passo esplicito.
- Le regole di dominio stanno in Postgres: vincoli, trigger, viste, RPC in `sql/`.
  `js/comune.js` contiene solo funzioni pure; le tre duplicate (fuoriRange, codiciFigli,
  bilancioChiusura) sono dichiarate nello spec e coperte dal test di coerenza.
- Progetto Supabase: `Overland Produzione` (ref: <da compilare al Task 7>). Nessuno staging.
  Mai rieseguire una sezione di `000_setup.sql`: le correzioni sono migrazioni nuove.
- `modificato_da/il` e `durata_min` le scrive il DB: mai dal client.
- `rotoli_grezzi` non è leggibile dal reparto: il tablet usa la vista `rotoli_grezzi_reparto`.
- Le `note` di una lavorazione si scrivono solo su lavorazioni `chiuse`; per le annullate il
  posto è `motivo_annullo`.
- Niente cache-buster: Pages serve con max-age=600.

## Struttura
Vedi il piano della Fase 0, sezione "Struttura dei file".
````

- [ ] **Step 6: Committa**

Run:
```bash
git add .gitignore CLAUDE.md package.json
git commit -m "chore: struttura del repo, CLAUDE.md, package.json type module, gitignore"
```
(Le cartelle `css/`, `js/`, `sql/`, `tests/` nascono con i primi file veri nei task seguenti.)

---

### Task 1: `comune.js` — costanti, `kgAlMetro`, `metriDaKg`, `kgDaMetri`

**Files:**
- Create: `js/comune.js`
- Test: `tests/test-comune.mjs`

**Interfaces:**
- Produces: `kgAlMetro(larghezzaMm, spessoreMm) → number`, `metriDaKg(kg, larghezzaMm, spessoreMm) → integer`, `kgDaMetri(metri, larghezzaMm, spessoreMm) → number`, e le costanti esportate elencate nei Global Constraints più `PESO_SPECIFICO_AL = 2.7`, `TOLLERANZA_BILANCIO = 1.02`.

- [ ] **Step 1: Scrivi il test che fallisce**

`tests/test-comune.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import * as c from "../js/comune.js";

test("kgAlMetro: formula del manuale (larg × sp × 2,7 / 1000), esatta in virgola mobile", () => {
  assert.equal(c.kgAlMetro(1500, 2), 8.1);          // (1500·2·27)/10000 = 8.1 esatto; (1500·2·2.7)/1000 darebbe 8.100000000000001
  assert.equal(Number(c.kgAlMetro(1080, 0.45).toFixed(2)), 1.31);
});

test("metriDaKg: esempi del manuale, arrotondati all'intero", () => {
  assert.equal(c.metriDaKg(7000, 1500, 2), 864);   // 864,2 nel manuale
  assert.equal(c.metriDaKg(6500, 1500, 2), 802);   // 802,47 → 802 (spec §2.7)
});

test("kgDaMetri: inverso", () => {
  assert.equal(c.kgDaMetri(500, 1500, 2), 4050);
});

test("costanti dello spec", () => {
  assert.equal(c.SOGLIA_CONTROLLO_MIN, 20);
  assert.equal(c.SOGLIA_BOLLA_PCT, 3);
  assert.equal(c.TOLLERANZA_PCT, 10);
  assert.equal(c.GLOSS_PERP_MAX, 40);
  assert.equal(c.GLOSS_PAR_MAX, 60);
  assert.equal(c.TOLLERANZA_BILANCIO, 1.02);
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `node --test tests/test-comune.mjs`
Expected: FAIL — `Cannot find module '.../js/comune.js'`.

- [ ] **Step 3: Implementa**

`js/comune.js`:
```js
// ============================================================
// Piattaforma Produzione Overland — comune.js
// Costanti e FUNZIONI PURE. Nessun import, nessun DOM, nessuna rete:
// questo file gira identico nel browser e nei test Node.
// Le tre regole duplicate col DB (fuoriRange, codiciFigli, bilancioChiusura)
// sono dichiarate nello spec §2.6/§3.7 e coperte dal test di coerenza.
// ============================================================

export const SOGLIA_CONTROLLO_MIN = 20;   // minuti senza controllo → banner colorato (manuale: ogni 20')
export const SOGLIA_BOLLA_PCT = 3;        // differenza netto/bolla oltre cui avvisare
export const TOLLERANZA_PCT = 10;         // ±10 % su velocità, ampere, micron
export const GLOSS_PERP_MAX = 40;         // manuale: perpendicolare "minore di 40" → fuori se ≥ 40
export const GLOSS_PAR_MAX = 60;          // manuale: parallelo "minore di 60" → fuori se ≥ 60
export const TOLLERANZA_BILANCIO = 1.02;  // Σ figli + residuo ≤ disponibile × 1,02
export const PESO_SPECIFICO_AL = 2.7;     // kg/dm³ — documentativa: la formula sotto usa 27/10000 per restare esatta

// kg al metro = larghezza (mm) × spessore (mm) × 2,7 / 1000. Scritta come ×27/10000 perché
// in virgola mobile 1500·2·2.7/1000 dà 8.100000000000001, mentre 1500·2·27/10000 dà 8.1.
export function kgAlMetro(larghezzaMm, spessoreMm) {
  return (larghezzaMm * spessoreMm * 27) / 10000;
}

export function metriDaKg(kg, larghezzaMm, spessoreMm) {
  return Math.round(kg / kgAlMetro(larghezzaMm, spessoreMm));
}

export function kgDaMetri(metri, larghezzaMm, spessoreMm) {
  return metri * kgAlMetro(larghezzaMm, spessoreMm);
}
```

- [ ] **Step 4: Esegui il test e verifica che passi**

Run: `node --test tests/test-comune.mjs`
Expected: `# pass 4`, `# fail 0`, nessun warning `MODULE_TYPELESS_PACKAGE_JSON` (se compare, manca `package.json` del Task 0).

- [ ] **Step 5: Commit**

```bash
git add js/comune.js tests/test-comune.mjs
git commit -m "feat(comune): costanti e formule kg/metri del manuale con test"
```

---

### Task 2: `codiciFigli`

**Files:**
- Modify: `js/comune.js`
- Test: `tests/test-comune.mjs`

**Interfaces:**
- Produces: `codiciFigli(nProg, nFigli, kgResidui, nFigliEsistenti = 0) → string[]`. Regola spec §2.7: nessun suffisso **solo se** `nFigli === 1 && kgResidui === 0 && nFigliEsistenti === 0`; altrimenti lettere `A, B, …` a partire da `nFigliEsistenti`.

- [ ] **Step 1: Test che fallisce** (aggiungi in coda a `tests/test-comune.mjs`)

```js
test("codiciFigli: caso A puro → nessun suffisso", () => {
  assert.deepEqual(c.codiciFigli("A5000", 1, 0, 0), ["A5000"]);
});
test("codiciFigli: caso B → /A /B", () => {
  assert.deepEqual(c.codiciFigli("A5000", 2, 0, 0), ["A5000/A", "A5000/B"]);
});
test("codiciFigli: caso C con un solo figlio → /A", () => {
  assert.deepEqual(c.codiciFigli("A5000", 1, 2450, 0), ["A5000/A"]);
});
test("codiciFigli: secondo giro dopo un caso C → continua da /B", () => {
  assert.deepEqual(c.codiciFigli("A5000", 1, 0, 1), ["A5000/B"]);
  assert.deepEqual(c.codiciFigli("A5000", 2, 0, 1), ["A5000/B", "A5000/C"]);
});
test("codiciFigli: zero figli è un errore; oltre 26 lettere è un errore", () => {
  assert.throws(() => c.codiciFigli("A5000", 0, 0, 0), /almeno un rotolo/);
  assert.throws(() => c.codiciFigli("A5000", 2, 0, 25), /Troppi rotoli/);
});
```

- [ ] **Step 2: Esegui, verifica FAIL** — Run: `node --test tests/test-comune.mjs` → `c.codiciFigli is not a function`.

- [ ] **Step 3: Implementa** (in coda a `js/comune.js`)

```js
// Regola dei codici (spec §2.7). Duplicata in chiudi_lavorazione: la verità è la RPC.
export function codiciFigli(nProg, nFigli, kgResidui, nFigliEsistenti = 0) {
  if (!Number.isInteger(nFigli) || nFigli < 1) throw new Error("Serve almeno un rotolo finito");
  if (nFigliEsistenti + nFigli > 26) throw new Error("Troppi rotoli finiti da questo grezzo");
  if (nFigli === 1 && kgResidui === 0 && nFigliEsistenti === 0) return [nProg];
  return Array.from({ length: nFigli }, (_, i) =>
    `${nProg}/${String.fromCharCode(65 + nFigliEsistenti + i)}`);
}
```

- [ ] **Step 4: Esegui, verifica PASS** — `# fail 0`.

- [ ] **Step 5: Commit** — `git add js/comune.js tests/test-comune.mjs && git commit -m "feat(comune): codiciFigli con i casi A/B/C e il secondo giro"`

---

### Task 3: `prossimoNProg`

**Files:** Modify `js/comune.js`; Test `tests/test-comune.mjs`

**Interfaces:**
- Produces: `prossimoNProg(codici: string[], lettera = "A") → string`. Considera solo i codici nel formato `^[A-Z]\d+$` con la stessa lettera; ritorna `lettera + (max+1)` con lo stesso numero di cifre del massimo (minimo 4); se nessuno, `lettera + "0001"`. Ignora `COLLAUDO-000x` (spec §2.2).

- [ ] **Step 1: Test che fallisce**

```js
test("prossimoNProg: massimo mai usato + 1, stessa lettera, ignora i codici fuori formato", () => {
  const usati = ["A4999", "A5000", "COLLAUDO-0001", "B0012", "A5000/A"];
  assert.equal(c.prossimoNProg(usati, "A"), "A5001");
  assert.equal(c.prossimoNProg(usati, "B"), "B0013");
  assert.equal(c.prossimoNProg(usati, "C"), "C0001");
  assert.equal(c.prossimoNProg([], "A"), "A0001");
});
```

- [ ] **Step 2: FAIL** — `c.prossimoNProg is not a function`.

- [ ] **Step 3: Implementa**

```js
// Proposta del prossimo numero progressivo (spec §2.2): massimo mai usato con la
// stessa lettera + 1. Scostamento dichiarato da procedure §3.3.
export function prossimoNProg(codici, lettera = "A") {
  if (!/^[A-Z]$/.test(lettera)) throw new Error("La lettera deve essere una maiuscola A-Z");
  const re = new RegExp(`^${lettera}(\\d+)$`);
  let max = 0, cifre = 4;
  for (const cod of codici) {
    const m = re.exec(cod);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    if (n > max) { max = n; cifre = Math.max(4, m[1].length); }
  }
  return lettera + String(max + 1).padStart(cifre, "0");
}
```

- [ ] **Step 4: PASS** · **Step 5: Commit** — `git commit -m "feat(comune): prossimoNProg"`

---

### Task 4: `fuoriRange`

**Files:** Modify `js/comune.js`; Test `tests/test-comune.mjs`

**Interfaces:**
- Produces: `fuoriRange(controllo, rif) → { temp_sgrassatura_fuori, temp_satina_fuori, temp_ossido_fuori, temp_fissaggio_fuori, velocita_m_min_fuori, corrente_a_fuori, micron_fuori, gloss_perpendicolare_fuori, gloss_parallelo_fuori, n_fuori }`.
  `controllo` ha i campi di `controlli` (spec §2.5). `rif` ha: `sgrassatura_temp_min/max`, `satina_temp_min/max`, `ossido_temp_min/max`, `fissaggio_temp_min/max`, `velocita_prevista`, `ampere_previsti`, `micron_previsti`, `tipo` (`naturale`|`satinato`). **Gli stessi nomi delle colonne della vista `controlli_scostamenti`** (Task 9).

- [ ] **Step 1: Test che fallisce**

```js
const RIF_SAT = { sgrassatura_temp_min: 52, sgrassatura_temp_max: 68, satina_temp_min: 50, satina_temp_max: 58,
  ossido_temp_min: 33, ossido_temp_max: 39, fissaggio_temp_min: 92, fissaggio_temp_max: 98,
  velocita_prevista: 2.3, ampere_previsti: 8400, micron_previsti: 5, tipo: "satinato" };
const RIF_NAT = { ...RIF_SAT, tipo: "naturale" };

test("fuoriRange: dentro i range → niente fuori", () => {
  const r = c.fuoriRange({ temp_sgrassatura: 60, temp_ossido: 37, velocita_m_min: 2.3, corrente_a: 8400,
    micron: 5, gloss_perpendicolare: 30, gloss_parallelo: 50 }, RIF_SAT);
  assert.equal(r.n_fuori, 0);
});
test("fuoriRange: temperatura sotto il minimo e sopra il massimo", () => {
  assert.equal(c.fuoriRange({ temp_ossido: 32 }, RIF_SAT).temp_ossido_fuori, true);
  assert.equal(c.fuoriRange({ temp_ossido: 40 }, RIF_SAT).temp_ossido_fuori, true);
  assert.equal(c.fuoriRange({ temp_ossido: 39 }, RIF_SAT).temp_ossido_fuori, false);
});
test("fuoriRange: valore null o range assente → mai fuori", () => {
  assert.equal(c.fuoriRange({ temp_ossido: null }, RIF_SAT).temp_ossido_fuori, false);
  assert.equal(c.fuoriRange({ temp_ossido: 99 }, { ...RIF_SAT, ossido_temp_min: null }).temp_ossido_fuori, false);
});
test("fuoriRange: ±10 % su velocità, ampere, micron", () => {
  assert.equal(c.fuoriRange({ velocita_m_min: 2.6 }, RIF_SAT).velocita_m_min_fuori, true);   // +13 %
  assert.equal(c.fuoriRange({ velocita_m_min: 2.5 }, RIF_SAT).velocita_m_min_fuori, false);  // +8,7 %
  assert.equal(c.fuoriRange({ corrente_a: 7500 }, RIF_SAT).corrente_a_fuori, true);          // −10,7 %
  assert.equal(c.fuoriRange({ micron: 4.4 }, RIF_SAT).micron_fuori, true);                  // −12 %
  assert.equal(c.fuoriRange({ micron: 5.5 }, RIF_SAT).micron_fuori, false);                 // +10 % esatto → dentro
});
test("fuoriRange: gloss con soglia ≥, solo per schede satinate", () => {
  assert.equal(c.fuoriRange({ gloss_perpendicolare: 40 }, RIF_SAT).gloss_perpendicolare_fuori, true);
  assert.equal(c.fuoriRange({ gloss_perpendicolare: 39.9 }, RIF_SAT).gloss_perpendicolare_fuori, false);
  assert.equal(c.fuoriRange({ gloss_parallelo: 60 }, RIF_SAT).gloss_parallelo_fuori, true);
  assert.equal(c.fuoriRange({ gloss_perpendicolare: 80, gloss_parallelo: 90 }, RIF_NAT).n_fuori, 0);
});
```

- [ ] **Step 2: FAIL** — `c.fuoriRange is not a function`.

- [ ] **Step 3: Implementa**

```js
// Scostamenti (spec §2.6). Stessa regola della vista controlli_scostamenti: qui serve
// solo per colorare subito il campo sul tablet; il giudizio vero lo dà la vista.
const fuoriMinMax = (v, min, max) =>
  v != null && min != null && max != null && (v < min || v > max);
const fuoriPct = (v, rif) =>
  v != null && rif != null && rif !== 0 && Math.abs(v - rif) / rif > TOLLERANZA_PCT / 100;

export function fuoriRange(ctl, rif) {
  const satinato = rif.tipo === "satinato";
  const f = {
    temp_sgrassatura_fuori: fuoriMinMax(ctl.temp_sgrassatura, rif.sgrassatura_temp_min, rif.sgrassatura_temp_max),
    temp_satina_fuori:      fuoriMinMax(ctl.temp_satina,      rif.satina_temp_min,      rif.satina_temp_max),
    temp_ossido_fuori:      fuoriMinMax(ctl.temp_ossido,      rif.ossido_temp_min,      rif.ossido_temp_max),
    temp_fissaggio_fuori:   fuoriMinMax(ctl.temp_fissaggio,   rif.fissaggio_temp_min,   rif.fissaggio_temp_max),
    velocita_m_min_fuori:   fuoriPct(ctl.velocita_m_min, rif.velocita_prevista),
    corrente_a_fuori:       fuoriPct(ctl.corrente_a,     rif.ampere_previsti),
    micron_fuori:           fuoriPct(ctl.micron,         rif.micron_previsti),
    gloss_perpendicolare_fuori: satinato && ctl.gloss_perpendicolare != null && ctl.gloss_perpendicolare >= GLOSS_PERP_MAX,
    gloss_parallelo_fuori:      satinato && ctl.gloss_parallelo != null && ctl.gloss_parallelo >= GLOSS_PAR_MAX,
  };
  f.n_fuori = Object.values(f).filter(Boolean).length;
  return f;
}
```

- [ ] **Step 4: PASS**. Attenzione al test `micron: 5.5`: `Math.abs(5.5 − 5) / 5 = 0.1` e `0.1 > 0.1` è falso → dentro, come vuole lo spec ("> 0,10").

- [ ] **Step 5: Commit** — `git commit -m "feat(comune): fuoriRange con le regole della vista scostamenti"`

---

### Task 5: `annotazioniDaEventi`

**Files:** Modify `js/comune.js`; Test `tests/test-comune.mjs`

**Interfaces:**
- Produces: `annotazioniDaEventi(eventi) → string`. `eventi` = righe di `eventi` con in più `tipo_difetto_nome` (join su `tipi_difetto`). Include **solo fatti**: `giunta_film`, `taglio_film`, `primi_metri_non_ossidati`, `difetto`; esclude fermo, ripartenza, aggiunta, nota; mai `causa_probabile`/`azione`. Ordinati per `contametri`. Numeri in formato italiano (`1.250`).

- [ ] **Step 1: Test che fallisce**

```js
test("annotazioniDaEventi: solo fatti, ordinati per metri, formato italiano (esempio spec §3.7)", () => {
  const ev = [
    { tipo: "difetto", contametri: 2100, tipo_difetto_nome: "Graffi", tipo_difetto_causa: "rulli" },
    { tipo: "fermo", contametri: 900, causa_fermo: "guasto" },
    { tipo: "giunta_film", contametri: 1250 },
    { tipo: "primi_metri_non_ossidati", contametri: 15 },
    { tipo: "aggiunta", contametri: 1000, prodotto: "satina", litri: 200 },
    { tipo: "nota", contametri: 50, descrizione: "test" },
  ];
  assert.equal(c.annotazioniDaEventi(ev), "Primi 15 m non ossidati. Giunta film a 1.250 m. Graffi a 2.100 m.");
});
test("annotazioniDaEventi: senza eventi rilevanti → stringa vuota", () => {
  assert.equal(c.annotazioniDaEventi([{ tipo: "fermo", contametri: 10 }]), "");
});
```

- [ ] **Step 2: FAIL**

- [ ] **Step 3: Implementa**

```js
// Precompilazione delle annotazioni per il cliente (spec §3.7): solo fatti, mai la diagnosi.
// useGrouping "always": l'italiano di default non separa le migliaia sotto i 10.000 (1250 → "1250")
const fmtM = (n) => new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0, useGrouping: "always" }).format(n ?? 0);

export function annotazioniDaEventi(eventi) {
  const frasi = [...eventi]
    .filter((e) => ["giunta_film", "taglio_film", "primi_metri_non_ossidati", "difetto"].includes(e.tipo))
    .sort((a, b) => (a.contametri ?? 0) - (b.contametri ?? 0))
    .map((e) => {
      switch (e.tipo) {
        case "giunta_film": return `Giunta film a ${fmtM(e.contametri)} m.`;
        case "taglio_film": return `Taglio film a ${fmtM(e.contametri)} m.`;
        case "primi_metri_non_ossidati": return `Primi ${fmtM(e.contametri)} m non ossidati.`;
        case "difetto": return `${e.tipo_difetto_nome ?? "Difetto"} a ${fmtM(e.contametri)} m.`;
      }
    });
  return frasi.join(" ");
}
```

- [ ] **Step 4: PASS** · **Step 5: Commit** — `git commit -m "feat(comune): annotazioniDaEventi, solo fatti"`

---

### Task 6: `residuoProposto` e `bilancioChiusura`

**Files:** Modify `js/comune.js`; Test `tests/test-comune.mjs`

**Interfaces:**
- Produces: `residuoProposto(kgDisponibiliStimati, contametriInizio, contametriFine, larghezzaMm, spessoreMm) → integer kg` (spec §2.7: `coalesce(kg_residui, peso_bolla_kg) − metri lavorati × kg_al_metro`).
- Produces: `bilancioChiusura({ pesoConImballo, pesoImballo, pesoTubolare, figli: [{ pesoLordo, pesoTubolare }], kgResidui }) → { kgFigli, disponibile, tetto, ok, eccesso, kgScarto }`. `pesoTubolare` può essere `null` (caso C): `disponibile` usa 0 al suo posto, `kgScarto` è `null`.

- [ ] **Step 1: Test che fallisce** — l'esempio dello spec §2.7, entrambi i giri

```js
test("residuoProposto: esempio spec, primo giro → 2.450", () => {
  assert.equal(c.residuoProposto(6500, 100, 600, 1500, 2), 2450);
});
test("bilancioChiusura: primo giro (caso C, tubolare null)", () => {
  const b = c.bilancioChiusura({ pesoConImballo: 6540, pesoImballo: 45, pesoTubolare: null,
    figli: [{ pesoLordo: 4090, pesoTubolare: 40 }], kgResidui: 2450 });
  assert.equal(b.kgFigli, 4050);
  assert.equal(b.disponibile, 6495);
  assert.equal(Number(b.tetto.toFixed(1)), 6624.9);
  assert.equal(b.ok, true);
  assert.equal(b.kgScarto, null);
});
test("bilancioChiusura: secondo giro (caso A con imballo 0, tubolare 60)", () => {
  const b = c.bilancioChiusura({ pesoConImballo: 2500, pesoImballo: 0, pesoTubolare: 60,
    figli: [{ pesoLordo: 2410, pesoTubolare: 40 }], kgResidui: 0 });
  assert.equal(b.kgFigli, 2370);
  assert.equal(b.disponibile, 2440);
  assert.equal(b.ok, true);
  assert.equal(b.kgScarto, 70);
});
test("bilancioChiusura: oltre il tetto → non ok, con l'eccesso in kg", () => {
  const b = c.bilancioChiusura({ pesoConImballo: 1000, pesoImballo: 0, pesoTubolare: 0,
    figli: [{ pesoLordo: 1100, pesoTubolare: 50 }], kgResidui: 0 });
  assert.equal(b.ok, false);
  assert.equal(b.eccesso, 30);   // 1050 − 1020
});
```

- [ ] **Step 2: FAIL**

- [ ] **Step 3: Implementa**

```js
// Residuo del caso C (spec §2.7): in kg, senza passare dai metri arrotondati.
export function residuoProposto(kgDisponibiliStimati, contametriInizio, contametriFine, larghezzaMm, spessoreMm) {
  const metriLavorati = contametriFine - contametriInizio;
  return Math.round(kgDisponibiliStimati - metriLavorati * kgAlMetro(larghezzaMm, spessoreMm));
}

// Bilancio di chiusura (spec §2.7). Duplicato nella RPC chiudi_lavorazione: la verità è la RPC.
export function bilancioChiusura({ pesoConImballo, pesoImballo, pesoTubolare, figli, kgResidui }) {
  const kgFigli = figli.reduce((s, f) => s + (f.pesoLordo - (f.pesoTubolare ?? 0)), 0);
  const disponibile = pesoConImballo - pesoImballo - (pesoTubolare ?? 0);
  const tetto = disponibile * TOLLERANZA_BILANCIO;
  const totale = kgFigli + (kgResidui ?? 0);
  const ok = totale <= tetto;
  return {
    kgFigli, disponibile, tetto, ok,
    eccesso: ok ? 0 : Math.round(totale - tetto),
    kgScarto: pesoTubolare == null ? null : disponibile - kgFigli - (kgResidui ?? 0),
  };
}
```

- [ ] **Step 4: PASS** — `node --test tests/test-comune.mjs` → tutti verdi.

- [ ] **Step 5: Commit** — `git commit -m "feat(comune): residuoProposto e bilancioChiusura sull'esempio dello spec"`

---

### Task 7: Progetto Supabase e `000_setup.sql` sezione **a** — ruoli, helper, trigger `imposta_modificato`, anagrafiche, `rotoli_grezzi`, vista reparto

**Files:**
- Create: `sql/000_setup.sql` (sezione a; le sezioni b-e si appendono nei Task 8-11)
- Modify: `CLAUDE.md` (ref del progetto)

**Interfaces:**
- Produces: funzioni `ruolo_utente() → text`, `e_ufficio() → boolean`, `e_reparto() → boolean`, `imposta_modificato() → trigger`; tabelle `utenti_app`, `operatori`, `schede_lavorazione`, `tipi_difetto`, `rotoli_grezzi`; vista `rotoli_grezzi_reparto`.

- [ ] **Step 1: Crea il progetto Supabase** (azione che richiede conferma esplicita del committente perché può avere un costo)

Con il connettore: `get_cost` (type `project`, organizzazione `yhdpbsndngekypqxcyfj`) → mostrare il costo → `confirm_cost` → `create_project` con `name: "Overland Produzione"`, `region: "eu-central-1"`. Se il connettore non è disponibile, il committente lo crea dalla dashboard (New project → nome `Overland Produzione`, regione Frankfurt eu-central-1) e comunica il ref.
Annotare il **ref** in `CLAUDE.md` alla riga "Progetto Supabase". Da qui in avanti, **prima di ogni `apply_migration`/`execute_sql`**: `get_project` deve restituire quel ref.

- [ ] **Step 2: Scrivi la sezione a in `sql/000_setup.sql`**

```sql
-- ============================================================
-- Piattaforma Produzione Overland — 000_setup.sql
-- Fase 0. Spec: docs/superpowers/specs/2026-09-03-ciclo-bobina-design.md
-- Sezione a: ruoli, helper, trigger modificato, anagrafiche, rotoli grezzi
-- ============================================================

-- ---------- Verifiche preliminari (sezione a) ----------
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'rotoli_grezzi') then
    raise exception 'Schema già presente: non rieseguire 000_setup.sql';
  end if;
end $$;

-- ---------- Ruoli applicativi ----------
create table utenti_app (
  uid   uuid primary key,                       -- = auth.users.id
  ruolo text not null check (ruolo in ('ufficio','reparto'))
);
alter table utenti_app enable row level security;   -- nessuna policy: nessun accesso via API
revoke all on utenti_app from anon, authenticated;

create or replace function ruolo_utente() returns text
language sql stable security definer set search_path = public as $$
  select ruolo from utenti_app where uid = auth.uid()
$$;
revoke execute on function ruolo_utente() from public, anon;
grant execute on function ruolo_utente() to authenticated;

create or replace function e_ufficio() returns boolean
language sql stable set search_path = public as $$
  select coalesce(ruolo_utente(), '') = 'ufficio'
$$;
create or replace function e_reparto() returns boolean
language sql stable set search_path = public as $$
  select coalesce(ruolo_utente(), '') = 'reparto'
$$;

-- ---------- Trigger: chi e quando ha modificato ----------
-- Il client non ha grant su modificato_da/modificato_il: le scrive solo questo trigger.
-- Dalle sessioni SQL (seed, migrazioni) ruolo_utente() è null → 'sistema'.
create or replace function imposta_modificato() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.modificato_da := coalesce(ruolo_utente(), 'sistema');
  new.modificato_il := now();
  return new;
end $$;

-- ---------- Anagrafiche ----------
create table operatori (
  id        uuid primary key default gen_random_uuid(),
  nome      text not null unique,
  ruolo     text not null default 'operatore' check (ruolo in ('operatore','capoturno')),
  attivo    boolean not null default true,
  creato_il timestamptz not null default now()
);

create table schede_lavorazione (
  id                    uuid primary key default gen_random_uuid(),
  lavorazione           text not null,
  tipo                  text not null check (tipo in ('naturale','satinato')),
  micron                numeric not null check (micron > 0),
  finitura              text,
  lega                  text,
  spessore_min          numeric not null check (spessore_min > 0),
  spessore_max          numeric not null check (spessore_max >= spessore_min),
  larghezza_min         numeric not null check (larghezza_min > 0),
  larghezza_max         numeric not null check (larghezza_max >= larghezza_min),
  velocita_m_min        numeric,
  ossido_ampere         numeric,
  sgrassatura_prodotto  text, sgrassatura_temp numeric, sgrassatura_temp_min numeric, sgrassatura_temp_max numeric,
  satina_prodotto       text, satina_temp      numeric, satina_temp_min      numeric, satina_temp_max      numeric,
  ossido_prodotto       text, ossido_temp      numeric, ossido_temp_min      numeric, ossido_temp_max      numeric,
  fissaggio_prodotto    text, fissaggio_temp   numeric, fissaggio_temp_min   numeric, fissaggio_temp_max   numeric,
  note                  text,
  creato_il             timestamptz not null default now()
);

create table tipi_difetto (
  id              uuid primary key default gen_random_uuid(),
  codice          text not null unique,
  nome            text not null,
  causa_probabile text,
  azione          text,
  ordine          integer not null default 0
);

-- ---------- Rotolo grezzo ----------
create table rotoli_grezzi (
  id             uuid primary key default gen_random_uuid(),
  n_prog         text not null unique,
  fornitore      text,                              -- non visibile al reparto (vista)
  rif_bolla      text,                              -- non visibile al reparto (vista)
  cliente        text,
  lega           text,
  finitura       text,
  spessore_mm    numeric not null check (spessore_mm > 0),
  larghezza_mm   numeric not null check (larghezza_mm > 0),
  peso_bolla_kg  numeric not null check (peso_bolla_kg > 0),
  kg_residui     numeric check (kg_residui >= 0),   -- kg netti di alluminio, tubolare escluso; null = mai lavorato; 0 = esaurito
  data_arrivo    date,
  posizione      text,
  note           text,
  stato          text not null default 'grezzo' check (stato in ('grezzo','in_lavorazione','esaurito')),
  -- formula del manuale: larg (mm) × sp (mm) × 2,7 / 1000 = kg al metro
  kg_al_metro    numeric generated always as (larghezza_mm * spessore_mm * 2.7 / 1000) stored,
  -- la formula è RIPETUTA per esteso: Postgres non ammette una colonna generata su un'altra generata
  metri_stimati  integer generated always as
                 (round(coalesce(kg_residui, peso_bolla_kg) / (larghezza_mm * spessore_mm * 2.7 / 1000))::integer) stored,
  modificato_da  text,
  modificato_il  timestamptz,
  creato_il      timestamptz not null default now()
);
create trigger trg_rotoli_grezzi_modificato before insert or update on rotoli_grezzi
  for each row execute function imposta_modificato();

-- Vista per il reparto: tutto tranne fornitore e rif_bolla (decisione del committente).
-- security_invoker = false: la vista è di postgres (proprietario di rotoli_grezzi) e scavalca
-- la RLS della tabella, che è in select al solo ufficio. È l'unica vista scritta così.
create view rotoli_grezzi_reparto with (security_invoker = false) as
  select id, n_prog, cliente, lega, finitura, spessore_mm, larghezza_mm, peso_bolla_kg,
         kg_residui, data_arrivo, posizione, note, stato, kg_al_metro, metri_stimati, creato_il
  from rotoli_grezzi;

-- ---------- Verifiche finali (sezione a) ----------
do $$ begin
  assert (select count(*) from information_schema.tables where table_schema = 'public'
          and table_name in ('utenti_app','operatori','schede_lavorazione','tipi_difetto','rotoli_grezzi')) = 5,
         'mancano tabelle della sezione a';
  assert (select count(*) from information_schema.views where table_schema = 'public'
          and table_name = 'rotoli_grezzi_reparto') = 1, 'manca la vista rotoli_grezzi_reparto';
end $$;
```

- [ ] **Step 3: Backup (vuoto) e applicazione**

Backup: `list_tables` sullo schema `public` → deve essere vuoto; annotare "backup 0 tabelle, <ora>" nello STATO provvisorio.
Applica con `apply_migration` (`name: "000a_ruoli_anagrafiche_grezzi"`) il contenuto della sezione a.
Expected: nessun errore; `list_tables` mostra le cinque tabelle.

- [ ] **Step 4: Verifica la colonna generata**

`execute_sql`:
```sql
insert into rotoli_grezzi (n_prog, spessore_mm, larghezza_mm, peso_bolla_kg) values ('PROVA-0001', 2, 1500, 6500);
select kg_al_metro, metri_stimati, stato, modificato_da from rotoli_grezzi where n_prog = 'PROVA-0001';
delete from rotoli_grezzi where n_prog = 'PROVA-0001';
```
Expected: `8.1`, `802`, `grezzo`, `sistema`.

- [ ] **Step 5: Commit**

```bash
git add sql/000_setup.sql CLAUDE.md
git commit -m "feat(sql): sezione a — ruoli, helper, trigger modificato, anagrafiche, rotoli grezzi, vista reparto"
```

---

### Task 8: `000_setup.sql` sezione **b** — `pianificazione`, `lavorazioni`, `rotoli_lavorati`, `controlli`, `eventi`, trigger dei fermi

**Files:** Modify `sql/000_setup.sql` (appendi la sezione b)

**Interfaces:**
- Produces: le cinque tabelle con i vincoli dello spec §2.3-§2.5; trigger `eventi_fermo_durata` (before, fermi) e `eventi_ripartenza` (after, ripartenze).

- [ ] **Step 1: Appendi la sezione b**

```sql
-- ============================================================
-- Sezione b: pianificazione, lavorazioni, rotoli lavorati, controlli, eventi
-- ============================================================
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'lavorazioni') then
    raise exception 'Sezione b già applicata: non rieseguire';
  end if;
end $$;

create table pianificazione (
  id                    uuid primary key default gen_random_uuid(),
  settimana             date not null,             -- il lunedì
  posizione             integer not null,
  rotolo_grezzo_id      uuid not null references rotoli_grezzi(id),
  scheda_lavorazione_id uuid references schede_lavorazione(id),
  suddivisione_prevista text,
  note                  text,
  modificato_da         text,
  modificato_il         timestamptz,
  creato_il             timestamptz not null default now(),
  unique (settimana, posizione)                    -- lo stesso residuo può comparire due volte nella settimana
);
create trigger trg_pianificazione_modificato before insert or update on pianificazione
  for each row execute function imposta_modificato();

create table lavorazioni (
  id                    uuid primary key default gen_random_uuid(),
  rotolo_grezzo_id      uuid not null references rotoli_grezzi(id),
  pianificazione_id     uuid references pianificazione(id),
  linea                 text not null default '1500' check (linea in ('1500','750')),
  scheda_lavorazione_id uuid not null references schede_lavorazione(id),
  velocita_prevista     numeric,                   -- snapshot dalla scheda all'avvio
  ampere_previsti       numeric,
  micron_previsti       numeric,
  operatore_avvio_id    uuid not null references operatori(id),
  avviata_il            timestamptz not null default now(),
  peso_con_imballo_kg   numeric not null check (peso_con_imballo_kg > 0),
  peso_imballo_kg       numeric not null default 0 check (peso_imballo_kg >= 0),
  contametri_inizio     numeric not null default 0,
  peso_tubolare_kg      numeric check (peso_tubolare_kg >= 0),   -- null = caso C
  contametri_fine       numeric,
  operatore_chiusura_id uuid references operatori(id),
  chiusa_il             timestamptz,
  kg_residui_dichiarati numeric not null default 0 check (kg_residui_dichiarati >= 0),
  stato                 text not null default 'aperta' check (stato in ('aperta','chiusa','annullata')),
  stampata_il           timestamptz,
  motivo_annullo        text,
  note                  text,
  modificato_da         text,
  modificato_il         timestamptz,
  creato_il             timestamptz not null default now(),
  check (peso_imballo_kg < peso_con_imballo_kg),
  -- invariante del caso C nel database: tubolare null ⇔ residuo dichiarato > 0 (solo sulle chiuse)
  constraint lavorazioni_caso_c check (stato <> 'chiusa' or (kg_residui_dichiarati > 0) = (peso_tubolare_kg is null))
);
create unique index lavorazioni_una_aperta_per_linea on lavorazioni (linea) where stato = 'aperta';
create index lavorazioni_grezzo on lavorazioni (rotolo_grezzo_id);
create trigger trg_lavorazioni_modificato before insert or update on lavorazioni
  for each row execute function imposta_modificato();

create table rotoli_lavorati (
  id                  uuid primary key default gen_random_uuid(),
  codice              text not null unique,
  lavorazione_id      uuid not null references lavorazioni(id),
  rotolo_grezzo_id    uuid not null references rotoli_grezzi(id),
  peso_lordo_kg       numeric not null check (peso_lordo_kg > 0),
  peso_tubolare_kg    numeric not null default 0 check (peso_tubolare_kg >= 0),
  peso_netto_kg       numeric generated always as (peso_lordo_kg - peso_tubolare_kg) stored,
  metri               integer,
  cliente             text,
  film                boolean not null default false,
  tipo_film           text,
  annotazioni_cliente text,
  modificato_da       text,
  modificato_il       timestamptz,
  creato_il           timestamptz not null default now(),
  check (peso_lordo_kg > peso_tubolare_kg)
);
create index rotoli_lavorati_grezzo on rotoli_lavorati (rotolo_grezzo_id);
create trigger trg_rotoli_lavorati_modificato before insert or update on rotoli_lavorati
  for each row execute function imposta_modificato();

create table controlli (
  id                   uuid primary key default gen_random_uuid(),
  lavorazione_id       uuid not null references lavorazioni(id),
  rilevato_il          timestamptz not null default now(),
  operatore_id         uuid references operatori(id),
  momento              text not null default 'periodico' check (momento in ('inizio','meta','fine','periodico')),
  contametri           numeric,
  velocita_m_min       numeric,
  corrente_a           numeric,
  tensione_v           numeric,
  temp_sgrassatura     numeric,
  temp_satina          numeric,
  temp_ossido          numeric,
  temp_fissaggio       numeric,
  micron               numeric,
  gloss_parallelo      numeric,
  gloss_perpendicolare numeric,
  note                 text,
  modificato_da        text,
  modificato_il        timestamptz,
  creato_il            timestamptz not null default now()
);
create index controlli_lavorazione on controlli (lavorazione_id, rilevato_il);
create trigger trg_controlli_modificato before insert or update on controlli
  for each row execute function imposta_modificato();

create table eventi (
  id              uuid primary key default gen_random_uuid(),
  lavorazione_id  uuid not null references lavorazioni(id),
  avvenuto_il     timestamptz not null default now(),
  operatore_id    uuid references operatori(id),
  tipo            text not null check (tipo in ('difetto','fermo','ripartenza','aggiunta','giunta_film','taglio_film','primi_metri_non_ossidati','nota')),
  contametri      numeric,
  tipo_difetto_id uuid references tipi_difetto(id),
  causa_fermo     text check (causa_fermo in ('guasto','bagno','cambio_rotolo','esterno','altro')),
  prodotto        text,
  litri           numeric,
  fermo_id        uuid references eventi(id),   -- ripartenza → il fermo che chiude
  durata_min      integer,                      -- sulla riga del FERMO, scritta solo dai trigger
  metri_scarto    numeric,                      -- sulla ripartenza; proposto 100 (prudenziale)
  descrizione     text,
  modificato_da   text,
  modificato_il   timestamptz,
  creato_il       timestamptz not null default now()
);
create index eventi_lavorazione on eventi (lavorazione_id, avvenuto_il);
create unique index eventi_un_fermo_una_ripartenza on eventi (fermo_id) where fermo_id is not null;
create trigger trg_eventi_modificato before insert or update on eventi
  for each row execute function imposta_modificato();

-- Trigger 1 (BEFORE, solo righe di tipo fermo): assegna new.durata_min dalla ripartenza che
-- lo punta. È un assegnamento su NEW, nessun update: non innesca nulla.
-- È QUESTO trigger che produce il valore vero di durata_min.
create or replace function eventi_fermo_durata() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select round(extract(epoch from (r.avvenuto_il - new.avvenuto_il)) / 60)::integer
    into new.durata_min
    from eventi r where r.tipo = 'ripartenza' and r.fermo_id = new.id;
  return new;
end $$;
create trigger trg_eventi_fermo before insert or update on eventi
  for each row when (new.tipo = 'fermo') execute function eventi_fermo_durata();

-- Trigger 2 (AFTER, solo righe di tipo ripartenza): valida il fermo puntato e "tocca" la sua
-- riga, così il trigger 1 ricalcola durata_min. Non reagisce alle righe di tipo fermo:
-- nessuna ricorsione. Non calcola niente: si limita a toccare la riga.
create or replace function eventi_ripartenza() returns trigger
language plpgsql security definer set search_path = public as $$
declare f eventi;
begin
  if new.fermo_id is null then
    raise exception 'La ripartenza deve indicare il fermo che chiude';
  end if;
  select * into f from eventi where id = new.fermo_id;
  if f.id is null or f.tipo <> 'fermo' then
    raise exception 'L''evento indicato non è un fermo';
  end if;
  if f.lavorazione_id <> new.lavorazione_id then
    raise exception 'Il fermo appartiene a un''altra lavorazione';
  end if;
  if f.avvenuto_il > new.avvenuto_il then
    raise exception 'La ripartenza non può precedere il fermo';
  end if;
  update eventi set avvenuto_il = avvenuto_il where id = new.fermo_id;   -- tocca la riga → trigger 1
  return null;
end $$;
create trigger trg_eventi_ripartenza after insert or update on eventi
  for each row when (new.tipo = 'ripartenza') execute function eventi_ripartenza();

-- ---------- Verifiche finali (sezione b) ----------
do $$ begin
  assert (select count(*) from information_schema.tables where table_schema = 'public'
          and table_name in ('pianificazione','lavorazioni','rotoli_lavorati','controlli','eventi')) = 5,
         'mancano tabelle della sezione b';
  assert (select count(*) from pg_trigger where tgname in ('trg_eventi_fermo','trg_eventi_ripartenza')) = 2,
         'mancano i trigger dei fermi';
end $$;
```

- [ ] **Step 2: Applica** — `apply_migration` (`name: "000b_lavorazioni_controlli_eventi"`) con la sola sezione b. Expected: nessun errore. (Il comportamento dei trigger dei fermi si prova al Task 13 con `test_regole.sql`, in una transazione annullata: nessuna prova manuale qui, per non lasciare righe in produzione.)

- [ ] **Step 3: Commit** — `git add sql/000_setup.sql && git commit -m "feat(sql): sezione b — lavorazioni, rotoli lavorati, controlli, eventi, trigger dei fermi"`

---

### Task 9: `000_setup.sql` sezione **c** — viste `lavorazioni_riepilogo` e `controlli_scostamenti`

**Files:** Modify `sql/000_setup.sql`

**Interfaces:**
- Produces: `lavorazioni_riepilogo` (tutte le colonne di `lavorazioni` + `kg_disponibili`, `kg_figli`, `n_figli`, `kg_scarto`); `controlli_scostamenti` (tutte le colonne di `controlli` + riferimenti + `<campo>_fuori` + `n_fuori`), **con gli stessi nomi di `fuoriRange`** (Task 4).

- [ ] **Step 1: Appendi la sezione c**

```sql
-- ============================================================
-- Sezione c: viste. security_invoker = true: girano con i permessi di chi le interroga
-- (leggono solo tabelle in select a tutti gli autenticati; non toccano rotoli_grezzi).
-- ============================================================
do $$ begin
  if exists (select 1 from information_schema.views where table_schema = 'public' and table_name = 'lavorazioni_riepilogo') then
    raise exception 'Sezione c già applicata: non rieseguire';
  end if;
end $$;

create view lavorazioni_riepilogo with (security_invoker = true) as
select l.*,
       case when l.peso_tubolare_kg is null then null
            else l.peso_con_imballo_kg - l.peso_imballo_kg - l.peso_tubolare_kg end            as kg_disponibili,
       coalesce(f.kg_figli, 0)                                                                 as kg_figli,
       coalesce(f.n_figli, 0)                                                                  as n_figli,
       -- null nel caso C (tubolare ignoto); può essere negativo (eccedenza entro il +2 %)
       case when l.peso_tubolare_kg is null then null
            else l.peso_con_imballo_kg - l.peso_imballo_kg - l.peso_tubolare_kg
                 - coalesce(f.kg_figli, 0) - l.kg_residui_dichiarati end                        as kg_scarto
from lavorazioni l
left join (select lavorazione_id, sum(peso_netto_kg) as kg_figli, count(*) as n_figli
           from rotoli_lavorati group by lavorazione_id) f on f.lavorazione_id = l.id;

create view controlli_scostamenti with (security_invoker = true) as
select x.*,
       (x.temp_sgrassatura_fuori::int + x.temp_satina_fuori::int + x.temp_ossido_fuori::int
        + x.temp_fissaggio_fuori::int + x.velocita_m_min_fuori::int + x.corrente_a_fuori::int
        + x.micron_fuori::int + x.gloss_perpendicolare_fuori::int + x.gloss_parallelo_fuori::int) as n_fuori
from (
  select c.*,
         s.tipo as scheda_tipo, l.velocita_prevista, l.ampere_previsti, l.micron_previsti,
         s.sgrassatura_temp_min, s.sgrassatura_temp_max, s.satina_temp_min, s.satina_temp_max,
         s.ossido_temp_min, s.ossido_temp_max, s.fissaggio_temp_min, s.fissaggio_temp_max,
         -- temperature: fuori se valore e range presenti e valore < min o > max
         (c.temp_sgrassatura is not null and s.sgrassatura_temp_min is not null and s.sgrassatura_temp_max is not null
          and (c.temp_sgrassatura < s.sgrassatura_temp_min or c.temp_sgrassatura > s.sgrassatura_temp_max)) as temp_sgrassatura_fuori,
         (c.temp_satina is not null and s.satina_temp_min is not null and s.satina_temp_max is not null
          and (c.temp_satina < s.satina_temp_min or c.temp_satina > s.satina_temp_max))                 as temp_satina_fuori,
         (c.temp_ossido is not null and s.ossido_temp_min is not null and s.ossido_temp_max is not null
          and (c.temp_ossido < s.ossido_temp_min or c.temp_ossido > s.ossido_temp_max))                 as temp_ossido_fuori,
         (c.temp_fissaggio is not null and s.fissaggio_temp_min is not null and s.fissaggio_temp_max is not null
          and (c.temp_fissaggio < s.fissaggio_temp_min or c.temp_fissaggio > s.fissaggio_temp_max))     as temp_fissaggio_fuori,
         -- ±10 % (TOLLERANZA_PCT) su velocità, ampere, micron rispetto allo snapshot della lavorazione
         (c.velocita_m_min is not null and l.velocita_prevista is not null and l.velocita_prevista <> 0
          and abs(c.velocita_m_min - l.velocita_prevista) / l.velocita_prevista > 0.10)               as velocita_m_min_fuori,
         (c.corrente_a is not null and l.ampere_previsti is not null and l.ampere_previsti <> 0
          and abs(c.corrente_a - l.ampere_previsti) / l.ampere_previsti > 0.10)                       as corrente_a_fuori,
         (c.micron is not null and l.micron_previsti is not null and l.micron_previsti <> 0
          and abs(c.micron - l.micron_previsti) / l.micron_previsti > 0.10)                           as micron_fuori,
         -- gloss: limiti assoluti del manuale (⊥ < 40, ∥ < 60 → fuori se ≥), solo schede satinate
         (s.tipo = 'satinato' and c.gloss_perpendicolare is not null and c.gloss_perpendicolare >= 40) as gloss_perpendicolare_fuori,
         (s.tipo = 'satinato' and c.gloss_parallelo is not null and c.gloss_parallelo >= 60)           as gloss_parallelo_fuori
  from controlli c
  join lavorazioni l on l.id = c.lavorazione_id
  join schede_lavorazione s on s.id = l.scheda_lavorazione_id
) x;

do $$ begin
  assert (select count(*) from information_schema.views where table_schema = 'public'
          and table_name in ('lavorazioni_riepilogo','controlli_scostamenti')) = 2, 'mancano le viste della sezione c';
end $$;
```

- [ ] **Step 2: Applica** — `apply_migration` (`name: "000c_viste"`). Expected: nessun errore.

- [ ] **Step 3: Commit** — `git commit -m "feat(sql): sezione c — viste riepilogo lavorazioni e scostamenti controlli"`

---

### Task 10: `000_setup.sql` sezione **d** — helper interni e le quattro RPC

**Files:** Modify `sql/000_setup.sql`

**Interfaces:**
- Produces: `_codici_figli(p_n_prog, p_n_figli, p_kg_residui, p_n_esistenti) → text[]`; `_controlla_figli_e_bilancio(p_peso_con_imballo, p_peso_imballo, p_peso_tubolare, p_figli, p_kg_residui)` (raise); `_inserisci_figli(p_lavorazione_id, p_grezzo_id, p_figli, p_codici) → void`; RPC `avvia_lavorazione(...) → uuid`, `chiudi_lavorazione(...) → text[]`, `annulla_lavorazione(...) → void`, `registra_lavorazione_completa(...) → jsonb {lavorazione_id, codici, avviso}` con le firme dello spec §2.7.
- `p_figli` è `jsonb`: array di oggetti `{peso_lordo_kg, peso_tubolare_kg, metri, cliente, film, tipo_film, annotazioni_cliente}`.

- [ ] **Step 1: Appendi la sezione d**

```sql
-- ============================================================
-- Sezione d: helper interni (prefisso _) e RPC. Tutte security definer + search_path.
-- Le RPC sono l'UNICO varco di scrittura su lavorazioni e rotoli_lavorati.
-- ============================================================
do $$ begin
  if exists (select 1 from pg_proc where proname = 'avvia_lavorazione' and pronamespace = 'public'::regnamespace) then
    raise exception 'Sezione d già applicata: non rieseguire';
  end if;
end $$;

-- Regola dei codici (spec §2.7). Duplicata in js/comune.js (codiciFigli): qui la verità.
create or replace function _codici_figli(p_n_prog text, p_n_figli integer, p_kg_residui numeric, p_n_esistenti integer)
returns text[] language plpgsql immutable set search_path = public as $$
declare cod text[] := '{}'; i integer;
begin
  if p_n_figli < 1 then raise exception 'Serve almeno un rotolo finito'; end if;
  if p_n_esistenti + p_n_figli > 26 then raise exception 'Troppi rotoli finiti da questo grezzo'; end if;
  if p_n_figli = 1 and p_kg_residui = 0 and p_n_esistenti = 0 then return array[p_n_prog]; end if;
  for i in 0 .. p_n_figli - 1 loop
    cod := cod || (p_n_prog || '/' || chr(65 + p_n_esistenti + i));
  end loop;
  return cod;
end $$;

-- Valida i figli e il bilancio (spec §2.7). Duplicato in js/comune.js (bilancioChiusura).
create or replace function _controlla_figli_e_bilancio(p_peso_con_imballo numeric, p_peso_imballo numeric,
  p_peso_tubolare numeric, p_figli jsonb, p_kg_residui numeric)
returns void language plpgsql stable set search_path = public as $$
declare f jsonb; kg_figli numeric := 0; disponibile numeric; tetto numeric;
begin
  if p_figli is null or jsonb_typeof(p_figli) <> 'array' or jsonb_array_length(p_figli) < 1 then
    raise exception 'Serve almeno un rotolo finito';
  end if;
  for f in select * from jsonb_array_elements(p_figli) loop
    if (f->>'peso_lordo_kg') is null or (f->>'peso_lordo_kg')::numeric <= 0 then
      raise exception 'Ogni rotolo finito deve avere un peso lordo maggiore di zero';
    end if;
    if coalesce((f->>'peso_tubolare_kg')::numeric, 0) < 0 then
      raise exception 'Il peso del tubolare non può essere negativo';
    end if;
    if (f->>'peso_lordo_kg')::numeric <= coalesce((f->>'peso_tubolare_kg')::numeric, 0) then
      raise exception 'Il peso lordo deve essere maggiore del tubolare';
    end if;
    kg_figli := kg_figli + (f->>'peso_lordo_kg')::numeric - coalesce((f->>'peso_tubolare_kg')::numeric, 0);
  end loop;
  if p_kg_residui is null or p_kg_residui < 0 then raise exception 'I kg residui non possono essere negativi'; end if;
  if p_kg_residui > 0 and p_peso_tubolare is not null then
    raise exception 'Con un residuo grezzo il tubolare non si pesa: lascialo vuoto';
  end if;
  if p_kg_residui = 0 and p_peso_tubolare is null then
    raise exception 'Senza residuo serve il peso del tubolare (0 se il rotolo non ne ha)';
  end if;
  if p_peso_tubolare is not null and p_peso_tubolare < 0 then raise exception 'Il peso del tubolare non può essere negativo'; end if;
  disponibile := p_peso_con_imballo - p_peso_imballo - coalesce(p_peso_tubolare, 0);
  tetto := disponibile * 1.02;
  if kg_figli + p_kg_residui > tetto then
    raise exception 'La somma dei pesi supera il disponibile di % kg', round(kg_figli + p_kg_residui - tetto);
  end if;
end $$;

create or replace function _inserisci_figli(p_lavorazione_id uuid, p_grezzo_id uuid, p_figli jsonb, p_codici text[])
returns void language plpgsql security definer set search_path = public as $$
declare f jsonb; i integer := 1; g rotoli_grezzi; netto numeric;
begin
  select * into g from rotoli_grezzi where id = p_grezzo_id;
  for f in select * from jsonb_array_elements(p_figli) loop
    netto := (f->>'peso_lordo_kg')::numeric - coalesce((f->>'peso_tubolare_kg')::numeric, 0);
    insert into rotoli_lavorati (codice, lavorazione_id, rotolo_grezzo_id, peso_lordo_kg, peso_tubolare_kg,
                                 metri, cliente, film, tipo_film, annotazioni_cliente)
    values (p_codici[i], p_lavorazione_id, p_grezzo_id,
            (f->>'peso_lordo_kg')::numeric, coalesce((f->>'peso_tubolare_kg')::numeric, 0),
            coalesce((f->>'metri')::integer, round(netto / g.kg_al_metro)::integer),
            coalesce(f->>'cliente', g.cliente), coalesce((f->>'film')::boolean, false),
            f->>'tipo_film', f->>'annotazioni_cliente');
    i := i + 1;
  end loop;
end $$;

-- ---------- RPC: avvia_lavorazione ----------
create or replace function avvia_lavorazione(
  p_rotolo_grezzo_id uuid, p_scheda_id uuid, p_operatore_id uuid,
  p_peso_con_imballo numeric, p_peso_imballo numeric, p_contametri_inizio numeric,
  p_pianificazione_id uuid default null, p_avviata_il timestamptz default now())
returns uuid language plpgsql security definer set search_path = public as $$
declare g rotoli_grezzi; s schede_lavorazione; v_id uuid;
begin
  if coalesce(ruolo_utente(), '') not in ('ufficio','reparto') then raise exception 'Non autorizzato'; end if;
  if coalesce(ruolo_utente(), '') <> 'ufficio' then p_avviata_il := now(); end if;   -- il reparto non sceglie l'orario
  select * into g from rotoli_grezzi where id = p_rotolo_grezzo_id for update;
  if g.id is null then raise exception 'Rotolo non trovato'; end if;
  if g.stato = 'in_lavorazione' then raise exception 'Il rotolo % è già in lavorazione', g.n_prog; end if;
  if g.stato = 'esaurito' then raise exception 'Il rotolo % è esaurito', g.n_prog; end if;
  if p_peso_con_imballo is null or p_peso_con_imballo <= 0 then raise exception 'Il peso con imballo deve essere maggiore di zero'; end if;
  if p_peso_imballo is null or p_peso_imballo < 0 then raise exception 'Il peso dell''imballo non può essere negativo'; end if;
  if p_peso_imballo >= p_peso_con_imballo then raise exception 'Il peso dell''imballo deve essere minore del peso con imballo'; end if;
  if coalesce(p_contametri_inizio, 0) < 0 then raise exception 'Il contametri iniziale non può essere negativo'; end if;
  select * into s from schede_lavorazione where id = p_scheda_id;
  if s.id is null then raise exception 'Scheda di lavorazione non trovata'; end if;
  if not exists (select 1 from operatori where id = p_operatore_id and attivo) then raise exception 'Operatore non valido'; end if;
  begin
    insert into lavorazioni (rotolo_grezzo_id, pianificazione_id, scheda_lavorazione_id,
                             velocita_prevista, ampere_previsti, micron_previsti,
                             operatore_avvio_id, avviata_il, peso_con_imballo_kg, peso_imballo_kg, contametri_inizio)
    values (g.id, p_pianificazione_id, s.id, s.velocita_m_min, s.ossido_ampere, s.micron,
            p_operatore_id, p_avviata_il, p_peso_con_imballo, p_peso_imballo, coalesce(p_contametri_inizio, 0))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'C''è già una lavorazione aperta sulla linea 1500';
  end;
  update rotoli_grezzi set stato = 'in_lavorazione' where id = g.id;
  return v_id;
end $$;

-- ---------- RPC: chiudi_lavorazione ----------
create or replace function chiudi_lavorazione(
  p_lavorazione_id uuid, p_operatore_id uuid, p_peso_tubolare numeric, p_contametri_fine numeric,
  p_figli jsonb, p_kg_residui numeric default 0, p_chiusa_il timestamptz default now())
returns text[] language plpgsql security definer set search_path = public as $$
declare l lavorazioni; g rotoli_grezzi; n_esistenti integer; codici text[];
begin
  if coalesce(ruolo_utente(), '') not in ('ufficio','reparto') then raise exception 'Non autorizzato'; end if;
  if coalesce(ruolo_utente(), '') <> 'ufficio' then p_chiusa_il := now(); end if;
  select * into l from lavorazioni where id = p_lavorazione_id for update;
  if l.id is null then raise exception 'Lavorazione non trovata'; end if;
  if l.stato <> 'aperta' then raise exception 'La lavorazione è già %', l.stato; end if;
  if exists (select 1 from eventi f where f.lavorazione_id = l.id and f.tipo = 'fermo'
             and not exists (select 1 from eventi r where r.tipo = 'ripartenza' and r.fermo_id = f.id)) then
    raise exception 'C''è un fermo aperto: registra la ripartenza prima di chiudere';
  end if;
  perform _controlla_figli_e_bilancio(l.peso_con_imballo_kg, l.peso_imballo_kg, p_peso_tubolare, p_figli, coalesce(p_kg_residui, 0));
  select * into g from rotoli_grezzi where id = l.rotolo_grezzo_id for update;
  select count(*) into n_esistenti from rotoli_lavorati where rotolo_grezzo_id = g.id;
  codici := _codici_figli(g.n_prog, jsonb_array_length(p_figli), coalesce(p_kg_residui, 0), n_esistenti);
  update lavorazioni
     set peso_tubolare_kg = p_peso_tubolare, contametri_fine = p_contametri_fine,
         operatore_chiusura_id = p_operatore_id, chiusa_il = p_chiusa_il,
         kg_residui_dichiarati = coalesce(p_kg_residui, 0), stato = 'chiusa'
   where id = l.id;
  perform _inserisci_figli(l.id, g.id, p_figli, codici);
  if coalesce(p_kg_residui, 0) = 0 then
    update rotoli_grezzi set stato = 'esaurito', kg_residui = 0 where id = g.id;
  else
    update rotoli_grezzi set stato = 'grezzo', kg_residui = p_kg_residui where id = g.id;
  end if;
  return codici;
end $$;

-- ---------- RPC: annulla_lavorazione ----------
create or replace function annulla_lavorazione(p_lavorazione_id uuid, p_operatore_id uuid, p_motivo text, p_metri_scarto numeric default 0)
returns void language plpgsql security definer set search_path = public as $$
declare l lavorazioni; g rotoli_grezzi;
begin
  if coalesce(ruolo_utente(), '') not in ('ufficio','reparto') then raise exception 'Non autorizzato'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Indica il motivo dell''annullo'; end if;
  select * into l from lavorazioni where id = p_lavorazione_id for update;
  if l.id is null then raise exception 'Lavorazione non trovata'; end if;
  if l.stato <> 'aperta' then raise exception 'La lavorazione è già %', l.stato; end if;
  if exists (select 1 from eventi f where f.lavorazione_id = l.id and f.tipo = 'fermo'
             and not exists (select 1 from eventi r where r.tipo = 'ripartenza' and r.fermo_id = f.id)) then
    raise exception 'C''è un fermo aperto: registra la ripartenza prima di annullare';
  end if;
  select * into g from rotoli_grezzi where id = l.rotolo_grezzo_id for update;
  p_metri_scarto := coalesce(p_metri_scarto, 0);
  if p_metri_scarto < 0 or p_metri_scarto > g.metri_stimati then
    raise exception 'I metri consumati superano il rotolo (massimo % m)', g.metri_stimati;
  end if;
  -- controlli ed eventi restano: sono dati misurati.
  -- chiusa_il = now() per tutti: lo spec impone la regola ufficio/reparto sull'orario solo ad avvio e chiusura.
  update lavorazioni
     set stato = 'annullata', motivo_annullo = p_motivo, operatore_chiusura_id = p_operatore_id,
         chiusa_il = now(), contametri_fine = l.contametri_inizio + p_metri_scarto
   where id = l.id;
  if p_metri_scarto > 0 then
    update rotoli_grezzi
       set stato = 'grezzo', kg_residui = greatest(0, coalesce(kg_residui, peso_bolla_kg) - p_metri_scarto * kg_al_metro)
     where id = g.id;
  else
    update rotoli_grezzi set stato = 'grezzo' where id = g.id;
  end if;
end $$;

-- ---------- RPC: registra_lavorazione_completa (solo ufficio) ----------
-- Crea una lavorazione GIÀ chiusa, con controlli, eventi e figli, in una transazione:
-- non passa da 'aperta' e non urta l'indice unico mentre in linea gira un altro rotolo.
create or replace function registra_lavorazione_completa(
  p_rotolo_grezzo_id uuid, p_scheda_id uuid, p_operatore_avvio_id uuid, p_avviata_il timestamptz,
  p_peso_con_imballo numeric, p_peso_imballo numeric, p_contametri_inizio numeric,
  p_controlli jsonb, p_eventi jsonb,
  p_operatore_chiusura_id uuid, p_chiusa_il timestamptz, p_peso_tubolare numeric, p_contametri_fine numeric,
  p_figli jsonb, p_kg_residui numeric default 0, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare g rotoli_grezzi; s schede_lavorazione; v_id uuid; n_esistenti integer; codici text[]; c jsonb; e jsonb; avviso text := null;
begin
  if coalesce(ruolo_utente(), '') <> 'ufficio' then raise exception 'Non autorizzato'; end if;
  if p_chiusa_il <= p_avviata_il then raise exception 'La chiusura deve essere dopo l''avvio'; end if;
  -- le ripartenze hanno bisogno del fermo_id, che qui non esiste ancora: si rifiutano in italiano.
  -- L'ufficio le aggiunge dopo, dalla scheda della lavorazione (la policy ev_ins glielo consente).
  if exists (select 1 from jsonb_array_elements(coalesce(p_eventi, '[]'::jsonb)) x where x->>'tipo' = 'ripartenza') then
    raise exception 'I fermi con ripartenza si registrano dopo, dalla scheda della lavorazione: qui inserisci solo il fermo';
  end if;
  select * into g from rotoli_grezzi where id = p_rotolo_grezzo_id for update;
  if g.id is null then raise exception 'Rotolo non trovato'; end if;
  select * into s from schede_lavorazione where id = p_scheda_id;
  if s.id is null then raise exception 'Scheda di lavorazione non trovata'; end if;
  if p_peso_con_imballo is null or p_peso_con_imballo <= 0 then raise exception 'Il peso con imballo deve essere maggiore di zero'; end if;
  if p_peso_imballo is null or p_peso_imballo < 0 or p_peso_imballo >= p_peso_con_imballo then
    raise exception 'Il peso dell''imballo deve essere tra 0 e il peso con imballo';
  end if;
  perform _controlla_figli_e_bilancio(p_peso_con_imballo, p_peso_imballo, p_peso_tubolare, p_figli, coalesce(p_kg_residui, 0));
  select count(*) into n_esistenti from rotoli_lavorati where rotolo_grezzo_id = g.id;
  -- Se il grezzo è già andato avanti (in_lavorazione o esaurito da un'altra lavorazione), questa
  -- non è stata l'unica: i codici prendono il suffisso come se ci fosse un residuo, così il
  -- figlio che chiuderà dopo avrà /B e non un codice senza suffisso accanto a uno con.
  codici := _codici_figli(g.n_prog, jsonb_array_length(p_figli),
                          case when g.stato <> 'grezzo' then 1 else coalesce(p_kg_residui, 0) end, n_esistenti);
  insert into lavorazioni (rotolo_grezzo_id, scheda_lavorazione_id, velocita_prevista, ampere_previsti, micron_previsti,
                           operatore_avvio_id, avviata_il, peso_con_imballo_kg, peso_imballo_kg, contametri_inizio,
                           peso_tubolare_kg, contametri_fine, operatore_chiusura_id, chiusa_il,
                           kg_residui_dichiarati, stato, note)
  values (g.id, s.id, s.velocita_m_min, s.ossido_ampere, s.micron,
          p_operatore_avvio_id, p_avviata_il, p_peso_con_imballo, p_peso_imballo, coalesce(p_contametri_inizio, 0),
          p_peso_tubolare, p_contametri_fine, p_operatore_chiusura_id, p_chiusa_il,
          coalesce(p_kg_residui, 0), 'chiusa', p_note)
  returning id into v_id;
  for c in select * from jsonb_array_elements(coalesce(p_controlli, '[]'::jsonb)) loop
    insert into controlli (lavorazione_id, rilevato_il, operatore_id, momento, contametri, velocita_m_min, corrente_a, tensione_v,
                           temp_sgrassatura, temp_satina, temp_ossido, temp_fissaggio, micron, gloss_parallelo, gloss_perpendicolare, note)
    values (v_id, coalesce((c->>'rilevato_il')::timestamptz, p_avviata_il), (c->>'operatore_id')::uuid, coalesce(c->>'momento','periodico'),
            (c->>'contametri')::numeric, (c->>'velocita_m_min')::numeric, (c->>'corrente_a')::numeric, (c->>'tensione_v')::numeric,
            (c->>'temp_sgrassatura')::numeric, (c->>'temp_satina')::numeric, (c->>'temp_ossido')::numeric, (c->>'temp_fissaggio')::numeric,
            (c->>'micron')::numeric, (c->>'gloss_parallelo')::numeric, (c->>'gloss_perpendicolare')::numeric, c->>'note');
  end loop;
  for e in select * from jsonb_array_elements(coalesce(p_eventi, '[]'::jsonb)) loop
    -- solo eventi senza fermo_id (mai ripartenze: respinte sopra)
    insert into eventi (lavorazione_id, avvenuto_il, operatore_id, tipo, contametri, tipo_difetto_id, causa_fermo, prodotto, litri, metri_scarto, descrizione)
    values (v_id, coalesce((e->>'avvenuto_il')::timestamptz, p_avviata_il), (e->>'operatore_id')::uuid, e->>'tipo',
            (e->>'contametri')::numeric, (e->>'tipo_difetto_id')::uuid, e->>'causa_fermo', e->>'prodotto', (e->>'litri')::numeric,
            (e->>'metri_scarto')::numeric, e->>'descrizione');
  end loop;
  perform _inserisci_figli(v_id, g.id, p_figli, codici);
  if g.stato = 'grezzo' then
    if coalesce(p_kg_residui, 0) = 0 then
      update rotoli_grezzi set stato = 'esaurito', kg_residui = 0 where id = g.id;
    else
      update rotoli_grezzi set kg_residui = p_kg_residui where id = g.id;
    end if;
  else
    avviso := 'Il rotolo ' || g.n_prog || ' è già stato ripreso: controlla i kg residui a magazzino';
  end if;
  return jsonb_build_object('lavorazione_id', v_id, 'codici', to_jsonb(codici), 'avviso', avviso);
end $$;

-- Permessi di esecuzione: mai anon/public (anche gli helper di ruolo, per coerenza con ruolo_utente)
revoke execute on function e_ufficio() from public, anon;
revoke execute on function e_reparto() from public, anon;
grant execute on function e_ufficio() to authenticated;
grant execute on function e_reparto() to authenticated;
revoke execute on function avvia_lavorazione(uuid,uuid,uuid,numeric,numeric,numeric,uuid,timestamptz) from public, anon;
revoke execute on function chiudi_lavorazione(uuid,uuid,numeric,numeric,jsonb,numeric,timestamptz) from public, anon;
revoke execute on function annulla_lavorazione(uuid,uuid,text,numeric) from public, anon;
revoke execute on function registra_lavorazione_completa(uuid,uuid,uuid,timestamptz,numeric,numeric,numeric,jsonb,jsonb,uuid,timestamptz,numeric,numeric,jsonb,numeric,text) from public, anon;
revoke execute on function _codici_figli(text,integer,numeric,integer) from public, anon, authenticated;
revoke execute on function _controlla_figli_e_bilancio(numeric,numeric,numeric,jsonb,numeric) from public, anon, authenticated;
revoke execute on function _inserisci_figli(uuid,uuid,jsonb,text[]) from public, anon, authenticated;
grant execute on function avvia_lavorazione(uuid,uuid,uuid,numeric,numeric,numeric,uuid,timestamptz) to authenticated;
grant execute on function chiudi_lavorazione(uuid,uuid,numeric,numeric,jsonb,numeric,timestamptz) to authenticated;
grant execute on function annulla_lavorazione(uuid,uuid,text,numeric) to authenticated;
grant execute on function registra_lavorazione_completa(uuid,uuid,uuid,timestamptz,numeric,numeric,numeric,jsonb,jsonb,uuid,timestamptz,numeric,numeric,jsonb,numeric,text) to authenticated;

do $$ begin
  assert (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
          and proname in ('avvia_lavorazione','chiudi_lavorazione','annulla_lavorazione','registra_lavorazione_completa')) = 4,
         'mancano RPC';
end $$;
```

Nota sugli eventi registrati a posteriori: la RPC accetta `fermo`, `difetto`, `aggiunta`, `giunta_film`, `taglio_film`, `primi_metri_non_ossidati`, `nota` e **rifiuta le `ripartenza`** con un messaggio in italiano, perché non conosce ancora gli id dei fermi che crea. Un fermo così registrato resta aperto sulla lavorazione chiusa; l'ufficio aggiunge la ripartenza subito dopo dalla scheda della lavorazione (Fase 4), cosa che la policy `ev_ins` gli consente. Il test del Task 13 verifica il rifiuto.

- [ ] **Step 2: Applica** — `apply_migration` (`name: "000d_rpc"`). Expected: nessun errore.

- [ ] **Step 3: Commit** — `git commit -m "feat(sql): sezione d — helper interni e le quattro RPC"`

---

### Task 11: `000_setup.sql` sezione **e** — RLS, grant per colonna, realtime

**Files:** Modify `sql/000_setup.sql`

**Interfaces:**
- Produces: la tabella dei permessi dello spec §5.3, realizzata.

- [ ] **Step 1: Appendi la sezione e**

```sql
-- ============================================================
-- Sezione e: RLS (righe) + grant (colonne). Servono entrambi (spec §5.3).
-- Supabase concede per default TUTTO (anche truncate/references/trigger) ad anon e
-- authenticated sulle tabelle e viste nuove: si revoca tutto e si concede solo l'indispensabile.
-- Il realtime sta nella sezione f, separata, perché può fallire per proprietà della publication.
-- ============================================================
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'grezzi_sel') then
    raise exception 'Sezione e già applicata: non rieseguire';
  end if;
end $$;

-- ---------- anon: niente, su tabelle e viste ----------
revoke all on all tables in schema public from anon;

-- ---------- authenticated: si parte da zero su ogni tabella, poi solo select + colonne ----------
revoke all on operatori, schede_lavorazione, tipi_difetto, rotoli_grezzi, pianificazione,
              lavorazioni, rotoli_lavorati, controlli, eventi from authenticated;
grant select on operatori, schede_lavorazione, tipi_difetto, rotoli_grezzi, pianificazione,
                lavorazioni, rotoli_lavorati, controlli, eventi to authenticated;
-- (select su rotoli_grezzi serve a PostgREST per "insert … returning" dell'ufficio; la RIGA la filtra la RLS)

-- ---------- Anagrafiche: lettura a tutti, scrittura ufficio (tutte le colonne) ----------
alter table operatori enable row level security;
alter table schede_lavorazione enable row level security;
alter table tipi_difetto enable row level security;
grant insert, update, delete on operatori, schede_lavorazione, tipi_difetto to authenticated;
create policy operatori_sel on operatori for select to authenticated using (true);
create policy operatori_ins on operatori for insert to authenticated with check (e_ufficio());
create policy operatori_upd on operatori for update to authenticated using (e_ufficio());
create policy operatori_del on operatori for delete to authenticated using (e_ufficio());
create policy schede_sel on schede_lavorazione for select to authenticated using (true);
create policy schede_ins on schede_lavorazione for insert to authenticated with check (e_ufficio());
create policy schede_upd on schede_lavorazione for update to authenticated using (e_ufficio());
create policy schede_del on schede_lavorazione for delete to authenticated using (e_ufficio());
create policy difetti_sel on tipi_difetto for select to authenticated using (true);
create policy difetti_ins on tipi_difetto for insert to authenticated with check (e_ufficio());
create policy difetti_upd on tipi_difetto for update to authenticated using (e_ufficio());
create policy difetti_del on tipi_difetto for delete to authenticated using (e_ufficio());

-- ---------- rotoli_grezzi: select solo ufficio; il reparto legge la vista ----------
alter table rotoli_grezzi enable row level security;
create policy grezzi_sel on rotoli_grezzi for select to authenticated using (e_ufficio());
create policy grezzi_ins on rotoli_grezzi for insert to authenticated with check (e_ufficio());
create policy grezzi_upd on rotoli_grezzi for update to authenticated
  using (e_ufficio() and stato = 'grezzo') with check (e_ufficio() and stato = 'grezzo');
create policy grezzi_del on rotoli_grezzi for delete to authenticated
  using (e_ufficio() and stato = 'grezzo' and not exists (select 1 from lavorazioni l where l.rotolo_grezzo_id = rotoli_grezzi.id));
grant insert (n_prog, fornitore, rif_bolla, cliente, lega, finitura, spessore_mm, larghezza_mm, peso_bolla_kg, data_arrivo, posizione, note)
  on rotoli_grezzi to authenticated;
grant update (n_prog, fornitore, rif_bolla, cliente, lega, finitura, spessore_mm, larghezza_mm, peso_bolla_kg, data_arrivo, posizione, note, kg_residui)
  on rotoli_grezzi to authenticated;                                  -- mai stato, mai modificato_*
grant delete on rotoli_grezzi to authenticated;                       -- la riga la filtra grezzi_del
-- La vista del reparto è a tabella singola, quindi AUTO-AGGIORNABILE, e con security_invoker = false
-- ogni scrittura girerebbe come proprietario scavalcando la RLS: deve restare in SOLA lettura.
revoke all on rotoli_grezzi_reparto from anon, authenticated;
grant select on rotoli_grezzi_reparto to authenticated;

-- ---------- pianificazione ----------
alter table pianificazione enable row level security;
create policy pian_sel on pianificazione for select to authenticated using (true);
create policy pian_ins on pianificazione for insert to authenticated with check (e_ufficio());
create policy pian_upd on pianificazione for update to authenticated using (e_ufficio());
create policy pian_del on pianificazione for delete to authenticated using (e_ufficio());
grant insert (settimana, posizione, rotolo_grezzo_id, scheda_lavorazione_id, suddivisione_prevista, note) on pianificazione to authenticated;
grant update (settimana, posizione, rotolo_grezzo_id, scheda_lavorazione_id, suddivisione_prevista, note) on pianificazione to authenticated;
grant delete on pianificazione to authenticated;

-- Nota valida per tutte le policy di update senza "with check" esplicito (operatori, schede,
-- difetti, pianificazione, rotoli_lavorati, controlli, eventi): Postgres riusa l'espressione
-- "using" anche come "with check". È il comportamento voluto: per controlli ed eventi impedisce
-- di SPOSTARE una riga su una lavorazione chiusa.

-- ---------- lavorazioni: insert solo RPC; update ufficio su chiuse, solo alcune colonne ----------
-- Le note di una lavorazione ANNULLATA non sono scrivibili (policy stato = 'chiusa'): il posto è
-- motivo_annullo, scritto dalla RPC. Le fasi successive non devono costruire un campo "note" per le annullate.
alter table lavorazioni enable row level security;
create policy lav_sel on lavorazioni for select to authenticated using (true);
create policy lav_upd on lavorazioni for update to authenticated
  using (e_ufficio() and stato = 'chiusa') with check (e_ufficio() and stato = 'chiusa');
grant update (note, stampata_il, peso_con_imballo_kg, peso_imballo_kg, peso_tubolare_kg, contametri_inizio, contametri_fine)
  on lavorazioni to authenticated;                                    -- mai stato, mai modificato_*; niente insert/delete

-- ---------- rotoli_lavorati: insert solo RPC; update ufficio su alcune colonne ----------
alter table rotoli_lavorati enable row level security;
create policy rl_sel on rotoli_lavorati for select to authenticated using (true);
create policy rl_upd on rotoli_lavorati for update to authenticated using (e_ufficio());
grant update (cliente, film, tipo_film, annotazioni_cliente, metri, peso_lordo_kg, peso_tubolare_kg)
  on rotoli_lavorati to authenticated;                                -- mai codice, mai lavorazione_id; niente insert/delete

-- ---------- controlli ed eventi: reparto solo su lavorazione aperta ----------
alter table controlli enable row level security;
create policy ctl_sel on controlli for select to authenticated using (true);
create policy ctl_ins on controlli for insert to authenticated
  with check (e_ufficio() or (e_reparto() and exists (select 1 from lavorazioni l where l.id = lavorazione_id and l.stato = 'aperta')));
create policy ctl_upd on controlli for update to authenticated
  using (e_ufficio() or (e_reparto() and exists (select 1 from lavorazioni l where l.id = lavorazione_id and l.stato = 'aperta')));
grant insert (lavorazione_id, rilevato_il, operatore_id, momento, contametri, velocita_m_min, corrente_a, tensione_v,
              temp_sgrassatura, temp_satina, temp_ossido, temp_fissaggio, micron, gloss_parallelo, gloss_perpendicolare, note)
  on controlli to authenticated;
grant update (rilevato_il, operatore_id, momento, contametri, velocita_m_min, corrente_a, tensione_v,
              temp_sgrassatura, temp_satina, temp_ossido, temp_fissaggio, micron, gloss_parallelo, gloss_perpendicolare, note)
  on controlli to authenticated;

alter table eventi enable row level security;
create policy ev_sel on eventi for select to authenticated using (true);
create policy ev_ins on eventi for insert to authenticated
  with check (e_ufficio() or (e_reparto() and exists (select 1 from lavorazioni l where l.id = lavorazione_id and l.stato = 'aperta')));
create policy ev_upd on eventi for update to authenticated
  using (e_ufficio() or (e_reparto() and exists (select 1 from lavorazioni l where l.id = lavorazione_id and l.stato = 'aperta')));
grant insert (lavorazione_id, avvenuto_il, operatore_id, tipo, contametri, tipo_difetto_id, causa_fermo, prodotto, litri, fermo_id, metri_scarto, descrizione)
  on eventi to authenticated;
grant update (avvenuto_il, operatore_id, tipo, contametri, tipo_difetto_id, causa_fermo, prodotto, litri, fermo_id, metri_scarto, descrizione)
  on eventi to authenticated;                                         -- mai durata_min, mai modificato_*

-- ---------- viste invoker: sola lettura ----------
revoke all on lavorazioni_riepilogo, controlli_scostamenti from anon, authenticated;
grant select on lavorazioni_riepilogo, controlli_scostamenti to authenticated;

```

- [ ] **Step 2: Applica** — `apply_migration` (`name: "000e_rls_grant"`). Expected: nessun errore.

- [ ] **Step 2b: Verifiche della sezione e, come migrazione separata** (`apply_migration`, `name: "000e_verifica"`): se un assert fosse scritto male, i permessi appena concessi restano acquisiti e si corregge solo l'assert.

```sql
-- Verifiche della sezione e. NB: information_schema.column_privileges ESPANDE i grant di tabella
-- su ogni colonna, quindi le colonne riservate vanno legate alla loro tabella (tipi_difetto ha una
-- colonna "codice" con grant di tabella legittimo).
do $$ begin
  assert (select count(*) from pg_tables where schemaname = 'public' and rowsecurity) = 10, 'RLS non attiva su tutte le tabelle';
  assert not exists (select 1 from information_schema.column_privileges
                     where table_schema = 'public' and grantee = 'authenticated' and privilege_type in ('INSERT','UPDATE')
                       and (   column_name in ('modificato_da','modificato_il')
                            or (table_name = 'eventi'          and column_name = 'durata_min')
                            or (table_name = 'lavorazioni'     and column_name = 'stato')
                            or (table_name = 'rotoli_grezzi'   and column_name = 'stato')
                            or (table_name = 'rotoli_lavorati' and column_name in ('codice','lavorazione_id')))),
         'il client ha grant su colonne riservate';
  -- le tre viste devono avere SOLO select per authenticated e niente per anon
  assert not exists (select 1 from information_schema.table_privileges
                     where table_schema = 'public' and table_name in ('rotoli_grezzi_reparto','lavorazioni_riepilogo','controlli_scostamenti')
                       and (grantee = 'anon' or (grantee = 'authenticated' and privilege_type <> 'SELECT'))), 'una vista è scrivibile o visibile ad anon';
  assert not exists (select 1 from information_schema.table_privileges
                     where table_schema = 'public' and grantee = 'authenticated' and privilege_type in ('TRUNCATE','REFERENCES','TRIGGER')), 'authenticated ha privilegi di tabella oltre il necessario';
  assert not exists (select 1 from information_schema.table_privileges
                     where table_schema = 'public' and grantee = 'authenticated' and privilege_type in ('INSERT','DELETE')
                       and table_name in ('lavorazioni','rotoli_lavorati')), 'lavorazioni/rotoli_lavorati scrivibili fuori dalle RPC';
end $$;
```
Expected: nessun errore. Se l'assert sulle RLS conta 9, controlla `utenti_app` (deve avere RLS attiva dalla sezione a).

- [ ] **Step 3: Appendi la sezione f — realtime, come migrazione separata**

```sql
-- ============================================================
-- Sezione f: realtime, solo le tre tabelle del turno. Separata perché "alter publication"
-- richiede di essere proprietari della publication: se fallisce, RLS e grant restano acquisiti.
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['lavorazioni','controlli','eventi'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
  assert (select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public') = 3, 'realtime: attese 3 tabelle';
end $$;
```
Applica con `apply_migration` (`name: "000f_realtime"`). **Piano B:** se risponde `must be owner of publication supabase_realtime`, attivare le tre tabelle dalla dashboard (Database → Publications → `supabase_realtime` → abilitare `lavorazioni`, `controlli`, `eventi`) e annotarlo nello STATO fra le cose fatte a mano; poi rieseguire solo l'`assert`.

- [ ] **Step 4: Commit** — `git commit -m "feat(sql): sezioni e-f — RLS, grant per colonna, viste in sola lettura, realtime"`

---

### Task 12: Seed — catalogo difetti e rotoli di collaudo

**Files:** Create `sql/seed_difetti.sql`, `sql/seed_collaudo.sql`

- [ ] **Step 1: `sql/seed_difetti.sql`** (dal manuale, sezione "Difetti tipici")

```sql
-- Catalogo difetti (manuale, "Difetti tipici che possono capitare"). Solo fatti + causa + azione.
insert into tipi_difetto (codice, nome, causa_probabile, azione, ordine) values
('SEGNI_CICLICI', 'Segni ciclici lungo il nastro',
 'Tracce, bozze o righe impresse da un rullo. La distanza fra due segni indica il rullo: 40,8 cm spremitore · 75,4 cm centrali fissaggio · 106,8 cm rullo di rame · 133,5 cm castello ossido · 165 cm rinvio.',
 'Misurare la distanza fra due segni, individuare il rullo, controllarne la superficie (tagli, rigonfiamenti, sporcizia, trucioli).', 10),
('STRISCE_TRASV', 'Strisce trasversali (aloni) lungo il nastro',
 'Temperatura della satina sopra il set point; nitrico che non lava i residui di satina; nastro che entra bagnato nell''ossido.',
 'Controllare la temperatura della satina, il lavaggio del nitrico e che il nastro entri asciutto nell''ossido.', 20),
('CHIAZZE_IRID', 'Chiazze non uniformi, spesso iridescenti',
 'Difetto di ossidazione: concentrazione di acido sbagliata o temperatura fuori range; voltaggio alto.',
 'Controllare voltaggio e temperatura dell''ossido; avvisare il chimico.', 30),
('RIGHE', 'Righe e strisciature',
 'Un rullo della linea non gira (accumulatore, frizione, spremitori); il nastro striscia sugli stampini della trancia.',
 'Verificare che tutti i rulli girino; se il nastro striscia sugli stampini chiudere il rullino post trancia.', 40),
('PUNTI_BIANCHI', 'Punti bianchi e calcificazioni',
 'Arrivano dal fissaggio: livello non corretto, ebollizione, lavaggio fissaggio non funzionante, schiuma.',
 'Controllare livello e temperatura del fissaggio, il lavaggio, le cannette; se i puntini sono in superficie alzare il livello per far uscire lo strato superficiale.', 50),
('ONDULATO', 'Nastro ondulato',
 'Rulli non paralleli, cuscinetti spostati, rullo a clessidra che stira il nastro.',
 'Individuare da dove iniziano le ondulature; verificare parallelismo dei rulli e cuscinetti; sostituire e rettificare il rullo a clessidra.', 60),
('MACCHIE_UMIDO', 'Macchie simili a umido che non vanno via asciugando',
 'Spremitore impastato di ossido che secca sul nastro; probabile eccesso di alluminio nell''ossido.',
 'Pulire lo spremitore con acqua demi; attivare la cannetta con acqua demi sul rullo di rinvio; fare le analisi dell''ossido.', 70),
('GRAFFI', 'Graffi', 'Contatto con superfici o rulli danneggiati; movimentazione.', 'Controllare i rulli e le superfici a contatto con il nastro; verificare la movimentazione della bobina.', 80),
('BRUCIATURE', 'Bruciature', 'Corrente troppo alta o contatto anomalo sul rullo di rame.', 'Controllare la corrente e il rullo di rame; avvisare la direzione.', 90),
('ALTRO', 'Altro difetto', null, 'Descrivere nel campo note.', 100)
on conflict (codice) do nothing;
```

- [ ] **Step 2: `sql/seed_collaudo.sql`**

```sql
-- Dieci rotoli di collaudo (spec §5.7): 1500 × 2 mm, bolla 6.500 kg. Nascosti in ufficio per
-- default (n_prog like 'COLLAUDO%'); sul tablet solo da "Cerca altro numero".
insert into rotoli_grezzi (n_prog, fornitore, rif_bolla, cliente, lega, finitura, spessore_mm, larghezza_mm, peso_bolla_kg, data_arrivo, note)
select 'COLLAUDO-' || lpad(i::text, 4, '0'), 'Fornitore di collaudo', 'BOLLA-COLLAUDO', 'Cliente di collaudo',
       '1050 H24', 'MF', 2, 1500, 6500, current_date, 'ROTOLO DI COLLAUDO - non cancellare'
from generate_series(1, 10) i
on conflict (n_prog) do nothing;
```

- [ ] **Step 3: Applica entrambi** — `apply_migration` (`name: "001_seed_difetti"`) e (`name: "002_seed_collaudo"`). Verifica: `select count(*) from tipi_difetto` → 10; `select count(*), min(metri_stimati) from rotoli_grezzi where n_prog like 'COLLAUDO%'` → 10, 802.

- [ ] **Step 4: Commit** — `git add sql/seed_difetti.sql sql/seed_collaudo.sql && git commit -m "feat(sql): seed catalogo difetti e rotoli di collaudo"`

---

### Task 13: `sql/test_regole.sql` — le regole provate come `authenticated`

**Files:** Create `sql/test_regole.sql`

**Interfaces:**
- Consumes: tutto lo schema. Gira in `begin … rollback`, come ruolo `authenticated` con `request.jwt.claims` impostato, così i test sui grant e su `ruolo_utente()` provano davvero qualcosa.

- [ ] **Step 1: Scrivi il file**

```sql
-- ============================================================
-- test_regole.sql — prova le regole del DB. Tutto in una transazione annullata.
-- Eseguire per intero via connettore (execute_sql). Deve terminare con 'TUTTI I TEST PASSATI'.
-- ============================================================
begin;

-- Utenti di prova (inseriti come postgres, prima di cambiare ruolo)
insert into utenti_app (uid, ruolo) values
  ('00000000-0000-0000-0000-00000000aaaa', 'ufficio'),
  ('00000000-0000-0000-0000-00000000bbbb', 'reparto');
insert into operatori (nome, ruolo) values ('Test Operatore', 'operatore'), ('Test Capoturno', 'capoturno');
insert into schede_lavorazione (lavorazione, tipo, micron, spessore_min, spessore_max, larghezza_min, larghezza_max,
                                velocita_m_min, ossido_ampere, ossido_temp, ossido_temp_min, ossido_temp_max)
  values ('TEST OX Satinato 5 micron', 'satinato', 5, 1, 3, 1000, 1500, 2.3, 8400, 37, 33, 39);
insert into rotoli_grezzi (n_prog, fornitore, spessore_mm, larghezza_mm, peso_bolla_kg) values ('T5000', 'Forn. Test', 2, 1500, 6500);
insert into rotoli_grezzi (n_prog, fornitore, spessore_mm, larghezza_mm, peso_bolla_kg) values ('T5001', 'Forn. Test', 2, 1500, 6500);
insert into rotoli_grezzi (n_prog, fornitore, spessore_mm, larghezza_mm, peso_bolla_kg) values ('T5004', 'Forn. Test', 2, 1500, 6500);

-- ---------- Come REPARTO ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000bbbb","role":"authenticated"}', true);

do $$
-- NB: g è "record", non "rotoli_grezzi": qui si legge la VISTA (16 colonne, ordine diverso) e
-- "select * into" assegna per posizione.
declare op uuid; sch uuid; gz uuid; gz2 uuid; lav uuid; lav2 uuid; codici text[]; f uuid; f2 uuid; n int; g record;
begin
  assert ruolo_utente() = 'reparto', 'ruolo reparto';
  select id into op from operatori where nome = 'Test Operatore';
  select id into sch from schede_lavorazione where lavorazione = 'TEST OX Satinato 5 micron';

  -- il reparto NON legge rotoli_grezzi, legge la vista; la vista NON espone fornitore e bolla
  select count(*) into n from rotoli_grezzi where n_prog = 'T5000';            assert n = 0, 'reparto legge rotoli_grezzi';
  select id into gz from rotoli_grezzi_reparto where n_prog = 'T5000';         assert gz is not null, 'reparto non legge la vista';
  assert not exists (select 1 from information_schema.columns where table_schema = 'public'
                     and table_name = 'rotoli_grezzi_reparto' and column_name in ('fornitore','rif_bolla')),
         'la vista del reparto espone fornitore o rif_bolla';
  begin  -- la vista è in sola lettura anche per chi è autenticato
    update rotoli_grezzi_reparto set kg_residui = 1 where id = gz;
    raise exception 'ATTESO ERRORE (scrittura sulla vista)';
  exception when insufficient_privilege then null; end;

  -- ESEMPIO SPEC §2.7, PRIMO GIRO (caso C)
  lav := avvia_lavorazione(gz, sch, op, 6540, 45, 100);
  select * into g from rotoli_grezzi_reparto where id = gz;                    assert g.stato = 'in_lavorazione', 'grezzo in lavorazione';
  -- NB: le sentinelle "ATTESO ERRORE (…)" non devono contenere il testo cercato dal like,
  -- altrimenti il test passa anche se la guardia sparisce.
  begin  -- avvio doppio sulla linea
    perform avvia_lavorazione((select id from rotoli_grezzi_reparto where n_prog = 'T5001'), sch, op, 1000, 0, 0);
    raise exception 'ATTESO ERRORE (secondo avvio sulla linea)';
  exception when others then assert sqlerrm like '%già una lavorazione aperta%', 'msg avvio doppio: ' || sqlerrm; end;
  begin  -- avvio di un in_lavorazione
    perform avvia_lavorazione(gz, sch, op, 1000, 0, 0);
    raise exception 'ATTESO ERRORE (avvio su rotolo occupato)';
  exception when others then assert sqlerrm like '%già in lavorazione%', 'msg in lavorazione: ' || sqlerrm; end;

  -- controllo e fermo/ripartenza
  insert into controlli (lavorazione_id, operatore_id, momento, contametri, temp_ossido, micron, gloss_perpendicolare)
    values (lav, op, 'inizio', 100, 40, 4.4, 40);
  assert (select n_fuori from controlli_scostamenti where lavorazione_id = lav) = 3, 'scostamenti: attesi 3 (ossido, micron, gloss ⊥)';
  insert into eventi (lavorazione_id, tipo, causa_fermo, avvenuto_il) values (lav, 'fermo', 'guasto', now() - interval '12 minutes') returning id into f;
  begin  -- chiusura con fermo aperto
    perform chiudi_lavorazione(lav, op, null, 600, '[{"peso_lordo_kg":4090,"peso_tubolare_kg":40}]'::jsonb, 2450);
    raise exception 'ATTESO ERRORE (chiusura con fermo non chiuso)';
  exception when others then assert sqlerrm like '%fermo aperto%', 'msg fermo aperto: ' || sqlerrm; end;
  begin  -- annullo con fermo aperto: stessa guardia
    perform annulla_lavorazione(lav, op, 'prova', 0);
    raise exception 'ATTESO ERRORE (annullo con fermo non chiuso)';
  exception when others then assert sqlerrm like '%fermo aperto%', 'msg annullo con fermo: ' || sqlerrm; end;
  begin  -- ripartenza precedente al fermo
    insert into eventi (lavorazione_id, tipo, fermo_id, avvenuto_il) values (lav, 'ripartenza', f, now() - interval '20 minutes');
    raise exception 'ATTESO ERRORE (ripartenza prima del fermo)';
  exception when others then assert sqlerrm like '%non può precedere%', 'msg precede: ' || sqlerrm; end;
  insert into eventi (lavorazione_id, tipo, fermo_id, metri_scarto) values (lav, 'ripartenza', f, 100);
  assert (select durata_min from eventi where id = f) = 12, 'durata_min 12';
  begin  -- ripartenza doppia
    insert into eventi (lavorazione_id, tipo, fermo_id) values (lav, 'ripartenza', f);
    raise exception 'ATTESO ERRORE (seconda ripartenza)';
  exception when unique_violation then null; end;
  begin  -- reparto non scrive durata_min
    update eventi set durata_min = 1 where id = f;
    raise exception 'ATTESO ERRORE (grant durata_min)';
  exception when insufficient_privilege then null; end;

  -- guardie di chiusura
  begin  -- residuo > 0 con tubolare non null
    perform chiudi_lavorazione(lav, op, 60, 600, '[{"peso_lordo_kg":4090,"peso_tubolare_kg":40}]'::jsonb, 2450);
    raise exception 'ATTESO ERRORE (residuo e tubolare insieme)';
  exception when others then assert sqlerrm like '%tubolare non si pesa%', 'msg: ' || sqlerrm; end;
  begin  -- residuo 0 con tubolare null
    perform chiudi_lavorazione(lav, op, null, 600, '[{"peso_lordo_kg":4090,"peso_tubolare_kg":40}]'::jsonb, 0);
    raise exception 'ATTESO ERRORE (manca il tubolare)';
  exception when others then assert sqlerrm like '%serve il peso del tubolare%', 'msg: ' || sqlerrm; end;
  begin  -- bilancio oltre tolleranza
    perform chiudi_lavorazione(lav, op, null, 600, '[{"peso_lordo_kg":4090,"peso_tubolare_kg":40}]'::jsonb, 2700);
    raise exception 'ATTESO ERRORE (pesi oltre il tetto)';
  exception when others then assert sqlerrm like '%supera il disponibile%', 'msg: ' || sqlerrm; end;

  -- chiusura caso C
  codici := chiudi_lavorazione(lav, op, null, 600, '[{"peso_lordo_kg":4090,"peso_tubolare_kg":40}]'::jsonb, 2450);
  assert codici = array['T5000/A'], 'codice caso C: ' || array_to_string(codici, ',');
  select * into g from rotoli_grezzi_reparto where id = gz;
  assert g.stato = 'grezzo' and g.kg_residui = 2450 and g.metri_stimati = 302, 'grezzo dopo caso C';
  assert (select kg_scarto from lavorazioni_riepilogo where id = lav) is null, 'kg_scarto null nel caso C';
  assert (select metri from rotoli_lavorati where codice = 'T5000/A') = 500, 'metri figlio = round(4050/8,1)';

  -- reparto non inserisce controlli su lavorazione chiusa (la violazione del "with check" RLS è 42501)
  begin
    insert into controlli (lavorazione_id, operatore_id, momento) values (lav, op, 'periodico');
    raise exception 'ATTESO ERRORE (controllo su lavorazione chiusa)';
  exception when insufficient_privilege then null; end;

  -- CASO A PURO su T5004: un figlio, residuo 0, nessun figlio precedente → codice SENZA suffisso
  select id into gz2 from rotoli_grezzi_reparto where n_prog = 'T5004';
  lav2 := avvia_lavorazione(gz2, sch, op, 6500, 0, 0);
  codici := chiudi_lavorazione(lav2, op, 60, 800, '[{"peso_lordo_kg":6340,"peso_tubolare_kg":40}]'::jsonb, 0);
  assert codici = array['T5004'], 'codice caso A puro: ' || array_to_string(codici, ',');

  -- fermo e ripartenza su una seconda lavorazione (T5001), poi CASO B
  select id into gz2 from rotoli_grezzi_reparto where n_prog = 'T5001';
  lav2 := avvia_lavorazione(gz2, sch, op, 6500, 0, 0);
  insert into eventi (lavorazione_id, tipo, causa_fermo, avvenuto_il) values (lav2, 'fermo', 'bagno', now() - interval '5 minutes') returning id into f2;
  insert into eventi (lavorazione_id, tipo, fermo_id, metri_scarto) values (lav2, 'ripartenza', f2, 80);
  assert (select durata_min from eventi where id = f2) = 5, 'durata_min 5';
  -- CASO B su T5001: due figli in una chiusura, tubolare 0 ("senza tubolare") → /A e /B
  codici := chiudi_lavorazione(lav2, op, 0, 800,
    '[{"peso_lordo_kg":3240,"peso_tubolare_kg":40},{"peso_lordo_kg":3160,"peso_tubolare_kg":40}]'::jsonb, 0);
  assert codici = array['T5001/A','T5001/B'], 'codici caso B: ' || array_to_string(codici, ',');
  assert (select count(*) from rotoli_lavorati where lavorazione_id = lav2) = 2, 'due figli';
  assert (select peso_netto_kg from rotoli_lavorati where codice = 'T5001/A') = 3200, 'il primo codice va al primo figlio dell''array';
  assert (select kg_scarto from lavorazioni_riepilogo where id = lav2) = 6500 - 3200 - 3120, 'kg_scarto caso B';

  -- SECONDO GIRO su T5000 (imballo 0, tubolare 60, un figlio, residuo 0 → /B)
  lav := avvia_lavorazione(gz, sch, op, 2500, 0, 0);
  codici := chiudi_lavorazione(lav, op, 60, 300, '[{"peso_lordo_kg":2410,"peso_tubolare_kg":40}]'::jsonb, 0);
  assert codici = array['T5000/B'], 'codice secondo giro: ' || array_to_string(codici, ',');
  assert (select kg_scarto from lavorazioni_riepilogo where id = lav) = 70, 'kg_scarto 70';
  select * into g from rotoli_grezzi_reparto where id = gz;
  assert g.stato = 'esaurito' and g.kg_residui = 0 and g.metri_stimati = 0, 'grezzo esaurito';

  -- reparto non chiama registra_lavorazione_completa
  begin
    perform registra_lavorazione_completa(gz, sch, op, now() - interval '2 hours', 1000, 0, 0, '[]', '[]', op, now(), 0, 100, '[{"peso_lordo_kg":900}]'::jsonb, 0, null);
    raise exception 'ATTESO ERRORE (reparto su RPC ufficio)';
  exception when others then assert sqlerrm = 'Non autorizzato', 'msg: ' || sqlerrm; end;

  -- reparto non aggiorna lo stato di una lavorazione
  begin
    update lavorazioni set stato = 'aperta' where id = lav;
    raise exception 'ATTESO ERRORE (grant stato)';
  exception when insufficient_privilege then null; end;
end $$;

-- ---------- Come UFFICIO ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000aaaa","role":"authenticated"}', true);
do $$
-- NB: lav_ko è la variabile per gli avvii "usa e getta" dentro i blocchi exception: il rollback
-- della sottotransazione cancella la riga ma NON la variabile, quindi lav non va riassegnata lì.
declare op uuid; sch uuid; gz uuid; gz2 uuid; lav uuid; lav2 uuid; lav_ko uuid; r jsonb; g rotoli_grezzi; n int; f_u uuid;
begin
  assert ruolo_utente() = 'ufficio', 'ruolo ufficio';
  select id into op from operatori where nome = 'Test Operatore';
  select id into sch from schede_lavorazione where lavorazione = 'TEST OX Satinato 5 micron';
  assert (select fornitore from rotoli_grezzi where n_prog = 'T5000') = 'Forn. Test', 'ufficio legge il fornitore';

  -- annullo con controlli presenti che riesce e scala i residui
  insert into rotoli_grezzi (n_prog, spessore_mm, larghezza_mm, peso_bolla_kg) values ('T5002', 2, 1500, 6500) returning id into gz;
  lav := avvia_lavorazione(gz, sch, op, 6540, 45, 100);
  insert into controlli (lavorazione_id, operatore_id, momento) values (lav, op, 'inizio');
  perform annulla_lavorazione(lav, op, 'aggancio non riuscito', 50);
  select * into g from rotoli_grezzi where id = gz;
  assert g.stato = 'grezzo' and g.kg_residui = 6500 - 50 * 8.1, 'residui dopo annullo: ' || g.kg_residui;   -- numeric esatto: 6095
  assert (select stato from lavorazioni where id = lav) = 'annullata', 'annullata';
  assert (select contametri_fine - contametri_inizio from lavorazioni where id = lav) = 50, 'metri consumati derivabili';
  begin  -- metri oltre il rotolo
    lav_ko := avvia_lavorazione(gz, sch, op, 6000, 0, 0);
    perform annulla_lavorazione(lav_ko, op, 'prova', 99999);
    raise exception 'ATTESO ERRORE (metri oltre il rotolo)';
  exception when others then assert sqlerrm like '%superano il rotolo%', 'msg: ' || sqlerrm; end;
  -- (l'avvio dentro il blocco exception è stato annullato con l'errore: la linea è di nuovo libera;
  --  lav resta l'annullata T5002)
  assert (select stato from lavorazioni where id = lav) = 'annullata', 'lav deve essere ancora l''annullata';

  -- controllo positivo della policy sul grezzo: un rotolo in stato "grezzo" SI modifica
  update rotoli_grezzi set cliente = 'Cliente corretto' where id = gz;
  assert (select cliente from rotoli_grezzi where id = gz) = 'Cliente corretto', 'l''ufficio deve poter modificare un grezzo';

  -- la linea viene occupata DAVVERO, fuori da ogni blocco exception
  insert into rotoli_grezzi (n_prog, spessore_mm, larghezza_mm, peso_bolla_kg) values ('T5005', 2, 1500, 6500) returning id into gz2;
  lav2 := avvia_lavorazione(gz2, sch, op, 6540, 45, 0);
  select count(*) into n from lavorazioni where stato = 'aperta';   assert n = 1, 'serve una lavorazione aperta per i test seguenti';

  -- ufficio non modifica un grezzo in lavorazione (policy stato = grezzo): l'update tocca 0 righe
  update rotoli_grezzi set cliente = 'X' where id = gz2;
  assert (select cliente from rotoli_grezzi where id = gz2) is distinct from 'X', 'la policy deve impedire la modifica di un grezzo in lavorazione';
  -- ufficio non può cambiare lo stato nemmeno con la RLS a favore: manca il grant di colonna
  begin
    update rotoli_grezzi set stato = 'grezzo' where id = gz2;
    raise exception 'ATTESO ERRORE (grant stato grezzo)';
  exception when insufficient_privilege then null; end;

  -- registrazione a posteriori MENTRE la linea è occupata: deve riuscire (riga già chiusa, niente indice)
  insert into rotoli_grezzi (n_prog, spessore_mm, larghezza_mm, peso_bolla_kg) values ('T5003', 2, 1500, 6500) returning id into gz;
  r := registra_lavorazione_completa(gz, sch, op, now() - interval '3 hours', 6500, 0, 0,
        '[{"momento":"inizio","temp_ossido":37}]'::jsonb,
        '[{"tipo":"nota","descrizione":"da carta"},{"tipo":"fermo","causa_fermo":"guasto"}]'::jsonb,
        op, now() - interval '1 hour', 60, 800, '[{"peso_lordo_kg":6300,"peso_tubolare_kg":40}]'::jsonb, 0, 'ricopiata');
  assert r->'codici' = '["T5003"]'::jsonb, 'codice a posteriori: ' || r::text;
  assert (select stato from rotoli_grezzi where id = gz) = 'esaurito', 'grezzo esaurito a posteriori';
  assert (select count(*) from controlli where lavorazione_id = (r->>'lavorazione_id')::uuid) = 1, 'controllo ricopiato';
  assert (select count(*) from eventi where lavorazione_id = (r->>'lavorazione_id')::uuid) = 2, 'eventi ricopiati';
  begin  -- le ripartenze sono rifiutate in italiano
    perform registra_lavorazione_completa(gz2, sch, op, now() - interval '3 hours', 6500, 0, 0, '[]'::jsonb,
        '[{"tipo":"ripartenza"}]'::jsonb, op, now() - interval '1 hour', 60, 800, '[{"peso_lordo_kg":6300,"peso_tubolare_kg":40}]'::jsonb, 0, null);
    raise exception 'ATTESO ERRORE (ripartenza a posteriori)';
  exception when others then assert sqlerrm like '%si registrano dopo%', 'msg ripartenza: ' || sqlerrm; end;
  -- registrazione a posteriori su un grezzo già avanzato (gz2 è in_lavorazione): riesce con avviso, senza toccare il grezzo
  r := registra_lavorazione_completa(gz2, sch, op, now() - interval '5 hours', 1000, 0, 0, '[]'::jsonb, '[]'::jsonb,
        op, now() - interval '4 hours', 0, 100, '[{"peso_lordo_kg":900,"peso_tubolare_kg":0}]'::jsonb, 0, null);
  assert (r->>'avviso') like '%già stato ripreso%', 'avviso grezzo avanzato: ' || r::text;
  assert (select stato from rotoli_grezzi where id = gz2) = 'in_lavorazione', 'il grezzo avanzato non viene toccato';
  assert r->'codici' = '["T5005/A"]'::jsonb, 'codice con grezzo avanzato (residuo implicito → suffisso): ' || r::text;

  -- il check del caso C respinge un update diretto che trasforma C in A
  begin
    update lavorazioni set peso_tubolare_kg = 60 where rotolo_grezzo_id = (select id from rotoli_grezzi where n_prog = 'T5000') and kg_residui_dichiarati > 0;
    raise exception 'ATTESO ERRORE (check del caso C)';
  exception when check_violation then null; end;

  -- ripartenza che punta il fermo di un'ALTRA lavorazione: l'ufficio può scrivere eventi anche su
  -- lavorazioni non aperte, quindi qui l'errore arriva dal trigger e non dalla RLS
  insert into eventi (lavorazione_id, tipo, causa_fermo, avvenuto_il) values (lav2, 'fermo', 'esterno', now() - interval '3 minutes') returning id into f_u;
  begin
    insert into eventi (lavorazione_id, tipo, fermo_id) values (lav, 'ripartenza', f_u);   -- lav è l'annullata T5002, f_u è di lav2
    raise exception 'ATTESO ERRORE (ripartenza incrociata)';
  exception when others then assert sqlerrm like '%altra lavorazione%', 'msg incrociata: ' || sqlerrm; end;
  insert into eventi (lavorazione_id, tipo, fermo_id, metri_scarto) values (lav2, 'ripartenza', f_u, 100);

  -- pulizia: la lavorazione aperta si annulla (il rollback finale farebbe comunque tutto)
  perform annulla_lavorazione(lav2, op, 'pulizia del test', 0);
end $$;

-- ---------- ruolo_utente() null: respinto ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000cccc","role":"authenticated"}', true);
do $$ begin
  begin
    perform annulla_lavorazione(gen_random_uuid(), gen_random_uuid(), 'x', 0);
    raise exception 'ATTESO ERRORE (utente senza ruolo)';
  exception when others then assert sqlerrm = 'Non autorizzato', 'utente non mappato: ' || sqlerrm; end;
end $$;

reset role;
select 'TUTTI I TEST PASSATI' as esito;
rollback;
```

- [ ] **Step 2: Esegui** — `execute_sql` con l'intero file. Expected: l'unico risultato è `TUTTI I TEST PASSATI`; nessun errore. Se un `assert` fallisce, il messaggio dice quale: correggere la sezione di `000_setup.sql` interessata con una **nuova** migrazione `003_fix_<voce>.sql` (mai rieseguire `000_setup.sql`), poi aggiornare anche `000_setup.sql` nel repo perché resti la fotografia dello schema.

Note per l'esecuzione: il connettore esegue il testo in un'unica sessione; `set local role` e `set_config(..., true)` valgono fino al `rollback`. Se `set local role authenticated` fallisse per permessi, eseguire `grant authenticated to postgres` una volta (è il default su Supabase, di norma non serve).

- [ ] **Step 3: Commit** — `git add sql/test_regole.sql && git commit -m "test(sql): test delle regole come authenticated, esempio dello spec incluso"`

---

### Task 14: `db.js`, `index.html` con login, `base.css`, `test-dom-ids.mjs`

**Files:**
- Create: `js/db.js`, `js/index.js`, `index.html`, `css/base.css`, `tests/test-dom-ids.mjs`

**Interfaces:**
- Produces: `db.js` esporta `sb` (client), `salva(fn, opzioni) → Promise<{ok, data?, errore?}>`, `ruoloCorrente() → Promise<'ufficio'|'reparto'|null>`, `login(email, password)`, `logout()`. `index.html` ha gli id `form-login`, `email`, `password`, `btn-login`, `messaggio`, `connesso`, `ruolo`, `btn-logout`.

- [ ] **Step 1: Test dom-ids che fallisce**

`tests/test-dom-ids.mjs`:
```js
// Ogni id cercato con byId("...") in un js/<pagina>.js deve esistere nell'HTML della pagina.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const COPPIE = [["js/index.js", "index.html"]];

for (const [js, html] of COPPIE) {
  test(`${js}: gli id cercati esistono in ${html}`, () => {
    const src = readFileSync(new URL("../" + js, import.meta.url), "utf8");
    const pagina = readFileSync(new URL("../" + html, import.meta.url), "utf8");
    const ids = [...src.matchAll(/byId\("([^"]+)"\)/g)].map((m) => m[1]);
    assert.ok(ids.length > 0, "nessun byId trovato: il test non prova nulla");
    for (const id of ids) assert.ok(pagina.includes(`id="${id}"`), `id mancante nell'HTML: ${id}`);
  });
}
```
Run: `node --test tests/test-dom-ids.mjs` → FAIL (file mancanti).

- [ ] **Step 2: `css/base.css`**

```css
/* Piattaforma Produzione — base */
:root { --blu: #1d4ed8; --rosso: #b91c1c; --verde: #15803d; --grigio: #6b7280; --sfondo: #f8fafc; --testo: #0f172a; }
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; font-size: 18px; color: var(--testo); background: var(--sfondo); }
main { max-width: 480px; margin: 8vh auto; padding: 24px; background: #fff; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,.08); }
h1 { font-size: 1.4rem; margin: 0 0 16px; }
label { display: block; margin: 12px 0 4px; color: var(--grigio); font-size: .95rem; }
input { width: 100%; min-height: 56px; font-size: 18px; padding: 0 12px; border: 1px solid #cbd5e1; border-radius: 8px; }
button { min-height: 56px; font-size: 18px; padding: 0 20px; border: 0; border-radius: 8px; background: var(--blu); color: #fff; cursor: pointer; }
button:disabled { opacity: .5; cursor: default; }
button.secondario { background: #e2e8f0; color: var(--testo); }
.messaggio { min-height: 1.5em; margin-top: 12px; color: var(--rosso); }
.messaggio.ok { color: var(--verde); }
[hidden] { display: none !important; }
```

- [ ] **Step 3: `js/db.js`**

Prima calcola l'hash SRI della libreria pinnata, con un comando che **fallisce** se il file non esiste (un 404 darebbe un hash plausibile della pagina d'errore) e che non dipende da `openssl`:
Run:
```bash
node -e "const h=require('crypto').createHash('sha384');fetch(process.argv[1]).then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.arrayBuffer()}).then(b=>{if(b.byteLength<100000)throw new Error('file troppo piccolo: '+b.byteLength);h.update(Buffer.from(b));console.log('sha384-'+h.digest('base64'))})" https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.6/dist/umd/supabase.min.js
```
Expected: una riga `sha384-…` (44+ caratteri dopo il prefisso). Annotala: va in `index.html` come `integrity="…"`.

```js
// ============================================================
// db.js — l'unico file che conosce Supabase. Client, salva(), sessione.
// La libreria è caricata come <script> UMD in ogni pagina (window.supabase), PRIMA del modulo.
// ============================================================
const SUPABASE_URL = "https://<REF>.supabase.co";            // ref del progetto Overland Produzione (Task 7)
const SUPABASE_KEY = "<CHIAVE_PUBLISHABLE>";                 // da get_publishable_keys; pubblica per design
export const byId = (id) => document.getElementById(id);

if (!window.supabase?.createClient) {
  document.body.innerHTML = '<main><p class="messaggio">Impossibile caricare la libreria Supabase (CDN bloccato?). Ricarica la pagina.</p></main>';
  throw new Error("supabase-js non disponibile");
}
export const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Ritentativi per gli errori di rete (spec §3.9): 1 s, 3 s, 10 s, poi ogni 30 s.
const ATTESE_MS = [1000, 3000, 10000];
const erroreDiRete = (e) => !e?.code && /fetch|network|rete|Failed/i.test(String(e?.message ?? e));

// salva(fn, { onStato }) — fn è una funzione che ritorna la Promise di supabase-js ({data, error}).
// onStato riceve "attesa" | "salvato" | "errore" per aggiornare l'indicatore.
export async function salva(fn, { onStato = () => {} } = {}) {
  let tentativo = 0;
  for (;;) {
    try {
      const { data, error } = await fn();
      if (!error) { onStato("salvato"); return { ok: true, data }; }
      if (!erroreDiRete(error)) { onStato("errore"); return { ok: false, errore: messaggio(error) }; }
    } catch (e) {
      if (!erroreDiRete(e)) { onStato("errore"); return { ok: false, errore: messaggio(e) }; }
    }
    onStato("attesa");
    await new Promise((r) => setTimeout(r, ATTESE_MS[tentativo] ?? 30000));
    tentativo++;
  }
}

// Gli errori delle RPC arrivano già in italiano (spec §5.5); i vincoli del DB parlano inglese e
// vanno tradotti qui; tutto il resto diventa una frase generica.
function messaggio(e) {
  const m = e?.message ?? String(e);
  if (e?.code === "P0001") return m;                                                      // raise exception nelle RPC (italiano)
  if (e?.code === "23505") return "Questo numero è già stato usato: controlla il numero progressivo.";   // unicità
  if (e?.code === "23514") return "I dati inseriti non rispettano una regola del sistema: controlla pesi e residuo."; // check
  if (e?.code === "42501") return "Operazione non consentita per questa utenza.";          // RLS / grant
  console.error(e);
  return "Qualcosa non ha funzionato, riprova; se continua avvisa l'ufficio.";
}

export async function ruoloCorrente() {
  const { data, error } = await sb.rpc("ruolo_utente");
  return error ? null : data;
}
export async function login(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email, password });
  return error ? "Email o password non corretti" : null;
}
export async function logout() { await sb.auth.signOut(); }
```
Sostituisci `<REF>` e `<CHIAVE_PUBLISHABLE>` con i valori reali (`get_project_url`, `get_publishable_keys` del connettore).

- [ ] **Step 4: `js/index.js`**

```js
import { byId, sb, ruoloCorrente, login, logout } from "./db.js";

async function aggiorna() {
  const { data: { session } } = await sb.auth.getSession();
  const ruolo = session ? await ruoloCorrente() : null;
  byId("form-login").hidden = !!session;
  byId("connesso").hidden = !session;
  if (session) {
    byId("ruolo").textContent = ruolo ? `Connesso come ${ruolo}` : "Connesso, ma senza ruolo: avvisa chi gestisce l'app";
  }
}

byId("form-login").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  byId("btn-login").disabled = true;
  byId("messaggio").textContent = "";
  const errore = await login(byId("email").value.trim(), byId("password").value);
  byId("btn-login").disabled = false;
  if (errore) byId("messaggio").textContent = errore;
  await aggiorna();
});
byId("btn-logout").addEventListener("click", async () => { await logout(); await aggiorna(); });
sb.auth.onAuthStateChange(() => aggiorna());
aggiorna();
```

- [ ] **Step 5: `index.html`**

```html
<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Piattaforma Produzione — Overland</title>
  <link rel="stylesheet" href="css/base.css">
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.6/dist/umd/supabase.min.js"
          integrity="sha384-<HASH_CALCOLATO_AL_PASSO_3>" crossorigin="anonymous"></script>
</head>
<body>
  <main>
    <h1>Piattaforma Produzione</h1>
    <form id="form-login">
      <label for="email">Email</label>
      <input id="email" type="email" autocomplete="username" required>
      <label for="password">Password</label>
      <input id="password" type="password" autocomplete="current-password" required>
      <p><button id="btn-login" type="submit">Entra</button></p>
      <p id="messaggio" class="messaggio"></p>
    </form>
    <section id="connesso" hidden>
      <p id="ruolo"></p>
      <p><button id="btn-logout" class="secondario" type="button">Esci</button></p>
    </section>
  </main>
  <script type="module" src="js/index.js"></script>
</body>
</html>
```

- [ ] **Step 6: Esegui i test** — `node --test tests/` → tutti verdi (`test-comune.mjs` + `test-dom-ids.mjs`).

- [ ] **Step 7: Prova in locale nel pannello browser**

`preview_start` con `name: "produzione-locale"`, apri `http://localhost:8000/index.html`. Expected: nessun errore in console (`read_console_messages`), form di login renderizzato, la richiesta a `<REF>.supabase.co` compare in `read_network_requests` solo dopo un tentativo di login (il caricamento della pagina non fa rete oltre il CDN). Screenshot a 1024×768 (`resize_window` width 1024 height 768) e desktop.

- [ ] **Step 8: Commit**

```bash
git add css/base.css js/db.js js/index.js index.html tests/test-dom-ids.mjs
git commit -m "feat: pagina di login con 'Connesso come', client Supabase e salva() con ritentativi"
```

---

### Task 15: Utenti Auth, repo privato GitHub, Pages, STATO

**Files:**
- Modify: `CLAUDE.md`
- Create: `STATO_<data>.md`

- [ ] **Step 1: Due utenti Auth** (azione del committente nella dashboard Supabase, guidata passo passo nel rapporto)

Dashboard → Authentication → Users → **Add user** → *Create new user*: email `ufficio@overland-ocm.it`, password scelta dal committente, **Auto Confirm User** attivo. Ripetere con `reparto@overland-ocm.it`. Poi, via connettore:
```sql
insert into utenti_app (uid, ruolo)
select id, case when email like 'ufficio@%' then 'ufficio' else 'reparto' end
from auth.users where email in ('ufficio@overland-ocm.it','reparto@overland-ocm.it')
on conflict (uid) do nothing;
select u.email, a.ruolo from auth.users u join utenti_app a on a.uid = u.id;
```
Expected: due righe. Se il committente preferisce altri indirizzi, usare quelli e annotarli nello STATO. **Disattivare la registrazione libera**: Authentication → Providers → Email → *Allow new users to sign up* = OFF (azione del committente, va per prima nel rapporto con la parola URGENTE).

- [ ] **Step 2: Repo privato e Pages** (committente, con GitHub Pro attivo)

Su github.com: **New repository** → nome `piattaforma-produzione`, **Private**, senza README. Poi in locale:
```bash
git remote add origin https://github.com/<utente>/piattaforma-produzione.git
git push -u origin main
```
Su GitHub: Settings → Pages → Source: *Deploy from a branch* → `main` / `/ (root)` → Save. Attendere 1-2 minuti: l'URL è `https://<utente>.github.io/piattaforma-produzione/`. Annotarlo in `CLAUDE.md`.
Se `gh` è disponibile e autenticato: `gh repo create piattaforma-produzione --private --source=. --remote=origin --push`.

- [ ] **Step 3: Controllo del sito pubblicato**

Aprire nel pannello browser `https://<utente>.github.io/piattaforma-produzione/index.html` con ricarica forzata (Ctrl+Shift+R; Pages può servire la versione precedente fino a 10 minuti): nessun errore in console; login con l'utenza `ufficio` (il committente digita la password nel pannello, mai in chat) → "Connesso come ufficio"; Esci; login `reparto` → "Connesso come reparto".

- [ ] **Step 4: Aggiorna `CLAUDE.md`** — ref del progetto, URL Pages, elenco tabelle/viste/RPC (copiato dai titoli delle sezioni a-e), le trappole: "mai rieseguire `000_setup.sql`", "`test_regole.sql` gira come authenticated", "`rotoli_grezzi` non è leggibile dal reparto: usare la vista", "`durata_min` e `modificato_*` le scrive il DB".

- [ ] **Step 5: `STATO_<data>.md`**

```markdown
# STATO — Fase 0 Fondamenta — <data>

FASE 0: CHIUSA

## Fatto
- Progetto Supabase `Overland Produzione` (ref …), migrazioni 000a, 000b, 000c, 000d, 000e, 000e_verifica, 000f, 001, 002 applicate il <data ora>.
- `test_regole.sql`: TUTTI I TEST PASSATI il <data ora>.
- `node --test tests/`: N test verdi.
- Pagina di login pubblicata su <URL>; verificato "Connesso come ufficio" e "come reparto".

## Migrazioni applicate
| nome | ora | esito |
…

## Verificato e come
…

## Aperto
- (nulla, oppure elenco)

## IN ATTESA DELL'UTENTE
- Disattivare la registrazione libera (se non ancora fatto).
- Passaggio a Supabase Pro: rimandato a dopo il pilota.

## Fatto a mano nella dashboard
- Creazione dei due utenti Auth.
```

- [ ] **Step 6: `RAPPORTO_fase-0.md`** (gitignorato; lo stesso testo va scritto per intero in chat al committente, che non apre i file)

```markdown
# Rapporto Fase 0 — Fondamenta — <data>

COSA È STATO FATTO
- Il database della piattaforma esiste: nove tabelle, tre viste, quattro funzioni con tutte le
  regole dei rotoli (avvio, chiusura nei casi A/B/C, annullo, registrazione a posteriori).
- Le regole sono state provate automaticamente: <N> test sul database e <M> test sulle formule,
  tutti passati (compreso l'esempio del rotolo A5000 diviso in due giri).
- La pagina di accesso è pubblicata su <URL>: entrando come "ufficio" o come "reparto" dice
  con quale ruolo si è connessi. Nient'altro è ancora visibile: le schermate arrivano dalla Fase 1.
- Dieci rotoli di collaudo e il catalogo dei difetti del manuale sono già caricati.

COSA DEVI FARE TU
1. URGENTE — Nella dashboard Supabase: Authentication → Providers → Email → spegnere
   "Allow new users to sign up". Senza questo chiunque può crearsi un'utenza.
2. Custodire le due password (ufficio e reparto). Quella del reparto andrà digitata una volta
   sola sul tablet, quando arriverà la Fase 2.
3. Verificare che GitHub Pro sia attivo e che il repository sia privato (Settings → General).

COSTI
- Progetto Supabase "Overland Produzione": <piano e costo mensile letti da get_cost al Task 7>.
- GitHub Pro: 4 $/mese.

COSA NON SONO RIUSCITO A FARE
- <vuoto, oppure elenco; qui i dettagli tecnici sono ammessi>

PROSSIMA FASE
- Fase 1 — Magazzino e pianificazione. Nessuna fermata prima.
```

- [ ] **Step 7: Commit finale della fase**

```bash
git add CLAUDE.md STATO_<data>.md
git commit -m "docs: stato di chiusura Fase 0"
git push origin main
```

---

## Self-review

**Spec coverage (Fase 0 secondo spec §6 e PIANO §3):** progetto Supabase → Task 7; `000_setup.sql` tabelle/viste/RPC/trigger/grant/RLS/realtime → Task 7-11; `seed_difetti`, `seed_collaudo` → Task 12; `comune.js` con le otto funzioni pure e test → Task 1-6; `test_regole.sql` verde come authenticated con l'esempio §2.7, casi A/B/C, tutte le guardie elencate in spec §5.6 punto 2 → Task 13; repo privato + Pages → Task 15; login e "connesso come" → Task 14-15; `test-dom-ids` → Task 14. Il test di coerenza JS↔DB (spec §5.6 punto 3) è coperto indirettamente: `test_regole.sql` e `test-comune.mjs` usano gli **stessi numeri** dell'esempio §2.7 (2.450, 302, 70, `/A`, `/B`) e la stessa terna di scostamenti; un confronto automatico via connettore arriva con la Fase 3, quando esistono controlli reali.

**Scostamenti dichiarati dallo spec:** (1) `js/comune.js` non contiene il client Supabase né `salva()` (spec §5.2 li elencava lì): sono in `js/db.js`, perché `comune.js` deve importarsi in Node senza `window`. (2) Esiste un `package.json` di una riga (`"type": "module"`), senza dipendenze: senza di esso Node ≥ 20 non importa `comune.js` come modulo ES. Nessuna toolchain, nessun `npm install`. (3) `registra_lavorazione_completa` rifiuta le ripartenze: la Fase 4 le farà aggiungere dall'ufficio dopo la registrazione. Tutti e tre da annotare nello STATO come "cosa non faccio / faccio diversamente".

**Placeholder:** `<REF>`, `<CHIAVE_PUBLISHABLE>`, `<HASH_…>`, `<utente>`, `<data>` sono valori che nascono durante l'esecuzione (Task 7, 14, 15) e ogni step dice da dove prenderli. Nessun "TBD" di disegno.

**Type consistency:** i nomi `<campo>_fuori` e `n_fuori` coincidono fra `fuoriRange` (Task 4) e `controlli_scostamenti` (Task 9); i riferimenti `sgrassatura_temp_min/max…`, `velocita_prevista`, `ampere_previsti`, `micron_previsti`, `tipo` coincidono fra il test JS e le colonne della vista (`scheda_tipo` nella vista: il JS riceve `tipo` dalla scheda — la Fase 3, che consuma la vista, mapperà `scheda_tipo → tipo` o passerà l'oggetto scheda; annotato qui perché è l'unico nome diverso). Le firme delle RPC nei `revoke/grant execute` corrispondono alle definizioni. `codiciFigli(nProg, nFigli, kgResidui, nFigliEsistenti)` ha lo stesso ordine di `_codici_figli`.
