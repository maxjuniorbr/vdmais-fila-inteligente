-- Habilita RLS em todas as tabelas. Sem políticas, isso bloqueia todo acesso
-- via anon/authenticated keys do Supabase. O backend NestJS usa a role
-- privilegiada (postgres) via connection string, que ignora RLS — logo o app
-- continua funcionando normalmente.
ALTER TABLE public.representatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queues ENABLE ROW LEVEL SECURITY;
