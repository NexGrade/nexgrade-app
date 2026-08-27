const fs = require('fs');
const conteudo = fs.readFileSync('artifacts/api-server/src/routes/horarios.ts', 'utf8');
const linhas = conteudo.split(/\r\n|\n/);
// linha 1085 no editor = indice 1084
for (let i = 1078; i <= 1090; i++) {
  const l = linhas[i - 1];
  if (l === undefined) continue;
  console.log(`${i}: ${JSON.stringify(l)}`);
}
