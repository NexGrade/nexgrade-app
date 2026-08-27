/**
 * diagnosticar-anchor.cjs
 * Busca o trecho "cpsatTurmaForm, setCpsatTurmaForm" no arquivo real
 * e mostra o contexto exato (com espacos/tabs visiveis) pra eu conseguir
 * montar a ancora certa.
 */
const fs = require('fs');
const path = require('path');

const ALVO = path.join('artifacts', 'horario-escolar', 'src', 'pages', 'horario', 'index.tsx');
const conteudo = fs.readFileSync(ALVO, 'utf8');

const marcador = 'setCpsatTurmaForm] = useState({';
const idx = conteudo.indexOf(marcador);
if (idx === -1) {
  console.log('NAO ACHOU o marcador basico. Algo mudou muito.');
  process.exit(1);
}

// Pega 400 caracteres a partir do marcador, e mostra com \n e \t visiveis
const trecho = conteudo.slice(idx - 20, idx + 400);
console.log('=== TRECHO BRUTO (com \\n e \\t marcados) ===');
console.log(JSON.stringify(trecho));
console.log('\n=== TRECHO LEGIVEL ===');
console.log(trecho);
