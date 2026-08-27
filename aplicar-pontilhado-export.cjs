const fs = require('fs');
const path = require('path');
const ALVO = path.join('artifacts', 'api-server', 'src', 'routes', 'export.ts');
const APLICAR = process.argv.includes('--aplicar');

const antigo = `      const haDoProf: BlocoGrade["slots"] = disponibilidades
        .filter((d) => d.professorId === prof.id && d.horaAtividadeObrigatoria && d.turno === turno)
        .filter((d) => !aulasDoProf.some((a) => a.diaSemana === d.diaSemana && a.numeroAula === d.horarioSlot))
        .map((d) => ({
          diaSemana: d.diaSemana,
          numeroAula: d.horarioSlot,
          linha1: "HA",
          destacado: true,
        }));`;

const novo = `      const haDoProf: BlocoGrade["slots"] = disponibilidades
        .filter((d) => d.professorId === prof.id && d.horaAtividadeObrigatoria && d.turno === turno)
        .filter((d) => !aulasDoProf.some((a) => a.diaSemana === d.diaSemana && a.numeroAula === d.horarioSlot))
        .map((d) => ({
          diaSemana: d.diaSemana,
          numeroAula: d.horarioSlot,
          linha1: "HA",
          destacado: true,
        }));

      // [NOVO] Dia/horario em que o professor esta bloqueado
      // (indisponivel, sem ser HA) nesse turno -- desenhado com
      // hachura pontilhada no PDF quando a celula estiver vazia (ver
      // pdf-grade.ts). So entra aqui quem NAO tem aula real e NAO e HA
      // (os dois ja tem marcacao propria e sempre vencem visualmente).
      const bloqueadasDoProf: NonNullable<BlocoGrade["celulasBloqueadas"]> = disponibilidades
        .filter((d) => d.professorId === prof.id && !d.disponivel && !d.horaAtividadeObrigatoria && d.turno === turno)
        .filter((d) => !aulasDoProf.some((a) => a.diaSemana === d.diaSemana && a.numeroAula === d.horarioSlot))
        .map((d) => ({ diaSemana: d.diaSemana, numeroAula: d.horarioSlot }));`;

function main() {
  if (!fs.existsSync(ALVO)) throw new Error('Arquivo nao encontrado: ' + ALVO);
  const bruto = fs.readFileSync(ALVO, 'utf8');
  const usaCRLF = bruto.includes('\r\n');
  let conteudo = bruto.replace(/\r\n/g, '\n');
  const antigoNorm = antigo.replace(/\r\n/g, '\n');
  const novoNorm = novo.replace(/\r\n/g, '\n');
  const ocorrencias = conteudo.split(antigoNorm).length - 1;
  console.log('Modo:', APLICAR ? 'APLICAR' : 'DRY-RUN');
  console.log('Ocorrencias do trecho antigo (esperado 1):', ocorrencias);
  if (ocorrencias !== 1) { console.error('Abortando -- nao bateu.'); process.exit(1); }

  conteudo = conteudo.split(antigoNorm).join(novoNorm);

  // Segunda edicao: adiciona celulasBloqueadas no objeto do bloco
  const antigo2 = `      blocos.push({
        rotulo,
        horariosPorAula,
        slots: [...aulasDoProf, ...haDoProf],
      });`;
  const novo2 = `      blocos.push({
        rotulo,
        horariosPorAula,
        slots: [...aulasDoProf, ...haDoProf],
        celulasBloqueadas: bloqueadasDoProf,
      });`;
  const antigo2Norm = antigo2.replace(/\r\n/g, '\n');
  const novo2Norm = novo2.replace(/\r\n/g, '\n');
  const ocorrencias2 = conteudo.split(antigo2Norm).length - 1;
  console.log('Ocorrencias do segundo trecho (esperado 1):', ocorrencias2);
  if (ocorrencias2 !== 1) { console.error('Abortando -- segundo trecho nao bateu.'); process.exit(1); }
  conteudo = conteudo.split(antigo2Norm).join(novo2Norm);

  const conteudoFinal = usaCRLF ? conteudo.replace(/\n/g, '\r\n') : conteudo;
  if (APLICAR) {
    const backupPath = ALVO + '.backup-' + Date.now();
    fs.copyFileSync(ALVO, backupPath);
    fs.writeFileSync(ALVO, conteudoFinal, { encoding: 'utf8' });
    console.log('Aplicado. Backup:', backupPath);
  } else {
    fs.writeFileSync(ALVO + '.preview-bloqueio.ts', conteudoFinal, { encoding: 'utf8' });
    console.log('DRY-RUN OK. Preview salvo.');
  }
}
main();
