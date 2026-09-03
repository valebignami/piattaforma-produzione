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
  -- (003) ripartenza spostata su un altro fermo: il fermo di prima torna aperto, la sua durata va azzerata
  if tg_op = 'UPDATE' and old.fermo_id is not null and old.fermo_id is distinct from new.fermo_id then
    update eventi set avvenuto_il = avvenuto_il where id = old.fermo_id;
  end if;
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

-- ============================================================
-- Sezione d: helper interni (prefisso _) e RPC. Tutte con search_path; security definer le
-- quattro RPC e _inserisci_figli (scrivono); _codici_figli e _controlla_figli_e_bilancio sono
-- puri (nessun accesso alle tabelle) e girano nel contesto della RPC che li chiama.
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

-- ============================================================
-- Verifiche della sezione e (applicate come migrazione separata 000e_verifica: se un assert fosse
-- scritto male, i permessi appena concessi restano acquisiti e si corregge solo l'assert).
-- NB: information_schema.column_privileges ESPANDE i grant di tabella su ogni colonna, quindi le
-- colonne riservate vanno legate alla loro tabella (tipi_difetto ha una colonna "codice" con grant
-- di tabella legittimo).
-- ============================================================
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

-- ============================================================
-- Sezione f: realtime, solo le tre tabelle del turno. Separata perché "alter publication"
-- richiede di essere proprietari della publication: se fallisce, RLS e grant restano acquisiti.
-- Non ha la guardia "già applicata": è idempotente per costruzione (if not exists).
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
