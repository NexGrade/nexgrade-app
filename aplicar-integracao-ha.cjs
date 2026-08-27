const fs = require('fs');
const path = require('path');

const ALVO = path.join('artifacts', 'api-server', 'src', 'routes', 'horarios.ts');
const APLICAR = process.argv.includes('--aplicar');

const EDITS = [
  {
    nome: '1) Import da funcao de recalculo',
    antigo: `import { getEscolaId } from "../lib/escola-id";
import { randomUUID } from "node:crypto";`,
    novo: `import { getEscolaId } from "../lib/escola-id";
import { randomUUID } from "node:crypto";
import { recalcularHoraAtividade } from "../lib/recalcular-ha";`,
  },
  {
    nome: '2) Recalculo apos promover experimento pra oficial',
    antigo: `    await tx.delete(horariosExperimentaisTable)
      .where(and(eq(horariosExperimentaisTable.nome, nome), eq(horariosExperimentaisTable.escolaId, escolaId)));
    return gravados;
  });

  res.json({ slotsGerados: inserted.length, conflitos: [], horario: [] });
});`,
    novo: `    await tx.delete(horariosExperimentaisTable)
      .where(and(eq(horariosExperimentaisTable.nome, nome), eq(horariosExperimentaisTable.escolaId, escolaId)));
    return gravados;
  });

  try {
    await recalcularHoraAtividade(escolaId);
  } catch (err) {
    console.error("[HA] Falha ao recalcular hora-atividade apos promover:", err);
  }

  res.json({ slotsGerados: inserted.length, conflitos: [], horario: [] });
});`,
  },
  {
    nome: '3) Recalculo apos geracao direta (nao-experimental)',
    antigo: `      experimental: data.experimental ?? false,
      nomeExperimental: data.nomeExperimental,
    });
    res.json(result);
  } catch (err) {`,
    novo: `      experimental: data.experimental ?? false,
      nomeExperimental: data.nomeExperimental,
    });
    if (!(data.experimental ?? false)) {
      try {
        await recalcularHoraAtividade(escolaId);
      } catch (errHA) {
        console.error("[HA] Falha ao recalcular hora-atividade apos geracao direta:", errHA);
      }
    }
    res.json(result);
  } catch (err) {`,
  },
  {
    nome: '4) Recalculo apos corrigir-professor (quando algo mudou)',
    antigo: `  res.json({ professorId, professorNome: professor.nome, movidas, naoResolvidas });`,
    novo: `  if (movidas.length > 0) {
    try {
      await recalcularHoraAtividade(escolaId);
    } catch (err) {
      console.error("[HA] Falha ao recalcular hora-atividade apos corrigir-professor:", err);
    }
  }

  res.json({ professorId, professorNome: professor.nome, movidas, naoResolvidas });`,
  },
];

function main() {
  if (!fs.existsSync(ALVO)) throw new Error(`Arquivo nao encontrado: ${ALVO}`);
  const bruto = fs.readFileSync(ALVO, 'utf8');
  const usaCRLF = bruto.includes('\r\n');
  let conteudo = bruto.replace(/\r\n/g, '\n');
  console.log(`Modo: ${APLICAR ? 'APLICAR' : 'DRY-RUN'}\n`);
  for (const edit of EDITS) {
    const antigoNorm = edit.antigo.replace(/\r\n/g, '\n');
    const novoNorm = edit.novo.replace(/\r\n/g, '\n');
    const ocorrencias = conteudo.split(antigoNorm).length - 1;
    if (ocorrencias === 0) throw new Error(`[FALHA] "${edit.nome}": trecho nao encontrado.`);
    if (ocorrencias > 1) throw new Error(`[FALHA] "${edit.nome}": aparece ${ocorrencias}x, esperava 1.`);
    conteudo = conteudo.split(antigoNorm).join(novoNorm);
    console.log(`OK ${edit.nome}`);
  }
  const conteudoFinal = usaCRLF ? conteudo.replace(/\n/g, '\r\n') : conteudo;
  if (APLICAR) {
    const backupPath = ALVO + `.backup-${Date.now()}`;
    fs.copyFileSync(ALVO, backupPath);
    fs.writeFileSync(ALVO, conteudoFinal, { encoding: 'utf8' });
    console.log(`\nAplicado. Backup: ${backupPath}`);
  } else {
    fs.writeFileSync(ALVO + '.preview-ha.ts', conteudoFinal, { encoding: 'utf8' });
    console.log('\nDRY-RUN OK. Preview salvo.');
  }
}
main();
