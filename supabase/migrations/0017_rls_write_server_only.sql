-- A.4 : fermer les policies d'écriture côté joueur.
--
-- Avant : le navigateur du joueur pouvait insérer/modifier directement
-- (companies, ledger_entries, employees, workshops, purchase_orders,
-- production_orders, marketing_actions, brand_state, loans, loan_schedules,
-- company_products, mission_progress, placed_modules). Il suffisait d'ouvrir
-- la console pour mettre sa trésorerie à 1 milliard.
--
-- Après : seules les policies _select_own restent. Toute écriture passe par
-- une route serveur /api/actions/* (A.1) qui utilise la clé service_role
-- (bypass RLS) après validation.
--
-- Les tables de référence (products, materials, suppliers, supplier_catalogue,
-- faconniers, faconnier_catalogue, worlds, valeurs_entreprises,
-- classement_publique, catalogues bâtiments/modules) gardent leurs policies
-- _select_all : lecture publique autorisée.

set statement_timeout = '60s';

-- companies
drop policy if exists "companies_insert_own" on public.companies;
drop policy if exists "companies_update_own" on public.companies;

-- ledger_entries
drop policy if exists "ledger_entries_insert_own_company" on public.ledger_entries;

-- company_products
drop policy if exists "company_products_insert_own" on public.company_products;
drop policy if exists "company_products_update_own" on public.company_products;

-- employees
drop policy if exists "employees_insert_own" on public.employees;
drop policy if exists "employees_update_own" on public.employees;

-- workshops
drop policy if exists "workshops_insert_own" on public.workshops;
drop policy if exists "workshops_update_own" on public.workshops;

-- purchase_orders
drop policy if exists "purchase_orders_insert_own" on public.purchase_orders;

-- production_orders
drop policy if exists "production_orders_insert_own" on public.production_orders;

-- brand_state
drop policy if exists "brand_state_insert_own" on public.brand_state;
drop policy if exists "brand_state_update_own" on public.brand_state;

-- marketing_actions
drop policy if exists "marketing_actions_insert_own" on public.marketing_actions;

-- loans
drop policy if exists "loans_insert_own" on public.loans;
drop policy if exists "loans_update_own" on public.loans;

-- loan_schedules
drop policy if exists "loan_schedules_insert_own" on public.loan_schedules;

-- mission_progress (mise à jour par la fonction serveur chargerProgressionMissions)
drop policy if exists "mission_progress_upsert_own" on public.mission_progress;
drop policy if exists "mission_progress_update_own" on public.mission_progress;

-- placed_modules (3D — aménagement passera aussi par route serveur plus tard)
drop policy if exists "placed_modules_insert_own" on public.placed_modules;
drop policy if exists "placed_modules_update_own" on public.placed_modules;
drop policy if exists "placed_modules_delete_own" on public.placed_modules;
