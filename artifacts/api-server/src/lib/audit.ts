import { db } from "@workspace/db";
import { auditLogsTable } from "@workspace/db";
import type { Request } from "express";
import { getAuth } from "@clerk/express";

type Acao = "criacao" | "alteracao" | "exclusao" | "consulta";

// RF-AUD-01: registro central de auditoria. Toda rota de escrita de
// entidade sensível (professor, turma, disciplina, curso/matriz, sala,
// licença, comunicado, configuração) deve chamar isto depois de
// persistir a mudança, passando o estado anterior (null em criação) e o
// estado novo (null em exclusão).
//
// [NOVO] "consulta" cobre um caso diferente: LEITURA de dado sensível
// que vale rastrear (ex: download do catálogo de matrizes oficiais
// SEED-PR) -- não há "antes/depois" nesse caso, dadosAnteriores e
// dadosNovos costumam vir null ou só com metadado leve.
export async function registrarAuditoria(params: {
  req: Request;
  escolaId: string;
  entidade: string;
  entidadeId: number;
  acao: Acao;
  dadosAnteriores: unknown;
  dadosNovos: unknown;
}): Promise<void> {
  const { userId } = getAuth(params.req);
  await db.insert(auditLogsTable).values({
    escolaId: params.escolaId,
    entidade: params.entidade,
    entidadeId: params.entidadeId,
    acao: params.acao,
    dadosAnteriores: params.dadosAnteriores as any,
    dadosNovos: params.dadosNovos as any,
    usuarioId: userId,
    usuarioNome: null,
    ip: params.req.ip ?? null,
  });
}
