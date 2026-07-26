-- Security hardening: pin a fixed search_path on every SECURITY DEFINER function
-- that lacked one. A definer function with a mutable search_path can be tricked
-- into resolving an unqualified object to an attacker-planted one and running it
-- with the function owner's (elevated) privileges — a privilege-escalation vector
-- (Supabase advisor: "Function Search Path Mutable").
--
-- search_path is pinned to `public, extensions, pg_temp` so the functions still
-- resolve app tables (public) and crypto helpers (extensions, e.g. pgcrypto used
-- by the API-key hash and store-employee PIN hashing) while an attacker can no
-- longer prepend their own schema. Idempotent; resolves overloads dynamically.

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND (p.proconfig IS NULL
           OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) s WHERE s LIKE 'search_path=%'))
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, extensions, pg_temp', r.sig);
  END LOOP;
END $$;
