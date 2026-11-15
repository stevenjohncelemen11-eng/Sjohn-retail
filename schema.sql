-- SJohn & Co. Retail — Supabase setup (run once in SQL Editor)
-- Uses PostgreSQL built-in gen_random_uuid(); no pgcrypto/gen_random_bytes call is required.

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  description text not null default '',
  price numeric(12,2) not null check (price >= 0),
  stock integer not null default 0 check (stock >= 0),
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_full_name text not null,
  customer_mobile text not null,
  customer_address text not null,
  region text not null,
  province text not null,
  city_municipality text not null,
  barangay text not null,
  street_address text not null,
  items jsonb not null check (jsonb_typeof(items) = 'array'),
  total_amount numeric(12,2) not null check (total_amount >= 0),
  payment_reference text not null default '',
  proof_path text not null,
  status text not null default 'Pending Payment Verification'
    check (status in ('Pending Payment Verification','Payment Verified / Processing','Shipped','Delivered','Cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- If these tables existed from an earlier iteration, add the columns this app expects.
-- Review existing data before applying NOT NULL to older tables with rows.
alter table public.products add column if not exists description text not null default '';
alter table public.products add column if not exists price numeric(12,2) not null default 0;
alter table public.products add column if not exists stock integer not null default 0;
alter table public.products add column if not exists image_url text;
alter table public.products add column if not exists is_active boolean not null default true;
alter table public.products add column if not exists updated_at timestamptz not null default now();
alter table public.orders add column if not exists customer_full_name text;
alter table public.orders add column if not exists customer_mobile text;
alter table public.orders add column if not exists customer_address text;
alter table public.orders add column if not exists region text;
alter table public.orders add column if not exists province text;
alter table public.orders add column if not exists city_municipality text;
alter table public.orders add column if not exists barangay text;
alter table public.orders add column if not exists street_address text;
alter table public.orders add column if not exists items jsonb;
alter table public.orders add column if not exists total_amount numeric(12,2);
alter table public.orders add column if not exists payment_reference text default '';
alter table public.orders add column if not exists proof_path text;
alter table public.orders add column if not exists status text default 'Pending Payment Verification';
alter table public.orders add column if not exists updated_at timestamptz not null default now();

-- Normalize legacy status values and replace the common legacy status check.
update public.orders set status = 'Pending Payment Verification'
where status is null or status not in ('Pending Payment Verification','Payment Verified / Processing','Shipped','Delivered','Cancelled');
alter table public.orders alter column status set default 'Pending Payment Verification';
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('Pending Payment Verification','Payment Verified / Processing','Shipped','Delivered','Cancelled'));

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_sjohn_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.admin_users where user_id = auth.uid()); $$;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at before update on public.products for each row execute function public.set_updated_at();
drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at before update on public.orders for each row execute function public.set_updated_at();

-- A cancelled order restores its reserved stock exactly once.
create or replace function public.restore_stock_on_order_cancel()
returns trigger language plpgsql security definer set search_path = public
as $$
declare item jsonb;
begin
  if old.status <> 'Cancelled' and new.status = 'Cancelled' then
    for item in select value from jsonb_array_elements(new.items) loop
      update public.products set stock = stock + (item->>'quantity')::integer
      where id = (item->>'product_id')::uuid;
    end loop;
  end if;
  return new;
end;
$$;
drop trigger if exists orders_restore_stock on public.orders;
create trigger orders_restore_stock after update of status on public.orders for each row execute function public.restore_stock_on_order_cancel();

-- Public checkout: server-calculates prices and atomically reserves stock.
-- The anon client cannot insert arbitrary order totals or read customer orders.
create or replace function public.place_customer_order(p_order jsonb)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  item jsonb;
  product_row public.products%rowtype;
  requested_qty integer;
  calculated_total numeric(12,2) := 0;
  order_items jsonb := '[]'::jsonb;
  new_order_id uuid;
begin
  if coalesce(trim(p_order->>'customer_full_name'),'') = '' then raise exception 'Full name is required'; end if;
  if coalesce(trim(p_order->>'customer_mobile'),'') = '' then raise exception 'Mobile number is required'; end if;
  if coalesce(trim(p_order->>'customer_address'),'') = '' then raise exception 'Complete delivery address is required'; end if;
  if coalesce(trim(p_order->>'proof_path'),'') = '' then raise exception 'Payment proof is required'; end if;
  if jsonb_typeof(p_order->'items') <> 'array' or jsonb_array_length(p_order->'items') = 0 then raise exception 'Cart is empty'; end if;

  for item in select value from jsonb_array_elements(p_order->'items') loop
    requested_qty := (item->>'quantity')::integer;
    if requested_qty < 1 then raise exception 'Invalid product quantity'; end if;
    select * into product_row from public.products where id = (item->>'product_id')::uuid and is_active = true for update;
    if not found then raise exception 'A product in your cart is no longer available'; end if;
    if product_row.stock < requested_qty then raise exception 'Insufficient stock for %', product_row.name; end if;
    update public.products set stock = stock - requested_qty where id = product_row.id;
    calculated_total := calculated_total + product_row.price * requested_qty;
    order_items := order_items || jsonb_build_array(jsonb_build_object(
      'product_id', product_row.id, 'name', product_row.name,
      'quantity', requested_qty, 'unit_price', product_row.price,
      'line_total', product_row.price * requested_qty
    ));
  end loop;

  insert into public.orders (
    customer_full_name, customer_mobile, customer_address, region, province,
    city_municipality, barangay, street_address, items, total_amount,
    payment_reference, proof_path, status
  ) values (
    trim(p_order->>'customer_full_name'), trim(p_order->>'customer_mobile'), trim(p_order->>'customer_address'),
    trim(p_order->>'region'), trim(p_order->>'province'), trim(p_order->>'city_municipality'),
    trim(p_order->>'barangay'), trim(p_order->>'street_address'), order_items, calculated_total,
    coalesce(trim(p_order->>'payment_reference'), ''), trim(p_order->>'proof_path'), 'Pending Payment Verification'
  ) returning id into new_order_id;
  return new_order_id;
end;
$$;
revoke all on function public.place_customer_order(jsonb) from public;
grant execute on function public.place_customer_order(jsonb) to anon, authenticated;

alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.admin_users enable row level security;

drop policy if exists "Public can view active products" on public.products;
create policy "Public can view active products" on public.products for select to anon, authenticated using (is_active = true or public.is_sjohn_admin());
drop policy if exists "Admins manage products" on public.products;
create policy "Admins manage products" on public.products for all to authenticated using (public.is_sjohn_admin()) with check (public.is_sjohn_admin());
drop policy if exists "Admins read orders" on public.orders;
create policy "Admins read orders" on public.orders for select to authenticated using (public.is_sjohn_admin());
drop policy if exists "Admins update orders" on public.orders;
create policy "Admins update orders" on public.orders for update to authenticated using (public.is_sjohn_admin()) with check (public.is_sjohn_admin());
drop policy if exists "Admins read admin users" on public.admin_users;
create policy "Admins read admin users" on public.admin_users for select to authenticated using (public.is_sjohn_admin());

-- Storage buckets. Payment proofs are PRIVATE; product images are PUBLIC.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images','product-images',true,5242880,array['image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg'];
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-proofs','payment-proofs',false,5242880,array['image/jpeg','image/png'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png'];

drop policy if exists "Public read product images" on storage.objects;
create policy "Public read product images" on storage.objects for select to anon, authenticated using (bucket_id = 'product-images');
drop policy if exists "Admins upload product images" on storage.objects;
create policy "Admins upload product images" on storage.objects for insert to authenticated with check (bucket_id = 'product-images' and public.is_sjohn_admin());
drop policy if exists "Admins update product images" on storage.objects;
create policy "Admins update product images" on storage.objects for update to authenticated using (bucket_id = 'product-images' and public.is_sjohn_admin()) with check (bucket_id = 'product-images' and public.is_sjohn_admin());
drop policy if exists "Admins delete product images" on storage.objects;
create policy "Admins delete product images" on storage.objects for delete to authenticated using (bucket_id = 'product-images' and public.is_sjohn_admin());
drop policy if exists "Anyone can upload payment proofs" on storage.objects;
create policy "Anyone can upload payment proofs" on storage.objects for insert to anon, authenticated with check (bucket_id = 'payment-proofs');
drop policy if exists "Admins view payment proofs" on storage.objects;
create policy "Admins view payment proofs" on storage.objects for select to authenticated using (bucket_id = 'payment-proofs' and public.is_sjohn_admin());
drop policy if exists "Admins delete payment proofs" on storage.objects;
create policy "Admins delete payment proofs" on storage.objects for delete to authenticated using (bucket_id = 'payment-proofs' and public.is_sjohn_admin());

-- Enable live product stock/catalog updates for the storefront.
do $$ begin
  alter publication supabase_realtime add table public.products;
exception when duplicate_object then null;
end $$;

-- Refresh PostgREST's schema cache after running this script.
notify pgrst, 'reload schema';
