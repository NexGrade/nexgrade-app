// Dry-run da importação da grade oficial do NOTURNO a partir do PDF
// real da escola (semana 27/07 a 31/07). NÃO grava nada no banco --
// só mostra o que SERIA importado, pra revisão antes de aplicar.
//
// Como rodar:
//   cd C:\Projetos\nexgrade-app
//   $env:DATABASE_URL = "..."
//   npx tsx scripts/dry-run-importar-noturno.ts

import { db } from "@workspace/db";
import {
  turmasTable,
  disciplinasTable,
  professoresTable,
  horariosTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { writeFileSync } from "fs";
import { readFileSync } from "fs";

// ── Dados extraídos do PDF (150 aulas, ver noturno_aulas_estruturadas.json) ──
// Cole aqui o conteúdo de aulas_noturno.json (colocado ao lado deste script)
const AULAS_EXTRAIDAS: Array<{
  professor: string;
  dia: number;
  diaLabel: string;
  numeroAula: number;
  hora: string;
  turmaCodigo: string;
  disciplinaAbrev: string;
}> = JSON.parse(readFileSync("scripts/aulas_noturno.json", "utf-8"));

// ── Tradução de sigla -> nome normalizado da disciplina ──
// Normalizado = minusculo, sem acento, sem pontuação extra, espaços simples.
const ABREV_PARA_NOME: Record<string, string> = {
  "MAT.": "matematica",
  "PORT": "lingua portuguesa e literatura",
  "GEO": "geografia",
  "BIO": "biologia",
  "QUIM": "quimica",
  "ART": "arte",
  "ED.FIS": "educacao fisica",
  "INGLES": "lingua estrangeira moderna - ingles",
  "ED.FIN": "educacao financeira",
  "ED.DIG": "educacao digital",
  "HIB": "hibrida",
  "HIST": "historia",
  "FISIC": "fisica",
  "FILOS": "filosofia",
  "SOCIO": "sociologia",
  "VIDA": "projeto de vida",
  "MAT 2": "matematica 2",
  "BIO2": "biologia 2",
  "FIS2": "fisica 2",
  "FIS3": "fisica 3",
  "QUI1": "quimica 1",
  // [ATENCAO] Ha 2 disciplinas parecidas no banco: "Recomposicao da
  // Aprendizagem - Lingua Portuguesa" e "Leitura e Recomposicao da
  // Aprendizagem - Lingua Portuguesa". Assumido a SEM "Leitura e" --
  // confirme no resultado do dry-run se e essa mesmo.
  "R PORT": "recomposicao da aprendizagem - lingua portuguesa",
  "R MAT": "recomposicao da aprendizagem - matematica",
  "ART2": "arte 2",
  "GEO1": "geografia 1",
  "HIS1": "historia 1",
  "SOCIO1": "sociologia 1",
  "EMPRES": "informatica empresarial",
  "ECON.": "principios economicos",
  "FINAN.": "financas empresariais",
  "PR.ADM": "princ de administracao",
  "RH": "recursos humanos",
  // [ATENCAO] Ha 2 disciplinas parecidas: "Estrategia de Marketing"
  // (singular) e "Estrategias de Marketing" (plural). Assumido a
  // PLURAL, que bate com o nome usado no documento curricular oficial.
  "E.MARK": "estrategias de marketing",
  "INTEG.": "tecnicas integradas",
};

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  const escolaId = "escola_default"; // ajuste se necessario

  const [turmasNoturno, disciplinas, professores, horariosAtuais] = await Promise.all([
    db.select().from(turmasTable).where(and(eq(turmasTable.turno, "noturno"), eq(turmasTable.escolaId, escolaId))),
    db.select().from(disciplinasTable).where(eq(disciplinasTable.escolaId, escolaId)),
    db.select().from(professoresTable).where(eq(professoresTable.escolaId, escolaId)),
    db.select().from(horariosTable).where(eq(horariosTable.escolaId, escolaId)),
  ]);

  const turmaPorNome = new Map(turmasNoturno.map((t) => [normalizar(t.nome), t]));
  const disciplinaPorNomeNorm = new Map<string, typeof disciplinas[number]>();
  for (const d of disciplinas) {
    disciplinaPorNomeNorm.set(normalizar(d.nome), d);
  }
  // professor: mapa nome-completo-normalizado -> professor, e tambem
  // primeiro-nome-normalizado -> lista de professores (p/ desambiguar)
  const professorPorNomeCompleto = new Map(professores.map((p) => [normalizar(p.nome), p]));
  const professorPorPrimeiroNome = new Map<string, typeof professores>();
  for (const p of professores) {
    const primeiro = normalizar(p.nome).split(" ")[0];
    if (!professorPorPrimeiroNome.has(primeiro)) professorPorPrimeiroNome.set(primeiro, []);
    professorPorPrimeiroNome.get(primeiro)!.push(p);
  }

  const horariosNoturnoIds = new Set(turmasNoturno.map((t) => t.id));
  const horariosAtuaisNoturno = horariosAtuais.filter((h) => horariosNoturnoIds.has(h.turmaId));

  type LinhaResolvida = {
    turmaId: number;
    turmaNome: string;
    disciplinaId: number;
    disciplinaNome: string;
    professorId: number;
    professorNome: string;
    diaSemana: number;
    numeroAula: number;
  };
  const resolvidas: LinhaResolvida[] = [];
  const problemas: Array<{ motivo: string; item: (typeof AULAS_EXTRAIDAS)[number] }> = [];

  for (const item of AULAS_EXTRAIDAS) {
    const turma = turmaPorNome.get(normalizar(item.turmaCodigo));
    if (!turma) {
      problemas.push({ motivo: `Turma "${item.turmaCodigo}" nao encontrada no banco`, item });
      continue;
    }

    const nomeBusca = ABREV_PARA_NOME[item.disciplinaAbrev];
    if (!nomeBusca) {
      problemas.push({ motivo: `Sigla de disciplina "${item.disciplinaAbrev}" sem tradução conhecida`, item });
      continue;
    }
    const disc = disciplinaPorNomeNorm.get(nomeBusca);
    if (!disc) {
      problemas.push({ motivo: `Disciplina "${nomeBusca}" (de "${item.disciplinaAbrev}") nao encontrada no banco`, item });
      continue;
    }

    const nomeProfNorm = normalizar(item.professor);
    let prof = professorPorNomeCompleto.get(nomeProfNorm);
    // [FIX] No PDF os professores virtuais aparecem como "HIBRIDA-1NB"
    // (hifen), mas no banco estao cadastrados como "Hibrida (1NB)"
    // (parenteses, ligado via professor_disciplinas). Trata esse caso
    // especial antes de cair no fallback de "nao encontrado".
    if (!prof) {
      const mHibrida = item.professor.match(/^HIBRIDA-(.+)$/i);
      if (mHibrida) {
        const alvo = normalizar(`Hibrida (${mHibrida[1]})`);
        prof = professores.find((p) => normalizar(p.nome) === alvo);
      }
    }
    if (!prof) {
      const candidatos = professorPorPrimeiroNome.get(nomeProfNorm.split(" ")[0]) ?? [];
      if (candidatos.length === 1) {
        prof = candidatos[0];
      } else if (candidatos.length > 1) {
        problemas.push({
          motivo: `Professor "${item.professor}" ambiguo -- ${candidatos.length} candidatos no banco: ${candidatos.map((c) => c.nome).join(", ")}`,
          item,
        });
        continue;
      }
    }
    if (!prof) {
      problemas.push({ motivo: `Professor "${item.professor}" nao encontrado no banco`, item });
      continue;
    }

    resolvidas.push({
      turmaId: turma.id,
      turmaNome: turma.nome,
      disciplinaId: disc.id,
      disciplinaNome: disc.nome,
      professorId: prof.id,
      professorNome: prof.nome,
      diaSemana: item.dia,
      numeroAula: item.numeroAula,
    });
  }

  console.log("=".repeat(70));
  console.log("DRY-RUN -- Importação da grade oficial NOTURNO (27/07 a 31/07)");
  console.log("=".repeat(70));
  console.log(`\nTotal de aulas extraídas do PDF: ${AULAS_EXTRAIDAS.length}`);
  console.log(`Resolvidas com sucesso (turma+disciplina+professor encontrados): ${resolvidas.length}`);
  console.log(`Com problema (precisam de revisão manual): ${problemas.length}`);

  if (problemas.length > 0) {
    console.log("\n--- PROBLEMAS (nada relacionado a isso seria importado) ---");
    const agrupados = new Map<string, number>();
    for (const p of problemas) {
      agrupados.set(p.motivo, (agrupados.get(p.motivo) ?? 0) + 1);
    }
    for (const [motivo, qtd] of agrupados) {
      console.log(`  [${qtd}x] ${motivo}`);
    }
  }

  // compara com o que ja esta gravado hoje como grade oficial
  const chaveAtual = (h: { turmaId: number; diaSemana: number; numeroAula: number }) =>
    `${h.turmaId}-${h.diaSemana}-${h.numeroAula}`;
  const atuaisMap = new Map(horariosAtuaisNoturno.map((h) => [chaveAtual(h), h]));
  const novasMap = new Map(resolvidas.map((r) => [chaveAtual(r), r]));

  let iguais = 0;
  let diferentes = 0;
  let novos = 0;
  for (const [chave, nova] of novasMap) {
    const atual = atuaisMap.get(chave);
    if (!atual) {
      novos++;
    } else if (atual.disciplinaId === nova.disciplinaId && atual.professorId === nova.professorId) {
      iguais++;
    } else {
      diferentes++;
    }
  }
  let removidos = 0;
  for (const chave of atuaisMap.keys()) {
    if (!novasMap.has(chave)) removidos++;
  }

  console.log("\n--- COMPARAÇÃO COM A GRADE OFICIAL ATUAL ---");
  console.log(`  Slots iguais (nada muda): ${iguais}`);
  console.log(`  Slots diferentes (disciplina/professor mudaria): ${diferentes}`);
  console.log(`  Slots novos (não existem hoje, seriam criados): ${novos}`);
  console.log(`  Slots que seriam REMOVIDOS (existem hoje mas não vieram do PDF novo): ${removidos}`);

  writeFileSync(
    "scripts/dry-run-resultado-noturno.json",
    JSON.stringify({ resolvidas, problemas, resumo: { iguais, diferentes, novos, removidos } }, null, 2),
    "utf-8",
  );
  console.log("\nRelatório completo salvo em: scripts/dry-run-resultado-noturno.json");
  console.log("\nNENHUMA alteração foi feita no banco (dry-run).");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
