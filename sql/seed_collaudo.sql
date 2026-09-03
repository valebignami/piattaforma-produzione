-- Dieci rotoli di collaudo (spec §5.7): 1500 × 2 mm, bolla 6.500 kg. Nascosti in ufficio per
-- default (n_prog like 'COLLAUDO%'); sul tablet solo da "Cerca altro numero".
insert into rotoli_grezzi (n_prog, fornitore, rif_bolla, cliente, lega, finitura, spessore_mm, larghezza_mm, peso_bolla_kg, data_arrivo, note)
select 'COLLAUDO-' || lpad(i::text, 4, '0'), 'Fornitore di collaudo', 'BOLLA-COLLAUDO', 'Cliente di collaudo',
       '1050 H24', 'MF', 2, 1500, 6500, current_date, 'ROTOLO DI COLLAUDO - non cancellare'
from generate_series(1, 10) i
on conflict (n_prog) do nothing;
