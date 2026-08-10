const fs = require('fs');

const ARQUIVO = 'C:\\Projetos\\nexgrade-app\\artifacts\\horario-escolar\\src\\pages\\professores\\id.tsx';
const APLICAR = process.argv.includes('--aplicar');

const PATCH1_ANTIGO = 'const diasSemana = ["Segunda", "Terca", "Terça", "Quarta", "Quinta", "Sexta"];';
const PATCH2_ANTIGO_BUSCA = 'const diasSemana';

const PATCH_JSX_ANTIGO = [
  '                  </div>',
  '',
  '                  {disciplinasUnicas.length > 0 && (',
].join("\n");
const PATCH_JSX_NOVO = [
  '                  </div>',
  '',
  '                  {cargaData.bloqueiosResumoPorTurno && Object.keys(cargaData.bloqueiosResumoPorTurno).length > 0 && (',
  '                    <div className="space-y-2 pt-2 border-t">',
  '                      <h4 className="text-sm font-medium text-muted-foreground pb-1">Disponibilidade</h4>',
  '                      <div className="space-y-1.5">',
  '                        {Object.entries(cargaData.bloqueiosResumoPorTurno).map(([turno, resumo]) => (',
  '                          <div key={turno} className="text-sm">',
  '                            <span className="font-medium">{TURNO_ROTULO_PROFESSOR[turno] ?? turno}:</span>{" "}',
  '                            <span className="text-muted-foreground">{resumo}</span>',
  '                          </div>',
  '                        ))}',
  '                      </div>',
  '                    </div>',
  '                  )}',
  '',
  '                  {disciplinasUnicas.length > 0 && (',
].join("\n");

function main() {
  const bruto = fs.readFileSync(ARQUIVO, 'utf8');
  const usaCRLF = bruto.includes('\r\n');
  let conteudo = bruto.replace(/\r\n/g, '\n');

  console.log(APLICAR ? 'MODO: APLICAR' : 'MODO: DRY-RUN');
  console.log(`Arquivo usa CRLF: ${usaCRLF}\n`);

  // Patch 1: adiciona a constante TURNO_ROTULO_PROFESSOR logo antes da
  // primeira linha que comeca com "const diasSemana" (import-like consts
  // costumam ficar no topo do arquivo, fora do componente)
  const linhas = conteudo.split("\n");
  const idxDiasSemana = linhas.findIndex((l) => l.trim().startsWith("const diasSemana"));
  console.log(`--- Adiciona TURNO_ROTULO_PROFESSOR ---`);
  if (idxDiasSemana === -1) {
    console.error('ERRO: não achei a linha "const diasSemana" pra ancorar.');
    process.exit(1);
  }
  console.log(`Ancorado na linha ${idxDiasSemana + 1}: "${linhas[idxDiasSemana].trim()}"`);
  const jaTemConstante = conteudo.includes('TURNO_ROTULO_PROFESSOR');
  if (jaTemConstante) {
    console.log('Já existe -- pulando (idempotente).\n');
  } else {
    linhas.splice(idxDiasSemana, 0, 'const TURNO_ROTULO_PROFESSOR: Record<string, string> = { matutino: "Manhã", vespertino: "Tarde", noturno: "Noite" };');
    console.log('OK.\n');
  }
  conteudo = linhas.join("\n");

  // Patch 2: JSX
  console.log(`--- Adiciona secao de Disponibilidade no JSX ---`);
  const antigoNorm = PATCH_JSX_ANTIGO.replace(/\r\n/g, '\n');
  const ocorrencias = conteudo.split(antigoNorm).length - 1;
  console.log(`Ocorrências: ${ocorrencias}`);
  if (ocorrencias !== 1) {
    console.error(`ERRO: esperava exatamente 1 ocorrência, achei ${ocorrencias}.`);
    process.exit(1);
  }
  conteudo = conteudo.replace(antigoNorm, PATCH_JSX_NOVO.replace(/\r\n/g, '\n'));
  console.log('OK.\n');

  console.log('Todos os patches aplicados com segurança.');

  if (APLICAR) {
    let final = conteudo;
    if (usaCRLF) final = final.replace(/\n/g, '\r\n');
    fs.writeFileSync(`${ARQUIVO}.bak-disponibilidade`, bruto, 'utf8');
    fs.writeFileSync(ARQUIVO, final, 'utf8');
    console.log(`\n✓ Gravado. Backup em: ${ARQUIVO}.bak-disponibilidade`);
  } else {
    console.log('\n(dry-run) Nada foi gravado. Rode com --aplicar para gravar de verdade.');
  }
}

main();
