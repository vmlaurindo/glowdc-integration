CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE public.workspace_role AS ENUM ('owner', 'admin', 'operator', 'viewer');
CREATE TYPE public.connection_status AS ENUM (
  'draft', 'credentials_saved', 'connected', 'needs_webhook',
  'observing', 'active', 'needs_attention', 'suspended'
);
CREATE TYPE public.meta_mode AS ENUM ('observation', 'active');
CREATE TYPE public.inbound_classification AS ENUM (
  'organic', 'paid_complete', 'paid_incomplete', 'ignored_outbound',
  'ignored_group', 'invalid_payload', 'duplicate'
);
CREATE TYPE public.conversion_status AS ENUM (
  'observed', 'queued', 'retrying', 'sent', 'failed_terminal', 'cancelled'
);

CREATE TABLE public.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 100),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.workspace_members (
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.workspace_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE public.provider_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider = 'uazapi'),
  label text NOT NULL,
  base_url text NOT NULL,
  instance_id text,
  credentials_cipher text NOT NULL,
  status public.connection_status NOT NULL DEFAULT 'draft',
  meta_mode public.meta_mode NOT NULL DEFAULT 'observation',
  webhook_installed_at timestamptz,
  last_tested_at timestamptz,
  last_error_code text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, label)
);

CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  phone_hmac text NOT NULL,
  phone_cipher text NOT NULL,
  display_name_cipher text,
  display_name_hint text,
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, phone_hmac)
);

CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'active', 'archived')),
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  last_classification public.inbound_classification NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, contact_id)
);

CREATE TABLE public.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES public.provider_connections(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  external_message_id text NOT NULL,
  classification public.inbound_classification NOT NULL,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, external_message_id)
);

CREATE TABLE public.attributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES public.provider_connections(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  external_message_id text NOT NULL,
  ctwa_clid_hmac text,
  ctwa_clid_cipher text,
  source_id text,
  source_url text,
  headline text,
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, connection_id, external_message_id)
);

CREATE UNIQUE INDEX attributions_workspace_ctwa_unique
  ON public.attributions(workspace_id, ctwa_clid_hmac)
  WHERE ctwa_clid_hmac IS NOT NULL;

CREATE TABLE public.meta_destinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL UNIQUE REFERENCES public.workspaces(id) ON DELETE CASCADE,
  dataset_id text NOT NULL,
  page_id text NOT NULL,
  access_token_cipher text NOT NULL,
  test_event_code text,
  enabled boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.conversion_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  attribution_id uuid NOT NULL REFERENCES public.attributions(id) ON DELETE CASCADE,
  event_name text NOT NULL CHECK (event_name = 'LeadSubmitted'),
  event_id text NOT NULL UNIQUE,
  status public.conversion_status NOT NULL,
  occurred_at timestamptz NOT NULL,
  sent_at timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users(id),
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX leads_workspace_last_seen_idx ON public.leads(workspace_id, last_seen_at DESC);
CREATE INDEX conversions_workspace_time_idx ON public.conversion_events(workspace_id, occurred_at DESC);
CREATE INDEX webhook_events_workspace_time_idx ON public.webhook_events(workspace_id, occurred_at DESC);

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversion_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- No table policy is intentionally granted to browser roles. The authenticated
-- UI talks to the Worker; only the service role crosses this boundary.

CREATE OR REPLACE FUNCTION public.create_workspace(
  p_name text,
  p_slug text,
  p_owner_id uuid
) RETURNS SETOF public.workspaces
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_workspace public.workspaces;
BEGIN
  INSERT INTO public.workspaces(name, slug)
  VALUES (trim(p_name), lower(trim(p_slug)))
  RETURNING * INTO v_workspace;

  INSERT INTO public.workspace_members(workspace_id, user_id, role)
  VALUES (v_workspace.id, p_owner_id, 'owner');

  INSERT INTO public.audit_logs(workspace_id, actor_user_id, action, target_type, target_id)
  VALUES (v_workspace.id, p_owner_id, 'workspace.created', 'workspace', v_workspace.id::text);

  RETURN NEXT v_workspace;
END;
$$;

CREATE OR REPLACE FUNCTION public.ingest_whatsapp_event(
  p_workspace_id uuid,
  p_connection_id uuid,
  p_external_message_id text,
  p_event_id text,
  p_occurred_at timestamptz,
  p_classification public.inbound_classification,
  p_phone_hmac text,
  p_phone_cipher text,
  p_name_cipher text,
  p_ctwa_hmac text,
  p_ctwa_cipher text,
  p_source_id text,
  p_source_url text,
  p_headline text,
  p_create_conversion boolean,
  p_conversion_status public.conversion_status
) RETURNS TABLE(conversion_id uuid, outcome text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contact_id uuid;
  v_lead_id uuid;
  v_attribution_id uuid;
  v_conversion_id uuid;
  v_event_inserted boolean := false;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.provider_connections
    WHERE id = p_connection_id AND workspace_id = p_workspace_id AND status <> 'suspended'
  ) THEN
    RAISE EXCEPTION 'connection_scope_invalid';
  END IF;

  INSERT INTO public.contacts(
    workspace_id, phone_hmac, phone_cipher, display_name_cipher, first_seen_at, last_seen_at
  ) VALUES (
    p_workspace_id, p_phone_hmac, p_phone_cipher, p_name_cipher, p_occurred_at, p_occurred_at
  )
  ON CONFLICT (workspace_id, phone_hmac) DO UPDATE SET
    phone_cipher = EXCLUDED.phone_cipher,
    display_name_cipher = COALESCE(EXCLUDED.display_name_cipher, public.contacts.display_name_cipher),
    last_seen_at = GREATEST(public.contacts.last_seen_at, EXCLUDED.last_seen_at)
  RETURNING id INTO v_contact_id;

  INSERT INTO public.leads(
    workspace_id, contact_id, first_seen_at, last_seen_at, last_classification
  ) VALUES (
    p_workspace_id, v_contact_id, p_occurred_at, p_occurred_at, p_classification
  )
  ON CONFLICT (workspace_id, contact_id) DO UPDATE SET
    last_seen_at = GREATEST(public.leads.last_seen_at, EXCLUDED.last_seen_at),
    last_classification = EXCLUDED.last_classification,
    status = CASE WHEN public.leads.status = 'archived' THEN 'archived' ELSE 'active' END
  RETURNING id INTO v_lead_id;

  INSERT INTO public.webhook_events(
    workspace_id, connection_id, lead_id, external_message_id, classification, occurred_at
  ) VALUES (
    p_workspace_id, p_connection_id, v_lead_id, p_external_message_id, p_classification, p_occurred_at
  ) ON CONFLICT (connection_id, external_message_id) DO NOTHING;
  v_event_inserted := FOUND;

  IF NOT v_event_inserted THEN
    SELECT id INTO v_conversion_id FROM public.conversion_events WHERE event_id = p_event_id;
    RETURN QUERY SELECT v_conversion_id, 'duplicate'::text;
    RETURN;
  END IF;

  IF p_ctwa_hmac IS NOT NULL OR p_source_id IS NOT NULL THEN
    INSERT INTO public.attributions(
      workspace_id, connection_id, lead_id, external_message_id,
      ctwa_clid_hmac, ctwa_clid_cipher, source_id, source_url, headline,
      first_seen_at, last_seen_at
    ) VALUES (
      p_workspace_id, p_connection_id, v_lead_id, p_external_message_id,
      p_ctwa_hmac, p_ctwa_cipher, p_source_id, p_source_url, p_headline,
      p_occurred_at, p_occurred_at
    )
    ON CONFLICT (workspace_id, connection_id, external_message_id) DO UPDATE SET
      ctwa_clid_hmac = COALESCE(EXCLUDED.ctwa_clid_hmac, public.attributions.ctwa_clid_hmac),
      ctwa_clid_cipher = COALESCE(EXCLUDED.ctwa_clid_cipher, public.attributions.ctwa_clid_cipher),
      source_id = COALESCE(EXCLUDED.source_id, public.attributions.source_id),
      source_url = COALESCE(EXCLUDED.source_url, public.attributions.source_url),
      headline = COALESCE(EXCLUDED.headline, public.attributions.headline),
      last_seen_at = GREATEST(public.attributions.last_seen_at, EXCLUDED.last_seen_at)
    RETURNING id INTO v_attribution_id;
  END IF;

  IF p_create_conversion THEN
    IF v_attribution_id IS NULL OR p_ctwa_cipher IS NULL OR p_source_id IS NULL THEN
      RAISE EXCEPTION 'complete_attribution_required';
    END IF;
    INSERT INTO public.conversion_events(
      workspace_id, lead_id, attribution_id, event_name, event_id, status, occurred_at
    ) VALUES (
      p_workspace_id, v_lead_id, v_attribution_id, 'LeadSubmitted', p_event_id,
      p_conversion_status, p_occurred_at
    )
    ON CONFLICT (event_id) DO UPDATE SET event_id = EXCLUDED.event_id
    RETURNING id INTO v_conversion_id;
  END IF;

  RETURN QUERY SELECT v_conversion_id, 'created'::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_meta_delivery_context(p_conversion_id uuid)
RETURNS TABLE(
  conversion_id uuid,
  event_id text,
  occurred_at timestamptz,
  status public.conversion_status,
  phone_cipher text,
  ctwa_clid_cipher text,
  source_id text,
  dataset_id text,
  page_id text,
  access_token_cipher text,
  test_event_code text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT c.id, c.event_id, c.occurred_at, c.status, co.phone_cipher,
         a.ctwa_clid_cipher, a.source_id, m.dataset_id, m.page_id,
         m.access_token_cipher, m.test_event_code
  FROM public.conversion_events c
  JOIN public.contacts co ON co.id = (SELECT l.contact_id FROM public.leads l WHERE l.id = c.lead_id)
  JOIN public.attributions a ON a.id = c.attribution_id
  JOIN public.meta_destinations m ON m.workspace_id = c.workspace_id AND m.enabled
  WHERE c.id = p_conversion_id;
$$;

REVOKE ALL ON FUNCTION public.create_workspace(text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ingest_whatsapp_event(
  uuid, uuid, text, text, timestamptz, public.inbound_classification,
  text, text, text, text, text, text, text, text, boolean, public.conversion_status
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_meta_delivery_context(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_workspace(text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.ingest_whatsapp_event(
  uuid, uuid, text, text, timestamptz, public.inbound_classification,
  text, text, text, text, text, text, text, text, boolean, public.conversion_status
) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_meta_delivery_context(uuid) TO service_role;

