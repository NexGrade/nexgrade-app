/**
 * aplicar-fix-healthz.cjs
 *
 * Corrige o bug em aguardarCpsatServiceAcordado (horarios.ts): a
 * funcao checava CPSAT_SERVICE_URL + "/api/healthz", rota que NUNCA
 * existiu no nexgrade-cpsat (main.py so define "/" e "/gerar-grade").
 * Isso fazia toda geracao perder ate 90s (maxEsperaMs) batendo num
 * endpoint que sempre retorna 404, antes mesmo de tentar o solve de
 * verdade.
 *
 * Uso:
 *   node aplicar-fix-healthz.cjs            (dry-run)
 *   node aplicar-fix-healthz.cjs --aplicar   (aplica de fato, com backup)
 */
const fs = require('fs');
const path = require('path');

const ALVO = path.join('artifacts', 'api-server', 'src', 'routes', 'horarios.ts');
const APLICAR = process.argv.includes('--aplicar');

function main() {
  if (!fs.existsSync(ALVO)) {
    throw new Error(`Arquivo nao encontrado: ${ALVO} (rode da raiz do projeto)`);
  }
  const bruto = fs.readFileSync(ALVO, 'utf8');
  const usaCRLF = bruto.includes('\r\n');
  let conteudo = bruto.replace(/\r\n/g, '\n');

  const ANTIGO = 'const response = await fetch(`${CPSAT_SERVICE_URL}/api/healthz`, { signal: controller.signal });';
  const NOVO = 'const response = await fetch(`${CPSAT_SERVICE_URL}/`, { signal: controller.signal }); // [FIX-HEALTHZ] nexgrade-cpsat so tem "/" e "/gerar-grade" -- "/api/healthz" nunca existiu nesse servico, sempre dava 404 e desperdicava ate 90s por geracao.';

  const ocorrencias = conteudo.split(ANTIGO).length - 1;
  if (ocorrencias === 0) {
    throw new Error('[FALHA] Trecho antigo nao encontrado -- o arquivo pode ter mudado desde a ultima leitura.');
  }
  if (ocorrencias > 1) {
    throw new Error(`[FALHA] Trecho antigo aparece ${ocorrencias} vezes -- esperava exatamente 1. Abortando por seguranca.`);
  }

  conteudo = conteudo.split(ANTIGO).join(NOVO);
  const conteudoFinal = usaCRLF ? conteudo.replace(/\n/g, '\r\n') : conteudo;

  console.log('Substituição encontrada e aplicada (1 ocorrência).');

  if (APLICAR) {
    const backupPath = ALVO + `.backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    fs.copyFileSync(ALVO, backupPath);
    fs.writeFileSync(ALVO, conteudoFinal, { encoding: 'utf8' });
    console.log(`✅ Aplicado. Backup: ${backupPath}`);
  } else {
    const previewPath = ALVO + '.preview-fix-healthz.ts';
    fs.writeFileSync(previewPath, conteudoFinal, { encoding: 'utf8' });
    console.log(`↩️  DRY-RUN. Preview salvo em: ${previewPath}`);
  }
}

main();
