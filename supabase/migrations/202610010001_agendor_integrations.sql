CREATE TABLE IF NOT EXISTS public.agendor_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  label text NOT NULL CHECK (char_length(label) BETWEEN 2 AND 80),
  base_url text NOT NULL DEFAULT 'https://api.agendor.com.br/v3',
  token_cipher text NOT NULL,
  mode text NOT NULL DEFAULT 'observation' CHECK (mode IN ('observation', 'active')),
  status text NOT NULL DEFAULT 'credentials_saved' CHECK (status IN ('credentials_saved', 'connected', 'needs_attention', 'suspended')),
  last_tested_at timestamptz,
  last_error_code text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, label)
);

ALTER TABLE public.agendor_integrations ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS agendor_integrations_workspace_idx
  ON public.agendor_integrations(workspace_id, created_at DESC);

DROP TRIGGER IF EXISTS agendor_integrations_set_updated_at ON public.agendor_integrations;
CREATE TRIGGER agendor_integrations_set_updated_at
  BEFORE UPDATE ON public.agendor_integrations
  FOR EACH ROW EXECUTE FUNCTION public.set_workspace_updated_at();
