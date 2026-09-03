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
