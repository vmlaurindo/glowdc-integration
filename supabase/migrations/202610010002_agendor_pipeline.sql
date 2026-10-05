CREATE TABLE IF NOT EXISTS public.agendor_contact_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL REFERENCES public.agendor_integrations(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  agendor_person_id bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (integration_id, contact_id),
  UNIQUE (integration_id, agendor_person_id)
);

CREATE TABLE IF NOT EXISTS public.agendor_deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL REFERENCES public.agendor_integrations(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  attribution_id uuid REFERENCES public.attributions(id) ON DELETE SET NULL,
  agendor_person_id bigint NOT NULL,
  agendor_deal_id bigint NOT NULL,
  funnel_id bigint,
  stage_id bigint,
  status text,
  owner_user_id bigint,
  title text,
  value numeric,
  currency text,
  source_first_seen_at timestamptz,
  last_remote_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (integration_id, agendor_deal_id),
  UNIQUE (integration_id, lead_id, agendor_deal_id)
);

CREATE TABLE IF NOT EXISTS public.agendor_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL REFERENCES public.agendor_integrations(id) ON DELETE CASCADE,
  agendor_deal_id bigint NOT NULL,
  audit_deal_id bigint NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('deal_created', 'stage_changed', 'status_changed')),
  occurred_at timestamptz NOT NULL,
  stage_id bigint,
  status_id bigint,
  observed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (integration_id, audit_deal_id)
);

CREATE TABLE IF NOT EXISTS public.agendor_sync_cursors (
  integration_id uuid PRIMARY KEY REFERENCES public.agendor_integrations(id) ON DELETE CASCADE,
  since_at timestamptz,
  last_audit_deal_id bigint,
  last_success_at timestamptz,
  last_error_code text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.integration_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  integration_id uuid NOT NULL REFERENCES public.agendor_integrations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('agendor_contact', 'agendor_deal', 'agendor_activity', 'agendor_sync')),
  operation_key text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'succeeded', 'retrying', 'blocked', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (integration_id, operation_key)
);

CREATE TABLE IF NOT EXISTS public.commercial_conversion_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  integration_id uuid NOT NULL REFERENCES public.agendor_integrations(id) ON DELETE CASCADE,
  funnel_id bigint NOT NULL,
  qualified_stage_id bigint,
  enabled boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (integration_id, funnel_id)
);

ALTER TABLE public.agendor_contact_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agendor_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agendor_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agendor_sync_cursors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_conversion_rules ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS agendor_deals_lead_idx ON public.agendor_deals(lead_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS agendor_movements_time_idx ON public.agendor_movements(integration_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS integration_jobs_queue_idx ON public.integration_jobs(status, next_attempt_at);
