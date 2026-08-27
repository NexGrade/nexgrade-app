// Atualiza nome completo e e-mail real de professores do Mário Braga,
// cruzados com o cadastro já validado do Click Reserva (mesmas pessoas,
// confirmado manualmente pela coordenação).
// NAO mescla registros duplicados (ex: "Eliane" id 619 vs "Eliane Rocha"
// id 620, que apontam pro mesmo nome/e-mail) -- so atualiza campos.
//
// Uso:
//   node atualizar-professores-nexgrade.cjs            -> dry-run (ROLLBACK)
//   node atualizar-professores-nexgrade.cjs --aplicar   -> aplica de verdade (COMMIT)

const { Client } = require("pg");
const APLICAR = process.argv.includes("--aplicar");
const ESCOLA_ID = "org_3HCMsuYeAwkggR1dxXNzEdzNaX8"; // C.E. Prof. Mário B.T. Braga

const ATUALIZACOES = [
  { id: 598, nome: 'Aline Nunes da Silva', email: 'silva.aline3@escola.pr.gov.br' },
  { id: 599, nome: 'Anderson dos Santos Mazur', email: 'anderson.mazur@escola.pr.gov.br' },
  { id: 600, nome: 'Andre Pizoni Cardoso', email: 'andre.cardoso26@escola.pr.gov.br' },
  { id: 602, nome: 'Antônio Carlos da Silva', email: 'antonio.silva6@escola.pr.gov.br' },
  { id: 603, nome: 'Arnaldo Veiga de Sousa', email: 'arnaldo.sousa@escola.pr.gov.vr' },
  { id: 832, nome: 'Camila Teixeira de Castro', email: 'camila.castro@escola.pr.gov.br' },
  { id: 604, nome: 'Carlos Eduardo M dos Santos', email: 'carlos.santos11@escola.pr.gov.br' },
  { id: 605, nome: 'Cecília Favoretto Jez', email: 'cecilia.jez@escola.pr.gov.br' },
  { id: 607, nome: 'Chrystian Savano Grassi', email: 'chrystian.grassi@escola.pr.gov.br' },
  { id: 608, nome: 'Cleide Aparecida Soares', email: 'cleide.soares@escola.pr.gov.br' },
  { id: 609, nome: 'Crislaine Lourenco Franco', email: 'crislaine.franco@escola.pr.gov.br' },
  { id: 615, nome: 'Eduarda Poliana Pauluk dos Santos', email: 'eduarda.pauluk.santos@escola.pr.gov.br' },
  { id: 619, nome: 'Eliane Rocha', email: 'francisco.eliane@escola.pr.gov.br' },
  { id: 620, nome: 'Eliane Rocha', email: 'francisco.eliane@escola.pr.gov.br' },
  { id: 621, nome: 'Elisabete', email: 'elisabete.rosa@escola.pr.gov.br' },
  { id: 625, nome: 'Fernanda Rizzi Galerani', email: 'fernanda.galerani@escola.pr.gov.br' },
  { id: 626, nome: 'Franciele de Assis Timotio', email: 'franciele.de.assis@escola.pr.gov.br' },
  { id: 627, nome: 'Francielle Salomé Conti', email: 'francielle.conti.costa@escola.pr.gov.br' },
  { id: 628, nome: 'Gabriela Costa', email: 'gabriela.faria.costa@escola.pr.gov.br' },
  { id: 629, nome: 'Geovani Borges Valente da Silva Carvalho', email: 'carvalho.geovani@escola.pr.gov.br' },
  { id: 630, nome: 'Geverson Luiz de Oliveira', email: 'geverson.oliveira@escola.pr.gov.br' },
  { id: 632, nome: 'Gleiciane Pauluk Rosario', email: 'gleiciane.rosario@escola.pr.gov.br' },
  { id: 633, nome: 'Gustavo Batista Santos', email: 'gustavo.batista.santos15@escola.pr.gov.br' },
  { id: 636, nome: 'Herica Carmo Gomes', email: 'herica.gomes@escola.pr.gov.br' },
  { id: 637, nome: 'Ione de Almeida Santos', email: 'santos.ione@escola.pr.gov.br' },
  { id: 638, nome: 'Ivanir', email: 'silvanir@escola.pr.gov.br' },
  { id: 639, nome: 'Ivete Aparecida da Silveira da Silveira', email: 'ivete.silveira@escola.pr.gov.br' },
  { id: 641, nome: 'Janice Michel de Jesus', email: 'janice.jesus@escola.pr.gov.br' },
  { id: 642, nome: 'Jordana Franco Cordeiro', email: 'cordeiro.jordana@escola.pr.gov.br' },
  { id: 645, nome: 'Julio Cesar dos Santos', email: 'valentin.julio@escola.pr.gov.br' },
  { id: 646, nome: 'Kethelin Luana de Almeida', email: 'almeida.kethelin@escola.pr.gov.br' },
  { id: 648, nome: 'Lorena', email: 'lorena.denis@escola.pr.gov.br' },
  { id: 651, nome: 'Márcio Augusto', email: 'marcio.augusto.lima@escola.pr.gov.br' },
  { id: 653, nome: 'Marise', email: 'marise.brunet@escola.pr.gov.br' },
  { id: 654, nome: 'Maristela de Fatima Worell Pasdiora', email: 'maristela.pasdiora@escola.pr.gov.br' },
  { id: 656, nome: 'Marta Caetana de Barros', email: 'marta.barros@escola.pr.gov.br' },
  { id: 657, nome: 'Matheus Tavares', email: 'matheus.tavares.costa@escola.pr.gov.br' },
  { id: 658, nome: 'Melina Gunha', email: 'melina.gunha@escola.pr.gov.br' },
  { id: 662, nome: 'Paulo Xavier', email: 'paulo.nunes.xavier@escola.pr.gov.br' },
  { id: 663, nome: 'Pedro Antonio Marcolino', email: 'marcolino.pedro@escola.pr.gov.br' },
  { id: 665, nome: 'Rafael Belo', email: 'rafael.belo.santos@escola.pr.gov.br' },
  { id: 668, nome: 'Robson dos Santos Amaral', email: 'robson.santos.amaral@escola.pr.gov.br' },
  { id: 669, nome: 'Rodrigo Alves dos Santos', email: 'srodrigo@escola.pr.gov.br' },
  { id: 670, nome: 'Salete Goncalo de Siqueira', email: 'salete.siqueira@escola.pr.gov.br' },
  { id: 674, nome: 'Soneide Santos', email: 'soneide.santos@escola.pr.gov.br' },
  { id: 675, nome: 'Luiz Antonio Sypriano', email: 'luiz.sypriano@escola.pr.gov.br' },
  { id: 676, nome: 'Tiago Manika Adamoski', email: 'tiago.adamoski@escola.pr.gov.br' },
  { id: 678, nome: 'Wellington de Souza Machado', email: 'wellington.souza.machado@escola.pr.gov.br' },
  { id: 679, nome: 'Werediana Cordeiro', email: 'werediana.cordeiro@escola.pr.gov.br' },
];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("ERRO: DATABASE_URL não definida nesta sessão.");
    process.exit(1);
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query("BEGIN");
    let aplicados = 0;

    for (const u of ATUALIZACOES) {
      const antes = (await client.query(
        `SELECT id, nome, email FROM professores WHERE id = $1 AND escola_id = $2`,
        [u.id, ESCOLA_ID]
      )).rows[0];
      if (!antes) {
        console.log(`  [PULADO] id ${u.id} não encontrado nessa escola.`);
        continue;
      }
      await client.query(
        `UPDATE professores SET nome = $1, email = $2 WHERE id = $3`,
        [u.nome, u.email, u.id]
      );
      console.log(`  [${u.id}] "${antes.nome}" / "${antes.email}"  ->  "${u.nome}" / "${u.email}"`);
      aplicados++;
    }

    console.log(`\nTotal atualizado: ${aplicados}/${ATUALIZACOES.length}`);

    if (APLICAR) {
      await client.query("COMMIT");
      console.log("\n✅ APLICADO.");
    } else {
      await client.query("ROLLBACK");
      console.log("\n🔎 DRY-RUN — nada foi salvo. Revise a lista acima e rode com --aplicar.");
    }
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("ERRO:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}
main();
