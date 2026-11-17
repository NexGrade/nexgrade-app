// [CPSAT-DESPERTADOR] (17/11/2026) Ligar a maquina do motor (VM que se desliga sozinha) e esperar ela responder.
// Caso do C.E. Andre Andreatta (17/11, 17:31): o despertador respondeu 500 do Google ("try again in 30 seconds"); a API
// desistia dele na primeira falha, esperava os 4 min, marcava "Ligando o servidor" como concluido e chamava o motor
// desligado -- a tela dizia "o servidor de calculo nao respondeu" depois de quase 5 min. Agora:
//  - o despertador e chamado de novo a cada 10 s enquanto falhar (erro de rede, 5xx, 409 "ainda desligando");
//  - a espera devolve se o servidor respondeu, e quem chama para com uma mensagem clara quando nao respondeu.
// As dependencias (chamada HTTP, relogio, pausa) entram por parametro para o teste nao esperar de verdade.

export type RespostaDespertador = { status: number; data?: { status?: string; acao?: string } | unknown };

export type DepsDespertador = {
  chamar: () => Promise<RespostaDespertador>;
  agora?: () => number;
  dormir?: (ms: number) => Promise<void>;
  log?: (msg: string) => void;
  maxEsperaMs?: number;
  intervaloMs?: number;
};

const dormirDeVerdade = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));

/** Pede ao despertador para ligar a maquina. true = ele aceitou (200/202); false = desistiu depois do tempo maximo. */
export async function pedirParaLigar(d: DepsDespertador): Promise<boolean> {
  const agora = d.agora ?? Date.now;
  const dormir = d.dormir ?? dormirDeVerdade;
  const log = d.log ?? ((m: string) => console.error(m));
  const max = d.maxEsperaMs ?? 120_000;
  const intervalo = d.intervaloMs ?? 10_000;
  const inicio = agora();
  let tentativa = 0;
  for (;;) {
    tentativa++;
    try {
      const r = await d.chamar();
      if (r.status === 200 || r.status === 202) {
        const dados = (r.data ?? {}) as { status?: string; acao?: string };
        console.log(`[CPSAT-DESPERTADOR] maquina ${dados.status ?? "?"} (acao: ${dados.acao ?? "?"}) na tentativa ${tentativa}`);
        return true;
      }
      // 409 = maquina ainda desligando; 5xx/4xx = falha do despertador (ex.: 500 do Google "try again in 30 seconds")
      log(`[CPSAT-DESPERTADOR] tentativa ${tentativa}: resposta ${r.status}${r.status === 409 ? " (ainda desligando)" : `: ${JSON.stringify(r.data).slice(0, 300)}`}`);
    } catch (err) {
      log(`[CPSAT-DESPERTADOR] tentativa ${tentativa}: falha ao chamar o despertador: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (agora() - inicio + intervalo > max) return false;
    await dormir(intervalo);
  }
}

export type DepsEspera = {
  checar: () => Promise<boolean>;
  agora?: () => number;
  dormir?: (ms: number) => Promise<void>;
  maxEsperaMs?: number;
  intervaloMs?: number;
};

/** Espera o servidor de calculo responder na rota de saude. true = respondeu; false = nao respondeu no tempo maximo. */
export async function esperarServidor(d: DepsEspera): Promise<boolean> {
  const agora = d.agora ?? Date.now;
  const dormir = d.dormir ?? dormirDeVerdade;
  const max = d.maxEsperaMs ?? 90_000;
  const intervalo = d.intervaloMs ?? 3_000;
  const inicio = agora();
  for (;;) {
    try {
      if (await d.checar()) return true;
    } catch {
      // ainda desligado/ligando -- tenta de novo
    }
    if (agora() - inicio >= max) return false;
    await dormir(intervalo);
  }
}

export const MENSAGEM_SERVIDOR_NAO_LIGOU =
  "O servidor de cálculo não ligou. Nada foi calculado nem salvo.";
export const DICA_SERVIDOR_NAO_LIGOU =
  "Tente de novo em 1 ou 2 minutos. Se continuar, avise o suporte NexGrade: a máquina do motor pode precisar ser ligada pelo console do Google Cloud.";
