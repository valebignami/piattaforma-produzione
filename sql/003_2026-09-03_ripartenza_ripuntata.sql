-- ============================================================
-- 003 — Fase 0, correzione da revisione del codice.
-- Difetto: se l'ufficio sposta una ripartenza da un fermo a un altro (update di fermo_id),
-- il trigger toccava solo il nuovo fermo: il fermo di prima restava con la durata vecchia
-- pur essendo di nuovo aperto. Ora tocca anche il fermo precedente, così il trigger 1 gli
-- azzera durata_min (nessuna ripartenza lo punta più). Nessuna ricorsione: il trigger 2
-- non reagisce alle righe di tipo fermo. 000_setup.sql è aggiornato di conseguenza.
-- ============================================================

-- ---------- Verifiche preliminari ----------
do $$ begin
  if not exists (select 1 from pg_proc where proname = 'eventi_ripartenza' and pronamespace = 'public'::regnamespace) then
    raise exception 'Manca eventi_ripartenza: applicare prima 000_setup.sql';
  end if;
  if position('old.fermo_id' in (select prosrc from pg_proc where proname = 'eventi_ripartenza' and pronamespace = 'public'::regnamespace)) > 0 then
    raise exception 'Migrazione 003 già applicata: non rieseguire';
  end if;
end $$;

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
  -- (003) ripartenza spostata su un altro fermo: il fermo di prima torna aperto, la sua durata va azzerata
  if tg_op = 'UPDATE' and old.fermo_id is not null and old.fermo_id is distinct from new.fermo_id then
    update eventi set avvenuto_il = avvenuto_il where id = old.fermo_id;
  end if;
  return null;
end $$;

-- ---------- Verifiche finali ----------
do $$ begin
  assert position('old.fermo_id' in (select prosrc from pg_proc where proname = 'eventi_ripartenza' and pronamespace = 'public'::regnamespace)) > 0,
         'eventi_ripartenza non aggiornata';
  assert (select count(*) from pg_trigger where tgname = 'trg_eventi_ripartenza') = 1, 'trigger trg_eventi_ripartenza assente';
end $$;
