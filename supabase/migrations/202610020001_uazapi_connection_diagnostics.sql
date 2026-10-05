ALTER TABLE public.provider_connections
  ADD COLUMN IF NOT EXISTS last_error_summary text,
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz;
