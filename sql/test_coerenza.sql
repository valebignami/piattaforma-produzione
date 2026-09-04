-- ============================================================
-- test_coerenza.sql — le tre regole duplicate fra Postgres e js/comune.js danno lo stesso
-- risultato sugli stessi dati (spec §5.6 punto 3): fuoriRange contro la vista
-- controlli_scostamenti, codiciFigli contro _codici_figli, bilancioChiusura contro
-- _controlla_figli_e_bilancio.
--
-- LA FONTE DEI DATI È UNA SOLA: il JSON fra $fixture$ e $fixture$ qui sotto. Questo file lo usa
-- per costruire le righe nel database; tests/test-coerenza.mjs LEGGE QUESTO FILE, ne estrae lo
-- stesso JSON e lo dà alle funzioni di comune.js. Se qualcuno cambia i numeri da una parte sola,
-- uno dei due test fallisce.
--
-- COME SI ESEGUE: per intero via connettore (execute_sql), COME `postgres`, cioè senza
-- `set local role`. È l'eccezione rispetto a test_regole.sql, che gira come `authenticated`
-- perché prova i permessi: qui si provano le REGOLE DI CALCOLO, e per farlo servono
-- _codici_figli e _controlla_figli_e_bilancio (revocate al client) e un insert diretto in
-- lavorazioni (che il client non ha: le RPC sono l'unico varco).
-- Tutto in una transazione annullata. L'unico risultato atteso è 'TUTTI I TEST DI COERENZA PASSATI'.
--
-- I numeri sono INVENTATI: nel repo pubblico non entra nessun parametro di processo.
-- ============================================================
begin;

create temp table _fixture_coerenza (dati jsonb) on commit drop;
insert into _fixture_coerenza values ($fixture$
{
  "codici_ammessi": {
    "momento":     ["inizio", "meta", "fine", "periodico"],
    "tipo_evento": ["difetto", "fermo", "ripartenza", "aggiunta", "giunta_film", "taglio_film", "primi_metri_non_ossidati", "nota"],
    "causa_fermo": ["guasto", "bagno", "cambio_rotolo", "esterno", "altro"]
  },

  "colonne_fuori": [
    "temp_sgrassatura_fuori", "temp_satina_fuori", "temp_ossido_fuori", "temp_fissaggio_fuori",
    "velocita_m_min_fuori", "corrente_a_fuori", "micron_fuori",
    "gloss_perpendicolare_fuori", "gloss_parallelo_fuori"
  ],

  "previsti": { "velocita_prevista": 10, "ampere_previsti": 1000, "micron_previsti": 100 },

  "schede": {
    "satinata": {
      "tipo": "satinato",
      "sgrassatura_temp_min": 20, "sgrassatura_temp_max": 30,
      "satina_temp_min": 40, "satina_temp_max": 50,
      "ossido_temp_min": 60, "ossido_temp_max": 70,
      "fissaggio_temp_min": 80, "fissaggio_temp_max": 90
    },
    "naturale": {
      "tipo": "naturale",
      "sgrassatura_temp_min": 20, "sgrassatura_temp_max": 30,
      "satina_temp_min": 40, "satina_temp_max": 50,
      "ossido_temp_min": 60, "ossido_temp_max": 70,
      "fissaggio_temp_min": 80, "fissaggio_temp_max": 90
    },
    "solo_minimo": {
      "tipo": "satinato",
      "sgrassatura_temp_min": 20, "sgrassatura_temp_max": 30,
      "satina_temp_min": 40, "satina_temp_max": 50,
      "ossido_temp_min": 60, "ossido_temp_max": 70,
      "fissaggio_temp_min": 80, "fissaggio_temp_max": null
    }
  },

  "controlli": [
    { "nome": "tutto dentro riferimento", "scheda": "satinata",
      "valori": { "contametri": 500, "velocita_m_min": 10, "corrente_a": 1000, "tensione_v": 12,
                  "temp_sgrassatura": 25, "temp_satina": 45, "temp_ossido": 65, "temp_fissaggio": 85,
                  "micron": 100, "gloss_perpendicolare": 30, "gloss_parallelo": 50 },
      "fuori": [] },

    { "nome": "campi vuoti: mai fuori", "scheda": "satinata",
      "valori": {},
      "fuori": [] },

    { "nome": "temperatura ossido sotto il minimo", "scheda": "satinata",
      "valori": { "temp_ossido": 59 },
      "fuori": ["temp_ossido_fuori"] },

    { "nome": "temperatura ossido sopra il massimo", "scheda": "satinata",
      "valori": { "temp_ossido": 71 },
      "fuori": ["temp_ossido_fuori"] },

    { "nome": "gli estremi del range sono dentro", "scheda": "satinata",
      "valori": { "temp_ossido": 70, "temp_sgrassatura": 20 },
      "fuori": [] },

    { "nome": "velocita e micron oltre il dieci per cento", "scheda": "satinata",
      "valori": { "velocita_m_min": 11.5, "micron": 88 },
      "fuori": ["velocita_m_min_fuori", "micron_fuori"] },

    { "nome": "il dieci per cento esatto e ancora dentro", "scheda": "satinata",
      "valori": { "micron": 110, "corrente_a": 900 },
      "fuori": [] },

    { "nome": "gloss oltre le soglie su scheda satinata", "scheda": "satinata",
      "valori": { "gloss_perpendicolare": 40, "gloss_parallelo": 60 },
      "fuori": ["gloss_perpendicolare_fuori", "gloss_parallelo_fuori"] },

    { "nome": "lo stesso gloss su scheda naturale non si segnala", "scheda": "naturale",
      "valori": { "gloss_perpendicolare": 80, "gloss_parallelo": 90 },
      "fuori": [] },

    { "nome": "fissaggio senza massimo: non si segnala mai (limite dichiarato)", "scheda": "solo_minimo",
      "valori": { "temp_fissaggio": 1 },
      "fuori": [] }
  ],

  "codici": [
    { "nome": "caso A: un figlio, niente residuo, nessun figlio prima",
      "n_prog": "T9000", "n_figli": 1, "kg_residui": 0, "n_esistenti": 0, "atteso": ["T9000"] },
    { "nome": "caso B: due figli",
      "n_prog": "T9000", "n_figli": 2, "kg_residui": 0, "n_esistenti": 0, "atteso": ["T9000/A", "T9000/B"] },
    { "nome": "caso C: un figlio ma resta del grezzo",
      "n_prog": "T9000", "n_figli": 1, "kg_residui": 2450, "n_esistenti": 0, "atteso": ["T9000/A"] },
    { "nome": "secondo giro del caso C: continua da /B",
      "n_prog": "T9000", "n_figli": 1, "kg_residui": 0, "n_esistenti": 1, "atteso": ["T9000/B"] },
    { "nome": "secondo giro con due figli",
      "n_prog": "T9000", "n_figli": 2, "kg_residui": 0, "n_esistenti": 1, "atteso": ["T9000/B", "T9000/C"] }
  ],

  "bilanci": [
    { "nome": "primo giro dell esempio del disegno (caso C)",
      "peso_con_imballo": 6540, "peso_imballo": 45, "peso_tubolare": null,
      "figli": [{ "peso_lordo_kg": 4090, "peso_tubolare_kg": 40 }], "kg_residui": 2450, "ok": true },
    { "nome": "secondo giro dell esempio del disegno (imballo zero)",
      "peso_con_imballo": 2500, "peso_imballo": 0, "peso_tubolare": 60,
      "figli": [{ "peso_lordo_kg": 2410, "peso_tubolare_kg": 40 }], "kg_residui": 0, "ok": true },
    { "nome": "due figli entro il due per cento di tolleranza",
      "peso_con_imballo": 1000, "peso_imballo": 0, "peso_tubolare": 0,
      "figli": [{ "peso_lordo_kg": 600, "peso_tubolare_kg": 0 }, { "peso_lordo_kg": 415, "peso_tubolare_kg": 0 }],
      "kg_residui": 0, "ok": true },
    { "nome": "la somma supera il disponibile oltre la tolleranza",
      "peso_con_imballo": 1000, "peso_imballo": 0, "peso_tubolare": 0,
      "figli": [{ "peso_lordo_kg": 1100, "peso_tubolare_kg": 0 }], "kg_residui": 0, "ok": false },
    { "nome": "il residuo di troppo sfonda il tetto",
      "peso_con_imballo": 6540, "peso_imballo": 45, "peso_tubolare": null,
      "figli": [{ "peso_lordo_kg": 4090, "peso_tubolare_kg": 40 }], "kg_residui": 2600, "ok": false }
  ]
}
$fixture$::jsonb);

do $$
declare
  fx        jsonb;
  gz        uuid;
  op        uuid;
  lav_per   jsonb := '{}'::jsonb;    -- nome della scheda → id della lavorazione che la applica
  nome      text;
  sch       jsonb;
  sch_id    uuid;
  lav_id    uuid;
  caso      jsonb;
  ctl_id    uuid;
  riga      jsonb;
  chiave    text;
  atteso    boolean;
  trovato   boolean;
  n_atteso  integer;
  codici    text[];
  ammessi   text[];
  dal_check text[];
  riuscito  boolean;
  colonne   text[];
begin
  select dati into fx from _fixture_coerenza;
  colonne := array(select jsonb_array_elements_text(fx->'colonne_fuori'));

  -- ---------- 1. I codici del JSON sono quelli dei check del database ----------
  -- Una fonte sola anche per le etichette: se domani si aggiunge un tipo di evento, il JSON e
  -- le mappe di comune.js devono seguirlo, e questo assert lo impone.
  foreach chiave in array array['momento', 'tipo_evento', 'causa_fermo'] loop
    ammessi := (select array_agg(x order by x) from jsonb_array_elements_text(fx->'codici_ammessi'->chiave) x);
    dal_check := (
      select array_agg(distinct m[1] order by m[1])
      from pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''', 'g') m
      where c.conname = case chiave when 'momento'     then 'controlli_momento_check'
                                    when 'tipo_evento' then 'eventi_tipo_check'
                                    else                    'eventi_causa_fermo_check' end);
    assert dal_check is not null, 'check non trovato per ' || chiave;
    assert ammessi = dal_check,
           'i codici del JSON non sono quelli del check per ' || chiave || ': '
           || array_to_string(ammessi, ',') || ' contro ' || array_to_string(dal_check, ',');
  end loop;

  -- ---------- 2. La fixture: un grezzo, un operatore, le schede, una lavorazione per scheda ----------
  insert into operatori (nome) values ('Test Coerenza') returning id into op;
  insert into rotoli_grezzi (n_prog, spessore_mm, larghezza_mm, peso_bolla_kg)
    values ('T9000', 2, 1500, 6500) returning id into gz;

  for nome, sch in select key, value from jsonb_each(fx->'schede') loop
    insert into schede_lavorazione (lavorazione, tipo, micron, spessore_min, spessore_max, larghezza_min, larghezza_max,
                                    sgrassatura_temp_min, sgrassatura_temp_max, satina_temp_min, satina_temp_max,
                                    ossido_temp_min, ossido_temp_max, fissaggio_temp_min, fissaggio_temp_max)
      values ('TEST coerenza ' || nome, sch->>'tipo', 100, 1, 3, 1000, 2000,
              (sch->>'sgrassatura_temp_min')::numeric, (sch->>'sgrassatura_temp_max')::numeric,
              (sch->>'satina_temp_min')::numeric,      (sch->>'satina_temp_max')::numeric,
              (sch->>'ossido_temp_min')::numeric,      (sch->>'ossido_temp_max')::numeric,
              (sch->>'fissaggio_temp_min')::numeric,   (sch->>'fissaggio_temp_max')::numeric)
      returning id into sch_id;

    -- La lavorazione della fixture è CHIUSA: l'indice unico lavorazioni_una_aperta_per_linea
    -- respingerebbe una seconda aperta se in linea ce ne fosse davvero una. E su una chiusa vale
    -- il check lavorazioni_caso_c: con residuo dichiarato 0 il tubolare deve esserci (0 va bene).
    insert into lavorazioni (rotolo_grezzo_id, scheda_lavorazione_id, operatore_avvio_id,
                             peso_con_imballo_kg, peso_imballo_kg, contametri_inizio,
                             peso_tubolare_kg, kg_residui_dichiarati, stato, chiusa_il,
                             velocita_prevista, ampere_previsti, micron_previsti)
      values (gz, sch_id, op, 6540, 45, 0, 0, 0, 'chiusa', now(),
              (fx->'previsti'->>'velocita_prevista')::numeric,
              (fx->'previsti'->>'ampere_previsti')::numeric,
              (fx->'previsti'->>'micron_previsti')::numeric)
      returning id into lav_id;
    lav_per := lav_per || jsonb_build_object(nome, lav_id::text);
  end loop;

  -- ---------- 3. fuoriRange ↔ controlli_scostamenti ----------
  for caso in select * from jsonb_array_elements(fx->'controlli') loop
    lav_id := (lav_per->>(caso->>'scheda'))::uuid;
    assert lav_id is not null, 'scheda sconosciuta nella fixture: ' || (caso->>'scheda');

    insert into controlli (lavorazione_id, operatore_id, momento, contametri, velocita_m_min, corrente_a, tensione_v,
                           temp_sgrassatura, temp_satina, temp_ossido, temp_fissaggio,
                           micron, gloss_parallelo, gloss_perpendicolare)
      values (lav_id, op, 'periodico',
              (caso->'valori'->>'contametri')::numeric,       (caso->'valori'->>'velocita_m_min')::numeric,
              (caso->'valori'->>'corrente_a')::numeric,       (caso->'valori'->>'tensione_v')::numeric,
              (caso->'valori'->>'temp_sgrassatura')::numeric, (caso->'valori'->>'temp_satina')::numeric,
              (caso->'valori'->>'temp_ossido')::numeric,      (caso->'valori'->>'temp_fissaggio')::numeric,
              (caso->'valori'->>'micron')::numeric,           (caso->'valori'->>'gloss_parallelo')::numeric,
              (caso->'valori'->>'gloss_perpendicolare')::numeric)
      returning id into ctl_id;

    select to_jsonb(x) into riga from controlli_scostamenti x where x.id = ctl_id;
    assert riga is not null, 'controllo assente dalla vista: ' || (caso->>'nome');

    -- jsonb_exists invece dell'operatore ? : un punto interrogativo nel testo di una query
    -- viene scambiato per un segnaposto da parecchi client.
    foreach chiave in array colonne loop
      atteso  := jsonb_exists(caso->'fuori', chiave);
      trovato := (riga->>chiave)::boolean;
      assert trovato = atteso,
             format('%s: %s atteso %s, trovato %s', caso->>'nome', chiave, atteso, trovato);
    end loop;

    n_atteso := jsonb_array_length(caso->'fuori');
    assert (riga->>'n_fuori')::integer = n_atteso,
           format('%s: n_fuori atteso %s, trovato %s', caso->>'nome', n_atteso, riga->>'n_fuori');
  end loop;

  -- ---------- 4. codiciFigli ↔ _codici_figli ----------
  for caso in select * from jsonb_array_elements(fx->'codici') loop
    codici := _codici_figli(caso->>'n_prog', (caso->>'n_figli')::integer,
                            (caso->>'kg_residui')::numeric, (caso->>'n_esistenti')::integer);
    assert codici = array(select jsonb_array_elements_text(caso->'atteso')),
           format('%s: codici %s', caso->>'nome', array_to_string(codici, ','));
  end loop;

  -- ---------- 5. bilancioChiusura ↔ _controlla_figli_e_bilancio ----------
  for caso in select * from jsonb_array_elements(fx->'bilanci') loop
    begin
      perform _controlla_figli_e_bilancio((caso->>'peso_con_imballo')::numeric,
                                          (caso->>'peso_imballo')::numeric,
                                          (caso->>'peso_tubolare')::numeric,
                                          caso->'figli',
                                          (caso->>'kg_residui')::numeric);
      riuscito := true;
    exception when others then
      riuscito := false;
    end;
    assert riuscito = (caso->>'ok')::boolean,
           format('%s: atteso %s, ottenuto %s', caso->>'nome', caso->>'ok', riuscito);
  end loop;
end $$;

select 'TUTTI I TEST DI COERENZA PASSATI' as esito;
rollback;
