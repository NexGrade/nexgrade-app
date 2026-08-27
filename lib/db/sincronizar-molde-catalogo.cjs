/**
 * sincronizar-molde-catalogo.cjs
 *
 * Sincroniza o nome de 309 disciplinas do "molde" (disciplinas com
 * escola_id='catalogo_geral', usado para popular itens_matriz de
 * novos cursos) com o nome já padronizado no catálogo mestre
 * (disciplinas_catalogo), cruzando por codigo_sae.
 *
 * O catálogo mestre é a fonte de verdade (já passou por padronização
 * de capitalização e numeral romano nesta sessão).
 *
 * Uso:
 *   node lib\db\sincronizar-molde-catalogo.cjs            (dry-run, padrão)
 *   node lib\db\sincronizar-molde-catalogo.cjs --aplicar   (aplica de fato)
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
  { moldeId: 1766, moldeAtual: "Química aplicada", codigoSae: "809", novo: "Química Aplicada" },
  { moldeId: 1768, moldeAtual: "Redação técnica", codigoSae: "126", novo: "Redação Técnica" },
  { moldeId: 1777, moldeAtual: "Fundamentos de farmácia", codigoSae: "4295", novo: "Fundamentos de Farmácia" },
  { moldeId: 1778, moldeAtual: "Fundamentos da fisiopatologia", codigoSae: "5515", novo: "Fundamentos da Fisiopatologia" },
  { moldeId: 2166, moldeAtual: "Organização e administração laboratorial", codigoSae: "3114", novo: "Organização e Administração Laboratorial" },
  { moldeId: 2167, moldeAtual: "Materiais e equipamentos odontológicos", codigoSae: "3115", novo: "Materiais e Equipamentos Odontológicos" },
  { moldeId: 2168, moldeAtual: "Prótese fixa", codigoSae: "3108", novo: "Prótese Fixa" },
  { moldeId: 2169, moldeAtual: "Prótese ortodôntica", codigoSae: "3112", novo: "Prótese Ortodôntica" },
  { moldeId: 2170, moldeAtual: "Prótese parcial removível", codigoSae: "3109", novo: "Prótese Parcial Removível" },
  { moldeId: 2171, moldeAtual: "Prótese total", codigoSae: "3107", novo: "Prótese Total" },
  { moldeId: 2172, moldeAtual: "Anatomia bucal", codigoSae: "3138", novo: "Anatomia Bucal" },
  { moldeId: 2173, moldeAtual: "Biossegurança e controle biológico", codigoSae: "3139", novo: "Biossegurança e Controle Biológico" },
  { moldeId: 2174, moldeAtual: "Patologia bucal", codigoSae: "3144", novo: "Patologia Bucal" },
  { moldeId: 2175, moldeAtual: "Emergência odontológica", codigoSae: "3121", novo: "Emergência Odontológica" },
  { moldeId: 2176, moldeAtual: "Materiais odontológicos", codigoSae: "3140", novo: "Materiais Odontológicos" },
  { moldeId: 2177, moldeAtual: "Nutrição aplicada", codigoSae: "3141", novo: "Nutrição Aplicada" },
  { moldeId: 2178, moldeAtual: "Odontologia preventiva e social", codigoSae: "3142", novo: "Odontologia Preventiva e Social" },
  { moldeId: 2179, moldeAtual: "Organização e administração em saúde bucal", codigoSae: "3143", novo: "Organização e Administração em Saúde Bucal" },
  { moldeId: 2180, moldeAtual: "Psicologia aplicada", codigoSae: "2113", novo: "Psicologia Aplicada" },
  { moldeId: 2181, moldeAtual: "Radiologia odontológica", codigoSae: "3145", novo: "Radiologia Odontológica" },
  { moldeId: 2182, moldeAtual: "Técnicas de instrumentação em odontologia", codigoSae: "3146", novo: "Técnicas de Instrumentação em Odontologia" },
  { moldeId: 2183, moldeAtual: "Técnicas restauradoras", codigoSae: "3147", novo: "Técnicas Restauradoras" },
  { moldeId: 2184, moldeAtual: "Desenho elétrico", codigoSae: "1909", novo: "Desenho Elétrico" },
  { moldeId: 2185, moldeAtual: "Eletrônica analógica", codigoSae: "1523", novo: "Eletrônica Analógica" },
  { moldeId: 2186, moldeAtual: "Conservação de energia e eficiência energética", codigoSae: "4278", novo: "Conservação de Energia e Eficiência Energética" },
  { moldeId: 2187, moldeAtual: "Controlador lógico programável", codigoSae: "2150", novo: "Controlador Lógico Programável" },
  { moldeId: 2188, moldeAtual: "Equipamentos e máquinas elétricas", codigoSae: "4234", novo: "Equipamentos e Máquinas Elétricas" },
  { moldeId: 2190, moldeAtual: "Eletrônica digital", codigoSae: "1524", novo: "Eletrônica Digital" },
  { moldeId: 2191, moldeAtual: "Instalações elétricas", codigoSae: "3810", novo: "Instalações Elétricas" },
  { moldeId: 2136, moldeAtual: "Anatomia e fisiologia humana I", codigoSae: "5505", novo: "Anatomia e Fisiologia Humana I" },
  { moldeId: 2139, moldeAtual: "Noções de patologia", codigoSae: "3253", novo: "Noções de Patologia" },
  { moldeId: 2140, moldeAtual: "Elemento de gestão e marketing", codigoSae: "5508", novo: "Elemento de Gestão e Marketing" },
  { moldeId: 2141, moldeAtual: "Saúde e bem-estar", codigoSae: "4854", novo: "Saúde e Bem-estar" },
  { moldeId: 2142, moldeAtual: "Técnica de estética capilar", codigoSae: "5510", novo: "Técnica de Estética Capilar" },
  { moldeId: 2144, moldeAtual: "Eletroestética facial e corporal", codigoSae: "1688", novo: "Eletroestética Facial e Corporal" },
  { moldeId: 2145, moldeAtual: "Massoterapia aplicada a estética", codigoSae: "5509", novo: "Massoterapia Aplicada a Estética" },
  { moldeId: 2147, moldeAtual: "Técnicas de estética corporal", codigoSae: "1693", novo: "Técnicas de Estética Corporal" },
  { moldeId: 2148, moldeAtual: "Técnicas de estética facial", codigoSae: "1694", novo: "Técnicas de Estética Facial" },
  { moldeId: 2150, moldeAtual: "Análise, controle e química ambiental", codigoSae: "867", novo: "Análise, Controle e Química Ambiental" },
  { moldeId: 2151, moldeAtual: "Educação ambiental I", codigoSae: "6622", novo: "Educação Ambiental I" },
  { moldeId: 2152, moldeAtual: "Estudos de impactos e riscos ambientais", codigoSae: "1519", novo: "Estudos de Impactos e Riscos Ambientais" },
  { moldeId: 2153, moldeAtual: "Gestão de recursos naturais", codigoSae: "868", novo: "Gestão de Recursos Naturais" },
  { moldeId: 2154, moldeAtual: "Metodologia científica e comunicação I", codigoSae: "6627", novo: "Metodologia Científica e Comunicação I" },
  { moldeId: 2155, moldeAtual: "Análise, controle e química ambiental I", codigoSae: "6620", novo: "Análise, Controle e Química Ambiental I" },
  { moldeId: 2156, moldeAtual: "Educação ambiental", codigoSae: "310", novo: "Educação Ambiental" },
  { moldeId: 2157, moldeAtual: "Gestão de recursos naturais I", codigoSae: "6623", novo: "Gestão de Recursos Naturais I" },
  { moldeId: 2158, moldeAtual: "Gestão de resíduos", codigoSae: "1928", novo: "Gestão de Resíduos" },
  { moldeId: 2159, moldeAtual: "Informática aplicada", codigoSae: "4420", novo: "Informática Aplicada" },
  { moldeId: 2160, moldeAtual: "Legislação e segurança ambiental", codigoSae: "870", novo: "Legislação e Segurança Ambiental" },
  { moldeId: 2161, moldeAtual: "Metodologia científica e comunicação", codigoSae: "871", novo: "Metodologia Científica e Comunicação" },
  { moldeId: 2162, moldeAtual: "Sistema de gestão ambiental", codigoSae: "6713", novo: "Sistema de Gestão Ambiental" },
  { moldeId: 2163, moldeAtual: "Anatomia e fisiologia da cabeça", codigoSae: "3102", novo: "Anatomia e Fisiologia da Cabeça" },
  { moldeId: 2164, moldeAtual: "Anatomia e escultura dental", codigoSae: "3103", novo: "Anatomia e Escultura Dental" },
  { moldeId: 2165, moldeAtual: "Higiene e segurança do trabalho", codigoSae: "1535", novo: "Higiene e Segurança do Trabalho" },
  { moldeId: 2192, moldeAtual: "Redes industriais", codigoSae: "3713", novo: "Redes Industriais" },
  { moldeId: 2193, moldeAtual: "Saúde e segurança do trabalho", codigoSae: "3212", novo: "Saúde e Segurança do Trabalho" },
  { moldeId: 2194, moldeAtual: "Sistemas eletrônicos", codigoSae: "1552", novo: "Sistemas Eletrônicos" },
  { moldeId: 2195, moldeAtual: "Sistemas microcontrolados", codigoSae: "3728", novo: "Sistemas Microcontrolados" },
  { moldeId: 2196, moldeAtual: "Automação industrial", codigoSae: "1547", novo: "Automação Industrial" },
  { moldeId: 2197, moldeAtual: "Manutenção de máquinas e equipamentos", codigoSae: "1682", novo: "Manutenção de Máquinas e Equipamentos" },
  { moldeId: 2200, moldeAtual: "Gestão ambiental", codigoSae: "4033", novo: "Gestão Ambiental" },
  { moldeId: 2201, moldeAtual: "Máquinas elétricas", codigoSae: "3820", novo: "Máquinas Elétricas" },
  { moldeId: 2202, moldeAtual: "Processos de fabricação", codigoSae: "3920", novo: "Processos de Fabricação" },
  { moldeId: 2203, moldeAtual: "Projetos em eletromecânica", codigoSae: "3808", novo: "Projetos em Eletromecânica" },
  { moldeId: 2204, moldeAtual: "Segurança do trabalho", codigoSae: "4014", novo: "Segurança do Trabalho" },
  { moldeId: 2205, moldeAtual: "Sistemas hidráulicos e pneumáticos", codigoSae: "3826", novo: "Sistemas Hidráulicos e Pneumáticos" },
  { moldeId: 2206, moldeAtual: "Gestão industrial", codigoSae: "2141", novo: "Gestão Industrial" },
  { moldeId: 2207, moldeAtual: "Sistemas digitais", codigoSae: "1548", novo: "Sistemas Digitais" },
  { moldeId: 2209, moldeAtual: "Desenho técnico", codigoSae: "1911", novo: "Desenho Técnico" },
  { moldeId: 2210, moldeAtual: "Projetos elétricos", codigoSae: "3719", novo: "Projetos Elétricos" },
  { moldeId: 2211, moldeAtual: "Acionamento de máquinas", codigoSae: "3823", novo: "Acionamento de Máquinas" },
  { moldeId: 2212, moldeAtual: "Equipamentos e comandos", codigoSae: "1526", novo: "Equipamentos e Comandos" },
  { moldeId: 2213, moldeAtual: "Segurança e controle ambiental", codigoSae: "4065", novo: "Segurança e Controle Ambiental" },
  { moldeId: 2214, moldeAtual: "Tecnologia mecânica dos materiais", codigoSae: "1522", novo: "Tecnologia Mecânica dos Materiais" },
  { moldeId: 2215, moldeAtual: "Desenho mecânico", codigoSae: "3828", novo: "Desenho Mecânico" },
  { moldeId: 2216, moldeAtual: "Eletricidade automotiva", codigoSae: "3082", novo: "Eletricidade Automotiva" },
  { moldeId: 2217, moldeAtual: "Eletrônica automotiva", codigoSae: "3083", novo: "Eletrônica Automotiva" },
  { moldeId: 2218, moldeAtual: "Mecânica automobilística", codigoSae: "3085", novo: "Mecânica Automobilística" },
  { moldeId: 2219, moldeAtual: "Mecânica e manutenção", codigoSae: "3919", novo: "Mecânica e Manutenção" },
  { moldeId: 2221, moldeAtual: "Motores de combustão interna", codigoSae: "3087", novo: "Motores de Combustão Interna" },
  { moldeId: 2222, moldeAtual: "Segurança do trabalho e controle ambiental", codigoSae: "2129", novo: "Segurança do Trabalho e Controle Ambiental" },
  { moldeId: 2223, moldeAtual: "Tecnologia mecânica", codigoSae: "3916", novo: "Tecnologia Mecânica" },
  { moldeId: 2225, moldeAtual: "Introdução a mecânica", codigoSae: "3918", novo: "Introdução a Mecânica" },
  { moldeId: 2226, moldeAtual: "Projetos mecânicos", codigoSae: "3921", novo: "Projetos Mecânicos" },
  { moldeId: 2227, moldeAtual: "Resistência dos materiais", codigoSae: "1525", novo: "Resistência dos Materiais" },
  { moldeId: 2228, moldeAtual: "Tecnologia dos materiais", codigoSae: "2147", novo: "Tecnologia dos Materiais" },
  { moldeId: 2230, moldeAtual: "Controle de processos industriais", codigoSae: "3825", novo: "Controle de Processos Industriais" },
  { moldeId: 2231, moldeAtual: "Automação e robótica", codigoSae: "3824", novo: "Automação e Robótica" },
  { moldeId: 2233, moldeAtual: "Tipos de energia renovável", codigoSae: "1698", novo: "Tipos de Energia Renovável" },
  { moldeId: 2234, moldeAtual: "Meteorologia aplicada", codigoSae: "1696", novo: "Meteorologia Aplicada" },
  { moldeId: 2236, moldeAtual: "Instrumentação e medidas de energia", codigoSae: "4280", novo: "Instrumentação e Medidas de Energia" },
  { moldeId: 2237, moldeAtual: "Máquinas mecânicas", codigoSae: "1527", novo: "Máquinas Mecânicas" },
  { moldeId: 2238, moldeAtual: "Projetos e instalações de sistemas de energia renovável", codigoSae: "1697", novo: "Projetos e Instalações de Sistemas de Energia Renovável" },
  { moldeId: 2239, moldeAtual: "Informática empresarial", codigoSae: "5015", novo: "Informática Empresarial" },
  { moldeId: 2240, moldeAtual: "Comunicação e vendas", codigoSae: "5020", novo: "Comunicação e Vendas" },
  { moldeId: 2241, moldeAtual: "Princípios econômicos", codigoSae: "5031", novo: "Princípios Econômicos" },
  { moldeId: 2242, moldeAtual: "Finanças empresariais", codigoSae: "5033", novo: "Finanças Empresariais" },
  { moldeId: 2243, moldeAtual: "Liderança organizacional e gestão de pessoas", codigoSae: "5034", novo: "Liderança Organizacional e Gestão de Pessoas" },
  { moldeId: 2244, moldeAtual: "Princípios de administração", codigoSae: "4129", novo: "Princípios de Administração" },
  { moldeId: 2245, moldeAtual: "Recursos humanos", codigoSae: "4450", novo: "Recursos Humanos" },
  { moldeId: 2246, moldeAtual: "Estratégias de marketing", codigoSae: "5019", novo: "Estratégias de Marketing" },
  { moldeId: 2247, moldeAtual: "Produção, logística e qualidade", codigoSae: "5021", novo: "Produção, Logística e Qualidade" },
  { moldeId: 2248, moldeAtual: "Técnicas integradas", codigoSae: "6509", novo: "Técnicas Integradas" },
  { moldeId: 2249, moldeAtual: "Gestão e empreendedorismo", codigoSae: "8125", novo: "Gestão e Empreendedorismo" },
  { moldeId: 2250, moldeAtual: "Liderança e associativismo", codigoSae: "5838", novo: "Liderança e Associativismo" },
  { moldeId: 2251, moldeAtual: "Marketing aplicado ao consumo sustentável", codigoSae: "5834", novo: "Marketing Aplicado ao Consumo Sustentável" },
  { moldeId: 2252, moldeAtual: "Tecnologias sociais e identidade territorial", codigoSae: "5835", novo: "Tecnologias Sociais e Identidade Territorial" },
  { moldeId: 2254, moldeAtual: "Cadeias produtivas e agroindústria", codigoSae: "5836", novo: "Cadeias Produtivas e Agroindústria" },
  { moldeId: 2255, moldeAtual: "Soluções sustentáveis", codigoSae: "5837", novo: "Soluções Sustentáveis" },
  { moldeId: 2256, moldeAtual: "Roteirização turística", codigoSae: "5839", novo: "Roteirização Turística" },
  { moldeId: 2257, moldeAtual: "Gestão da atividade turística", codigoSae: "5840", novo: "Gestão da Atividade Turística" },
  { moldeId: 2258, moldeAtual: "Técnicas de produção animal e vegetal", codigoSae: "5841", novo: "Técnicas de Produção Animal e Vegetal" },
  { moldeId: 2259, moldeAtual: "Operações contábeis e tributação", codigoSae: "6368", novo: "Operações Contábeis e Tributação" },
  { moldeId: 2260, moldeAtual: "Planejamento empresarial e logístico", codigoSae: "6367", novo: "Planejamento Empresarial e Logístico" },
  { moldeId: 2261, moldeAtual: "Tecnologia de informação aplicada", codigoSae: "6402", novo: "Tecnologia de Informação Aplicada" },
  { moldeId: 2262, moldeAtual: "Marketing logístico", codigoSae: "6401", novo: "Marketing Logístico" },
  { moldeId: 2263, moldeAtual: "Armazenagem e gestão de estoque", codigoSae: "6403", novo: "Armazenagem e Gestão de Estoque" },
  { moldeId: 2264, moldeAtual: "Canais de distribuição", codigoSae: "6404", novo: "Canais de Distribuição" },
  { moldeId: 2265, moldeAtual: "Transportes e seguros", codigoSae: "6405", novo: "Transportes e Seguros" },
  { moldeId: 2266, moldeAtual: "Gestão de qualidade total", codigoSae: "6406", novo: "Gestão de Qualidade Total" },
  { moldeId: 2267, moldeAtual: "Logística internacional", codigoSae: "6407", novo: "Logística Internacional" },
  { moldeId: 2268, moldeAtual: "Logística integrada e sustentabilidade", codigoSae: "6408", novo: "Logística Integrada e Sustentabilidade" },
  { moldeId: 2269, moldeAtual: "Empreendedorismo e plano de negócio", codigoSae: "6409", novo: "Empreendedorismo e Plano de Negócio" },
  { moldeId: 2270, moldeAtual: "Legislação aplicada", codigoSae: "4036", novo: "Legislação Aplicada" },
  { moldeId: 2271, moldeAtual: "Técnicas de venda e marketing de varejo", codigoSae: "5537", novo: "Técnicas de Venda e Marketing de Varejo" },
  { moldeId: 2272, moldeAtual: "Marketing digital", codigoSae: "5542", novo: "Marketing Digital" },
  { moldeId: 2273, moldeAtual: "Planejamento de marketing", codigoSae: "5538", novo: "Planejamento de Marketing" },
  { moldeId: 2274, moldeAtual: "Fundamentos do marketing", codigoSae: "5532", novo: "Fundamentos do Marketing" },
  { moldeId: 2275, moldeAtual: "Tecnologias digitais aplicadas ao marketing", codigoSae: "5833", novo: "Tecnologias Digitais Aplicadas ao Marketing" },
  { moldeId: 2276, moldeAtual: "Análise de mercado e comportamento do consumidor", codigoSae: "5535", novo: "Análise de Mercado e Comportamento do Consumidor" },
  { moldeId: 2277, moldeAtual: "Relações interpessoais", codigoSae: "2324", novo: "Relações Interpessoais" },
  { moldeId: 2278, moldeAtual: "Comunicação de marketing", codigoSae: "5536", novo: "Comunicação de Marketing" },
  { moldeId: 2279, moldeAtual: "Pesquisa de marketing", codigoSae: "5539", novo: "Pesquisa de Marketing" },
  { moldeId: 2280, moldeAtual: "Logística e canais de distribuição de marketing", codigoSae: "5540", novo: "Logística e Canais de Distribuição de Marketing" },
  { moldeId: 2281, moldeAtual: "Segmentação e posicionamento de marketing", codigoSae: "5541", novo: "Segmentação e Posicionamento de Marketing" },
  { moldeId: 2282, moldeAtual: "Análise de dados aplicada ao marketing", codigoSae: "5543", novo: "Análise de Dados Aplicada ao Marketing" },
  { moldeId: 2283, moldeAtual: "Legislação aplicada ao marketing", codigoSae: "5544", novo: "Legislação Aplicada ao Marketing" },
  { moldeId: 2285, moldeAtual: "Marketing de conteúdo", codigoSae: "5546", novo: "Marketing de Conteúdo" },
  { moldeId: 2286, moldeAtual: "Análise e método para sistemas", codigoSae: "5316", novo: "Análise e Método para Sistemas" },
  { moldeId: 2287, moldeAtual: "Inovação tecnológica e empreendedorismo", codigoSae: "5999", novo: "Inovação Tecnológica e Empreendedorismo" },
  { moldeId: 2288, moldeAtual: "Introdução à computação", codigoSae: "5314", novo: "Introdução à Computação" },
  { moldeId: 2289, moldeAtual: "Lógica computacional", codigoSae: "1348", novo: "Lógica Computacional" },
  { moldeId: 2290, moldeAtual: "Introdução à programação", codigoSae: "5315", novo: "Introdução à Programação" },
  { moldeId: 2291, moldeAtual: "Banco de dados I", codigoSae: "5400", novo: "Banco de Dados I" },
  { moldeId: 2292, moldeAtual: "Programação back- end I", codigoSae: "5700", novo: "Programação Back-end I" },
  { moldeId: 2293, moldeAtual: "Programação front- end", codigoSae: "4761", novo: "Programação Front-end" },
  { moldeId: 2294, moldeAtual: "Banco de dados II", codigoSae: "5600", novo: "Banco de Dados II" },
  { moldeId: 2295, moldeAtual: "Programação back- end II", codigoSae: "5900", novo: "Programação back-end II" },
  { moldeId: 2296, moldeAtual: "Programação mobile", codigoSae: "4491", novo: "Programação Mobile" },
  { moldeId: 2297, moldeAtual: "Banco de dados III", codigoSae: "6510", novo: "Banco de Dados III" },
  { moldeId: 2298, moldeAtual: "Instalação e manutenção de computadores II", codigoSae: "6515", novo: "Instalação e Manutenção de Computadores II" },
  { moldeId: 2301, moldeAtual: "Banco de dados", codigoSae: "4443", novo: "Banco de Dados" },
  { moldeId: 2302, moldeAtual: "Documentação técnica", codigoSae: "4485", novo: "Documentação Técnica" },
  { moldeId: 2303, moldeAtual: "Fundamentos e arquitetura de computadores I", codigoSae: "6536", novo: "Fundamentos e Arquitetura de Computadores I" },
  { moldeId: 2304, moldeAtual: "Fundamentos e arquitetura de computadores II", codigoSae: "6537", novo: "Fundamentos e Arquitetura de Computadores II" },
  { moldeId: 2305, moldeAtual: "Gestão comercial I", codigoSae: "6519", novo: "Gestão Comercial I" },
  { moldeId: 2307, moldeAtual: "Instalação e manutenção de computadores I", codigoSae: "6514", novo: "Instalação e Manutenção de Computadores I" },
  { moldeId: 2310, moldeAtual: "Lógica de programação", codigoSae: "4442", novo: "Lógica de Programação" },
  { moldeId: 2312, moldeAtual: "Sistemas operacionais", codigoSae: "4455", novo: "Sistemas Operacionais" },
  { moldeId: 2313, moldeAtual: "Produção audiovisual", codigoSae: "3493", novo: "Produção Audiovisual" },
  { moldeId: 2314, moldeAtual: "Análise e projetos de jogos digitais II", codigoSae: "5555", novo: "Análise e Projetos de Jogos Digitais II" },
  { moldeId: 2315, moldeAtual: "Análise e projetos de jogos digitais I", codigoSae: "5554", novo: "Análise e Projetos de Jogos Digitais I" },
  { moldeId: 2316, moldeAtual: "Ciências da computação", codigoSae: "3936", novo: "Ciências da Computação" },
  { moldeId: 2317, moldeAtual: "Fundamentos da programação de jogos digitais", codigoSae: "5556", novo: "Fundamentos da Programação de Jogos Digitais" },
  { moldeId: 2318, moldeAtual: "Game e design", codigoSae: "5557", novo: "Game e Design" },
  { moldeId: 2319, moldeAtual: "Programação de jogos digitais I", codigoSae: "5558", novo: "Programação de Jogos Digitais I" },
  { moldeId: 2320, moldeAtual: "Programação de jogos digitais II", codigoSae: "5559", novo: "Programação de Jogos Digitais II" },
  { moldeId: 2321, moldeAtual: "Programação mobile aplicada a jogos digitais", codigoSae: "5560", novo: "Programação Mobile Aplicada a Jogos Digitais" },
  { moldeId: 2322, moldeAtual: "Programação web aplicada a jogos digitais", codigoSae: "5561", novo: "Programação Web Aplicada a Jogos Digitais" },
  { moldeId: 2323, moldeAtual: "Sistemas estruturais", codigoSae: "4052", novo: "Sistemas Estruturais" },
  { moldeId: 2324, moldeAtual: "Controle e proteção ambiental", codigoSae: "2132", novo: "Controle e Proteção Ambiental" },
  { moldeId: 2325, moldeAtual: "Introdução à construção civil", codigoSae: "2137", novo: "Introdução à Construção Civil" },
  { moldeId: 2326, moldeAtual: "Administração de obras", codigoSae: "4107", novo: "Administração de Obras" },
  { moldeId: 2327, moldeAtual: "Instalações hidráulicas", codigoSae: "2708", novo: "Instalações Hidráulicas" },
  { moldeId: 2328, moldeAtual: "Instalações prediais", codigoSae: "2705", novo: "Instalações Prediais" },
  { moldeId: 2329, moldeAtual: "Materiais de construção", codigoSae: "3717", novo: "Materiais de Construção" },
  { moldeId: 2330, moldeAtual: "Mecânica dos solos", codigoSae: "4644", novo: "Mecânica dos Solos" },
  { moldeId: 2331, moldeAtual: "Projetos em construção civil", codigoSae: "2138", novo: "Projetos em Construção Civil" },
  { moldeId: 2332, moldeAtual: "Segurança do trabalho na construção civil", codigoSae: "2135", novo: "Segurança do Trabalho na Construção Civil" },
  { moldeId: 2333, moldeAtual: "Técnicas construtivas", codigoSae: "2136", novo: "Técnicas Construtivas" },
  { moldeId: 2335, moldeAtual: "Administração portuária", codigoSae: "4185", novo: "Administração Portuária" },
  { moldeId: 2336, moldeAtual: "Legislação portuária", codigoSae: "4183", novo: "Legislação Portuária" },
  { moldeId: 2337, moldeAtual: "Espanhol técnico", codigoSae: "1306", novo: "Espanhol Técnico" },
  { moldeId: 2338, moldeAtual: "Logística de cargas", codigoSae: "4187", novo: "Logística de Cargas" },
  { moldeId: 2339, moldeAtual: "Operações com cargas", codigoSae: "4321", novo: "Operações com Cargas" },
  { moldeId: 2340, moldeAtual: "Regulamentação aduaneira", codigoSae: "4184", novo: "Regulamentação Aduaneira" },
  { moldeId: 2341, moldeAtual: "Transporte marítimo", codigoSae: "4322", novo: "Transporte Marítimo" },
  { moldeId: 2342, moldeAtual: "Microbiologia dos alimentos", codigoSae: "3072", novo: "Microbiologia dos Alimentos" },
  { moldeId: 2343, moldeAtual: "Nutrição e saúde", codigoSae: "6143", novo: "Nutrição e Saúde" },
  { moldeId: 2344, moldeAtual: "Análise de alimentos", codigoSae: "3018", novo: "Análise de Alimentos" },
  { moldeId: 2345, moldeAtual: "Bioquímica de alimentos", codigoSae: "3001", novo: "Bioquímica de Alimentos" },
  { moldeId: 2346, moldeAtual: "Conservação de alimentos", codigoSae: "3003", novo: "Conservação de Alimentos" },
  { moldeId: 2347, moldeAtual: "Novas tecnologias", codigoSae: "1360", novo: "Novas Tecnologias" },
  { moldeId: 2348, moldeAtual: "Prática de higienização e legislação dos alimentos", codigoSae: "2062", novo: "Prática de Higienização e Legislação dos Alimentos" },
  { moldeId: 2349, moldeAtual: "Química dos alimentos", codigoSae: "6792", novo: "Química dos Alimentos" },
  { moldeId: 2350, moldeAtual: "Tecnologias de carnes e derivados", codigoSae: "4342", novo: "Tecnologias de Carnes e Derivados" },
  { moldeId: 2351, moldeAtual: "Tecnologias de lacticínios", codigoSae: "4340", novo: "Tecnologias de Lacticínios" },
  { moldeId: 2352, moldeAtual: "Tecnologias de processamento vegetal", codigoSae: "4339", novo: "Tecnologias de Processamento Vegetal" },
  { moldeId: 2353, moldeAtual: "Iluminação, cenografia e sonoplastia", codigoSae: "2524", novo: "Iluminação, Cenografia e Sonoplastia" },
  { moldeId: 2354, moldeAtual: "Laboratório de montagem teatral", codigoSae: "2528", novo: "Laboratório de Montagem Teatral" },
  { moldeId: 2355, moldeAtual: "Expressão corporal", codigoSae: "2511", novo: "Expressão Corporal" },
  { moldeId: 2356, moldeAtual: "Improvisação teatral", codigoSae: "2525", novo: "Improvisação Teatral" },
  { moldeId: 2357, moldeAtual: "Indumentária e caracterização", codigoSae: "2526", novo: "Indumentária e Caracterização" },
  { moldeId: 2358, moldeAtual: "Interpretação teatral", codigoSae: "2527", novo: "Interpretação Teatral" },
  { moldeId: 2359, moldeAtual: "Organização e produção teatral", codigoSae: "2529", novo: "Organização e Produção Teatral" },
  { moldeId: 2360, moldeAtual: "Técnicas de expressão vocal", codigoSae: "2517", novo: "Técnicas de Expressão Vocal" },
  { moldeId: 2361, moldeAtual: "Fundamentos da biotecnologia", codigoSae: "3191", novo: "Fundamentos da Biotecnologia" },
  { moldeId: 2363, moldeAtual: "Processos industriais", codigoSae: "805", novo: "Processos Industriais" },
  { moldeId: 2365, moldeAtual: "Gestão da qualidade", codigoSae: "348", novo: "Gestão da Qualidade" },
  { moldeId: 2366, moldeAtual: "Microbiologia industrial", codigoSae: "3067", novo: "Microbiologia Industrial" },
  { moldeId: 2367, moldeAtual: "Processos agroindustriais", codigoSae: "4072", novo: "Processos Agroindustriais" },
  { moldeId: 2368, moldeAtual: "Análise ambiental", codigoSae: "3028", novo: "Análise Ambiental" },
  { moldeId: 2369, moldeAtual: "Química analítica aplicada", codigoSae: "865", novo: "Química Analítica Aplicada" },
  { moldeId: 2370, moldeAtual: "Sustentabilidade nos processos de produção", codigoSae: "5553", novo: "Sustentabilidade nos Processos de Produção" },
  { moldeId: 2371, moldeAtual: "Programação e monitoramento da produção", codigoSae: "5550", novo: "Programação e Monitoramento da Produção" },
  { moldeId: 2373, moldeAtual: "Planejamento da produção", codigoSae: "5548", novo: "Planejamento da Produção" },
  { moldeId: 2374, moldeAtual: "Tecnologia da informação e comunicação", codigoSae: "1818", novo: "Tecnologia da Informação e Comunicação" },
  { moldeId: 2375, moldeAtual: "Gestão organizacional", codigoSae: "6372", novo: "Gestão Organizacional" },
  { moldeId: 2376, moldeAtual: "Gestão de projetos e processos", codigoSae: "5549", novo: "Gestão de Projetos e Processos" },
  { moldeId: 2377, moldeAtual: "Programação e monitoramento da produção I", codigoSae: "6628", novo: "Programação e Monitoramento da Produção I" },
  { moldeId: 2378, moldeAtual: "Gestão das equipes de trabalho", codigoSae: "5551", novo: "Gestão das Equipes de Trabalho" },
  { moldeId: 2379, moldeAtual: "Processos de manutenção e melhoria da produção", codigoSae: "5552", novo: "Processos de Manutenção e Melhoria da Produção" },
  { moldeId: 2380, moldeAtual: "Gestão da produção e qualidade", codigoSae: "4388", novo: "Gestão da Produção e Qualidade" },
  { moldeId: 2381, moldeAtual: "Legislação e normas", codigoSae: "3029", novo: "Legislação e Normas" },
  { moldeId: 2382, moldeAtual: "Química aplicada ao meio ambiente", codigoSae: "1155", novo: "Química Aplicada ao Meio Ambiente" },
  { moldeId: 2384, moldeAtual: "Química analítica", codigoSae: "807", novo: "Química Analítica" },
  { moldeId: 2385, moldeAtual: "Química inorgânica", codigoSae: "813", novo: "Química Inorgânica" },
  { moldeId: 2386, moldeAtual: "Química orgânica", codigoSae: "814", novo: "Química Orgânica" },
  { moldeId: 2387, moldeAtual: "História da moda, arte e cultura", codigoSae: "874", novo: "História da Moda, Arte e Cultura" },
  { moldeId: 2388, moldeAtual: "Segurança e saúde ocupacional", codigoSae: "4316", novo: "Segurança e Saúde Ocupacional" },
  { moldeId: 2389, moldeAtual: "Fundamentos da indústria e do vestuário", codigoSae: "873", novo: "Fundamentos da Indústria e do Vestuário" },
  { moldeId: 2390, moldeAtual: "Planejamento e controle da produção do vestuário", codigoSae: "878", novo: "Planejamento e Controle da Produção do Vestuário" },
  { moldeId: 2391, moldeAtual: "Design e criação do vestuário", codigoSae: "872", novo: "Design e Criação do Vestuário" },
  { moldeId: 2392, moldeAtual: "Máquinas e equipamentos do vestuário", codigoSae: "875", novo: "Máquinas e Equipamentos do Vestuário" },
  { moldeId: 2393, moldeAtual: "Materiais têxteis e aviamentos", codigoSae: "876", novo: "Materiais Têxteis e Aviamentos" },
  { moldeId: 2394, moldeAtual: "Modelagem e produção industrial", codigoSae: "877", novo: "Modelagem e Produção Industrial" },
  { moldeId: 2395, moldeAtual: "Risco e corte da confecção industrial", codigoSae: "879", novo: "Risco e Corte da Confecção Industrial" },
  { moldeId: 2396, moldeAtual: "Administração e economia rural", codigoSae: "4602", novo: "Administração e Economia Rural" },
  { moldeId: 2397, moldeAtual: "Cadeias produtivas I", codigoSae: "6617", novo: "Cadeias Produtivas I" },
  { moldeId: 2399, moldeAtual: "Cadeias produtivas", codigoSae: "5035", novo: "Cadeias Produtivas" },
  { moldeId: 2400, moldeAtual: "Tecnologias emergentes", codigoSae: "5037", novo: "Tecnologias Emergentes" },
  { moldeId: 2401, moldeAtual: "Legislação agrária e ambiental", codigoSae: "2125", novo: "Legislação Agrária e Ambiental" },
  { moldeId: 2403, moldeAtual: "Práticas sustentáveis", codigoSae: "3944", novo: "Práticas Sustentáveis" },
  { moldeId: 2404, moldeAtual: "Administração e economia rural I", codigoSae: "6619", novo: "Administração e Economia Rural I" },
  { moldeId: 2406, moldeAtual: "Marketing e mercado agrícola", codigoSae: "4746", novo: "Marketing e Mercado Agrícola" },
  { moldeId: 2407, moldeAtual: "Gestão de empresas turísticas", codigoSae: "5568", novo: "Gestão de Empresas Turísticas" },
  { moldeId: 2408, moldeAtual: "Aspectos geográficos, culturais, históricos e turísticos do Paraná", codigoSae: "5530", novo: "Aspectos Geográficos, Culturais, Históricos e Turísticos do Paraná" },
  { moldeId: 2409, moldeAtual: "Aspectos geográficos e históricos do turismo brasileiro", codigoSae: "5567", novo: "Aspectos Geográficos e Históricos do Turismo Brasileiro" },
  { moldeId: 2410, moldeAtual: "Fundamentos do turismo e da hospitalidade", codigoSae: "4942", novo: "Fundamentos do Turismo e da Hospitalidade" },
  { moldeId: 2411, moldeAtual: "Produtos e serviços turísticos", codigoSae: "5562", novo: "Produtos e Serviços Turísticos" },
  { moldeId: 2412, moldeAtual: "Agências de viagens", codigoSae: "5563", novo: "Agências de Viagens" },
  { moldeId: 2413, moldeAtual: "Comunicação e atendimento ao cliente", codigoSae: "5565", novo: "Comunicação e Atendimento ao Cliente" },
  { moldeId: 2414, moldeAtual: "Patrimônio, museu e turismo cultural", codigoSae: "5564", novo: "Patrimônio, Museu e Turismo Cultural" },
  { moldeId: 2415, moldeAtual: "Planejamento de roteiros turísticos", codigoSae: "5566", novo: "Planejamento de Roteiros Turísticos" },
  { moldeId: 2416, moldeAtual: "Marketing aplicado ao turismo", codigoSae: "5569", novo: "Marketing Aplicado ao Turismo" },
  { moldeId: 2417, moldeAtual: "Prática profissional em agenciamento de viagem", codigoSae: "5570", novo: "Prática Profissional em Agenciamento de Viagem" },
  { moldeId: 2418, moldeAtual: "Tecnologia da informação aplicada ao turismo", codigoSae: "5571", novo: "Tecnologia da Informação Aplicada ao Turismo" },
  { moldeId: 2419, moldeAtual: "Gestão e negócios na gastronomia", codigoSae: "5517", novo: "Gestão e Negócios na Gastronomia" },
  { moldeId: 2420, moldeAtual: "Higiene e segurança alimentar", codigoSae: "1832", novo: "Higiene e Segurança Alimentar" },
  { moldeId: 2421, moldeAtual: "História, arte e cultura dos alimentos", codigoSae: "4276", novo: "História, Arte e Cultura dos Alimentos" },
  { moldeId: 2422, moldeAtual: "Cozinha brasileira", codigoSae: "4271", novo: "Cozinha Brasileira" },
  { moldeId: 2423, moldeAtual: "Cozinha fria", codigoSae: "4272", novo: "Cozinha Fria" },
  { moldeId: 2424, moldeAtual: "Cozinha internacional", codigoSae: "4273", novo: "Cozinha Internacional" },
  { moldeId: 2425, moldeAtual: "Cozinha vegetariana e restritiva", codigoSae: "5516", novo: "Cozinha Vegetariana e Restritiva" },
  { moldeId: 2426, moldeAtual: "Habilidades básicas em cozinha", codigoSae: "5518", novo: "Habilidades Básicas em Cozinha" },
  { moldeId: 2427, moldeAtual: "Panificação e confeitaria", codigoSae: "5519", novo: "Panificação e Confeitaria" },
  { moldeId: 2428, moldeAtual: "Segurança do trabalho e saúde ocupacional", codigoSae: "5520", novo: "Segurança do Trabalho e Saúde Ocupacional" },
  { moldeId: 2429, moldeAtual: "Organização de eventos", codigoSae: "432", novo: "Organização de Eventos" },
  { moldeId: 2430, moldeAtual: "Marketing na gastronomia", codigoSae: "5521", novo: "Marketing na Gastronomia" },
  { moldeId: 2431, moldeAtual: "Empreendedorismo e inovação", codigoSae: "3947", novo: "Empreendedorismo e Inovação" },
  { moldeId: 2432, moldeAtual: "Teoria e técnica", codigoSae: "4934", novo: "Teoria e Técnica Profissional" },
  { moldeId: 2433, moldeAtual: "Patrimônio histórico- cultural e turismo", codigoSae: "504", novo: "Patrimônio Histórico- Cultural e Turismo" },
  { moldeId: 2434, moldeAtual: "Legislação aplicada ao turismo", codigoSae: "423", novo: "Legislação Aplicada ao Turismo" },
  { moldeId: 2435, moldeAtual: "Conversação língua inglesa", codigoSae: "3353", novo: "Conversação Língua Inglesa" },
  { moldeId: 2436, moldeAtual: "Técnicas de comunicação", codigoSae: "190", novo: "Técnicas de Comunicação" },
  { moldeId: 2437, moldeAtual: "Gestão de eventos", codigoSae: "5524", novo: "Gestão de Eventos" },
  { moldeId: 2438, moldeAtual: "Introdução ao turismo e a hospitalidade", codigoSae: "3074", novo: "Introdução ao Turismo e a Hospitalidade" },
  { moldeId: 2439, moldeAtual: "Meios de hospedagem", codigoSae: "416", novo: "Meios de Hospedagem" },
  { moldeId: 2440, moldeAtual: "Rotinas de governança e manutenção", codigoSae: "5522", novo: "Rotinas de Governança e Manutenção" },
  { moldeId: 2441, moldeAtual: "Gestão de reservas", codigoSae: "5523", novo: "Gestão de Reservas" },
  { moldeId: 2442, moldeAtual: "Marketing hoteleiro e mídias digitais", codigoSae: "5525", novo: "Marketing Hoteleiro e Mídias Digitais" },
  { moldeId: 2443, moldeAtual: "Administração nos meios de hospedagem", codigoSae: "3073", novo: "Administração nos Meios de Hospedagem" },
  { moldeId: 2444, moldeAtual: "Legislação aplicada aos meios de hospedagem", codigoSae: "5526", novo: "Legislação Aplicada aos Meios de Hospedagem" },
  { moldeId: 2445, moldeAtual: "Introdução a gestão de alimentos e bebidas", codigoSae: "5527", novo: "Introdução a Gestão de Alimentos e Bebidas" },
  { moldeId: 2446, moldeAtual: "Rotina de recepção e atendimento ao cliente", codigoSae: "5528", novo: "Rotina de Recepção e Atendimento ao Cliente" },
  { moldeId: 2447, moldeAtual: "Empreendedorismo e inovação na hospedagem", codigoSae: "5531", novo: "Empreendedorismo e Inovação na Hospedagem" },
  { moldeId: 2448, moldeAtual: "Tecnologia da informação aplicada a hospedagem", codigoSae: "5529", novo: "Tecnologia da Informação Aplicada a Hospedagem" },
  { moldeId: 2449, moldeAtual: "Liderança e gestão de empresas", codigoSae: "6444", novo: "Liderança e Gestão de Empresas" },
  { moldeId: 2450, moldeAtual: "Música e lazer", codigoSae: "6432", novo: "Música e Lazer" },
  { moldeId: 2451, moldeAtual: "Lazer e artes visuais", codigoSae: "6425", novo: "Lazer e Artes Visuais" },
  { moldeId: 2452, moldeAtual: "Recreação e ludicidade", codigoSae: "6421", novo: "Recreação e Ludicidade" },
  { moldeId: 2453, moldeAtual: "Lazer e cultura digital", codigoSae: "6422", novo: "Lazer e Cultura Digital" },
  { moldeId: 2454, moldeAtual: "Práticas em lazer", codigoSae: "6423", novo: "Práticas em Lazer" },
  { moldeId: 2455, moldeAtual: "Produção e gestão cultural", codigoSae: "6426", novo: "Produção e Gestão Cultural" },
  { moldeId: 2456, moldeAtual: "Teoria do lazer", codigoSae: "6428", novo: "Teoria do Lazer" },
  { moldeId: 2457, moldeAtual: "Contação de histórias", codigoSae: "6430", novo: "Contação de Histórias" },
  { moldeId: 2459, moldeAtual: "Produção de eventos", codigoSae: "6431", novo: "Produção de Eventos" },
  { moldeId: 2460, moldeAtual: "Noções de primeiros socorros", codigoSae: "6166", novo: "Noções de Primeiros Socorros" },
  { moldeId: 2461, moldeAtual: "Lazer e inclusão", codigoSae: "6424", novo: "Lazer e Inclusão" },
  { moldeId: 2462, moldeAtual: "Tecnologia e inovação", codigoSae: "3935", novo: "Tecnologia e Inovação" },
  { moldeId: 2463, moldeAtual: "Programação com Python 1", codigoSae: "6599", novo: "Programação com Python I" },
  { moldeId: 2464, moldeAtual: "Inteligência artificial e prompts", codigoSae: "6602", novo: "Inteligência Artificial e Prompts" },
  { moldeId: 2465, moldeAtual: "Ciências de dados", codigoSae: "4763", novo: "Ciências de Dados" },
  { moldeId: 2466, moldeAtual: "Programação com Python 2", codigoSae: "6600", novo: "Programação com Python II" },
  { moldeId: 2467, moldeAtual: "Banco de dados aplicado", codigoSae: "6607", novo: "Banco de Dados Aplicado" },
  { moldeId: 2469, moldeAtual: "Educação midiática", codigoSae: "6609", novo: "Educação Midiática" },
  { moldeId: 2470, moldeAtual: "Programação avançada", codigoSae: "6610", novo: "Programação Avançada" },
  { moldeId: 2471, moldeAtual: "Segurança digital", codigoSae: "6612", novo: "Segurança Digital" },
  { moldeId: 2473, moldeAtual: "Visualização de dados", codigoSae: "6614", novo: "Visualização de Dados" },
];

async function main() {
  const client = new Client({ connectionString: carregarDatabaseUrl() });
  await client.connect();

  const linhasSaida = [];
  const log = (msg = '') => { linhasSaida.push(String(msg)); console.log(msg); };

  log(`Modo: ${APLICAR ? 'APLICAR (COMMIT)' : 'DRY-RUN (ROLLBACK)'}`);
  log(`Total de disciplinas a sincronizar: ${CONVERSOES.length}\n`);

  try {
    await client.query('BEGIN');
    let divergencias = 0;
    let atualizadas = 0;

    for (const item of CONVERSOES) {
      const { rows } = await client.query(
        `SELECT id, nome, codigo_sae FROM disciplinas WHERE id = $1 AND escola_id = 'catalogo_geral'`,
        [item.moldeId]
      );

      if (rows.length === 0) {
        log(`[AVISO] molde id=${item.moldeId} não encontrado — pulando.`);
        divergencias++;
        continue;
      }

      const atual = rows[0];
      if (atual.nome !== item.moldeAtual || atual.codigo_sae !== item.codigoSae) {
        log(`[DIVERGÊNCIA] molde id=${item.moldeId}: esperado nome="${item.moldeAtual}" codigo_sae="${item.codigoSae}", encontrado nome="${atual.nome}" codigo_sae="${atual.codigo_sae}" — pulando por segurança.`);
        divergencias++;
        continue;
      }

      await client.query('UPDATE disciplinas SET nome = $1 WHERE id = $2', [item.novo, item.moldeId]);
      log(`molde id=${item.moldeId}: "${item.moldeAtual}" -> "${item.novo}"`);
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
    const relatorioPath = path.join(__dirname, 'sincronizar-molde-catalogo-relatorio.txt');
    fs.writeFileSync(relatorioPath, linhasSaida.join('\n'), { encoding: 'utf8' });
  }
}

main();
