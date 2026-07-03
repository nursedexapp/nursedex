-- ============================================================
-- Allow first-time role selection through guard_users_protected_columns (#515)
-- ============================================================
-- Migration 043's guard_users_protected_columns trigger blocks ANY change
-- to users.role for a non-admin/non-service caller, with no exemption for
-- the one-time NULL -> role transition that selectRole() performs during
-- onboarding (src/lib/auth/actions.ts). Every new signup hits this: role
-- starts NULL (handle_new_user()), and the very first role-selection
-- UPDATE is exactly the kind of self-role-change the trigger exists to
-- block.
--
-- Fix: allow exactly one role change, from NULL to 'nurse' or 'family',
-- and only that. Once role is set, this trigger blocks changing it again
-- (the original #384 self-escalation guard), and the transition is also
-- restricted to the two roles the onboarding UI actually offers — a caller
-- can't set role straight to 'admin'/'super_admin' on first selection
-- either.

CREATE OR REPLACE FUNCTION public.guard_users_protected_columns()
RETURNS trigger AS $$
BEGIN
  IF current_user = 'service_role' OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.is_suspended IS DISTINCT FROM OLD.is_suspended
     OR NEW.is_deleted IS DISTINCT FROM OLD.is_deleted
  THEN
    RAISE EXCEPTION 'Cannot modify is_suspended or is_deleted'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF OLD.role IS NOT NULL OR NEW.role NOT IN ('nurse', 'family') THEN
      RAISE EXCEPTION 'Cannot modify role'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
