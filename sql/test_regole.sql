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
-- Numeri INVENTATI (come in tests/test-comune.mjs): il repo è pubblico e i parametri di
-- processo veri stanno solo nel Word delle schede e in sql/seed_schede.sql, gitignorato.
-- Qui contano le REGOLE (dentro/fuori, ±10 %, soglie del gloss), non i valori.
insert into schede_lavorazione (lavorazione, tipo, micron, spessore_min, spessore_max, larghezza_min, larghezza_max,
                                velocita_m_min, ossido_ampere, ossido_temp, ossido_temp_min, ossido_temp_max)
  values ('TEST OX Satinato 5 micron', 'satinato', 5, 1, 3, 1000, 1500, 10, 1000, 65, 60, 70);
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
  -- ossido 40 sotto il minimo 60, micron 4,4 a −12 % dai 5 previsti, gloss ⊥ 40 alla soglia
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
declare op uuid; sch uuid; gz uuid; gz2 uuid; lav uuid; lav2 uuid; lav_ko uuid; r jsonb; g rotoli_grezzi; n int; f_u uuid; f_u2 uuid;
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
        '[{"momento":"inizio","temp_ossido":65}]'::jsonb,
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
  assert (select durata_min from eventi where id = f_u) = 3, 'durata_min 3 del fermo ufficio';

  -- (003) correzione d'ufficio: la ripartenza viene spostata su un altro fermo → il fermo di prima
  -- torna aperto con durata azzerata, il nuovo fermo prende la durata
  insert into eventi (lavorazione_id, tipo, causa_fermo, avvenuto_il) values (lav2, 'fermo', 'altro', now() - interval '2 minutes') returning id into f_u2;
  update eventi set fermo_id = f_u2 where tipo = 'ripartenza' and fermo_id = f_u;
  assert (select durata_min from eventi where id = f_u) is null, 'il fermo abbandonato deve tornare senza durata';
  assert (select durata_min from eventi where id = f_u2) = 2, 'il nuovo fermo prende la durata';
  -- il fermo abbandonato è di nuovo aperto: l'annullo lo respinge finché non ha una ripartenza
  begin
    perform annulla_lavorazione(lav2, op, 'prova', 0);
    raise exception 'ATTESO ERRORE (fermo tornato aperto)';
  exception when others then assert sqlerrm like '%fermo aperto%', 'msg fermo riaperto: ' || sqlerrm; end;
  insert into eventi (lavorazione_id, tipo, fermo_id) values (lav2, 'ripartenza', f_u);

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
