-- ══════════════════════════════════════════════════════════
--  LoadLess — PUSH TRIGGERS v1 (Phase 5.3)
--  Prérequis : SECURITE_PATCH.sql déjà appliqué
--
--  ÉTAPE 1 — Activer pg_net :
--    Supabase Dashboard → Database → Extensions → pg_net → Enable
--
--  ÉTAPE 2 — Stocker la service role key (OBLIGATOIRE) :
--    Remplace YOUR_SERVICE_ROLE_KEY ci-dessous par ta clé
--    (Supabase Dashboard → Project Settings → API → service_role secret)
--    Puis colle la ligne suivante dans SQL Editor et Run :
--
--    alter database postgres set app.settings.service_role_key to 'YOUR_SERVICE_ROLE_KEY';
--
--  ÉTAPE 3 — Colle CE fichier dans SQL Editor → Run
-- ══════════════════════════════════════════════════════════

-- ── Extension pg_net (si pas encore activée via Dashboard) ──
create extension if not exists pg_net schema extensions;

-- ── Fonction générique : appel HTTP async vers Edge Function ──
create or replace function _push_notify(
  p_couple_id     uuid,
  p_exclude_user  uuid,
  p_title         text,
  p_body          text,
  p_category      text
) returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_key text := current_setting('app.settings.service_role_key', true);
begin
  -- Si la clé n'est pas configurée, skip silencieusement
  if v_key is null or v_key = '' then return; end if;

  perform net.http_post(
    url     := 'https://lalpmkyxzapiheadvckp.supabase.co/functions/v1/push-notification',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := jsonb_build_object(
      'couple_id',       p_couple_id::text,
      'exclude_user_id', p_exclude_user::text,
      'title',           p_title,
      'body',            p_body,
      'category',        p_category
    )::text
  );
exception when others then
  -- Ne jamais bloquer la transaction principale
  null;
end;
$$;

-- ── Trigger functions ──

create or replace function trg_push_message()
returns trigger language plpgsql security definer as $$
begin
  perform _push_notify(
    NEW.couple_id, NEW.sender_id,
    'Nouveau message 💬', 'Votre partenaire vous a écrit', 'chat'
  );
  return NEW;
end;
$$;

create or replace function trg_push_task()
returns trigger language plpgsql security definer as $$
begin
  perform _push_notify(
    NEW.couple_id, NEW.created_by,
    '📋 Nouvelle tâche', NEW.title, 'tasks'
  );
  return NEW;
end;
$$;

create or replace function trg_push_shopping()
returns trigger language plpgsql security definer as $$
begin
  perform _push_notify(
    NEW.couple_id, NEW.added_by,
    '🛒 Courses', NEW.name || ' ajouté·e', 'shopping'
  );
  return NEW;
end;
$$;

create or replace function trg_push_meal()
returns trigger language plpgsql security definer as $$
declare
  v_slots text[] := array['Petit-déjeuner', 'Déjeuner', 'Dîner'];
begin
  perform _push_notify(
    NEW.couple_id, NEW.created_by,
    '🍽️ Repas planifié',
    coalesce(v_slots[NEW.slot + 1], 'Repas') || ' · ' || NEW.name,
    'meals'
  );
  return NEW;
end;
$$;

create or replace function trg_push_calendar()
returns trigger language plpgsql security definer as $$
begin
  perform _push_notify(
    NEW.couple_id, NEW.created_by,
    '📅 Événement', NEW.title || ' — ' || to_char(NEW.event_date, 'DD/MM'),
    'calendar'
  );
  return NEW;
end;
$$;

create or replace function trg_push_transaction()
returns trigger language plpgsql security definer as $$
begin
  perform _push_notify(
    NEW.couple_id, NEW.created_by,
    '💰 Nouvelle dépense',
    NEW.title || ' · ' || NEW.amount::text || ' €',
    'budget'
  );
  return NEW;
end;
$$;

-- ── Attacher les triggers ──

drop trigger if exists push_on_message    on messages;
drop trigger if exists push_on_task       on tasks;
drop trigger if exists push_on_shopping   on shopping_items;
drop trigger if exists push_on_meal       on meals;
drop trigger if exists push_on_calendar   on calendar_events;
drop trigger if exists push_on_transaction on transactions;

create trigger push_on_message
  after insert on messages
  for each row execute function trg_push_message();

create trigger push_on_task
  after insert on tasks
  for each row execute function trg_push_task();

create trigger push_on_shopping
  after insert on shopping_items
  for each row execute function trg_push_shopping();

create trigger push_on_meal
  after insert on meals
  for each row execute function trg_push_meal();

create trigger push_on_calendar
  after insert on calendar_events
  for each row execute function trg_push_calendar();

create trigger push_on_transaction
  after insert on transactions
  for each row execute function trg_push_transaction();

-- ══════════════════════════════════════════════
--  FIN — PUSH_TRIGGERS v1
-- ══════════════════════════════════════════════
