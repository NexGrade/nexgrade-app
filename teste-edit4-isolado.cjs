const fs = require('fs');
const ALVO = 'artifacts/api-server/src/routes/horarios.ts';
const bruto = fs.readFileSync(ALVO, 'utf8');
const conteudo = bruto.replace(/\r\n/g, '\n');

const antigo = '  res.json({ professorId, professorNome: professor.nome, movidas, naoResolvidas });';

const ocorrencias = conteudo.split(antigo).length - 1;
console.log('Ocorrências encontradas (isolado, direto no arquivo real):', ocorrencias);

if (ocorrencias === 0) {
  // procura variantes proximas pra achar a diferenca real
  const idx = conteudo.indexOf('res.json({ professorId, professorNome: professor.nome, movidas');
  if (idx === -1) {
    console.log('Nem o inicio da linha foi encontrado. Algo mudou bem mais.');
  } else {
    const trecho = conteudo.slice(idx - 5, idx + 90);
    console.log('Trecho real encontrado (com contexto):');
    console.log(JSON.stringify(trecho));
  }
}
