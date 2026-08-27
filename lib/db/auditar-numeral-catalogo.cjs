/**
 * auditar-numeral-catalogo.cjs
 *
 * Script SOMENTE LEITURA — não altera nada no banco.
 *
 * Varre disciplinas_catalogo em busca de nomes terminados em numeral
 * arábico (ex: "Física 2", "Banco de Dados 1") que violam o padrão de
 * produto definido (variantes numeradas por nível sempre usam romano:
 * I, II, III...).
 *
 * Isso complementa o pente-fino anterior, que só detectava CONFLITOS
 * (mesmo nome em romano e arábico ao mesmo tempo) — este script pega
 * também os casos "solitários" em arábico, sem duplicata correspondente.
 *
 * Uso:
 *   node lib\db\auditar-numeral-catalogo.cjs
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function carregarDatabaseUrl() {
  const envPath = path.join(__dirname, '.env');
  const conteudo = fs.readFileSync(envPath, 'utf8');
  const linha = conteudo
    .split('\n')
    .find((l) => l.trim().startsWith('DATABASE_URL='));
  if (!linha) throw new Error('DATABASE_URL não encontrada no .env');
  let valor = linha.slice(linha.indexOf('=') + 1).trim();
  valor = valor.replace(/^["']|["']$/g, '');
  return valor;
}

// Detecta nome terminado em " <número>" (arábico), ex: "Física 2"
const REGEX_ARABICO = /\s(\d+)$/;
// Detecta nome terminado em " <romano>" (I, II, III, IV...), ex: "Física II"
const REGEX_ROMANO = /\s(I|II|III|IV|V|VI|VII|VIII|IX|X)$/;

async function main() {
  const connectionString = carregarDatabaseUrl();
  const client = new Client({ connectionString });
  await client.connect();

  try {
    const { rows } = await client.query(
      'SELECT id, nome FROM disciplinas_catalogo ORDER BY nome'
    );

    const arabicos = rows.filter((r) => REGEX_ARABICO.test(r.nome || ''));

    console.log(`Total de disciplinas no catálogo: ${rows.length}`);
    console.log(`Entradas terminadas em numeral arábico: ${arabicos.length}\n`);

    if (arabicos.length === 0) {
      console.log('Nenhuma violação encontrada — catálogo já 100% em romano.');
    } else {
      console.log('id\tnome\t\t\t\t-> sugestão');
      for (const r of arabicos) {
        const match = r.nome.match(REGEX_ARABICO);
        const numeroArabico = parseInt(match[1], 10);
        const romanos = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
        const romano = romanos[numeroArabico] || `[${numeroArabico}?]`;
        const nomeBase = r.nome.slice(0, match.index);
        const sugestao = `${nomeBase} ${romano}`;
        console.log(`${r.id}\t"${r.nome}"\t-> "${sugestao}"`);
      }
    }

    // Bônus: verificar se alguma sugestão colidiria com uma entrada romana já existente
    console.log('\n--- Checagem de colisão (sugestão já existe como outra linha?) ---');
    const nomesExistentes = new Set(rows.map((r) => r.nome));
    let colisoes = 0;
    for (const r of arabicos) {
      const match = r.nome.match(REGEX_ARABICO);
      const numeroArabico = parseInt(match[1], 10);
      const romanos = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
      const romano = romanos[numeroArabico] || `[${numeroArabico}?]`;
      const nomeBase = r.nome.slice(0, match.index);
      const sugestao = `${nomeBase} ${romano}`;
      if (nomesExistentes.has(sugestao)) {
        console.log(`[COLISÃO] id=${r.id} "${r.nome}" -> "${sugestao}" já existe como outra linha — precisa MERGE, não rename simples.`);
        colisoes++;
      }
    }
    if (colisoes === 0) console.log('Nenhuma colisão — todas as correções podem ser rename simples.');

  } finally {
    await client.end();
  }
}

main();
