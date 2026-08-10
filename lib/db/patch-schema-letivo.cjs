const fs = require('fs');

const ARQUIVO = 'C:\\Projetos\\nexgrade-app\\lib\\db\\src\\schema\\horarios_slots.ts';
const APLICAR = process.argv.includes('--aplicar');

const PATCH1_ANTIGO = 'import { pgTable, text, serial, timestamp, integer, time } from "drizzle-orm/pg-core";';
const PATCH1_NOVO = 'import { pgTable, text, serial, timestamp, integer, time, boolean } from "drizzle-orm/pg-core";';

const PATCH2_ANTIGO = [
  '  duracaoMinutos: integer("duracao_minutos").notNull().default(50),',
  '  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),',
  '});',
].join("\n");

const PATCH2_NOVO = [
  '  duracaoMinutos: integer("duracao_minutos").notNull().default(50),',
  '  // [NOVO] Fonte da verdade sobre se este periodo e aula de verdade ou',
  '  // so um horario de entrada/intervalo que ocupa um numero de aula no',
  '  // grid (ex.: periodo 0 do noturno no Mario Braga). Antes disso era',
  '  // assumido via "numeroAula >= 1" espalhado pelo codigo, que quebrou',
  '  // quando a Arlinda cadastrou um periodo 0 que E aula de verdade --',
  '  // agora e explicito por escola em vez de um numero magico universal.',
  '  letivo: boolean("letivo").notNull().default(true),',
  '  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),',
  '});',
].join("\n");

const PATCHES = [
  { nome: 'Import do boolean', antigo: PATCH1_ANTIGO, novo: PATCH1_NOVO },
  { nome: 'Campo letivo na tabela', antigo: PATCH2_ANTIGO, novo: PATCH2_NOVO },
];

function main() {
  const bruto = fs.readFileSync(ARQUIVO, 'utf8');
  const usaCRLF = bruto.includes('\r\n');
  let conteudo = bruto.replace(/\r\n/g, '\n');

  console.log(APLICAR ? 'MODO: APLICAR' : 'MODO: DRY-RUN');
  console.log(`Arquivo usa CRLF: ${usaCRLF}\n`);

  let tudoOk = true;
  for (const p of PATCHES) {
    const antigoNorm = p.antigo.replace(/\r\n/g, '\n');
    const ocorrencias = conteudo.split(antigoNorm).length - 1;
    console.log(`--- ${p.nome} ---`);
    console.log(`Ocorrências: ${ocorrencias}`);
    if (ocorrencias !== 1) {
      console.error(`ERRO: esperava exatamente 1 ocorrência, achei ${ocorrencias}.`);
      tudoOk = false;
      continue;
    }
    conteudo = conteudo.replace(antigoNorm, p.novo.replace(/\r\n/g, '\n'));
    console.log('OK.\n');
  }

  if (!tudoOk) {
    console.error('Algum patch não pôde ser aplicado com segurança. NADA foi gravado.');
    process.exit(1);
  }

  console.log('Todos os patches bateram exatamente 1 ocorrência cada.');

  if (APLICAR) {
    let final = conteudo;
    if (usaCRLF) final = final.replace(/\n/g, '\r\n');
    fs.writeFileSync(`${ARQUIVO}.bak-letivo`, bruto, 'utf8');
    fs.writeFileSync(ARQUIVO, final, 'utf8');
    console.log(`\n✓ Gravado. Backup em: ${ARQUIVO}.bak-letivo`);
  } else {
    console.log('\n(dry-run) Nada foi gravado. Rode com --aplicar para gravar de verdade.');
  }
}

main();
