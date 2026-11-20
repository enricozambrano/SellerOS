BEGIN;
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "app_user_status" AS ENUM ('active', 'disabled', 'anonymized');

-- CreateEnum
CREATE TYPE "organization_status" AS ENUM ('active', 'suspended', 'pending_deletion');

-- CreateEnum
CREATE TYPE "member_role" AS ENUM ('owner', 'admin', 'operator', 'viewer');

-- CreateEnum
CREATE TYPE "member_status" AS ENUM ('active', 'inactive');

-- CreateTable
CREATE TABLE "app_users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "auth_issuer" TEXT,
    "auth_subject" TEXT,
    "email" TEXT,
    "name" TEXT,
    "status" "app_user_status" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "currency_code" CHAR(3) NOT NULL DEFAULT 'BRL',
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "status" "organization_status" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_members" (
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "member_role" NOT NULL,
    "status" "member_status" NOT NULL,
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("organization_id","user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_users_auth_issuer_auth_subject_key" ON "app_users"("auth_issuer", "auth_subject");

-- CreateIndex
CREATE INDEX "organization_members_user_id_status_organization_id_idx" ON "organization_members"("user_id", "status", "organization_id");

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Reviewed PostgreSQL additions. Roles are provisioned separately, exclusively in the pinned test cluster.
-- Keep grants/policies/functions transactional with the three generated tables.
ALTER TABLE public.app_users ADD CONSTRAINT app_users_identity_check CHECK (
  (status IN ('active', 'disabled') AND auth_issuer IS NOT NULL AND length(btrim(auth_issuer)) > 0
   AND auth_subject IS NOT NULL AND length(btrim(auth_subject)) > 0)
  OR (status = 'anonymized' AND auth_issuer IS NULL AND auth_subject IS NULL AND email IS NULL AND name IS NULL)
);
ALTER TABLE public.organizations ADD CONSTRAINT organizations_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 200);
ALTER TABLE public.organizations ADD CONSTRAINT organizations_currency_check CHECK (currency_code = 'BRL');

CREATE SCHEMA selleros;
REVOKE ALL ON SCHEMA selleros FROM PUBLIC;
GRANT USAGE ON SCHEMA public, selleros TO selleros_test_api, selleros_test_worker, selleros_test_bootstrap,
  selleros_test_maintenance, selleros_test_policy, selleros_test_bootstrap_writer;
GRANT CREATE ON SCHEMA selleros TO selleros_test_policy, selleros_test_bootstrap_writer;
ALTER DEFAULT PRIVILEGES IN SCHEMA selleros REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_users FORCE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_users, public.organizations, public.organization_members FROM PUBLIC;

-- Dedicated non-login policy reader prevents membership-policy recursion.
-- No runtime role may assume it; only narrow functions are exposed.
GRANT SELECT ON public.app_users, public.organizations, public.organization_members TO selleros_test_policy;
GRANT UPDATE (updated_at) ON public.organizations TO selleros_test_policy;
CREATE POLICY policy_reader ON public.app_users TO selleros_test_policy USING (true);
CREATE POLICY policy_reader ON public.organizations TO selleros_test_policy USING (true) WITH CHECK (true);
CREATE POLICY policy_reader ON public.organization_members TO selleros_test_policy USING (true);

CREATE FUNCTION selleros.subject_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog AS $$
  SELECT u.id FROM public.app_users u
  WHERE session_user IN ('selleros_test_api', 'selleros_test_bootstrap')
    AND current_setting('selleros.actor', true) = 'user'
    AND u.auth_issuer = nullif(current_setting('selleros.issuer', true), '')
    AND u.auth_subject = nullif(current_setting('selleros.subject', true), '')
    AND u.status = 'active'
$$;
ALTER FUNCTION selleros.subject_id() OWNER TO selleros_test_policy;

CREATE FUNCTION selleros.can_access(target uuid, owner_required boolean DEFAULT false) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members m JOIN public.organizations o ON o.id=m.organization_id
    WHERE m.organization_id=target
      AND target::text = current_setting('selleros.organization_id', true)
      AND m.user_id = selleros.subject_id() AND m.status='active' AND o.status='active'
      AND (NOT owner_required OR m.role='owner')
  )
$$;
ALTER FUNCTION selleros.can_access(uuid, boolean) OWNER TO selleros_test_policy;

CREATE POLICY self_profile ON public.app_users TO selleros_test_api
  USING (id=selleros.subject_id()) WITH CHECK (id=selleros.subject_id());
CREATE POLICY tenant_read ON public.organizations FOR SELECT TO selleros_test_api
  USING (selleros.can_access(id));
CREATE POLICY tenant_update ON public.organizations FOR UPDATE TO selleros_test_api
  USING (selleros.can_access(id,true)) WITH CHECK (selleros.can_access(id,true));
CREATE POLICY member_read ON public.organization_members FOR SELECT TO selleros_test_api
  USING (selleros.can_access(organization_id) AND (user_id=selleros.subject_id() OR selleros.can_access(organization_id,true)));
CREATE POLICY member_insert ON public.organization_members FOR INSERT TO selleros_test_api
  WITH CHECK (selleros.can_access(organization_id,true));
CREATE POLICY member_update ON public.organization_members FOR UPDATE TO selleros_test_api
  USING (selleros.can_access(organization_id,true)) WITH CHECK (selleros.can_access(organization_id,true));

GRANT SELECT ON public.app_users, public.organizations, public.organization_members TO selleros_test_api;
GRANT UPDATE (email,name) ON public.app_users TO selleros_test_api;
GRANT UPDATE (name,timezone) ON public.organizations TO selleros_test_api;
GRANT INSERT ON public.organization_members TO selleros_test_api;
GRANT UPDATE (role,status) ON public.organization_members TO selleros_test_api;

CREATE FUNCTION selleros.touch_identity() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF TG_TABLE_NAME='organization_members' THEN
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'Immutable identity' USING ERRCODE='23514';
    END IF;
  ELSIF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Immutable identity' USING ERRCODE='23514';
  END IF;
  NEW.updated_at = clock_timestamp();
  RETURN NEW;
END $$;
CREATE TRIGGER touch_user BEFORE UPDATE ON public.app_users FOR EACH ROW EXECUTE FUNCTION selleros.touch_identity();
CREATE TRIGGER touch_organization BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION selleros.touch_identity();
CREATE TRIGGER touch_member BEFORE UPDATE ON public.organization_members FOR EACH ROW EXECUTE FUNCTION selleros.touch_identity();

CREATE FUNCTION selleros.validate_timezone() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=NEW.timezone) THEN
    RAISE EXCEPTION 'Invalid timezone' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER organization_timezone BEFORE INSERT OR UPDATE ON public.organizations
 FOR EACH ROW EXECUTE FUNCTION selleros.validate_timezone();

-- Lock parent before membership changes. Updating the parent also forces serialization
-- failures under repeatable-read snapshots rather than permitting write skew.
CREATE FUNCTION selleros.lock_membership_parent() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog AS $$
DECLARE target uuid;
BEGIN
  IF TG_OP='DELETE' THEN target=OLD.organization_id; ELSE target=NEW.organization_id; END IF;
  UPDATE public.organizations SET updated_at=clock_timestamp() WHERE id=target;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
ALTER FUNCTION selleros.lock_membership_parent() OWNER TO selleros_test_policy;
CREATE TRIGGER member_parent_lock BEFORE INSERT OR UPDATE OR DELETE ON public.organization_members
 FOR EACH ROW EXECUTE FUNCTION selleros.lock_membership_parent();

CREATE FUNCTION selleros.require_owner() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog AS $$
DECLARE target uuid;
BEGIN
  IF TG_TABLE_NAME='organizations' THEN target=NEW.id;
  ELSIF TG_OP='DELETE' THEN target=OLD.organization_id;
  ELSE target=NEW.organization_id; END IF;
  IF EXISTS (SELECT 1 FROM public.organizations WHERE id=target AND status='active')
    AND NOT EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id=target AND role='owner' AND status='active') THEN
    RAISE EXCEPTION 'Active organization requires an owner' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
ALTER FUNCTION selleros.require_owner() OWNER TO selleros_test_policy;
CREATE CONSTRAINT TRIGGER organization_requires_owner AFTER INSERT OR UPDATE ON public.organizations
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION selleros.require_owner();
CREATE CONSTRAINT TRIGGER membership_requires_owner AFTER INSERT OR UPDATE OR DELETE ON public.organization_members
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION selleros.require_owner();

-- Bootstrap writer is non-login and only used by this fixed function.
GRANT SELECT, INSERT ON public.organizations, public.organization_members TO selleros_test_bootstrap_writer;
CREATE POLICY bootstrap_write ON public.organizations TO selleros_test_bootstrap_writer USING (true) WITH CHECK (true);
CREATE POLICY bootstrap_write ON public.organization_members TO selleros_test_bootstrap_writer USING (true) WITH CHECK (true);
CREATE FUNCTION selleros.bootstrap_organization(organization_name text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog AS $$
DECLARE subject uuid; target uuid := gen_random_uuid();
BEGIN
  IF session_user <> 'selleros_test_bootstrap' THEN
    RAISE EXCEPTION 'Bootstrap denied' USING ERRCODE='42501';
  END IF;
  subject := selleros.subject_id();
  IF subject IS NULL THEN RAISE EXCEPTION 'Unknown subject' USING ERRCODE='42501'; END IF;
  INSERT INTO public.organizations(id,name,status) VALUES(target,organization_name,'active');
  INSERT INTO public.organization_members(organization_id,user_id,role,status) VALUES(target,subject,'owner','active');
  RETURN target;
END $$;
ALTER FUNCTION selleros.bootstrap_organization(text) OWNER TO selleros_test_bootstrap_writer;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA selleros FROM PUBLIC;
GRANT EXECUTE ON FUNCTION selleros.subject_id() TO selleros_test_api, selleros_test_bootstrap, selleros_test_bootstrap_writer;
GRANT EXECUTE ON FUNCTION selleros.can_access(uuid,boolean) TO selleros_test_api;
GRANT EXECUTE ON FUNCTION selleros.bootstrap_organization(text) TO selleros_test_bootstrap;
REVOKE CREATE ON SCHEMA selleros FROM selleros_test_policy, selleros_test_bootstrap_writer;
-- runtime_worker and maintenance deliberately receive no table access yet.
-- Their domain capabilities require later migrations; worker context is proved only in disposable fixtures.

COMMIT;
