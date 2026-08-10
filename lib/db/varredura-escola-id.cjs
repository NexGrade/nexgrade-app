const fs = require('fs');
const path = require('path');

const DIR_ROTAS = 'C:\\Projetos\\nexgrade-app\\artifacts\\api-server\\src\\routes';

// Tabelas que sao "globais" por natureza (nao tem escolaId, ou nao fazem
// sentido escopar) -- exclui do alerta pra reduzir ruido.
const TABELAS_IGNORAR = new Set(['configuracoesTable']); // ajusta se aparecer mais

function extrairBlocos(conteudo) {
  // separa o arquivo em "statements" aproximados: do inicio de uma chamada
  // db.XXX( ate o ; que fecha aquele statement no nivel 0 -- incluindo
  // encadeamentos posteriores como .set({...}).where(...), que vem DEPOIS
  // do parenteses de fechamento do db.metodo(tabela) inicial.
  const blocos = [];
  const regexInicio = /\bdb\s*\.\s*(select|update|delete|insert)\s*\(/g;
  let m;
  while ((m = regexInicio.exec(conteudo)) !== null) {
    const inicio = m.index;
    let i = m.index + m[0].length;
    let profundidade = 1;
    while (i < conteudo.length && profundidade > 0) {
      if (conteudo[i] === '(') profundidade++;
      else if (conteudo[i] === ')') profundidade--;
      i++;
    }
    // continua capturando encadeamentos .algo(...) subsequentes ate achar
    // um ';' no nivel 0 (fim de verdade do statement), nao so o primeiro ')'
    let fim = i;
    let prof2 = 0;
    while (fim < conteudo.length) {
      const c = conteudo[fim];
      if (c === '(') prof2++;
      else if (c === ')') prof2--;
      else if (c === ';' && prof2 <= 0) { fim++; break; }
      fim++;
      if (fim - inicio > 3000) break; // guarda de seguranca
    }
    const linhaNumero = conteudo.slice(0, inicio).split('\n').length;
    blocos.push({ tipo: m[1], inicio, fim, linha: linhaNumero, texto: conteudo.slice(inicio, fim) });
  }
  return blocos;
}

function main() {
  const arquivos = fs.readdirSync(DIR_ROTAS).filter((f) => f.endsWith('.ts'));
  let totalSuspeitos = 0;

  for (const arquivo of arquivos) {
    const caminho = path.join(DIR_ROTAS, arquivo);
    const conteudo = fs.readFileSync(caminho, 'utf8');
    const blocos = extrairBlocos(conteudo);

    const suspeitos = [];
    for (const b of blocos) {
      // so nos interessam blocos que referenciam alguma *Table (tabela real)
      const referenciaTabela = /(\w+Table)/.exec(b.texto);
      if (!referenciaTabela) continue;
      const tabela = referenciaTabela[1];
      if (TABELAS_IGNORAR.has(tabela)) continue;

      // SELECT com from(tabela) e sem where() nenhum: pega tudo da tabela,
      // sempre suspeito (a menos que seja claramente admin-only).
      const temWhere = /\.where\s*\(/.test(b.texto);
      const temEscolaId = /escolaId/.test(b.texto);

      if (b.tipo === 'select' && !temWhere) {
        suspeitos.push({ ...b, tabela, motivo: 'SELECT sem .where() nenhum' });
      } else if (temWhere && !temEscolaId) {
        suspeitos.push({ ...b, tabela, motivo: '.where() presente mas sem escolaId' });
      } else if ((b.tipo === 'update' || b.tipo === 'delete') && !temWhere) {
        suspeitos.push({ ...b, tabela, motivo: `${b.tipo.toUpperCase()} sem .where() nenhum -- risco alto` });
      }
    }

    if (suspeitos.length > 0) {
      console.log(`\n=== ${arquivo} (${suspeitos.length} suspeito(s)) ===`);
      for (const s of suspeitos) {
        console.log(`  linha ~${s.linha}: ${s.tipo.toUpperCase()} ${s.tabela} -- ${s.motivo}`);
      }
      totalSuspeitos += suspeitos.length;
    }
  }

  console.log(`\n\nTotal de arquivos verificados: ${arquivos.length}`);
  console.log(`Total de blocos suspeitos: ${totalSuspeitos}`);
  console.log('\n[NOTA] Isso e uma varredura heuristica baseada em texto, nao um parser de verdade.');
  console.log('Falsos positivos existem (ex.: query que filtra por um ID que ja pertence a uma');
  console.log('turma/professor que foi buscado com escolaId em outra query antes). Cada item');
  console.log('precisa de revisao manual, isso so aponta onde OLHAR primeiro.');
}

main();
