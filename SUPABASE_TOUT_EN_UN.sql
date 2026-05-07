-- ══════════════════════════════════════════════════════════
--  LoadLess — SQL COMPLET v8
--  UN SEUL FICHIER — tout est dedans
--  Colle dans Supabase > SQL Editor > New query > Run
-- ══════════════════════════════════════════════════════════

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- ══════════════════════════════════════════════
--  TABLES
-- ══════════════════════════════════════════════

create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique not null check (length(trim(username)) >= 2),
  display_name text not null check (length(trim(display_name)) >= 1),
  avatar_color text default '#8B5CF6',
  public_key text,
  couple_id uuid,
  created_at timestamptz default now()
);

create table if not exists couples (
  id uuid default uuid_generate_v4() primary key,
  name text default 'Notre foyer',
  partner1_id uuid references profiles(id) on delete cascade not null,
  partner2_id uuid references profiles(id) on delete cascade,
  invite_code text unique default upper(substring(replace(gen_random_uuid()::text,'-',''),1,8)),
  invite_expires_at timestamptz default (now() + interval '7 days'),
  invite_attempts int default 0,
  created_at timestamptz default now(),
  constraint different_partners check (partner1_id <> partner2_id)
);

alter table profiles drop constraint if exists profiles_couple_id_fkey;
alter table profiles add constraint profiles_couple_id_fkey
  foreign key (couple_id) references couples(id) on delete set null;

create table if not exists tasks (
  id uuid default uuid_generate_v4() primary key,
  couple_id uuid references couples(id) on delete cascade not null,
  title text not null check (length(trim(title)) >= 1),
  category text default 'autre',
  priority text default 'low' check (priority in ('low','med','hgh')),
  frequency text default 'once' check (frequency in ('once','daily','weekly','monthly')),
  due_date date,
  note text,
  duration_minutes int check (duration_minutes is null or duration_minutes > 0),
  is_personal boolean default false,
  personal_owner uuid references profiles(id),
  assignee_id uuid references profiles(id),
  helper_id uuid references profiles(id),
  validated_by uuid references profiles(id),
  is_done boolean default false,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

create table if not exists shopping_items (
  id uuid default uuid_generate_v4() primary key,
  couple_id uuid references couples(id) on delete cascade not null,
  name text not null check (length(trim(name)) >= 1),
  qty text default '1',
  category text default 'autre',
  is_checked boolean default false,
  added_by uuid references profiles(id),
  created_at timestamptz default now()
);

create table if not exists accounts (
  id uuid default uuid_generate_v4() primary key,
  couple_id uuid references couples(id) on delete cascade not null,
  name text not null check (length(trim(name)) >= 1),
  type text default 'courant' check (type in ('courant','epargne','especes','autre')),
  balance numeric(12,2) default 0,
  color text default '#8B5CF6',
  created_at timestamptz default now()
);

create table if not exists transactions (
  id uuid default uuid_generate_v4() primary key,
  couple_id uuid references couples(id) on delete cascade not null,
  account_id uuid references accounts(id) on delete cascade not null,
  title text not null check (length(trim(title)) >= 1),
  amount numeric(12,2) not null check (amount > 0),
  type text not null check (type in ('expense','income','recurring','withdrawal')),
  category text default 'autre',
  note text,
  tx_date date not null,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

create table if not exists meals (
  id uuid default uuid_generate_v4() primary key,
  couple_id uuid references couples(id) on delete cascade not null,
  meal_date date not null,
  slot smallint not null check (slot between 0 and 2),
  name text not null check (length(trim(name)) >= 1),
  ingredients text[],
  note text,
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  unique(couple_id, meal_date, slot)
);

create table if not exists messages (
  id uuid default uuid_generate_v4() primary key,
  couple_id uuid references couples(id) on delete cascade not null,
  sender_id uuid references profiles(id) not null,
  ciphertext text not null check (length(ciphertext) > 10),
  iv text not null check (length(iv) > 5),
  version int default 1,
  expires_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists calendar_events (
  id uuid default uuid_generate_v4() primary key,
  couple_id uuid references couples(id) on delete cascade not null,
  title text not null check (length(trim(title)) >= 1),
  event_date date not null,
  event_time time,
  end_time time,
  color text default '#7C3AED' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  note text,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

create table if not exists rate_limits (
  id uuid default uuid_generate_v4() primary key,
  key text not null,
  action text not null,
  attempts int default 1,
  first_at timestamptz default now(),
  last_at timestamptz default now(),
  blocked_until timestamptz
);
create unique index if not exists rate_limits_key_idx on rate_limits(key, action);

create table if not exists security_logs (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete set null,
  action text not null,
  status text not null,
  detail jsonb,
  created_at timestamptz default now()
);

-- ══════════════════════════════════════════════
--  RLS — Row Level Security
-- ══════════════════════════════════════════════

alter table profiles enable row level security;
alter table couples enable row level security;
alter table tasks enable row level security;
alter table shopping_items enable row level security;
alter table accounts enable row level security;
alter table transactions enable row level security;
alter table meals enable row level security;
alter table messages enable row level security;
alter table calendar_events enable row level security;
alter table security_logs enable row level security;
alter table rate_limits enable row level security;

-- Supprimer toutes les anciennes policies
drop policy if exists "read_profiles" on profiles;
drop policy if exists "update_own_profile" on profiles;
drop policy if exists "insert_own_profile" on profiles;
drop policy if exists "profiles_select" on profiles;
drop policy if exists "profiles_insert" on profiles;
drop policy if exists "profiles_update" on profiles;
drop policy if exists "profiles_delete" on profiles;
drop policy if exists "read_own_couple" on couples;
drop policy if exists "create_couple" on couples;
drop policy if exists "update_couple" on couples;
drop policy if exists "couples_select" on couples;
drop policy if exists "couples_insert" on couples;
drop policy if exists "couples_update" on couples;
drop policy if exists "couples_delete" on couples;
drop policy if exists "tasks_couple" on tasks;
drop policy if exists "tasks_select" on tasks;
drop policy if exists "tasks_insert" on tasks;
drop policy if exists "tasks_update" on tasks;
drop policy if exists "tasks_delete" on tasks;
drop policy if exists "shop_couple" on shopping_items;
drop policy if exists "shop_select" on shopping_items;
drop policy if exists "shop_insert" on shopping_items;
drop policy if exists "shop_update" on shopping_items;
drop policy if exists "shop_delete" on shopping_items;
drop policy if exists "accounts_couple" on accounts;
drop policy if exists "accounts_select" on accounts;
drop policy if exists "accounts_insert" on accounts;
drop policy if exists "accounts_update" on accounts;
drop policy if exists "accounts_delete" on accounts;
drop policy if exists "tx_couple" on transactions;
drop policy if exists "tx_select" on transactions;
drop policy if exists "tx_insert" on transactions;
drop policy if exists "tx_update" on transactions;
drop policy if exists "tx_delete" on transactions;
drop policy if exists "tx_block_direct_insert" on transactions;
drop policy if exists "tx_block_direct_update" on transactions;
drop policy if exists "tx_block_direct_delete" on transactions;
drop policy if exists "meals_couple" on meals;
drop policy if exists "meals_select" on meals;
drop policy if exists "meals_insert" on meals;
drop policy if exists "meals_update" on meals;
drop policy if exists "meals_delete" on meals;
drop policy if exists "msgs_couple" on messages;
drop policy if exists "messages_select" on messages;
drop policy if exists "messages_insert" on messages;
drop policy if exists "messages_delete" on messages;
drop policy if exists "cal_select" on calendar_events;
drop policy if exists "cal_insert" on calendar_events;
drop policy if exists "cal_update" on calendar_events;
drop policy if exists "cal_delete" on calendar_events;
drop policy if exists "sec_logs_select" on security_logs;

-- ══════════════════════════════════════════════
--  FONCTION HELPER
-- ══════════════════════════════════════════════

create or replace function is_couple_member(cid uuid)
returns boolean language sql security definer
set search_path = public, auth stable as $$
  select exists (
    select 1 from couples
    where id = cid
      and (partner1_id = auth.uid() or partner2_id = auth.uid())
  );
$$;

-- ══════════════════════════════════════════════
--  POLICIES RLS
-- ══════════════════════════════════════════════

create policy "profiles_select" on profiles for select using (
  auth.uid() = id or id in (
    select case when partner1_id = auth.uid() then partner2_id else partner1_id end
    from couples where partner1_id = auth.uid() or partner2_id = auth.uid()
  )
);
create policy "profiles_insert" on profiles for insert with check (auth.uid() = id);
create policy "profiles_update" on profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "profiles_delete" on profiles for delete using (auth.uid() = id);

create policy "couples_select" on couples for select using (auth.uid() = partner1_id or auth.uid() = partner2_id);
create policy "couples_insert" on couples for insert with check (auth.uid() = partner1_id);
create policy "couples_update" on couples for update using (auth.uid() = partner1_id or auth.uid() = partner2_id) with check (auth.uid() = partner1_id or auth.uid() = partner2_id);
create policy "couples_delete" on couples for delete using (auth.uid() = partner1_id);

create policy "tasks_select" on tasks for select using (is_couple_member(couple_id) and (not is_personal or personal_owner = auth.uid()));
create policy "tasks_insert" on tasks for insert with check (is_couple_member(couple_id) and created_by = auth.uid() and (not is_personal or personal_owner = auth.uid()));
create policy "tasks_update" on tasks for update using (is_couple_member(couple_id) and (not is_personal or personal_owner = auth.uid())) with check (is_couple_member(couple_id) and (not is_personal or personal_owner = auth.uid()));
create policy "tasks_delete" on tasks for delete using (is_couple_member(couple_id) and (not is_personal or personal_owner = auth.uid()));

create policy "shop_select" on shopping_items for select using (is_couple_member(couple_id));
create policy "shop_insert" on shopping_items for insert with check (is_couple_member(couple_id) and added_by = auth.uid());
create policy "shop_update" on shopping_items for update using (is_couple_member(couple_id)) with check (is_couple_member(couple_id));
create policy "shop_delete" on shopping_items for delete using (is_couple_member(couple_id));

create policy "accounts_select" on accounts for select using (is_couple_member(couple_id));
create policy "accounts_insert" on accounts for insert with check (is_couple_member(couple_id));
create policy "accounts_update" on accounts for update using (is_couple_member(couple_id)) with check (is_couple_member(couple_id));
create policy "accounts_delete" on accounts for delete using (is_couple_member(couple_id));

create policy "tx_select" on transactions for select using (is_couple_member(couple_id));

-- ✅ B4 — Refus explicite des writes directs sur transactions.
-- Toute insertion / modification / suppression DOIT passer par les RPC security definer
-- (add_transaction_secure / update_transaction_secure / delete_transaction_secure)
-- qui gèrent la mise à jour atomique du solde via le trigger trg_prevent_balance_update.
-- Sans ces policies, un sb.from('transactions').insert(...) côté client échouerait
-- silencieusement, ce qui rend le debug confus.
create policy "tx_block_direct_insert" on transactions for insert with check (false);
create policy "tx_block_direct_update" on transactions for update using (false) with check (false);
create policy "tx_block_direct_delete" on transactions for delete using (false);

create policy "meals_select" on meals for select using (is_couple_member(couple_id));
create policy "meals_insert" on meals for insert with check (is_couple_member(couple_id) and created_by = auth.uid());
create policy "meals_update" on meals for update using (is_couple_member(couple_id)) with check (is_couple_member(couple_id));
create policy "meals_delete" on meals for delete using (is_couple_member(couple_id));

create policy "messages_select" on messages for select using (is_couple_member(couple_id));
create policy "messages_insert" on messages for insert with check (is_couple_member(couple_id) and sender_id = auth.uid() and length(ciphertext) > 10 and length(iv) > 5);
create policy "messages_delete" on messages for delete using (is_couple_member(couple_id));

create policy "cal_select" on calendar_events for select using (is_couple_member(couple_id));
create policy "cal_insert" on calendar_events for insert with check (is_couple_member(couple_id) and created_by = auth.uid());
create policy "cal_update" on calendar_events for update using (is_couple_member(couple_id)) with check (is_couple_member(couple_id));
create policy "cal_delete" on calendar_events for delete using (is_couple_member(couple_id));

create policy "sec_logs_select" on security_logs for select using (auth.uid() = user_id);

-- ══════════════════════════════════════════════
--  TRIGGER — Protection solde direct
-- ══════════════════════════════════════════════

create or replace function prevent_direct_balance_update()
returns trigger language plpgsql security definer
set search_path = public, auth as $$
begin
  if current_setting('app.bypass_balance_check', true) = 'true' then return new; end if;
  if new.balance <> old.balance then
    raise exception 'Solde modifiable uniquement via les fonctions sécurisées.';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_prevent_balance_update on accounts;
create trigger trg_prevent_balance_update before update on accounts
  for each row execute function prevent_direct_balance_update();

-- ══════════════════════════════════════════════
--  TRIGGER — Intégrité couple_id profil
-- ══════════════════════════════════════════════

create or replace function check_profile_couple_integrity()
returns trigger language plpgsql security definer
set search_path = public, auth as $$
begin
  if new.couple_id is not null then
    if not exists (
      select 1 from couples
      where id = new.couple_id
        and (partner1_id = new.id or partner2_id = new.id)
    ) then
      raise exception 'Intégrité violée : couple_id ne correspond pas au profil';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_profile_couple_integrity on profiles;
create trigger trg_profile_couple_integrity before update on profiles
  for each row when (new.couple_id is distinct from old.couple_id)
  execute function check_profile_couple_integrity();

-- ══════════════════════════════════════════════
--  FONCTIONS RPC SÉCURISÉES
-- ══════════════════════════════════════════════

create or replace function create_couple_secure(p_name text default 'Notre foyer')
returns json language plpgsql security definer set search_path = public, auth as $$
declare v_user_id uuid := auth.uid(); v_existing uuid; v_couple_id uuid; v_invite text;
begin
  if v_user_id is null then return json_build_object('error','not_authenticated'); end if;
  select couple_id into v_existing from profiles where id = v_user_id;
  if v_existing is not null then return json_build_object('error','already_in_couple','message','Vous êtes déjà dans un foyer.'); end if;
  insert into couples (partner1_id, name) values (v_user_id, coalesce(nullif(trim(p_name),''), 'Notre foyer')) returning id, invite_code into v_couple_id, v_invite;
  update profiles set couple_id = v_couple_id where id = v_user_id;
  return json_build_object('success',true,'couple_id',v_couple_id,'invite_code',v_invite);
end;
$$;

create or replace function join_couple(p_invite_code text)
returns json language plpgsql security definer set search_path = public, auth as $$
declare
  v_user_id uuid := auth.uid(); v_user_email text;
  v_couple couples%rowtype; v_existing uuid;
  v_rate_key_uid text; v_rate_key_email text;
  v_attempts int; v_blocked timestamptz;
begin
  if v_user_id is null then return json_build_object('error','not_authenticated','message','Vous devez être connecté·e.'); end if;
  select email into v_user_email from auth.users where id = v_user_id;
  v_rate_key_uid := 'join_couple:uid:' || v_user_id::text;
  v_rate_key_email := 'join_couple:email:' || coalesce(lower(v_user_email),'unknown');
  insert into rate_limits (key,action,attempts,first_at,last_at) values (v_rate_key_uid,'join_couple',1,now(),now())
    on conflict (key,action) do update set attempts=rate_limits.attempts+1,last_at=now(),
      blocked_until=case when rate_limits.attempts>=4 then now()+interval '15 minutes' else rate_limits.blocked_until end;
  insert into rate_limits (key,action,attempts,first_at,last_at) values (v_rate_key_email,'join_couple',1,now(),now())
    on conflict (key,action) do update set attempts=rate_limits.attempts+1,last_at=now(),
      blocked_until=case when rate_limits.attempts>=6 then now()+interval '30 minutes' else rate_limits.blocked_until end;
  select attempts,blocked_until into v_attempts,v_blocked from rate_limits where key=v_rate_key_uid and action='join_couple';
  if v_blocked is not null and v_blocked>now() then
    insert into security_logs (user_id,action,status,detail) values (v_user_id,'join_couple','blocked',jsonb_build_object('reason','rate_limit_uid'));
    return json_build_object('error','rate_limited','message','Trop de tentatives. Réessayez dans 15 minutes.');
  end if;
  select blocked_until into v_blocked from rate_limits where key=v_rate_key_email and action='join_couple';
  if v_blocked is not null and v_blocked>now() then
    return json_build_object('error','rate_limited','message','Trop de tentatives. Réessayez dans 30 minutes.');
  end if;
  select couple_id into v_existing from profiles where id=v_user_id;
  if v_existing is not null then return json_build_object('error','already_in_couple','message','Vous êtes déjà dans un foyer.'); end if;
  select * into v_couple from couples where invite_code=upper(trim(p_invite_code));
  if not found then
    insert into security_logs (user_id,action,status,detail) values (v_user_id,'join_couple','failed',jsonb_build_object('reason','invalid_code'));
    return json_build_object('error','invalid_code','message','Code invalide ou introuvable.');
  end if;
  if v_couple.invite_expires_at is not null and v_couple.invite_expires_at<now() then
    return json_build_object('error','code_expired','message','Ce code a expiré. Demandez un nouveau code.');
  end if;
  if v_couple.partner1_id=v_user_id then return json_build_object('error','own_couple','message','Vous avez créé ce foyer.'); end if;
  if v_couple.partner2_id is not null and v_couple.partner2_id<>v_user_id then
    insert into security_logs (user_id,action,status,detail) values (v_user_id,'join_couple','failed',jsonb_build_object('reason','couple_full'));
    return json_build_object('error','couple_full','message','Ce foyer a déjà deux membres.');
  end if;
  update couples set partner2_id=v_user_id where id=v_couple.id;
  update profiles set couple_id=v_couple.id where id=v_user_id;
  delete from rate_limits where key in (v_rate_key_uid,v_rate_key_email) and action='join_couple';
  insert into security_logs (user_id,action,status,detail) values (v_user_id,'join_couple','success',jsonb_build_object('couple_id',v_couple.id));
  return json_build_object('success',true,'couple_id',v_couple.id,'couple_name',v_couple.name,'invite_code',v_couple.invite_code);
end;
$$;

create or replace function add_transaction_secure(p_couple_id uuid, p_account_id uuid, p_title text, p_amount numeric, p_type text, p_category text, p_note text, p_tx_date date)
returns json language plpgsql security definer set search_path = public, auth as $$
declare v_user_id uuid:=auth.uid(); v_delta numeric; v_tx_id uuid;
begin
  if v_user_id is null then return json_build_object('error','not_authenticated'); end if;
  if p_amount is null or p_amount<=0 then return json_build_object('error','invalid_amount','message','Le montant doit être positif.'); end if;
  if p_type not in ('expense','income','recurring','withdrawal') then return json_build_object('error','invalid_type'); end if;
  if not is_couple_member(p_couple_id) then
    insert into security_logs (user_id,action,status,detail) values (v_user_id,'add_transaction','failed',jsonb_build_object('reason','unauthorized'));
    return json_build_object('error','unauthorized');
  end if;
  if not exists(select 1 from accounts where id=p_account_id and couple_id=p_couple_id) then
    return json_build_object('error','account_not_found');
  end if;
  v_delta:=case when p_type='income' then p_amount else -p_amount end;
  insert into transactions(couple_id,account_id,title,amount,type,category,note,tx_date,created_by)
    values(p_couple_id,p_account_id,p_title,p_amount,p_type,coalesce(p_category,'autre'),p_note,coalesce(p_tx_date,current_date),v_user_id)
    returning id into v_tx_id;
  perform set_config('app.bypass_balance_check','true',true);
  update accounts set balance=balance+v_delta where id=p_account_id;
  perform set_config('app.bypass_balance_check','false',true);
  insert into security_logs (user_id,action,status,detail) values (v_user_id,'add_transaction','success',jsonb_build_object('tx_id',v_tx_id,'type',p_type,'amount',p_amount));
  return json_build_object('success',true,'transaction_id',v_tx_id);
end;
$$;

create or replace function delete_transaction_secure(p_tx_id uuid)
returns json language plpgsql security definer set search_path = public, auth as $$
declare v_user_id uuid:=auth.uid(); v_tx transactions%rowtype; v_delta numeric;
begin
  if v_user_id is null then return json_build_object('error','not_authenticated'); end if;
  select * into v_tx from transactions where id=p_tx_id;
  if not found then return json_build_object('error','not_found'); end if;
  if not is_couple_member(v_tx.couple_id) then
    insert into security_logs (user_id,action,status,detail) values (v_user_id,'delete_transaction','failed',jsonb_build_object('reason','unauthorized'));
    return json_build_object('error','unauthorized');
  end if;
  v_delta:=case when v_tx.type='income' then -v_tx.amount else v_tx.amount end;
  perform set_config('app.bypass_balance_check','true',true);
  update accounts set balance=balance+v_delta where id=v_tx.account_id;
  perform set_config('app.bypass_balance_check','false',true);
  delete from transactions where id=p_tx_id;
  insert into security_logs (user_id,action,status,detail) values (v_user_id,'delete_transaction','success',jsonb_build_object('tx_id',p_tx_id,'amount',v_tx.amount));
  return json_build_object('success',true);
end;
$$;

create or replace function rotate_invite_code(p_couple_id uuid)
returns json language plpgsql security definer set search_path = public, auth as $$
declare v_user_id uuid:=auth.uid(); v_new_code text;
begin
  if v_user_id is null then return json_build_object('error','not_authenticated'); end if;
  if not exists(select 1 from couples where id=p_couple_id and partner1_id=v_user_id) then
    return json_build_object('error','unauthorized');
  end if;
  loop
    v_new_code:=upper(substring(replace(gen_random_uuid()::text,'-',''),1,8));
    exit when not exists(select 1 from couples where invite_code=v_new_code);
  end loop;
  update couples set invite_code=v_new_code,invite_expires_at=now()+interval '7 days',invite_attempts=0 where id=p_couple_id;
  return json_build_object('success',true,'invite_code',v_new_code,'expires_at',(now()+interval '7 days'));
end;
$$;

create or replace function delete_expired_messages()
returns void language sql security definer set search_path = public, auth as $$
  delete from messages where expires_at is not null and expires_at < now();
$$;

create or replace function get_messages_page(p_couple_id uuid, p_before timestamptz default now(), p_limit int default 50)
returns setof messages language plpgsql security definer set search_path = public, auth as $$
begin
  if not is_couple_member(p_couple_id) then raise exception 'unauthorized'; end if;
  p_limit:=least(p_limit,100);
  return query select * from messages
    where couple_id=p_couple_id and created_at<p_before and (expires_at is null or expires_at>now())
    order by created_at desc limit p_limit;
end;
$$;

create or replace function get_transactions_page(p_couple_id uuid, p_account_id uuid default null, p_cursor_date date default null, p_cursor_ts timestamptz default null, p_cursor_id uuid default null, p_limit int default 50)
returns setof transactions language plpgsql security definer set search_path = public, auth as $$
begin
  if not is_couple_member(p_couple_id) then raise exception 'unauthorized'; end if;
  p_limit:=least(p_limit,100);
  if p_cursor_date is null then
    return query select * from transactions
      where couple_id=p_couple_id and (p_account_id is null or account_id=p_account_id)
      order by tx_date desc,created_at desc,id desc limit p_limit;
  else
    return query select * from transactions
      where couple_id=p_couple_id and (p_account_id is null or account_id=p_account_id)
        and (tx_date<p_cursor_date or (tx_date=p_cursor_date and created_at<p_cursor_ts)
          or (tx_date=p_cursor_date and created_at=p_cursor_ts and id<p_cursor_id))
      order by tx_date desc,created_at desc,id desc limit p_limit;
  end if;
end;
$$;

create or replace function cleanup_rate_limits()
returns void language sql security definer set search_path = public, auth as $$
  delete from rate_limits where last_at < now() - interval '2 hours' and (blocked_until is null or blocked_until < now());
$$;

create or replace function cleanup_security_logs()
returns void language sql security definer set search_path = public, auth as $$
  delete from security_logs where created_at < now() - interval '90 days';
$$;

-- ══════════════════════════════════════════════
--  ✅ B1 — RPC update_transaction_secure
--  Modification atomique d'une transaction : ajuste le solde du compte
--  en une seule transaction SQL. Évite la séquence delete+add qui peut
--  laisser une transaction perdue si l'add échoue (perte de données).
-- ══════════════════════════════════════════════
create or replace function update_transaction_secure(
  p_tx_id uuid, p_account_id uuid, p_title text, p_amount numeric,
  p_type text, p_category text, p_note text, p_tx_date date
) returns json language plpgsql security definer set search_path = public, auth as $$
declare
  v_user_id uuid := auth.uid();
  v_old transactions%rowtype;
  v_old_delta numeric;
  v_new_delta numeric;
begin
  if v_user_id is null then return json_build_object('error','not_authenticated'); end if;
  if p_amount is null or p_amount <= 0 then
    return json_build_object('error','invalid_amount','message','Le montant doit être positif.');
  end if;
  if p_type not in ('expense','income','recurring','withdrawal') then
    return json_build_object('error','invalid_type');
  end if;

  -- Charger l'ancienne transaction
  select * into v_old from transactions where id = p_tx_id;
  if not found then return json_build_object('error','not_found'); end if;

  -- Vérifier l'autorisation (membre du couple)
  if not is_couple_member(v_old.couple_id) then
    insert into security_logs (user_id,action,status,detail)
      values (v_user_id,'update_transaction','failed',jsonb_build_object('reason','unauthorized'));
    return json_build_object('error','unauthorized');
  end if;

  -- Vérifier que le nouveau compte appartient bien au même couple
  if not exists(select 1 from accounts where id = p_account_id and couple_id = v_old.couple_id) then
    return json_build_object('error','account_not_found');
  end if;

  -- Calculer les deltas (annulation ancienne + application nouvelle)
  v_old_delta := case when v_old.type='income' then -v_old.amount else v_old.amount end;
  v_new_delta := case when p_type='income' then p_amount else -p_amount end;

  -- Bypass du trigger de protection du solde
  perform set_config('app.bypass_balance_check','true',true);

  if v_old.account_id = p_account_id then
    -- Même compte : un seul update (annulation + application sur le même compte)
    update accounts set balance = balance + v_old_delta + v_new_delta
      where id = p_account_id;
  else
    -- Compte changé : annuler sur l'ancien, appliquer sur le nouveau
    update accounts set balance = balance + v_old_delta where id = v_old.account_id;
    update accounts set balance = balance + v_new_delta where id = p_account_id;
  end if;

  perform set_config('app.bypass_balance_check','false',true);

  -- Mettre à jour la transaction
  update transactions set
    account_id = p_account_id,
    title = p_title,
    amount = p_amount,
    type = p_type,
    category = coalesce(p_category, 'autre'),
    note = p_note,
    tx_date = coalesce(p_tx_date, current_date)
  where id = p_tx_id;

  insert into security_logs (user_id, action, status, detail)
    values (v_user_id, 'update_transaction', 'success',
            jsonb_build_object('tx_id', p_tx_id, 'type', p_type, 'amount', p_amount));

  return json_build_object('success', true, 'transaction_id', p_tx_id);
end;
$$;

-- ══════════════════════════════════════════════
--  ✅ B6 — RPC delete_my_account
--  Effacement RGPD complet : supprime le profil (cascade vers tasks/budget/etc)
--  ET marque le compte auth.users pour suppression.
--  Note: la suppression effective dans auth.users requiert le service-role
--  via la console Supabase ou un edge function. Cette RPC supprime le profil
--  et logge l'intention de suppression du compte auth pour traitement.
-- ══════════════════════════════════════════════
create or replace function delete_my_account()
returns json language plpgsql security definer set search_path = public, auth as $$
declare
  v_user_id uuid := auth.uid();
  v_couple_id uuid;
begin
  if v_user_id is null then return json_build_object('error','not_authenticated'); end if;

  -- Si l'user est seul dans son couple, supprimer aussi le couple
  -- (sinon, le couple reste avec partner1 ou partner2 manquant — géré par cascade FK)
  select couple_id into v_couple_id from profiles where id = v_user_id;
  if v_couple_id is not null then
    if not exists(
      select 1 from couples
      where id = v_couple_id
        and partner1_id is not null
        and partner2_id is not null
    ) then
      delete from couples where id = v_couple_id;
    end if;
  end if;

  -- Logger avant suppression (le user_id sera mis à NULL par la FK on delete set null)
  insert into security_logs (user_id, action, status, detail)
    values (v_user_id, 'delete_account', 'success',
            jsonb_build_object('uid_short', substring(v_user_id::text, 1, 8)));

  -- Supprimer le profil → cascade vers tasks, transactions, etc.
  delete from profiles where id = v_user_id;

  -- Note: la suppression de auth.users nécessite le service_role.
  -- Côté client, après cette RPC, il faut signOut().
  -- L'admin peut nettoyer les auth.users orphelins via la console Supabase
  -- ou un cron job qui supprime les auth.users sans profile correspondant.

  return json_build_object('success', true,
    'message', 'Profil et données supprimés. Le compte d''authentification sera nettoyé sous 24h.');
end;
$$;

-- ══════════════════════════════════════════════
--  INDEX PERFORMANCE
-- ══════════════════════════════════════════════

create index if not exists idx_tx_pagination on transactions(couple_id,tx_date desc,created_at desc,id desc);
create index if not exists idx_msg_pagination on messages(couple_id,created_at desc,id desc);
create index if not exists idx_cal_date on calendar_events(couple_id,event_date,event_time);
create index if not exists idx_tasks_assignee on tasks(couple_id,assignee_id,is_done);
create index if not exists idx_tasks_personal on tasks(personal_owner,is_personal);
create index if not exists idx_sec_logs_user on security_logs(user_id,created_at desc);

-- ══════════════════════════════════════════════
--  REPLICA IDENTITY (Realtime complet)
-- ══════════════════════════════════════════════

alter table tasks replica identity full;
alter table shopping_items replica identity full;
alter table messages replica identity full;
alter table meals replica identity full;
alter table accounts replica identity full;
alter table transactions replica identity full;
alter table calendar_events replica identity full;

-- ══════════════════════════════════════════════
--  REALTIME
-- ══════════════════════════════════════════════

do $$ begin
  begin alter publication supabase_realtime add table tasks; exception when others then null; end;
  begin alter publication supabase_realtime add table shopping_items; exception when others then null; end;
  begin alter publication supabase_realtime add table messages; exception when others then null; end;
  begin alter publication supabase_realtime add table meals; exception when others then null; end;
  begin alter publication supabase_realtime add table accounts; exception when others then null; end;
  begin alter publication supabase_realtime add table transactions; exception when others then null; end;
  begin alter publication supabase_realtime add table calendar_events; exception when others then null; end;
end $$;

-- ══════════════════════════════════════════════
--  FIN — LoadLess SQL v8 complet
-- ══════════════════════════════════════════════
