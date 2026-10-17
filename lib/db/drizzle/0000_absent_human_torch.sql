CREATE TYPE "public"."nivel_ensino" AS ENUM('fundamental', 'medio_tecnico');--> statement-breakpoint
CREATE TYPE "public"."composicao_curricular" AS ENUM('BNC', 'PD', 'FGB', 'PFO', 'IFA', 'IF', 'IFP', 'APF');--> statement-breakpoint
CREATE TYPE "public"."eixo_tecnologico" AS ENUM('ambiente_saude', 'controle_processos_industriais', 'desenvolvimento_educacional_social', 'gestao_negocios', 'informacao_comunicacao', 'infraestrutura', 'militar', 'producao_alimenticia', 'producao_cultural_design', 'producao_industrial', 'recursos_naturais', 'seguranca', 'turismo_hospitalidade_lazer');--> statement-breakpoint
CREATE TYPE "public"."forma_oferta" AS ENUM('integrada', 'concomitante_intercomplementar');--> statement-breakpoint
CREATE TABLE "professor_disciplinas" (
	"id" serial PRIMARY KEY NOT NULL,
	"professor_id" integer NOT NULL,
	"disciplina_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "professores" (
	"id" serial PRIMARY KEY NOT NULL,
	"escola_id" text DEFAULT 'escola_default' NOT NULL,
	"nome" text NOT NULL,
	"email" text NOT NULL,
	"cpf" text,
	"matricula" text,
	"telefone" text,
	"carga_horaria_total" integer DEFAULT 20 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"professor_principal_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "disciplinas" (
	"id" serial PRIMARY KEY NOT NULL,
	"escola_id" text DEFAULT 'escola_default' NOT NULL,
	"nome" text NOT NULL,
	"sigla" text,
	"carga_semanal" integer DEFAULT 2 NOT NULL,
	"cor" text DEFAULT '#6366f1' NOT NULL,
	"codigo_sae" text,
	"codigo_externo_rco" integer,
	"tipo_sala_exigido" text,
	"categoria_curricular_padrao" "composicao_curricular",
	"sem_turma" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "turma_disciplinas" (
	"id" serial PRIMARY KEY NOT NULL,
	"turma_id" integer NOT NULL,
	"disciplina_id" integer NOT NULL,
	"professor_id" integer,
	"professor_apoio_id" integer,
	"carga_horaria_semanal_override" integer,
	"aulas_assincronas" integer DEFAULT 0 NOT NULL,
	"grupo_trio" text,
	"trio_ordem" integer,
	"trio_inicio" date,
	"max_aulas_consecutivas_dia" integer,
	"grupo_compartilhado_id" text
);
--> statement-breakpoint
CREATE TABLE "turmas" (
	"id" serial PRIMARY KEY NOT NULL,
	"escola_id" text DEFAULT 'escola_default' NOT NULL,
	"nome" text NOT NULL,
	"serie" text NOT NULL,
	"turno" text DEFAULT 'matutino' NOT NULL,
	"nivel_ensino" "nivel_ensino",
	"ano_letivo" integer NOT NULL,
	"fantasma" boolean DEFAULT false NOT NULL,
	"matriz_curricular_id" integer,
	"codigo_sere" integer,
	"codigo_sere_if" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "horarios" (
	"id" serial PRIMARY KEY NOT NULL,
	"escola_id" text DEFAULT 'escola_default' NOT NULL,
	"turma_id" integer NOT NULL,
	"disciplina_id" integer NOT NULL,
	"professor_id" integer NOT NULL,
	"dia_semana" integer NOT NULL,
	"numero_aula" integer NOT NULL,
	"sala" text,
	"versao_grade" text DEFAULT 'oficial',
	"assincrona" boolean DEFAULT false NOT NULL,
	"fixa" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "salas" (
	"id" serial PRIMARY KEY NOT NULL,
	"escola_id" text DEFAULT 'escola_default' NOT NULL,
	"nome" text NOT NULL,
	"tipo" text DEFAULT 'sala_aula' NOT NULL,
	"capacidade" integer DEFAULT 35 NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"observacoes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "licencas_professores" (
	"id" serial PRIMARY KEY NOT NULL,
	"escola_id" text DEFAULT 'escola_default' NOT NULL,
	"professor_id" integer NOT NULL,
	"professor_substituto_id" integer,
	"data_inicio" date NOT NULL,
	"data_fim" date NOT NULL,
	"tipo" text DEFAULT 'medica' NOT NULL,
	"motivo" text,
	"aprovada" boolean DEFAULT false NOT NULL,
	"comunicado_enviado" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comunicados" (
	"id" serial PRIMARY KEY NOT NULL,
	"escola_id" text NOT NULL,
	"titulo" text NOT NULL,
	"mensagem" text NOT NULL,
	"tipo" text DEFAULT 'geral' NOT NULL,
	"turma_id" integer,
	"professor_id" integer,
	"lida" boolean DEFAULT false NOT NULL,
	"autor_nome" text DEFAULT 'Sistema' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"escola_id" text DEFAULT 'escola_default' NOT NULL,
	"entidade" text NOT NULL,
	"entidade_id" integer,
	"acao" text NOT NULL,
	"dados_anteriores" jsonb,
	"dados_novos" jsonb,
	"usuario_id" text,
	"usuario_nome" text,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" serial PRIMARY KEY NOT NULL,
	"escola_id" text NOT NULL,
	"clerk_id" text NOT NULL,
	"nome" text NOT NULL,
	"email" text NOT NULL,
	"perfil" text DEFAULT 'coordenacao' NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_clerk_id_unique" UNIQUE("clerk_id")
);
--> statement-breakpoint
CREATE TABLE "configuracoes" (
	"id" serial PRIMARY KEY NOT NULL,
	"escola_id" text DEFAULT 'escola_default' NOT NULL,
	"chave" text NOT NULL,
	"valor" jsonb,
	"descricao" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "horarios_experimentais" (
	"id" serial PRIMARY KEY NOT NULL,
	"escola_id" text DEFAULT 'escola_default' NOT NULL,
	"nome" text NOT NULL,
	"turma_id" integer NOT NULL,
	"disciplina_id" integer NOT NULL,
	"professor_id" integer NOT NULL,
	"dia_semana" integer NOT NULL,
	"numero_aula" integer NOT NULL,
	"sala" text,
	"assincrona" boolean DEFAULT false NOT NULL,
	"fixa" boolean DEFAULT false NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_por" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "escolas" (
	"id" text PRIMARY KEY NOT NULL,
	"nome_fantasia" text NOT NULL,
	"cnpj" text,
	"cidade" text,
	"estado" text DEFAULT 'SP' NOT NULL,
	"modalidade" text DEFAULT 'regular' NOT NULL,
	"codigo_inep" text,
	"nre" text,
	"turnos_ofertados" text,
	"resolucao_seed_pr" text,
	"plano_id" integer,
	"clerk_org_id" text,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"email_contato" text,
	"telefone_contato" text,
	"email_cobranca" text,
	"asaas_customer_id" text,
	"asaas_subscription_id" text,
	"asaas_status_assinatura" text,
	"asaas_proximo_vencimento" timestamp with time zone,
	"plano_ativo" boolean DEFAULT true NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"isenta" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "escolas_clerk_org_id_unique" UNIQUE("clerk_org_id")
);
--> statement-breakpoint
CREATE TABLE "planos" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"preco_mensal" integer DEFAULT 0 NOT NULL,
	"preco_anual" integer,
	"max_professores" integer DEFAULT 10 NOT NULL,
	"max_turmas" integer DEFAULT 5 NOT NULL,
	"tem_ia" boolean DEFAULT false NOT NULL,
	"tem_export" boolean DEFAULT false NOT NULL,
	"tem_import" boolean DEFAULT false NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"visivel_publicamente" boolean DEFAULT true NOT NULL,
	"cobranca" text DEFAULT 'fixa' NOT NULL,
	"preco_por_turma_anual" integer,
	"stripe_price_id_mensal" text,
	"stripe_price_id_anual" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "disponibilidade_professores" (
	"id" serial PRIMARY KEY NOT NULL,
	"professor_id" integer NOT NULL,
	"dia_semana" integer NOT NULL,
	"horario_slot" integer NOT NULL,
	"disponivel" boolean DEFAULT true NOT NULL,
	"motivo" text,
	"turno" text,
	"hora_atividade_obrigatoria" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_conversas" (
	"id" serial PRIMARY KEY NOT NULL,
	"escola_id" text DEFAULT 'escola_default' NOT NULL,
	"titulo" text DEFAULT 'Nova conversa' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_mensagens" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversa_id" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cursos" (
	"id" serial PRIMARY KEY NOT NULL,
	"escola_id" text DEFAULT 'escola_default' NOT NULL,
	"nome" text NOT NULL,
	"codigo_curso" text,
	"nivel" text DEFAULT 'fundamental' NOT NULL,
	"eixo_tecnologico" "eixo_tecnologico",
	"forma_oferta" "forma_oferta",
	"ofertado" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "itens_matriz" (
	"id" serial PRIMARY KEY NOT NULL,
	"matriz_curricular_id" integer NOT NULL,
	"disciplina_id" integer NOT NULL,
	"categoria_curricular" "composicao_curricular" DEFAULT 'BNC' NOT NULL,
	"carga_horaria_semanal" integer DEFAULT 2 NOT NULL,
	"grupo_disciplina" text,
	"eh_padrao_do_grupo" boolean DEFAULT false NOT NULL,
	"obrigatoria" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matrizes_curriculares" (
	"id" serial PRIMARY KEY NOT NULL,
	"escola_id" text DEFAULT 'escola_default' NOT NULL,
	"curso_id" integer NOT NULL,
	"serie_ano" text NOT NULL,
	"carga_horaria_semanal_total" integer DEFAULT 0 NOT NULL,
	"codigo_matriz_sere" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendario_escolar" (
	"id" serial PRIMARY KEY NOT NULL,
	"escola_id" text DEFAULT 'escola_default' NOT NULL,
	"ano" integer NOT NULL,
	"data" date NOT NULL,
	"tipo" text NOT NULL,
	"descricao" text NOT NULL,
	"dia_letivo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trimestres_letivos" (
	"id" serial PRIMARY KEY NOT NULL,
	"escola_id" text DEFAULT 'escola_default' NOT NULL,
	"ano" integer NOT NULL,
	"trimestre" integer NOT NULL,
	"data_inicio" date NOT NULL,
	"data_fim" date NOT NULL,
	"dias_letivos" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "aulas_fixas" (
	"id" serial PRIMARY KEY NOT NULL,
	"escola_id" text DEFAULT 'escola_default' NOT NULL,
	"turma_id" integer NOT NULL,
	"disciplina_id" integer NOT NULL,
	"professor_id" integer NOT NULL,
	"dia_semana" integer NOT NULL,
	"numero_aula" integer NOT NULL,
	"ano_letivo" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "horario_slots" (
	"id" serial PRIMARY KEY NOT NULL,
	"escola_id" text DEFAULT 'escola_default' NOT NULL,
	"turno" text NOT NULL,
	"nivel_ensino" "nivel_ensino",
	"numero_aula" integer NOT NULL,
	"hora_inicio" time NOT NULL,
	"duracao_minutos" integer DEFAULT 50 NOT NULL,
	"letivo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "limites_diarios_professor" (
	"id" serial PRIMARY KEY NOT NULL,
	"escola_id" text DEFAULT 'escola_default' NOT NULL,
	"professor_id" integer NOT NULL,
	"turma_id" integer,
	"max_aulas_por_dia" integer DEFAULT 2 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "disciplinas_catalogo" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"codigo_sae" text,
	"codigo_externo_rco" integer,
	"categoria_curricular_padrao" "composicao_curricular",
	"carga_semanal_sugerida" integer DEFAULT 2 NOT NULL,
	"tipo_sala_exigido" text,
	"sigla" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asaas_webhook_eventos" (
	"id" text PRIMARY KEY NOT NULL,
	"tipo" text NOT NULL,
	"processado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regras_reserva_professor" (
	"id" serial PRIMARY KEY NOT NULL,
	"escola_id" text NOT NULL,
	"professor_id" integer NOT NULL,
	"limite_semanal" integer DEFAULT 2 NOT NULL,
	"prioridade" integer DEFAULT 3 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reservas" (
	"id" serial PRIMARY KEY NOT NULL,
	"escola_id" text NOT NULL,
	"sala_id" integer NOT NULL,
	"professor_id" integer NOT NULL,
	"horario_id" integer,
	"data" date NOT NULL,
	"dia_semana" integer NOT NULL,
	"numero_aula" integer NOT NULL,
	"turno" text,
	"titulo" text NOT NULL,
	"observacoes" text,
	"status" text DEFAULT 'confirmada' NOT NULL,
	"prioridade_aplicada" integer DEFAULT 3 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recursos" (
	"id" serial PRIMARY KEY NOT NULL,
	"escola_id" text NOT NULL,
	"nome" text NOT NULL,
	"quantidade_total" integer NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reservas_recursos" (
	"id" serial PRIMARY KEY NOT NULL,
	"escola_id" text NOT NULL,
	"recurso_id" integer NOT NULL,
	"professor_id" integer NOT NULL,
	"data" date NOT NULL,
	"dia_semana" integer NOT NULL,
	"numero_aula" integer NOT NULL,
	"turno" text NOT NULL,
	"quantidade" integer NOT NULL,
	"titulo" text NOT NULL,
	"observacoes" text,
	"status" text DEFAULT 'confirmada' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "codigos_rco_disciplina" (
	"codigo_sae" integer PRIMARY KEY NOT NULL,
	"codigo_externo" integer NOT NULL,
	"nome_rco" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "acessos_escola" (
	"id" serial PRIMARY KEY NOT NULL,
	"escola_id" text NOT NULL,
	"email" text NOT NULL,
	"nome" text,
	"cargo" text NOT NULL,
	"user_id" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_por" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"ultimo_acesso_em" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "professor_disciplinas" ADD CONSTRAINT "professor_disciplinas_professor_id_professores_id_fk" FOREIGN KEY ("professor_id") REFERENCES "public"."professores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professor_disciplinas" ADD CONSTRAINT "professor_disciplinas_disciplina_id_disciplinas_id_fk" FOREIGN KEY ("disciplina_id") REFERENCES "public"."disciplinas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turma_disciplinas" ADD CONSTRAINT "turma_disciplinas_turma_id_turmas_id_fk" FOREIGN KEY ("turma_id") REFERENCES "public"."turmas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turma_disciplinas" ADD CONSTRAINT "turma_disciplinas_professor_id_professores_id_fk" FOREIGN KEY ("professor_id") REFERENCES "public"."professores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turma_disciplinas" ADD CONSTRAINT "turma_disciplinas_professor_apoio_id_professores_id_fk" FOREIGN KEY ("professor_apoio_id") REFERENCES "public"."professores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turmas" ADD CONSTRAINT "turmas_matriz_curricular_id_matrizes_curriculares_id_fk" FOREIGN KEY ("matriz_curricular_id") REFERENCES "public"."matrizes_curriculares"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "horarios" ADD CONSTRAINT "horarios_turma_id_turmas_id_fk" FOREIGN KEY ("turma_id") REFERENCES "public"."turmas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "horarios" ADD CONSTRAINT "horarios_disciplina_id_disciplinas_id_fk" FOREIGN KEY ("disciplina_id") REFERENCES "public"."disciplinas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "horarios" ADD CONSTRAINT "horarios_professor_id_professores_id_fk" FOREIGN KEY ("professor_id") REFERENCES "public"."professores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "licencas_professores" ADD CONSTRAINT "licencas_professores_professor_id_professores_id_fk" FOREIGN KEY ("professor_id") REFERENCES "public"."professores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escolas" ADD CONSTRAINT "escolas_plano_id_planos_id_fk" FOREIGN KEY ("plano_id") REFERENCES "public"."planos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disponibilidade_professores" ADD CONSTRAINT "disponibilidade_professores_professor_id_professores_id_fk" FOREIGN KEY ("professor_id") REFERENCES "public"."professores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_mensagens" ADD CONSTRAINT "ai_mensagens_conversa_id_ai_conversas_id_fk" FOREIGN KEY ("conversa_id") REFERENCES "public"."ai_conversas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itens_matriz" ADD CONSTRAINT "itens_matriz_matriz_curricular_id_matrizes_curriculares_id_fk" FOREIGN KEY ("matriz_curricular_id") REFERENCES "public"."matrizes_curriculares"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matrizes_curriculares" ADD CONSTRAINT "matrizes_curriculares_curso_id_cursos_id_fk" FOREIGN KEY ("curso_id") REFERENCES "public"."cursos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aulas_fixas" ADD CONSTRAINT "aulas_fixas_turma_id_turmas_id_fk" FOREIGN KEY ("turma_id") REFERENCES "public"."turmas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aulas_fixas" ADD CONSTRAINT "aulas_fixas_disciplina_id_disciplinas_id_fk" FOREIGN KEY ("disciplina_id") REFERENCES "public"."disciplinas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aulas_fixas" ADD CONSTRAINT "aulas_fixas_professor_id_professores_id_fk" FOREIGN KEY ("professor_id") REFERENCES "public"."professores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "limites_diarios_professor" ADD CONSTRAINT "limites_diarios_professor_professor_id_professores_id_fk" FOREIGN KEY ("professor_id") REFERENCES "public"."professores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "limites_diarios_professor" ADD CONSTRAINT "limites_diarios_professor_turma_id_turmas_id_fk" FOREIGN KEY ("turma_id") REFERENCES "public"."turmas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regras_reserva_professor" ADD CONSTRAINT "regras_reserva_professor_professor_id_professores_id_fk" FOREIGN KEY ("professor_id") REFERENCES "public"."professores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_sala_id_salas_id_fk" FOREIGN KEY ("sala_id") REFERENCES "public"."salas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_professor_id_professores_id_fk" FOREIGN KEY ("professor_id") REFERENCES "public"."professores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_horario_id_horarios_id_fk" FOREIGN KEY ("horario_id") REFERENCES "public"."horarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservas_recursos" ADD CONSTRAINT "reservas_recursos_recurso_id_recursos_id_fk" FOREIGN KEY ("recurso_id") REFERENCES "public"."recursos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservas_recursos" ADD CONSTRAINT "reservas_recursos_professor_id_professores_id_fk" FOREIGN KEY ("professor_id") REFERENCES "public"."professores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "regras_reserva_professor_escola_professor_idx" ON "regras_reserva_professor" USING btree ("escola_id","professor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reservas_sala_slot_unico" ON "reservas" USING btree ("escola_id","sala_id","data","numero_aula",coalesce("turno", '')) WHERE "reservas"."status" != 'cancelada';--> statement-breakpoint
CREATE UNIQUE INDEX "recursos_escola_nome_idx" ON "recursos" USING btree ("escola_id","nome");--> statement-breakpoint
CREATE UNIQUE INDEX "acessos_escola_escola_email_uq" ON "acessos_escola" USING btree ("escola_id","email");--> statement-breakpoint
CREATE INDEX "acessos_escola_email_idx" ON "acessos_escola" USING btree ("email");--> statement-breakpoint
CREATE INDEX "acessos_escola_user_idx" ON "acessos_escola" USING btree ("user_id");