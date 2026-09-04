#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
importa_schede.py — genera sql/seed_schede.sql dalle schede di lavorazione della Linea 1500.

  Fonte (PIANO §2, decisione del committente del 2026-09-04):
    Desktop/Schede di lavorazione/Schede di lavorazione Impianto 1500.docx
  Uscita:
    sql/seed_schede.sql   (GITIGNORATO: contiene i parametri di processo e il repo è pubblico)

  Uso:
    python tools/importa_schede.py                     # percorsi predefiniti
    python tools/importa_schede.py --word X --sql Y

  Serve Python 3.9 o successivo e la libreria python-docx:
    python -m pip install python-docx
  (È l'unico programma di questo repo che non gira con `node --test tests/`: si esegue a mano,
  una volta, e il suo risultato si applica come migrazione 004_seed_schede.)

  Il programma riconosce i FORMATI delle celle, non un elenco di valori attesi: così nessun
  parametro di processo finisce nel sorgente. Se incontra un formato che non conosce si ferma
  con un errore, invece di indovinare.
"""

import argparse
import re
import sys
from pathlib import Path

try:
    import docx
    from docx.table import Table
    from docx.text.paragraph import Paragraph
    from docx.oxml.ns import qn
except ImportError:                                          # pragma: no cover
    sys.exit("Manca python-docx. Installalo con:  python -m pip install python-docx")

RADICE = Path(__file__).resolve().parent.parent
WORD_PREDEFINITO = RADICE.parent / "Schede di lavorazione" / "Schede di lavorazione Impianto 1500.docx"
SQL_PREDEFINITO = RADICE / "sql" / "seed_schede.sql"

# Le fasi del Word e la colonna dello schema che le riceve. NEUTRO non c'è: è la
# neutralizzazione, non ha una colonna in schede_lavorazione e lo spec §2.1 la esclude.
VASCHE = {"SGRASSATURA": "sgrassatura", "SATINATURA": "satina", "OSSIDO": "ossido", "FISSAGGIO": "fissaggio"}
FASI_NOTE = {"NEUTRO"}                                       # riconosciute e volutamente saltate
VUOTO = {"", "—", "-", "–"}

CONTEGGI_ATTESI = {"SGRASSATURA": 51, "OSSIDO": 51, "FISSAGGIO": 51, "SATINATURA": 21, "NEUTRO": 18}
SCHEDE_ATTESE = 51

COLONNE = [
    "lavorazione", "tipo", "micron", "finitura", "lega",
    "spessore_min", "spessore_max", "larghezza_min", "larghezza_max",
    "velocita_m_min", "ossido_ampere",
    "sgrassatura_prodotto", "sgrassatura_temp", "sgrassatura_temp_min", "sgrassatura_temp_max",
    "satina_prodotto", "satina_temp", "satina_temp_min", "satina_temp_max",
    "ossido_prodotto", "ossido_temp", "ossido_temp_min", "ossido_temp_max",
    "fissaggio_prodotto", "fissaggio_temp", "fissaggio_temp_min", "fissaggio_temp_max",
    "note",
]


# ---------- lettura del documento ----------

def blocchi(documento):
    """Paragrafi e tabelle nell'ordine in cui stanno nella pagina (python-docx li tiene separati)."""
    for figlio in documento.element.body.iterchildren():
        if figlio.tag == qn("w:p"):
            yield Paragraph(figlio, documento)
        elif figlio.tag == qn("w:tbl"):
            yield Table(figlio, documento)


def testo(cella):
    return " ".join(cella.text.split())


# ---------- conversioni (riconoscono i formati, non i valori) ----------

def numero(grezzo):
    """'3,7' → 3.7. None se la cella è vuota o non è un numero."""
    if grezzo is None:
        return None
    ripulito = str(grezzo).strip().replace(",", ".")
    if ripulito in VUOTO:
        return None
    return float(ripulito) if re.fullmatch(r"-?\d+(\.\d+)?", ripulito) else None


def intervallo(grezzo, dove):
    """'N mm' → (N, N);  'da N a M mm' → (N, M). Il minimo e il massimo sono compresi."""
    pulito = str(grezzo).replace("mm", "").strip()
    coppia = re.fullmatch(r"da\s+([\d.,]+)\s+a\s+([\d.,]+)", pulito)
    if coppia:
        minimo, massimo = numero(coppia.group(1)), numero(coppia.group(2))
    else:
        minimo = massimo = numero(pulito)
    if minimo is None or massimo is None:
        raise ValueError(f"{dove}: misura non riconosciuta ({grezzo!r})")
    if massimo < minimo:
        raise ValueError(f"{dove}: il massimo è minore del minimo ({grezzo!r})")
    return minimo, massimo


def tolleranza(grezzo, dove):
    """'A-B' → (A, B);  'min N' → (N, None), un minimo senza limite superiore;  '—' → (None, None)."""
    pulito = str(grezzo).strip()
    if pulito in VUOTO:
        return None, None
    coppia = re.fullmatch(r"([\d.,]+)\s*-\s*([\d.,]+)", pulito)
    if coppia:
        return numero(coppia.group(1)), numero(coppia.group(2))
    solo_minimo = re.fullmatch(r"min\s+([\d.,]+)", pulito, re.IGNORECASE)
    if solo_minimo:
        return numero(solo_minimo.group(1)), None
    raise ValueError(f"{dove}: tolleranza in un formato che non conosco ({grezzo!r})")


def micron_dal_nome(nome):
    """'N micron' → N;  'N-M micron' → punto medio (la colonna è un numero solo e non ammette null)."""
    trovato = re.search(r"(\d+)(?:\s*-\s*(\d+))?\s*micron", nome, re.IGNORECASE)
    if not trovato:
        raise ValueError(f"{nome}: non trovo i micron nel nome della lavorazione")
    primo = int(trovato.group(1))
    secondo = trovato.group(2)
    return float(primo) if secondo is None else (primo + int(secondo)) / 2


# ---------- estrazione ----------

def leggi_schede(percorso_word):
    documento = docx.Document(str(percorso_word))
    pezzi = list(blocchi(documento))
    schede, conteggi = [], {fase: 0 for fase in CONTEGGI_ATTESI}
    indice = 0

    while indice < len(pezzi):
        pezzo = pezzi[indice]
        if not (isinstance(pezzo, Paragraph) and pezzo.text.strip() == "SCHEDA IMPIANTO 1500"):
            indice += 1
            continue

        # nome della lavorazione (primo paragrafo non vuoto dopo l'intestazione)
        cursore = indice + 1
        while isinstance(pezzi[cursore], Paragraph) and not pezzi[cursore].text.strip():
            cursore += 1
        nome = pezzi[cursore].text.strip()
        cursore += 1

        # tabella FINITURA | SPESSORE | LARGHEZZA
        while not isinstance(pezzi[cursore], Table):
            cursore += 1
        dimensioni = pezzi[cursore]
        cursore += 1
        if testo(dimensioni.rows[0].cells[0]) != "FINITURA":
            raise ValueError(f"{nome}: mi aspettavo la tabella delle dimensioni")
        finitura, spessore, larghezza = [testo(c) for c in dimensioni.rows[1].cells][:3]

        # paragrafi fino alla tabella delle vasche: fra questi c'è la velocità di linea
        velocita = None
        while isinstance(pezzi[cursore], Paragraph):
            riga = re.match(r"Velocità linea:\s*([\d.,]+)\s*m/min", pezzi[cursore].text.strip())
            if riga:
                velocita = numero(riga.group(1))
            cursore += 1
        vasche = pezzi[cursore]
        if testo(vasche.rows[0].cells[0]) != "FASE":
            raise ValueError(f"{nome}: mi aspettavo la tabella delle vasche")

        scheda = {colonna: None for colonna in COLONNE}
        scheda["lavorazione"] = nome
        scheda["tipo"] = "satinato" if "satinato" in nome.lower() else "naturale"
        scheda["micron"] = micron_dal_nome(nome)
        scheda["finitura"] = finitura or None
        scheda["lega"] = None            # il Word non la riporta (PIANO §2, decisione del 2026-09-04)
        scheda["velocita_m_min"] = velocita
        scheda["spessore_min"], scheda["spessore_max"] = intervallo(spessore, f"{nome}: spessore")
        scheda["larghezza_min"], scheda["larghezza_max"] = intervallo(larghezza, f"{nome}: larghezza")

        for riga in vasche.rows[1:]:
            celle = [testo(c) for c in riga.cells]
            fase, prodotto, temperatura, tolleranza_grezza, corrente = celle[0], celle[1], celle[2], celle[3], celle[4]
            if fase not in VASCHE and fase not in FASI_NOTE:
                raise ValueError(f"{nome}: fase sconosciuta ({fase!r})")
            conteggi[fase] = conteggi.get(fase, 0) + 1
            if fase == "OSSIDO":
                scheda["ossido_ampere"] = numero(corrente)
            if fase in FASI_NOTE:
                continue                                     # NEUTRO: letta, contata, non importata
            vasca = VASCHE[fase]
            scheda[f"{vasca}_prodotto"] = None if prodotto in VUOTO else prodotto
            scheda[f"{vasca}_temp"] = numero(temperatura)
            scheda[f"{vasca}_temp_min"], scheda[f"{vasca}_temp_max"] = tolleranza(
                tolleranza_grezza, f"{nome}: tolleranza di {vasca}")

        # tabella di avviso, se c'è: diventa le note della scheda
        successivo = cursore + 1
        while successivo < len(pezzi) and isinstance(pezzi[successivo], Paragraph) and not pezzi[successivo].text.strip():
            successivo += 1
        if successivo < len(pezzi) and isinstance(pezzi[successivo], Table):
            prima = testo(pezzi[successivo].rows[0].cells[0])
            if prima.startswith("⚠"):
                scheda["note"] = " ".join(prima.replace("⚠", " ").split())

        schede.append(scheda)
        indice = cursore + 1

    return schede, conteggi


def controlla(schede, conteggi):
    """Ciò che il documento deve avere: se il Word cambia struttura, meglio fermarsi qui."""
    if len(schede) != SCHEDE_ATTESE:
        raise ValueError(f"trovate {len(schede)} schede invece di {SCHEDE_ATTESE}")
    for fase, atteso in CONTEGGI_ATTESI.items():
        if conteggi.get(fase, 0) != atteso:
            raise ValueError(f"la fase {fase} compare {conteggi.get(fase, 0)} volte invece di {atteso}")
    obbligatorie = ["lavorazione", "tipo", "micron", "spessore_min", "spessore_max",
                    "larghezza_min", "larghezza_max"]
    for scheda in schede:
        mancanti = [c for c in obbligatorie if scheda[c] is None]
        if mancanti:
            raise ValueError(f"{scheda['lavorazione']}: mancano {', '.join(mancanti)}")


# ---------- scrittura del SQL ----------

def sql_valore(valore):
    if valore is None:
        return "null"
    if isinstance(valore, float):
        return str(int(valore)) if valore.is_integer() else repr(valore)
    return "'" + str(valore).replace("'", "''") + "'"


def scrivi_sql(schede, percorso_sql):
    campione = sorted(schede, key=lambda s: (s["lavorazione"], s["spessore_min"], s["larghezza_min"]))[:1]
    righe = [
        "-- ============================================================",
        "-- seed_schede.sql — le 51 schede di lavorazione della Linea 1500.",
        "-- GENERATO da tools/importa_schede.py: non modificare a mano, rigeneralo.",
        "-- Fonte: Schede di lavorazione Impianto 1500.docx (PIANO §2, 2026-09-04).",
        "-- FUORI DAL REPO (.gitignore): contiene i parametri di processo e il repo è pubblico.",
        "-- Si applica come migrazione 004_seed_schede. apply_migration lo esegue in UNA",
        "-- transazione: se un assert finale fallisce, l'insert viene annullato con lui.",
        "-- Da psql, eseguirlo dentro begin … commit per avere lo stesso comportamento.",
        "-- ============================================================",
        "",
        "-- ---------- Verifica preliminare ----------",
        "do $$ begin",
        "  if exists (select 1 from schede_lavorazione) then",
        "    raise exception 'Schede già caricate: non rieseguire seed_schede.sql';",
        "  end if;",
        "end $$;",
        "",
        "insert into schede_lavorazione (" + ", ".join(COLONNE) + ") values",
    ]
    corpo = [f"  ({', '.join(sql_valore(scheda[c]) for c in COLONNE)})" for scheda in schede]
    righe.append(",\n".join(corpo) + ";")
    righe += [
        "",
        "-- ---------- Verifiche finali ----------",
        "do $$ begin",
        f"  assert (select count(*) from schede_lavorazione) = {len(schede)}, 'schede: numero inatteso';",
        f"  assert (select count(*) from schede_lavorazione where tipo = 'naturale') = "
        f"{sum(1 for s in schede if s['tipo'] == 'naturale')}, 'schede naturali: numero inatteso';",
        f"  assert (select count(*) from schede_lavorazione where tipo = 'satinato') = "
        f"{sum(1 for s in schede if s['tipo'] == 'satinato')}, 'schede satinate: numero inatteso';",
        f"  assert (select count(distinct micron) from schede_lavorazione) = "
        f"{len({s['micron'] for s in schede})}, 'micron distinti: numero inatteso';",
        "  assert (select count(*) from schede_lavorazione where sgrassatura_temp is null "
        "or ossido_temp is null or fissaggio_temp is null or ossido_ampere is null) = 0,",
        "         'una scheda è senza temperature o senza corrente';",
        f"  assert (select count(*) from schede_lavorazione where satina_temp is not null) = "
        f"{sum(1 for s in schede if s['satina_temp'] is not None)}, 'schede con satinatura: numero inatteso';",
        f"  assert (select count(*) from schede_lavorazione where note is not null) = "
        f"{sum(1 for s in schede if s['note'] is not None)}, 'schede con note: numero inatteso';",
        f"  assert (select count(*) from schede_lavorazione where lega is not null) = 0,",
        "         'la lega non si importa dal Word (PIANO §2, decisione del 2026-09-04)';",
        "  assert (select count(*) from schede_lavorazione where velocita_m_min is null) = 0,",
        "         'una scheda è senza velocità di linea';",
    ]
    # una scheda a campione scritta per esteso: confrontata con l'Excel prima di importare
    for scheda in campione:
        confronti = " and ".join(
            f"{c} {'is null' if scheda[c] is None else '= ' + sql_valore(scheda[c])}"
            for c in ["velocita_m_min", "ossido_ampere", "sgrassatura_temp", "sgrassatura_temp_min",
                      "sgrassatura_temp_max", "ossido_temp", "ossido_temp_min", "ossido_temp_max",
                      "fissaggio_temp", "fissaggio_temp_min", "fissaggio_temp_max"])
        righe += [
            "  assert (select count(*) from schede_lavorazione",
            f"          where lavorazione = {sql_valore(scheda['lavorazione'])}",
            f"            and spessore_min = {sql_valore(scheda['spessore_min'])}"
            f" and larghezza_min = {sql_valore(scheda['larghezza_min'])}",
            f"            and {confronti}) = 1,",
            "         'la scheda a campione non ha i valori confrontati con l''Excel';",
        ]
    righe += ["end $$;", ""]
    percorso_sql.write_text("\n".join(righe), encoding="utf-8")


def main():
    argomenti = argparse.ArgumentParser(description="Genera sql/seed_schede.sql dal Word delle schede.")
    argomenti.add_argument("--word", default=str(WORD_PREDEFINITO), help="il documento Word di partenza")
    argomenti.add_argument("--sql", default=str(SQL_PREDEFINITO), help="il file SQL da scrivere")
    scelte = argomenti.parse_args()

    percorso_word = Path(scelte.word)
    if not percorso_word.exists():
        sys.exit(f"Non trovo il Word delle schede: {percorso_word}")

    schede, conteggi = leggi_schede(percorso_word)
    controlla(schede, conteggi)
    percorso_sql = Path(scelte.sql)
    percorso_sql.parent.mkdir(parents=True, exist_ok=True)
    scrivi_sql(schede, percorso_sql)

    naturali = sum(1 for s in schede if s["tipo"] == "naturale")
    print(f"Scritto {percorso_sql}")
    print(f"  {len(schede)} schede: {naturali} naturali, {len(schede) - naturali} satinate")
    print(f"  {sum(1 for s in schede if s['satina_temp'] is not None)} con satinatura, "
          f"{sum(1 for s in schede if s['note'] is not None)} con note")
    print(f"  micron distinti: {len({s['micron'] for s in schede})}")


if __name__ == "__main__":
    main()
