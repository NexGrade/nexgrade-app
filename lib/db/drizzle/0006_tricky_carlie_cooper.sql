-- [DISP-UNICA] (01/11/2026) a regra ja existe no banco real (criada a mao em lib/db/_arquivo/adicionar-constraint-unicidade.cjs);
-- so cria onde faltar (banco novo, CI, local). Sem isso o recalculo da HA (ON CONFLICT) falha depois de promover.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'disponibilidade_professores_unica') THEN
    ALTER TABLE "disponibilidade_professores" ADD CONSTRAINT "disponibilidade_professores_unica" UNIQUE("professor_id","dia_semana","horario_slot","turno");
  END IF;
END $$;
