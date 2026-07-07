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
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "disciplinas" (
	"id" serial PRIMARY KEY NOT NULL,
	"escola_id" text DEFAULT 'escola_default' NOT NULL,
	"nome" text NOT NULL,
	"carga_semanal" integer DEFAULT 2 NOT NULL,
	"cor" text DEFAULT '#6366f1' NOT NULL,
	"codigo_sae" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "turma_disciplinas" (
	"id" serial PRIMARY KEY NOT NULL,
	"turma_id" integer NOT NULL,
	"disciplina_id" integer NOT NULL,
	"carga_horaria_semanal_override" integer
);
--> statement-breakpoint
CREATE TABLE "turmas" (
	"id" serial PRIMARY KEY NOT NULL,
	"escola_id" text DEFAULT 'escola_default' NOT NULL,
	"nome" text NOT NULL,
	"serie" text NOT NULL,
	"turno" text DEFAULT 'matutino' NOT NULL,
	"ano_letivo" integer NOT NULL,
	"matriz_curricular_id" integer,
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
	"escola_id" text DEFAULT 'escola_default' NOT NULL,
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
	"escola_id" text DEFAULT 'escola_default' NOT NULL,
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
	"plano_id" integer,
	"clerk_org_id" text,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"plano_ativo" boolean DEFAULT true NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "escolas_clerk_org_id_unique" UNIQUE("clerk_org_id")
);
--> statement-breakpoint
CREATE TABLE "planos" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"preco" integer DEFAULT 0 NOT NULL,
	"max_professores" integer DEFAULT 10 NOT NULL,
	"max_turmas" integer DEFAULT 5 NOT NULL,
	"tem_ia" boolean DEFAULT false NOT NULL,
	"tem_export" boolean DEFAULT false NOT NULL,
	"tem_import" boolean DEFAULT false NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"stripe_price_id" text,
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
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "itens_matriz" (
	"id" serial PRIMARY KEY NOT NULL,
	"matriz_curricular_id" integer NOT NULL,
	"disciplina_id" integer NOT NULL,
	"categoria_curricular" text DEFAULT 'base_nacional_comum' NOT NULL,
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
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "professor_disciplinas" ADD CONSTRAINT "professor_disciplinas_professor_id_professores_id_fk" FOREIGN KEY ("professor_id") REFERENCES "public"."professores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turma_disciplinas" ADD CONSTRAINT "turma_disciplinas_turma_id_turmas_id_fk" FOREIGN KEY ("turma_id") REFERENCES "public"."turmas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turmas" ADD CONSTRAINT "turmas_matriz_curricular_id_matrizes_curriculares_id_fk" FOREIGN KEY ("matriz_curricular_id") REFERENCES "public"."matrizes_curriculares"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "horarios" ADD CONSTRAINT "horarios_turma_id_turmas_id_fk" FOREIGN KEY ("turma_id") REFERENCES "public"."turmas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "horarios" ADD CONSTRAINT "horarios_disciplina_id_disciplinas_id_fk" FOREIGN KEY ("disciplina_id") REFERENCES "public"."disciplinas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "horarios" ADD CONSTRAINT "horarios_professor_id_professores_id_fk" FOREIGN KEY ("professor_id") REFERENCES "public"."professores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "licencas_professores" ADD CONSTRAINT "licencas_professores_professor_id_professores_id_fk" FOREIGN KEY ("professor_id") REFERENCES "public"."professores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escolas" ADD CONSTRAINT "escolas_plano_id_planos_id_fk" FOREIGN KEY ("plano_id") REFERENCES "public"."planos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disponibilidade_professores" ADD CONSTRAINT "disponibilidade_professores_professor_id_professores_id_fk" FOREIGN KEY ("professor_id") REFERENCES "public"."professores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_mensagens" ADD CONSTRAINT "ai_mensagens_conversa_id_ai_conversas_id_fk" FOREIGN KEY ("conversa_id") REFERENCES "public"."ai_conversas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itens_matriz" ADD CONSTRAINT "itens_matriz_matriz_curricular_id_matrizes_curriculares_id_fk" FOREIGN KEY ("matriz_curricular_id") REFERENCES "public"."matrizes_curriculares"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matrizes_curriculares" ADD CONSTRAINT "matrizes_curriculares_curso_id_cursos_id_fk" FOREIGN KEY ("curso_id") REFERENCES "public"."cursos"("id") ON DELETE cascade ON UPDATE no action;