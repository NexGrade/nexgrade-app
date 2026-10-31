/**
 * [DEMO-COPIA-MB] (31/10/2026) Escola Demonstracao passa a ter o cadastro e a grade do Mario Braga, com
 * professores de NOME FICTICIO (decisao da dona: demonstracao para outro cliente, sem dados reais).
 *  - Apaga da Demonstracao: cadastro, grade e o dia a dia (reservas, presencas, licencas, comunicados),
 *    copias da grade, experimentos e as viradas de ano (o backup delas aponta para o cadastro antigo).
 *  - Mantem da Demonstracao: a escola (nome, INEP, plano), usuarios, acessos e o historico (audit_logs).
 *  - Copia do Mario Braga: configuracoes (menos o nome da escola e o arquivo do RCO enviado), esquema de
 *    aulas, calendario, trimestres, salas, recursos, cursos, matrizes, disciplinas, professores (nome
 *    ficticio, e-mail @demonstracao.invalid, sem CPF/matricula/telefone), habilitacoes, disponibilidade/HA,
 *    turmas (com codigos SERE), vinculos, aulas fixas, limites, grade oficial e experimentos.
 *  - NAO copia o dia a dia do Mario Braga nem as copias da grade (grade_backups).
 * Tudo numa transacao. Dry-run faz a copia inteira e desfaz no fim (ROLLBACK): valida as travas do banco
 * sem gravar. --aplicar grava o backup da Demonstracao em lib/db/_arquivo e confirma (COMMIT).
 * Uso (na raiz do repositorio):
 *   pnpm --filter @workspace/api-server exec tsx scripts/copiar-mario-braga-para-demonstracao.ts            (dry-run)
 *   pnpm --filter @workspace/api-server exec tsx scripts/copiar-mario-braga-para-demonstracao.ts --aplicar  (backup + grava)
 * Relatorio em lib/db/_arquivo/copiar-mario-braga-para-demonstracao.txt
 */
import fs from "node:fs";
import path from "node:path";
import type { PoolClient } from "pg";

const APLICAR = process.argv.includes("--aplicar");
const ORIGEM = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8"; // C.E. Prof. Mario B.T. Braga
const DESTINO = "esc_1ce4d2d30c4146a99fb7ffa5"; // Escola Demonstracao NexGrade
const RAIZ = path.resolve(process.cwd(), "..", "..");
const CONFIG_FORA = ["escola.nome", "arquivo_rco_conteudo", "arquivo_rco_exportacao", "arquivo_rco_solicitado"];

const PRENOMES = ["Adriana", "Alexandre", "Amanda", "André", "Beatriz", "Bruno", "Camila", "Carlos", "Cláudia", "Daniel",
  "Denise", "Diego", "Eduardo", "Elaine", "Fábio", "Fernanda", "Flávia", "Gabriel", "Giovana", "Guilherme", "Helena",
  "Henrique", "Isabela", "Jéssica", "Jorge", "Juliana", "Larissa", "Leandro", "Letícia", "Luana", "Marcelo", "Márcia",
  "Mateus", "Natália", "Patrícia", "Paulo", "Priscila", "Rafael", "Regina", "Renata", "Ricardo", "Rodrigo", "Sandra",
  "Sérgio", "Tatiana", "Thiago", "Vanessa", "Vítor", "Viviane", "Wagner"];
const SOBRENOMES = ["Almeida", "Andrade", "Araújo", "Barbosa", "Cardoso", "Carvalho", "Castro", "Correia", "Costa", "Dias",
  "Duarte", "Farias", "Fernandes", "Ferreira", "Freitas", "Gomes", "Lima", "Lopes", "Machado", "Martins", "Melo",
  "Mendes", "Monteiro", "Moraes", "Moreira", "Nascimento", "Nogueira", "Oliveira", "Pereira", "Pinto", "Ramos",
  "Ribeiro", "Rocha", "Rodrigues", "Santana", "Silveira", "Soares", "Souza", "Teixeira", "Vieira"];

const linhas: string[] = [];
const log = (s = "") => { linhas.push(s); console.log(s); };
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

function carregarDatabaseUrl() {
  if (process.env.DATABASE_URL) return;
  const linha = fs.readFileSync(path.join(RAIZ, "lib", "db", ".env"), "utf8").split(/\r?\n/).find((l) => l.trim().startsWith("DATABASE_URL="))!;
  process.env.DATABASE_URL = linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

/** Nomes ficticios distintos entre si e dos nomes reais (combinacao deterministica prenome x sobrenome). */
function nomesFicticios(qtd: number, reais: string[]): string[] {
  const proibidos = new Set(reais.map((n) => semAcento(n).toLowerCase()));
  const saida: string[] = [];
  for (let i = 0; saida.length < qtd; i++) {
    if (i > PRENOMES.length * SOBRENOMES.length) throw new Error("faltam nomes ficticios");
    const nome = `${PRENOMES[(i * 7) % PRENOMES.length]} ${SOBRENOMES[(i * 11 + Math.floor(i / PRENOMES.length)) % SOBRENOMES.length]}`;
    const chave = semAcento(nome).toLowerCase();
    if (proibidos.has(chave) || saida.some((s) => semAcento(s).toLowerCase() === chave)) continue;
    saida.push(nome);
  }
  return saida;
}

type Mapa = Map<number, number>;

async function main() {
  carregarDatabaseUrl();
  const { pool } = await import("@workspace/db");
  const c: PoolClient = await pool.connect();
  const q = async <T = any>(sql: string, p: unknown[] = []) => (await c.query(sql, p)).rows as T[];

  const colunasCache = new Map<string, { nome: string; identidade: boolean }[]>();
  async function colunas(tabela: string) {
    if (!colunasCache.has(tabela)) {
      colunasCache.set(tabela, (await q<{ column_name: string; is_identity: string; identity_generation: string | null }>(
        "select column_name, is_identity, identity_generation from information_schema.columns where table_schema='public' and table_name=$1 order by ordinal_position",
        [tabela])).map((r) => ({ nome: r.column_name, identidade: r.is_identity === "YES" && r.identity_generation === "ALWAYS" })));
    }
    return colunasCache.get(tabela)!;
  }

  /**
   * Copia as linhas para `tabela`, com escola_id = DESTINO, colunas de id trocadas pelos mapas e id novo
   * (reservado na sequence, para montar o mapa sem depender da ordem do RETURNING). Devolve id antigo -> novo.
   */
  async function copiar(tabela: string, rows: any[], mapas: Record<string, Mapa> = {}, ajustar?: (novo: any, original: any) => void): Promise<Mapa> {
    const mapa: Mapa = new Map();
    if (rows.length === 0) return mapa;
    const cols = await colunas(tabela);
    const temId = cols.some((x) => x.nome === "id");
    const sobrescreve = cols.some((x) => x.nome === "id" && x.identidade) ? " OVERRIDING SYSTEM VALUE" : "";
    if (temId) {
      const ids = await q<{ id: string }>(`select nextval(pg_get_serial_sequence($1, 'id')) as id from generate_series(1, $2)`, [`public.${tabela}`, rows.length]);
      rows.forEach((r, i) => mapa.set(r.id, Number(ids[i].id)));
    }
    const novas = rows.map((r) => {
      const n: any = { ...r };
      if (temId) n.id = mapa.get(r.id);
      if ("escola_id" in n) n.escola_id = DESTINO;
      for (const [col, m] of Object.entries(mapas)) {
        if (n[col] == null) continue;
        const novo = m.get(n[col]);
        if (novo == null) throw new Error(`${tabela}.${col}=${n[col]} sem correspondente na copia`);
        n[col] = novo;
      }
      ajustar?.(n, r);
      return n;
    });
    const nomes = cols.map((x) => x.nome).filter((x) => x in novas[0]);
    const porLote = Math.max(1, Math.floor(30000 / nomes.length));
    for (let i = 0; i < novas.length; i += porLote) {
      const lote = novas.slice(i, i + porLote);
      const params: unknown[] = [];
      const valores = lote.map((r) => `(${nomes.map((k) => { params.push(r[k]); return `$${params.length}`; }).join(", ")})`);
      await c.query(`insert into "${tabela}" (${nomes.map((k) => `"${k}"`).join(", ")})${sobrescreve} values ${valores.join(", ")}`, params);
    }
    return mapa;
  }

  try {
    log(APLICAR ? "MODO: APLICAR\n" : "MODO: DRY-RUN (faz a copia e desfaz no fim; nada fica gravado)\n");
    const [orig] = await q("select nome_fantasia from escolas where id=$1", [ORIGEM]);
    const [dest] = await q("select nome_fantasia from escolas where id=$1", [DESTINO]);
    if (!orig || !dest) throw new Error("escola nao encontrada");
    if (!/demonstra/i.test(dest.nome_fantasia)) throw new Error(`destino nao e a escola de demonstracao: ${dest.nome_fantasia}`);
    log(`Origem : ${orig.nome_fantasia} (${ORIGEM})`);
    log(`Destino: ${dest.nome_fantasia} (${DESTINO})\n`);

    // ---------- o que a Demonstracao tem hoje (sai) ----------
    const daEscola = (t: string) => `select * from "${t}" where escola_id=$1 order by id`;
    const doProfessor = (t: string) => `select x.* from "${t}" x join professores p on p.id=x.professor_id where p.escola_id=$1 order by x.id`;
    const daTurma = (t: string) => `select x.* from "${t}" x join turmas tu on tu.id=x.turma_id where tu.escola_id=$1 order by x.id`;
    const daMatriz = `select x.* from itens_matriz x join matrizes_curriculares m on m.id=x.matriz_curricular_id where m.escola_id=$1 order by x.id`;
    const TABELAS_ESCOLA = ["configuracoes", "horario_slots", "calendario_escolar", "trimestres_letivos", "salas", "recursos", "bloqueios",
      "cursos", "matrizes_curriculares", "disciplinas", "professores", "turmas", "aulas_fixas", "limites_diarios_professor", "horarios",
      "horarios_experimentais", "reservas", "reservas_recursos", "regras_reserva_professor", "presencas_professores", "licencas_professores",
      "comunicados", "grade_backups", "viradas_ano"];
    const atual: Record<string, any[]> = {};
    for (const t of TABELAS_ESCOLA) atual[t] = await q(daEscola(t), [DESTINO]);
    atual.itens_matriz = await q(daMatriz, [DESTINO]);
    atual.professor_disciplinas = await q(doProfessor("professor_disciplinas"), [DESTINO]);
    atual.disponibilidade_professores = await q(doProfessor("disponibilidade_professores"), [DESTINO]);
    atual.turma_disciplinas = await q(daTurma("turma_disciplinas"), [DESTINO]);
    log("== Sai da Demonstracao (linhas)");
    log("  " + Object.entries(atual).filter(([, v]) => v.length > 0).map(([t, v]) => `${t}: ${v.length}`).join(" | "));
    log("  Ficam: a escola (nome, INEP, plano), usuarios, acessos e o historico.\n");

    // ---------- o que vem do Mario Braga ----------
    const mb: Record<string, any[]> = {};
    for (const t of ["configuracoes", "horario_slots", "calendario_escolar", "trimestres_letivos", "salas", "recursos", "bloqueios", "cursos",
      "matrizes_curriculares", "disciplinas", "professores", "turmas", "aulas_fixas", "limites_diarios_professor", "horarios", "horarios_experimentais"]) {
      mb[t] = await q(daEscola(t), [ORIGEM]);
    }
    mb.configuracoes = mb.configuracoes.filter((r) => !CONFIG_FORA.includes(r.chave));
    mb.itens_matriz = await q(daMatriz, [ORIGEM]);
    // item de matriz com disciplina que ja foi apagada no Mario Braga (sem chave estrangeira): fica de fora
    const idsDisc = new Set(mb.disciplinas.map((d) => d.id));
    const itensOrfaos = mb.itens_matriz.filter((i) => !idsDisc.has(i.disciplina_id));
    mb.itens_matriz = mb.itens_matriz.filter((i) => idsDisc.has(i.disciplina_id));
    mb.professor_disciplinas = await q(doProfessor("professor_disciplinas"), [ORIGEM]);
    mb.disponibilidade_professores = await q(doProfessor("disponibilidade_professores"), [ORIGEM]);
    mb.turma_disciplinas = await q(daTurma("turma_disciplinas"), [ORIGEM]);
    log("== Vem do Mario Braga (linhas)");
    log("  " + Object.entries(mb).filter(([, v]) => v.length > 0).map(([t, v]) => `${t}: ${v.length}`).join(" | "));
    log(`  Configuracoes que NAO vem: ${CONFIG_FORA.join(", ")}`);
    if (itensOrfaos.length) log(`  Itens de matriz que NAO vem (disciplina apagada no Mario Braga): ${itensOrfaos.map((i) => `#${i.id} (disciplina #${i.disciplina_id}, matriz #${i.matriz_curricular_id})`).join(", ")}`);
    log("");

    // ---------- nomes ficticios ----------
    const sistema = (p: any) => /^h[ií]brida\b/i.test(p.nome) || /@sistema\.local$/i.test(p.email ?? "");
    const reais = mb.professores.filter((p) => !sistema(p));
    const ficticios = nomesFicticios(reais.length, [...reais.map((p) => p.nome), ...atual.professores.map((p) => p.nome)]);
    const novoNome = new Map<number, string>();
    reais.forEach((p, i) => novoNome.set(p.id, ficticios[i]));
    log(`== Professores: ${reais.length} com nome ficticio, ${mb.professores.length - reais.length} do sistema (Hibrida) com o mesmo nome`);
    for (const p of reais) log(`  #${p.id} -> ${novoNome.get(p.id)}${p.ativo ? "" : " [inativo]"}`);
    log("");

    /** Troca "Prof. <nome real>" pelo ficticio nos textos que guardam nomes (conflitos aceitos). */
    const trocas = reais.map((p) => [String(p.nome).trim(), novoNome.get(p.id)!] as const).filter(([a]) => a.length > 0)
      .sort((a, b) => b[0].length - a[0].length);
    const anonimizar = (texto: string) => trocas.reduce((s, [real, fic]) => s.split(`Prof. ${real}`).join(`Prof. ${fic}`), texto);

    // ---------- grava (dentro da transacao) ----------
    if (APLICAR) {
      const arqBk = path.join(RAIZ, "lib", "db", "_arquivo", `backup-escola-demonstracao-antes-copia-mb-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
      fs.mkdirSync(path.dirname(arqBk), { recursive: true });
      fs.writeFileSync(arqBk, JSON.stringify({ escola: DESTINO, feitoEm: new Date().toISOString(), tabelas: atual }, null, 1));
      log(`Backup da Demonstracao: ${arqBk}\n`);
    }

    await c.query("BEGIN");
    try {
      // apaga (filhos primeiro; professores/turmas/cursos levam o resto em cascata)
      const apagar = ["comunicados", "presencas_professores", "reservas", "reservas_recursos", "regras_reserva_professor", "licencas_professores",
        "aulas_fixas", "limites_diarios_professor", "horarios", "horarios_experimentais", "grade_backups", "viradas_ano", "turmas", "cursos",
        "matrizes_curriculares", "professores", "disciplinas", "bloqueios", "recursos", "salas", "horario_slots", "calendario_escolar",
        "trimestres_letivos", "configuracoes"];
      for (const t of apagar) await c.query(`delete from "${t}" where escola_id=$1`, [DESTINO]);

      await copiar("configuracoes", mb.configuracoes, {}, (r) => {
        if (r.chave === "conflitos.aceitos" && r.valor && typeof r.valor === "object") {
          r.valor = Object.fromEntries(Object.entries(r.valor).map(([k, v]) => [anonimizar(k), v]));
        }
        if (r.valor != null) r.valor = JSON.stringify(r.valor); // jsonb pelo driver: manda texto JSON
      });
      await copiar("horario_slots", mb.horario_slots);
      await copiar("calendario_escolar", mb.calendario_escolar);
      await copiar("trimestres_letivos", mb.trimestres_letivos);
      const salas = await copiar("salas", mb.salas);
      const recursos = await copiar("recursos", mb.recursos);
      await copiar("bloqueios", mb.bloqueios, { sala_id: salas, recurso_id: recursos });
      const cursos = await copiar("cursos", mb.cursos);
      const matrizes = await copiar("matrizes_curriculares", mb.matrizes_curriculares, { curso_id: cursos });
      const disciplinas = await copiar("disciplinas", mb.disciplinas);
      await copiar("itens_matriz", mb.itens_matriz, { matriz_curricular_id: matrizes, disciplina_id: disciplinas });

      // professores: principal depois (aponta para outro professor da mesma tabela)
      const professores = await copiar("professores", mb.professores, {}, (r, original) => {
        r.professor_principal_id = null;
        if (novoNome.has(original.id)) {
          const nome = novoNome.get(original.id)!;
          r.nome = nome;
          r.email = `${semAcento(nome).toLowerCase().replace(/[^a-z]+/g, ".")}@demonstracao.invalid`;
          r.cpf = null; r.matricula = null; r.telefone = null;
        }
      });
      for (const p of mb.professores.filter((x) => x.professor_principal_id != null)) {
        await c.query("update professores set professor_principal_id=$1 where id=$2", [professores.get(p.professor_principal_id) ?? null, professores.get(p.id)]);
      }
      await copiar("professor_disciplinas", mb.professor_disciplinas, { professor_id: professores, disciplina_id: disciplinas });
      await copiar("disponibilidade_professores", mb.disponibilidade_professores, { professor_id: professores });

      const turmas = await copiar("turmas", mb.turmas, { matriz_curricular_id: matrizes });
      await copiar("turma_disciplinas", mb.turma_disciplinas, { turma_id: turmas, disciplina_id: disciplinas, professor_id: professores, professor_apoio_id: professores });
      await copiar("aulas_fixas", mb.aulas_fixas, { turma_id: turmas, disciplina_id: disciplinas, professor_id: professores });
      await copiar("limites_diarios_professor", mb.limites_diarios_professor, { professor_id: professores, turma_id: turmas });
      await copiar("horarios", mb.horarios, { turma_id: turmas, disciplina_id: disciplinas, professor_id: professores });
      await copiar("horarios_experimentais", mb.horarios_experimentais, { turma_id: turmas, disciplina_id: disciplinas, professor_id: professores });

      // conferencia: mesma contagem nas duas escolas
      log("== Conferencia depois da copia (Mario Braga x Demonstracao)");
      let diferente = 0;
      const contar = async (sql: string, escola: string) => Number((await q(sql.replace(/^select x\.\*|^select \*/, "select count(*)::int as n").replace(/ order by .*$/, ""), [escola]))[0].n);
      const conferir: [string, string][] = [
        ...["horario_slots", "calendario_escolar", "trimestres_letivos", "salas", "recursos", "cursos", "matrizes_curriculares", "disciplinas",
          "professores", "turmas", "aulas_fixas", "horarios", "horarios_experimentais"].map((t) => [t, daEscola(t)] as [string, string]),
        ["itens_matriz", daMatriz], ["professor_disciplinas", doProfessor("professor_disciplinas")],
        ["disponibilidade_professores", doProfessor("disponibilidade_professores")], ["turma_disciplinas", daTurma("turma_disciplinas")],
      ];
      for (const [t, sql] of conferir) {
        const a = (await contar(sql, ORIGEM)) - (t === "itens_matriz" ? itensOrfaos.length : 0), b = await contar(sql, DESTINO);
        if (a !== b) diferente++;
        log(`  ${t.padEnd(28)} ${String(a).padStart(5)} x ${String(b).padStart(5)}${a === b ? "" : "  <-- DIFERENTE"}`);
      }
      for (const [t, campos] of [["calendario_escolar", "data::text || tipo"], ["trimestres_letivos", "data_inicio::text || data_fim::text"], ["horario_slots", "turno || numero_aula || hora_inicio::text || duracao_minutos"]]) {
        const sql = `select string_agg(${campos}, ',' order by ${campos}) s from "${t}" where escola_id=$1`;
        const igual = (await q(sql, [ORIGEM]))[0].s === (await q(sql, [DESTINO]))[0].s;
        if (!igual) diferente++;
        log(`  ${t.padEnd(28)} datas/horarios ${igual ? "iguais" : "DIFERENTES"}`);
      }
      const [nomesReais] = await q("select count(*)::int n from professores d where d.escola_id=$1 and exists (select 1 from professores o where o.escola_id=$2 and lower(o.nome)=lower(d.nome) and o.email not ilike '%@sistema.local')", [DESTINO, ORIGEM]);
      log(`  professores da Demonstracao com nome igual a um do Mario Braga: ${nomesReais.n}`);
      const configTexto = (await q("select string_agg(valor::text, ' ') s from configuracoes where escola_id=$1", [DESTINO]))[0].s ?? "";
      const nomesNaConfig = trocas.filter(([real]) => configTexto.includes(`Prof. ${real}`)).length;
      log(`  nomes reais nas configuracoes (conflitos aceitos): ${nomesNaConfig}`);
      if (diferente > 0 || nomesReais.n > 0 || nomesNaConfig > 0) throw new Error("conferencia falhou; nada foi gravado");

      if (APLICAR) { await c.query("COMMIT"); log("\nGRAVADO."); }
      else { await c.query("ROLLBACK"); log("\nDRY-RUN: a copia funcionou e foi desfeita. NADA FOI GRAVADO."); }
    } catch (e) { await c.query("ROLLBACK"); throw e; }
  } finally {
    c.release();
    await pool.end();
    const arq = path.join(RAIZ, "lib", "db", "_arquivo", "copiar-mario-braga-para-demonstracao.txt");
    fs.mkdirSync(path.dirname(arq), { recursive: true });
    fs.writeFileSync(arq, linhas.join("\r\n"), "utf8");
    console.log(`\nRelatorio: ${arq}`);
  }
}

main().catch((e) => { console.error("ERRO:", e); process.exit(1); });
