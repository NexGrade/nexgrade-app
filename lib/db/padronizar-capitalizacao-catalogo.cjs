/**
 * padronizar-capitalizacao-catalogo.cjs
 *
 * Padroniza capitalização (Título Case) de 218 disciplinas do catálogo
 * mestre, identificadas por auditar-capitalizacao-e-duplicatas-catalogo.cjs
 * (Parte A1 - correções seguras, sem acrônimo).
 *
 * EXCLUÍDOS deste lote (revisão manual pendente, heurística errou):
 *   id=862 "Aprendizado de máquina (Machine Learning)" - NÃO mexer no "Machine"
 *   id=565 "Redes neurais e aprendizado profundo (Deep Learning)" - NÃO mexer no "Deep"
 *
 * Uso:
 *   node lib\db\padronizar-capitalizacao-catalogo.cjs            (dry-run, padrão)
 *   node lib\db\padronizar-capitalizacao-catalogo.cjs --aplicar   (aplica de fato)
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function carregarDatabaseUrl() {
  const envPath = path.join(__dirname, '.env');
  const conteudo = fs.readFileSync(envPath, 'utf8');
  const linha = conteudo.split('\n').find((l) => l.trim().startsWith('DATABASE_URL='));
  if (!linha) throw new Error('DATABASE_URL não encontrada no .env');
  let valor = linha.slice(linha.indexOf('=') + 1).trim();
  return valor.replace(/^["']|["']$/g, '');
}

const APLICAR = process.argv.includes('--aplicar');

const CONVERSOES = [
  { id: 3, atual: "Administração de obras", novo: "Administração de Obras" },
  { id: 843, atual: "Administração e economia rural I", novo: "Administração e Economia Rural I" },
  { id: 6, atual: "Administração Nos If", novo: "Administração nos If" },
  { id: 856, atual: "Administração nos meios de hospedagem", novo: "Administração nos Meios de Hospedagem" },
  { id: 7, atual: "Administração portuária", novo: "Administração Portuária" },
  { id: 10, atual: "Agricultura digital", novo: "Agricultura Digital" },
  { id: 11, atual: "Agropecuária digital", novo: "Agropecuária Digital" },
  { id: 12, atual: "Análise ambiental", novo: "Análise Ambiental" },
  { id: 14, atual: "Análise de Dados Aplicada Ao Marketing", novo: "Análise de Dados Aplicada ao Marketing" },
  { id: 16, atual: "Análise e Método Para Sistemas", novo: "Análise e Método para Sistemas" },
  { id: 771, atual: "Análise, controle e química ambiental", novo: "Análise, Controle e Química Ambiental" },
  { id: 27, atual: "Anatomia bucal", novo: "Anatomia Bucal" },
  { id: 28, atual: "Anatomia e escultura dental", novo: "Anatomia e Escultura Dental" },
  { id: 777, atual: "Anatomia e fisiologia da cabeça", novo: "Anatomia e Fisiologia da Cabeça" },
  { id: 765, atual: "Anatomia e fisiologia humana I", novo: "Anatomia e Fisiologia Humana I" },
  { id: 30, atual: "Aplicação e Mapeamento Com Drones", novo: "Aplicação e Mapeamento com Drones" },
  { id: 803, atual: "Armazenagem e gestão de estoque", novo: "Armazenagem e Gestão de Estoque" },
  { id: 37, atual: "Aspectos geográficos, culturais, históricos e turísticos do Paraná", novo: "Aspectos Geográficos, Culturais, Históricos e Turísticos do Paraná" },
  { id: 47, atual: "Automação e robótica", novo: "Automação e Robótica" },
  { id: 48, atual: "Automação industrial", novo: "Automação Industrial" },
  { id: 49, atual: "Automatização e Precisão Na Pecuária", novo: "Automatização e Precisão na Pecuária" },
  { id: 779, atual: "Biossegurança e controle biológico", novo: "Biossegurança e Controle Biológico" },
  { id: 67, atual: "Cadeias produtivas e agroindústria", novo: "Cadeias Produtivas e Agroindústria" },
  { id: 69, atual: "Canais de distribuição", novo: "Canais de Distribuição" },
  { id: 76, atual: "Comunicação de marketing", novo: "Comunicação de Marketing" },
  { id: 844, atual: "Comunicação e atendimento ao cliente", novo: "Comunicação e Atendimento ao Cliente" },
  { id: 83, atual: "Contação de histórias", novo: "Contação de Histórias" },
  { id: 84, atual: "Controlador lógico programável", novo: "Controlador Lógico Programável" },
  { id: 86, atual: "Controle de processos industriais", novo: "Controle de Processos Industriais" },
  { id: 93, atual: "Cozinha brasileira", novo: "Cozinha Brasileira" },
  { id: 94, atual: "Cozinha fria", novo: "Cozinha Fria" },
  { id: 95, atual: "Cozinha internacional", novo: "Cozinha Internacional" },
  { id: 847, atual: "Cozinha vegetariana e restritiva", novo: "Cozinha Vegetariana e Restritiva" },
  { id: 107, atual: "Desenho elétrico", novo: "Desenho Elétrico" },
  { id: 837, atual: "Design e criação do vestuário", novo: "Design e Criação do Vestuário" },
  { id: 125, atual: "Documentação técnica", novo: "Documentação Técnica" },
  { id: 773, atual: "Educação ambiental", novo: "Educação Ambiental" },
  { id: 127, atual: "Educação ambiental I", novo: "Educação Ambiental I" },
  { id: 863, atual: "Educação midiática", novo: "Educação Midiática" },
  { id: 851, atual: "Empreendedorismo e inovação", novo: "Empreendedorismo e Inovação" },
  { id: 858, atual: "Empreendedorismo e inovação na hospedagem", novo: "Empreendedorismo e Inovação na Hospedagem" },
  { id: 806, atual: "Empreendedorismo e plano de negócio", novo: "Empreendedorismo e Plano de Negócio" },
  { id: 788, atual: "Equipamentos e comandos", novo: "Equipamentos e Comandos" },
  { id: 153, atual: "Espanhol técnico", novo: "Espanhol Técnico" },
  { id: 159, atual: "Estratégias de marketing", novo: "Estratégias de Marketing" },
  { id: 160, atual: "Estratégias na Manutenção – Estratégias e Qualidade Na Manutenção", novo: "Estratégias na Manutenção – Estratégias e Qualidade na Manutenção" },
  { id: 163, atual: "Expressão corporal", novo: "Expressão Corporal" },
  { id: 905, atual: "Filosofia Análises de textos Filosóficos", novo: "Filosofia Análises de Textos Filosóficos" },
  { id: 821, atual: "Fundamentos da biotecnologia", novo: "Fundamentos da Biotecnologia" },
  { id: 658, atual: "Fundamentos da fisiopatologia", novo: "Fundamentos da Fisiopatologia" },
  { id: 835, atual: "Fundamentos da indústria e do vestuário", novo: "Fundamentos da Indústria e do Vestuário" },
  { id: 815, atual: "Fundamentos da programação de jogos digitais", novo: "Fundamentos da Programação de Jogos Digitais" },
  { id: 657, atual: "Fundamentos de farmácia", novo: "Fundamentos de Farmácia" },
  { id: 808, atual: "Fundamentos do marketing", novo: "Fundamentos do Marketing" },
  { id: 811, atual: "Fundamentos e arquitetura de computadores I", novo: "Fundamentos e Arquitetura de Computadores I" },
  { id: 205, atual: "Game e design", novo: "Game e Design" },
  { id: 212, atual: "Gestão da atividade turística", novo: "Gestão da Atividade Turística" },
  { id: 823, atual: "Gestão da qualidade", novo: "Gestão da Qualidade" },
  { id: 228, atual: "Gestão de eventos", novo: "Gestão de Eventos" },
  { id: 804, atual: "Gestão de qualidade total", novo: "Gestão de Qualidade Total" },
  { id: 772, atual: "Gestão de recursos naturais", novo: "Gestão de Recursos Naturais" },
  { id: 774, atual: "Gestão de recursos naturais I", novo: "Gestão de Recursos Naturais I" },
  { id: 237, atual: "Gestão de reservas", novo: "Gestão de Reservas" },
  { id: 238, atual: "Gestão de resíduos", novo: "Gestão de Resíduos" },
  { id: 798, atual: "Gestão e empreendedorismo", novo: "Gestão e Empreendedorismo" },
  { id: 244, atual: "Gestão e Negócios Na Gastronomia", novo: "Gestão e Negócios na Gastronomia" },
  { id: 245, atual: "Gestão industrial", novo: "Gestão Industrial" },
  { id: 248, atual: "Gestão rural", novo: "Gestão Rural" },
  { id: 250, atual: "Habilidades básicas em cozinha", novo: "Habilidades Básicas em Cozinha" },
  { id: 833, atual: "História da moda, arte e cultura", novo: "História da Moda, Arte e Cultura" },
  { id: 259, atual: "Iluminação, cenografia e sonoplastia", novo: "Iluminação, Cenografia e Sonoplastia" },
  { id: 263, atual: "Improvisação teatral", novo: "Improvisação Teatral" },
  { id: 266, atual: "Indumentária e caracterização", novo: "Indumentária e Caracterização" },
  { id: 812, atual: "Instalação e manutenção de computadores I", novo: "Instalação e Manutenção de Computadores I" },
  { id: 295, atual: "Instalações hidráulicas", novo: "Instalações Hidráulicas" },
  { id: 296, atual: "Instalações prediais", novo: "Instalações Prediais" },
  { id: 298, atual: "Instrumentação e medidas de energia", novo: "Instrumentação e Medidas de Energia" },
  { id: 304, atual: "Interação, ensino, serviço e comunidade", novo: "Interação, Ensino, Serviço e Comunidade" },
  { id: 308, atual: "Interpretação teatral", novo: "Interpretação Teatral" },
  { id: 310, atual: "Introdução à construção civil", novo: "Introdução à Construção Civil" },
  { id: 313, atual: "Introdução À Fabricação Itinerário", novo: "Introdução à Fabricação Itinerário" },
  { id: 317, atual: "Introdução À Mecânica dos Solos", novo: "Introdução à Mecânica dos Solos" },
  { id: 321, atual: "Introdução a Qualidade e Produtividade e Sustentabilidade Nos Processos Industriais", novo: "Introdução a Qualidade e Produtividade e Sustentabilidade nos Processos Industriais" },
  { id: 322, atual: "Introdução Ao Aprofundamento Desenvolvimento de Projetos e Saúde", novo: "Introdução ao Aprofundamento Desenvolvimento de Projetos e Saúde" },
  { id: 323, atual: "Introdução Ao Desenvolvimento de Projetos Aprofundamento", novo: "Introdução ao Desenvolvimento de Projetos Aprofundamento" },
  { id: 324, atual: "Introdução Ao Desenvolvimento de Projetos e Saúde e Segurança No Trabalho", novo: "Introdução ao Desenvolvimento de Projetos e Saúde e Segurança no Trabalho" },
  { id: 326, atual: "Introdução Ao Turismo e a Hospitalidade", novo: "Introdução ao Turismo e a Hospitalidade" },
  { id: 327, atual: "Introdução Aos Processos Industriais", novo: "Introdução aos Processos Industriais" },
  { id: 328, atual: "Introdução Às Tecnologias e Processos da Manutenção", novo: "Introdução às Tecnologias e Processos da Manutenção" },
  { id: 819, atual: "Laboratório de montagem teatral", novo: "Laboratório de Montagem Teatral" },
  { id: 330, atual: "Lazer e artes visuais", novo: "Lazer e Artes Visuais" },
  { id: 331, atual: "Lazer e cultura digital", novo: "Lazer e Cultura Digital" },
  { id: 332, atual: "Lazer e inclusão", novo: "Lazer e Inclusão" },
  { id: 333, atual: "Legislação agrária e ambiental", novo: "Legislação Agrária e Ambiental" },
  { id: 807, atual: "Legislação aplicada", novo: "Legislação Aplicada" },
  { id: 334, atual: "Legislação Aplicada Ao Marketing", novo: "Legislação Aplicada ao Marketing" },
  { id: 853, atual: "Legislação aplicada ao turismo", novo: "Legislação Aplicada ao Turismo" },
  { id: 857, atual: "Legislação aplicada aos meios de hospedagem", novo: "Legislação Aplicada aos Meios de Hospedagem" },
  { id: 827, atual: "Legislação e normas", novo: "Legislação e Normas" },
  { id: 775, atual: "Legislação e segurança ambiental", novo: "Legislação e Segurança Ambiental" },
  { id: 335, atual: "Legislação portuária", novo: "Legislação Portuária" },
  { id: 799, atual: "Liderança e associativismo", novo: "Liderança e Associativismo" },
  { id: 353, atual: "Logística de cargas", novo: "Logística de Cargas" },
  { id: 809, atual: "Logística e canais de distribuição de marketing", novo: "Logística e Canais de Distribuição de Marketing" },
  { id: 805, atual: "Logística integrada e sustentabilidade", novo: "Logística Integrada e Sustentabilidade" },
  { id: 357, atual: "Logística internacional", novo: "Logística Internacional" },
  { id: 360, atual: "Manejo florestal", novo: "Manejo Florestal" },
  { id: 363, atual: "Manutenção de máquinas e equipamentos", novo: "Manutenção de Máquinas e Equipamentos" },
  { id: 838, atual: "Máquinas e equipamentos do vestuário", novo: "Máquinas e Equipamentos do Vestuário" },
  { id: 378, atual: "Máquinas elétricas", novo: "Máquinas Elétricas" },
  { id: 379, atual: "Máquinas mecânicas", novo: "Máquinas Mecânicas" },
  { id: 800, atual: "Marketing aplicado ao consumo sustentável", novo: "Marketing Aplicado ao Consumo Sustentável" },
  { id: 846, atual: "Marketing aplicado ao turismo", novo: "Marketing Aplicado ao Turismo" },
  { id: 381, atual: "Marketing de conteúdo", novo: "Marketing de Conteúdo" },
  { id: 382, atual: "Marketing digital", novo: "Marketing Digital" },
  { id: 384, atual: "Marketing hoteleiro e mídias digitais", novo: "Marketing Hoteleiro e Mídias Digitais" },
  { id: 385, atual: "Marketing logístico", novo: "Marketing Logístico" },
  { id: 386, atual: "Marketing Na Gastronomia", novo: "Marketing na Gastronomia" },
  { id: 769, atual: "Massoterapia aplicada a estética", novo: "Massoterapia Aplicada a Estética" },
  { id: 389, atual: "Matemática Básica Para Anos Iniciais", novo: "Matemática Básica para Anos Iniciais" },
  { id: 390, atual: "Materiais de construção", novo: "Materiais de Construção" },
  { id: 392, atual: "Materiais odontológicos", novo: "Materiais Odontológicos" },
  { id: 839, atual: "Materiais têxteis e aviamentos", novo: "Materiais Têxteis e Aviamentos" },
  { id: 395, atual: "Mecânica dos solos", novo: "Mecânica dos Solos" },
  { id: 396, atual: "Mecânica e manutenção", novo: "Mecânica e Manutenção" },
  { id: 398, atual: "Mecanização agrícola", novo: "Mecanização Agrícola" },
  { id: 855, atual: "Meios de hospedagem", novo: "Meios de Hospedagem" },
  { id: 776, atual: "Metodologia científica e comunicação", novo: "Metodologia Científica e Comunicação" },
  { id: 403, atual: "Metodologia da matemática", novo: "Metodologia da Matemática" },
  { id: 840, atual: "Modelagem e produção industrial", novo: "Modelagem e Produção Industrial" },
  { id: 426, atual: "Música e lazer", novo: "Música e Lazer" },
  { id: 430, atual: "Noções de patologia", novo: "Noções de Patologia" },
  { id: 433, atual: "Nutrição aplicada", novo: "Nutrição Aplicada" },
  { id: 434, atual: "Nutrição e dietética", novo: "Nutrição e Dietética" },
  { id: 440, atual: "Operações com cargas", novo: "Operações com Cargas" },
  { id: 850, atual: "Organização de eventos", novo: "Organização de Eventos" },
  { id: 778, atual: "Organização e administração laboratorial", novo: "Organização e Administração Laboratorial" },
  { id: 820, atual: "Organização e produção teatral", novo: "Organização e Produção Teatral" },
  { id: 450, atual: "Otimização de Processos Produtivos Dedicados À Manutenção", novo: "Otimização de Processos Produtivos Dedicados à Manutenção" },
  { id: 848, atual: "Panificação e confeitaria", novo: "Panificação e Confeitaria" },
  { id: 452, atual: "Patologia bucal", novo: "Patologia Bucal" },
  { id: 852, atual: "Patrimônio histórico- cultural e turismo", novo: "Patrimônio Histórico- Cultural e Turismo" },
  { id: 453, atual: "Patrimônio, museu e turismo cultural", novo: "Patrimônio, Museu e Turismo Cultural" },
  { id: 454, atual: "Pesquisa de marketing", novo: "Pesquisa de Marketing" },
  { id: 845, atual: "Planejamento de roteiros turísticos", novo: "Planejamento de Roteiros Turísticos" },
  { id: 836, atual: "Planejamento e controle da produção do vestuário", novo: "Planejamento e Controle da Produção do Vestuário" },
  { id: 465, atual: "Prática de higienização e legislação dos alimentos", novo: "Prática de Higienização e Legislação dos Alimentos" },
  { id: 466, atual: "Prática profissional em agenciamento de viagem", novo: "Prática Profissional em Agenciamento de Viagem" },
  { id: 468, atual: "Práticas em lazer", novo: "Práticas em Lazer" },
  { id: 470, atual: "Práticas sustentáveis", novo: "Práticas Sustentáveis" },
  { id: 796, atual: "Princípios de administração", novo: "Princípios de Administração" },
  { id: 475, atual: "Princípios econômicos", novo: "Princípios Econômicos" },
  { id: 824, atual: "Processos agroindustriais", novo: "Processos Agroindustriais" },
  { id: 784, atual: "Processos de fabricação", novo: "Processos de Fabricação" },
  { id: 486, atual: "Processos de manutenção e melhoria da produção", novo: "Processos de Manutenção e Melhoria da Produção" },
  { id: 822, atual: "Processos industriais", novo: "Processos Industriais" },
  { id: 490, atual: "Produção animal", novo: "Produção Animal" },
  { id: 492, atual: "Produção de eventos", novo: "Produção de Eventos" },
  { id: 859, atual: "Produção e gestão cultural", novo: "Produção e Gestão Cultural" },
  { id: 494, atual: "Produção vegetal", novo: "Produção Vegetal" },
  { id: 797, atual: "Produção, logística e qualidade", novo: "Produção, Logística e Qualidade" },
  { id: 864, atual: "Programação avançada", novo: "Programação Avançada" },
  { id: 498, atual: "Programação back-end I", novo: "Programação Back-end I" },
  { id: 816, atual: "Programação de jogos digitais I", novo: "Programação de Jogos Digitais I" },
  { id: 826, atual: "Programação e monitoramento da produção I", novo: "Programação e Monitoramento da Produção I" },
  { id: 535, atual: "Projetos elétricos", novo: "Projetos Elétricos" },
  { id: 817, atual: "Projetos em construção civil", novo: "Projetos em Construção Civil" },
  { id: 785, atual: "Projetos em eletromecânica", novo: "Projetos em Eletromecânica" },
  { id: 541, atual: "Projetos mecânicos", novo: "Projetos Mecânicos" },
  { id: 545, atual: "Prótese total", novo: "Prótese Total" },
  { id: 549, atual: "Psicologia aplicada", novo: "Psicologia Aplicada" },
  { id: 830, atual: "Química analítica", novo: "Química Analítica" },
  { id: 825, atual: "Química analítica aplicada", novo: "Química Analítica Aplicada" },
  { id: 656, atual: "Química aplicada", novo: "Química Aplicada" },
  { id: 828, atual: "Química aplicada ao meio ambiente", novo: "Química Aplicada ao Meio Ambiente" },
  { id: 553, atual: "Química dos alimentos", novo: "Química dos Alimentos" },
  { id: 831, atual: "Química inorgânica", novo: "Química Inorgânica" },
  { id: 832, atual: "Química orgânica", novo: "Química Orgânica" },
  { id: 780, atual: "Radiologia odontológica", novo: "Radiologia Odontológica" },
  { id: 561, atual: "Redação técnica", novo: "Redação Técnica" },
  { id: 564, atual: "Redes industriais", novo: "Redes Industriais" },
  { id: 818, atual: "Regulamentação aduaneira", novo: "Regulamentação Aduaneira" },
  { id: 569, atual: "Resistência dos materiais", novo: "Resistência dos Materiais" },
  { id: 841, atual: "Risco e corte da confecção industrial", novo: "Risco e Corte da Confecção Industrial" },
  { id: 571, atual: "Roteirização turística", novo: "Roteirização Turística" },
  { id: 572, atual: "Rotina de Recepção e Atendimento Ao Cliente", novo: "Rotina de Recepção e Atendimento ao Cliente" },
  { id: 574, atual: "Saúde e bem-estar", novo: "Saúde e Bem-estar" },
  { id: 579, atual: "Segurança digital", novo: "Segurança Digital" },
  { id: 786, atual: "Segurança do trabalho", novo: "Segurança do Trabalho" },
  { id: 790, atual: "Segurança do trabalho e controle ambiental", novo: "Segurança do Trabalho e Controle Ambiental" },
  { id: 849, atual: "Segurança do trabalho e saúde ocupacional", novo: "Segurança do Trabalho e Saúde Ocupacional" },
  { id: 584, atual: "Segurança do Trabalho Na Construção Civil", novo: "Segurança do Trabalho na Construção Civil" },
  { id: 834, atual: "Segurança e saúde ocupacional", novo: "Segurança e Saúde Ocupacional" },
  { id: 594, atual: "Sistemas digitais", novo: "Sistemas Digitais" },
  { id: 597, atual: "Sistemas eletrônicos", novo: "Sistemas Eletrônicos" },
  { id: 600, atual: "Sistemas estruturais", novo: "Sistemas Estruturais" },
  { id: 604, atual: "Sistemas operacionais", novo: "Sistemas Operacionais" },
  { id: 802, atual: "Soluções sustentáveis", novo: "Soluções Sustentáveis" },
  { id: 609, atual: "Sustentabilidade Nos Processos de Produção", novo: "Sustentabilidade nos Processos de Produção" },
  { id: 768, atual: "Técnica de estética capilar", novo: "Técnica de Estética Capilar" },
  { id: 612, atual: "Técnicas construtivas", novo: "Técnicas Construtivas" },
  { id: 854, atual: "Técnicas de comunicação", novo: "Técnicas de Comunicação" },
  { id: 770, atual: "Técnicas de estética corporal", novo: "Técnicas de Estética Corporal" },
  { id: 615, atual: "Técnicas de instrumentação em odontologia", novo: "Técnicas de Instrumentação em Odontologia" },
  { id: 619, atual: "Técnicas restauradoras", novo: "Técnicas Restauradoras" },
  { id: 621, atual: "Tecnologia aplicada a alimentação animal/zootecnia", novo: "Tecnologia Aplicada a Alimentação Animal/zootecnia" },
  { id: 623, atual: "Tecnologia da Informação Aplicada Ao Turismo", novo: "Tecnologia da Informação Aplicada ao Turismo" },
  { id: 793, atual: "Tecnologia dos materiais", novo: "Tecnologia dos Materiais" },
  { id: 791, atual: "Tecnologia mecânica", novo: "Tecnologia Mecânica" },
  { id: 635, atual: "Tecnologias Digitais Aplicadas Ao Marketing", novo: "Tecnologias Digitais Aplicadas ao Marketing" },
  { id: 638, atual: "Tecnologias Para o Plantio", novo: "Tecnologias para o Plantio" },
  { id: 640, atual: "Teoria do lazer", novo: "Teoria do Lazer" },
  { id: 641, atual: "Teoria e técnica profissional", novo: "Teoria e Técnica Profissional" },
  { id: 646, atual: "Trabalho Pedagógico Na Educação Infantil", novo: "Trabalho Pedagógico na Educação Infantil" },
  { id: 647, atual: "Transporte marítimo", novo: "Transporte Marítimo" },
  { id: 648, atual: "Transportes e seguros", novo: "Transportes e Seguros" },
  { id: 651, atual: "Visualização de dados", novo: "Visualização de Dados" },
  { id: 652, atual: "Viveiros florestais", novo: "Viveiros Florestais" },
];

async function main() {
  const client = new Client({ connectionString: carregarDatabaseUrl() });
  await client.connect();

  const linhasSaida = [];
  const log = (msg = '') => { linhasSaida.push(String(msg)); console.log(msg); };

  log(`Modo: ${APLICAR ? 'APLICAR (COMMIT)' : 'DRY-RUN (ROLLBACK)'}`);
  log(`Total de disciplinas a padronizar: ${CONVERSOES.length}\n`);

  try {
    await client.query('BEGIN');
    let divergencias = 0;
    let atualizadas = 0;

    for (const item of CONVERSOES) {
      const { rows } = await client.query(
        'SELECT id, nome FROM disciplinas_catalogo WHERE id = $1',
        [item.id]
      );

      if (rows.length === 0) {
        log(`[AVISO] id=${item.id} não encontrado — pulando.`);
        divergencias++;
        continue;
      }

      const nomeNoBanco = rows[0].nome;
      if (nomeNoBanco !== item.atual) {
        log(`[DIVERGÊNCIA] id=${item.id}: esperado "${item.atual}", encontrado "${nomeNoBanco}" — pulando por segurança.`);
        divergencias++;
        continue;
      }

      await client.query('UPDATE disciplinas_catalogo SET nome = $1 WHERE id = $2', [item.novo, item.id]);
      log(`id=${item.id}: "${item.atual}" -> "${item.novo}"`);
      atualizadas++;
    }

    log(`\nResumo: ${atualizadas} atualizadas, ${divergencias} puladas por divergência/ausência.`);

    if (APLICAR) {
      await client.query('COMMIT');
      log('\n✅ COMMIT realizado — alterações aplicadas.');
    } else {
      await client.query('ROLLBACK');
      log('\n↩️  ROLLBACK (dry-run) — nenhuma alteração persistida. Rode com --aplicar para aplicar de fato.');
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro — ROLLBACK executado.', err);
    process.exitCode = 1;
  } finally {
    await client.end();
    const relatorioPath = path.join(__dirname, 'padronizar-capitalizacao-catalogo-relatorio.txt');
    fs.writeFileSync(relatorioPath, linhasSaida.join('\n'), { encoding: 'utf8' });
  }
}

main();
