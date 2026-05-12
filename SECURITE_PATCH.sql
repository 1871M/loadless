-- ══════════════════════════════════════════════════════════
--  LoadLess — PATCH SÉCURITÉ v2
--  Applique après SUPABASE_TOUT_EN_UN.sql v9
--  Colle dans Supabase > SQL Editor > New query > Run
-- ══════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════
--  1. PG_CRON — Suppressions automatiques
-- ══════════════════════════════════════════════
-- Activer pg_cron dans Supabase Dashboard → Database → Extensions → pg_cron

-- Suppression messages éphémères (toutes les heures)
select cron.schedule(
  'delete-expired-msgs',
  '0 * * * *',
  'select delete_expired_messages()'
);

-- Nettoyage rate_limits (toutes les 2h)
select cron.schedule(
  'cleanup-rate-limits',
  '0 */2 * * *',
  'select cleanup_rate_limits()'
);

-- Nettoyage security_logs > 90 jours (chaque dimanche 3h)
select cron.schedule(
  'cleanup-security-logs',
  '0 3 * * 0',
  'select cleanup_security_logs()'
);

-- Nettoyage sessions chat expirées (toutes les 6h)
select cron.schedule(
  'cleanup-chat-sessions',
  '0 */6 * * *',
  'delete from chat_sessions where expires_at < now()'
);

-- ══════════════════════════════════════════════
--  2. SESSIONS CHAT — PFS (Forward Secrecy)
--  Clés éphémères de session par utilisateur
-- ══════════════════════════════════════════════

create table if not exists chat_sessions (
  id uuid default uuid_generate_v4() primary key,
  couple_id uuid references couples(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  session_pub_key text not null,
  created_at timestamptz default now(),
  expires_at timestamptz default (now() + interval '24 hours'),
  unique(couple_id, user_id)
);

alter table chat_sessions enable row level security;

drop policy if exists "sessions_select" on chat_sessions;
drop policy if exists "sessions_insert" on chat_sessions;
drop policy if exists "sessions_update" on chat_sessions;
drop policy if exists "sessions_delete" on chat_sessions;

create policy "sessions_select" on chat_sessions
  for select using (is_couple_member(couple_id));

create policy "sessions_insert" on chat_sessions
  for insert with check (is_couple_member(couple_id) and user_id = auth.uid());

create policy "sessions_update" on chat_sessions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "sessions_delete" on chat_sessions
  for delete using (user_id = auth.uid());

-- Index pour les lookups fréquents
create index if not exists idx_chat_sessions_couple on chat_sessions(couple_id, user_id);

-- Realtime pour recevoir la clé de session du partenaire
do $$ begin
  begin alter publication supabase_realtime add table chat_sessions; exception when others then null; end;
end $$;
alter table chat_sessions replica identity full;

-- ══════════════════════════════════════════════
--  3. TRANSACTIONS — Rendre account_id nullable
--  Permet keepHistory=true sur delete_account_secure
-- ══════════════════════════════════════════════

alter table transactions alter column account_id drop not null;

-- ══════════════════════════════════════════════
--  4. RPC — delete_account_secure
--  Remplace la suppression directe côté client
-- ══════════════════════════════════════════════

create or replace function delete_account_secure(p_account_id uuid, p_keep_history boolean default false)
returns json language plpgsql security definer set search_path = public, auth as $$
declare
  v_user_id uuid := auth.uid();
  v_acct accounts%rowtype;
begin
  if v_user_id is null then return json_build_object('error','not_authenticated'); end if;

  select * into v_acct from accounts where id = p_account_id;
  if not found then return json_build_object('error','not_found'); end if;

  if not is_couple_member(v_acct.couple_id) then
    insert into security_logs (user_id,action,status,detail)
      values (v_user_id,'delete_account','failed',jsonb_build_object('reason','unauthorized'));
    return json_build_object('error','unauthorized');
  end if;

  if p_keep_history then
    -- Détacher les transactions (account_id → NULL) avant de supprimer le compte
    update transactions set account_id = null where account_id = p_account_id;
    delete from accounts where id = p_account_id;
    insert into security_logs (user_id,action,status,detail)
      values (v_user_id,'delete_account','success',
              jsonb_build_object('account_id',p_account_id,'keep_history',true,'account_name',v_acct.name));
    return json_build_object('success',true,'kept_transactions',true);
  else
    -- Cascade FK supprime les transactions automatiquement
    delete from accounts where id = p_account_id;
    insert into security_logs (user_id,action,status,detail)
      values (v_user_id,'delete_account','success',
              jsonb_build_object('account_id',p_account_id,'keep_history',false,'account_name',v_acct.name));
    return json_build_object('success',true,'kept_transactions',false);
  end if;
end;
$$;

-- ══════════════════════════════════════════════
--  5. PHASE 5 — NOTIFICATIONS PUSH
-- ══════════════════════════════════════════════

-- Tokens de device (OneSignal player_id)
create table if not exists device_tokens (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  couple_id uuid references couples(id) on delete cascade not null,
  token text not null,
  platform text default 'android' check (platform in ('android','ios','web')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, token)
);

alter table device_tokens enable row level security;

drop policy if exists "tokens_select" on device_tokens;
drop policy if exists "tokens_insert" on device_tokens;
drop policy if exists "tokens_delete" on device_tokens;

create policy "tokens_select" on device_tokens
  for select using (user_id = auth.uid() or is_couple_member(couple_id));

create policy "tokens_insert" on device_tokens
  for insert with check (user_id = auth.uid() and is_couple_member(couple_id));

create policy "tokens_delete" on device_tokens
  for delete using (user_id = auth.uid());

-- Préférences de notification par catégorie
create table if not exists notification_prefs (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete cascade not null unique,
  couple_id uuid references couples(id) on delete cascade not null,
  notif_tasks boolean default true,
  notif_budget boolean default true,
  notif_shopping boolean default true,
  notif_meals boolean default true,
  notif_chat boolean default true,
  notif_calendar boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table notification_prefs enable row level security;

drop policy if exists "notif_prefs_select" on notification_prefs;
drop policy if exists "notif_prefs_insert" on notification_prefs;
drop policy if exists "notif_prefs_update" on notification_prefs;

create policy "notif_prefs_select" on notification_prefs
  for select using (user_id = auth.uid());

create policy "notif_prefs_insert" on notification_prefs
  for insert with check (user_id = auth.uid() and is_couple_member(couple_id));

create policy "notif_prefs_update" on notification_prefs
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- RPC pour upsert des tokens de device
create or replace function upsert_device_token(p_token text, p_platform text default 'android')
returns json language plpgsql security definer set search_path = public, auth as $$
declare
  v_user_id uuid := auth.uid();
  v_couple_id uuid;
begin
  if v_user_id is null then return json_build_object('error','not_authenticated'); end if;
  select couple_id into v_couple_id from profiles where id = v_user_id;
  if v_couple_id is null then return json_build_object('error','no_couple'); end if;

  insert into device_tokens (user_id, couple_id, token, platform, updated_at)
    values (v_user_id, v_couple_id, p_token, p_platform, now())
    on conflict (user_id, token) do update set updated_at = now(), platform = p_platform;

  return json_build_object('success', true);
end;
$$;

-- RPC pour log d'audit depuis le client (actions sensibles)
create or replace function log_audit_event(p_action text, p_detail jsonb default '{}')
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then return; end if;
  -- Limiter les actions autorisées (whitelist)
  if p_action not in ('login','logout','key_verified','key_rotation','chat_opened','export_backup','delete_account_intent') then
    return;
  end if;
  insert into security_logs (user_id, action, status, detail)
    values (v_user_id, p_action, 'client_audit', p_detail);
end;
$$;

-- ══════════════════════════════════════════════
--  FIN — LoadLess SECURITE_PATCH v2
-- ══════════════════════════════════════════════
