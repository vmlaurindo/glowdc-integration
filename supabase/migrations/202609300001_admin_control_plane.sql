CREATE TABLE IF NOT EXISTS public.platform_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.admin_find_auth_user_by_email(p_email text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT id FROM auth.users
  WHERE lower(email) = lower(trim(p_email)) AND deleted_at IS NULL
  ORDER BY created_at
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.set_workspace_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS workspaces_set_updated_at ON public.workspaces;
CREATE TRIGGER workspaces_set_updated_at
  BEFORE UPDATE ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.set_workspace_updated_at();

CREATE OR REPLACE FUNCTION public.admin_update_workspace_name(
  p_workspace_id uuid,
  p_actor_user_id uuid,
  p_name text
) RETURNS public.workspaces
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_workspace public.workspaces;
  v_previous_name text;
BEGIN
  IF char_length(trim(p_name)) NOT BETWEEN 2 AND 100 THEN
    RAISE EXCEPTION 'invalid_workspace';
  END IF;
  SELECT * INTO v_workspace FROM public.workspaces WHERE id = p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'workspace_not_found'; END IF;
  v_previous_name := v_workspace.name;
  IF v_previous_name IS DISTINCT FROM trim(p_name) THEN
    UPDATE public.workspaces SET name = trim(p_name) WHERE id = p_workspace_id
      RETURNING * INTO v_workspace;
    INSERT INTO public.audit_logs(workspace_id, actor_user_id, action, target_type, target_id, metadata)
    VALUES (p_workspace_id, p_actor_user_id, 'workspace.updated', 'workspace', p_workspace_id::text,
      jsonb_build_object('previousName', v_previous_name, 'name', v_workspace.name));
  END IF;
  RETURN v_workspace;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_member_role(
  p_workspace_id uuid,
  p_target_user_id uuid,
  p_actor_user_id uuid,
  p_role public.workspace_role
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_previous_role public.workspace_role;
  v_owner_count integer;
BEGIN
  PERFORM 1 FROM public.workspaces WHERE id = p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'workspace_not_found'; END IF;
  SELECT role INTO v_previous_role FROM public.workspace_members
    WHERE workspace_id = p_workspace_id AND user_id = p_target_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'member_not_found'; END IF;
  IF v_previous_role = p_role THEN RETURN; END IF;
  IF v_previous_role = 'owner' AND p_role <> 'owner' THEN
    SELECT count(*) INTO v_owner_count FROM public.workspace_members
      WHERE workspace_id = p_workspace_id AND role = 'owner';
    IF v_owner_count <= 1 THEN RAISE EXCEPTION 'last_owner_required'; END IF;
  END IF;
  UPDATE public.workspace_members SET role = p_role
    WHERE workspace_id = p_workspace_id AND user_id = p_target_user_id;
  INSERT INTO public.audit_logs(workspace_id, actor_user_id, action, target_type, target_id, metadata)
  VALUES (p_workspace_id, p_actor_user_id, 'member.role_updated', 'workspace_member', p_target_user_id::text,
    jsonb_build_object('previousRole', v_previous_role, 'role', p_role));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_add_workspace_member(
  p_workspace_id uuid,
  p_target_user_id uuid,
  p_actor_user_id uuid,
  p_role public.workspace_role
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_inserted boolean := false;
BEGIN
  PERFORM 1 FROM public.workspaces WHERE id = p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'workspace_not_found'; END IF;
  INSERT INTO public.workspace_members(workspace_id, user_id, role)
  VALUES (p_workspace_id, p_target_user_id, p_role)
  ON CONFLICT (workspace_id, user_id) DO NOTHING;
  v_inserted := FOUND;
  IF v_inserted THEN
    INSERT INTO public.audit_logs(workspace_id, actor_user_id, action, target_type, target_id, metadata)
    VALUES (p_workspace_id, p_actor_user_id, 'member.invited', 'workspace_member', p_target_user_id::text,
      jsonb_build_object('role', p_role));
  END IF;
  RETURN v_inserted;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_revoke_workspace_member(
  p_workspace_id uuid,
  p_target_user_id uuid,
  p_actor_user_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role public.workspace_role;
  v_owner_count integer;
BEGIN
  PERFORM 1 FROM public.workspaces WHERE id = p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'workspace_not_found'; END IF;
  SELECT role INTO v_role FROM public.workspace_members
    WHERE workspace_id = p_workspace_id AND user_id = p_target_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_role = 'owner' THEN
    SELECT count(*) INTO v_owner_count FROM public.workspace_members
      WHERE workspace_id = p_workspace_id AND role = 'owner';
    IF v_owner_count <= 1 THEN RAISE EXCEPTION 'last_owner_required'; END IF;
  END IF;
  DELETE FROM public.workspace_members
    WHERE workspace_id = p_workspace_id AND user_id = p_target_user_id;
  INSERT INTO public.audit_logs(workspace_id, actor_user_id, action, target_type, target_id, metadata)
  VALUES (p_workspace_id, p_actor_user_id, 'member.revoked', 'workspace_member', p_target_user_id::text,
    jsonb_build_object('previousRole', v_role));
END;
$$;

REVOKE ALL ON FUNCTION public.set_workspace_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_find_auth_user_by_email(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_update_workspace_name(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_set_member_role(uuid, uuid, uuid, public.workspace_role) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_add_workspace_member(uuid, uuid, uuid, public.workspace_role) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_revoke_workspace_member(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_workspace_name(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_find_auth_user_by_email(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_member_role(uuid, uuid, uuid, public.workspace_role) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_add_workspace_member(uuid, uuid, uuid, public.workspace_role) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_revoke_workspace_member(uuid, uuid, uuid) TO service_role;

INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
VALUES ('profile-photos', 'profile-photos', false, 2097152, ARRAY['image/png','image/jpeg','image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS profile_photos_select_own ON storage.objects;
CREATE POLICY profile_photos_select_own ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'profile-photos' AND (storage.foldername(name))[1] = (select auth.uid())::text);
DROP POLICY IF EXISTS profile_photos_insert_own ON storage.objects;
CREATE POLICY profile_photos_insert_own ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'profile-photos' AND (storage.foldername(name))[1] = (select auth.uid())::text);
DROP POLICY IF EXISTS profile_photos_update_own ON storage.objects;
CREATE POLICY profile_photos_update_own ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'profile-photos' AND (storage.foldername(name))[1] = (select auth.uid())::text)
  WITH CHECK (bucket_id = 'profile-photos' AND (storage.foldername(name))[1] = (select auth.uid())::text);
DROP POLICY IF EXISTS profile_photos_delete_own ON storage.objects;
CREATE POLICY profile_photos_delete_own ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'profile-photos' AND (storage.foldername(name))[1] = (select auth.uid())::text);
