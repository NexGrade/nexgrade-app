const fs = require('fs');

const ARQUIVO = 'C:\\Projetos\\nexgrade-app\\artifacts\\api-server\\src\\routes\\horarios.ts';
const APLICAR = process.argv.includes('--aplicar');

const ANTIGO = [
  '  };',
  '  // [TEMP-DEBUG] log temporario pra diagnosticar 3D TEC -- remover depois',
  '  console.log("[DEBUG-CPSAT-PAYLOAD]", JSON.stringify(payload));',
].join("\n");

const NOVO = '  };';

function main() {
  const bruto = fs.readFileSync(ARQUIVO, 'utf8');
  const usaCRLF = bruto.includes('\r\n');
  const conteudo = bruto.replace(/\r\n/g, '\n');
  const antigoNorm = ANTIGO.replace(/\r\n/g, '\n');

  console.log(APLICAR ? 'MODO: APLICAR' : 'MODO: DRY-RUN');
  const ocorrencias = conteudo.split(antigoNorm).length - 1;
  console.log(`Ocorrências: ${ocorrencias}`);
  if (ocorrencias !== 1) {
    console.error(`ERRO: esperava exatamente 1 ocorrência, achei ${ocorrencias}.`);
    process.exit(1);
  }

  let novoConteudo = conteudo.replace(antigoNorm, NOVO.replace(/\r\n/g, '\n'));
  if (usaCRLF) novoConteudo = novoConteudo.replace(/\n/g, '\r\n');

  if (APLICAR) {
    fs.writeFileSync(`${ARQUIVO}.bak-removedebug`, bruto, 'utf8');
    fs.writeFileSync(ARQUIVO, novoConteudo, 'utf8');
    console.log(`\n✓ Gravado. Backup em: ${ARQUIVO}.bak-removedebug`);
  } else {
    console.log('\n(dry-run) Nada foi gravado. Rode com --aplicar para gravar de verdade.');
  }
}

main();
