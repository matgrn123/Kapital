-- T27 : stocks de produits finis, clamp des ventes au stock disponible.
--
-- Avant : avancerMonde generait des ventes sans tenir compte du stock, et le
-- compte 35 pouvait devenir negatif puisque rien n'alimentait le stock.
--
-- Apres : chaque company_product a une ligne product_stock avec sa quantite
-- courante et sa valeur moyenne. avancerMonde clamp les ventes a cette
-- quantite. Le stock est alimente manuellement (bouton admin) en MVP,
-- puis par le processeur d'ordres de production dans T28.

set statement_timeout = '60s';

create table if not exists public.product_stock (
  company_id uuid not null references public.companies(id) on delete cascade,
  product_id text not null references public.products(id),
  quantite_pieces integer not null default 0 check (quantite_pieces >= 0),
  valeur_totale_centimes bigint not null default 0 check (valeur_totale_centimes >= 0),
  mise_a_jour_le timestamptz not null default now(),
  primary key (company_id, product_id)
);

create index if not exists product_stock_company_id_idx
  on public.product_stock(company_id);

alter table public.product_stock enable row level security;

drop policy if exists "product_stock_select_own" on public.product_stock;
create policy "product_stock_select_own"
  on public.product_stock for select
  using (
    exists (
      select 1 from public.companies c
      where c.id = product_stock.company_id
        and c.owner_profile_id = auth.uid()
    )
  );

-- Initialisation automatique : chaque nouveau product au catalogue cree
-- une ligne product_stock a 0.
create or replace function public.initialiser_stock_produit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.product_stock (company_id, product_id, quantite_pieces, valeur_totale_centimes)
  values (new.company_id, new.product_id, 0, 0)
  on conflict (company_id, product_id) do nothing;
  return new;
end;
$$;

drop trigger if exists company_product_init_stock on public.company_products;
create trigger company_product_init_stock
  after insert on public.company_products
  for each row execute function public.initialiser_stock_produit();

-- Backfill : lignes existantes dans company_products sans product_stock
insert into public.product_stock (company_id, product_id, quantite_pieces, valeur_totale_centimes)
select cp.company_id, cp.product_id, 0, 0
from public.company_products cp
on conflict (company_id, product_id) do nothing;
