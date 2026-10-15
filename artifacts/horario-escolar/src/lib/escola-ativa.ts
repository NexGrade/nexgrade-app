// [ACESSOS-ESCOLA] (15/10/2026) Escola escolhida pela pessoa (quem tem acesso a mais de
// uma escola). Fica no navegador e vai em toda chamada a /api no cabecalho X-Escola-Id;
// o servidor sempre confere se a pessoa tem acesso a ela (lib/acesso.ts no api-server).
// Com ACESSOS_PELO_BANCO desligado no servidor, o cabecalho e simplesmente ignorado.
const CHAVE = "nexgrade.escolaAtiva";

export function lerEscolaAtiva(): string | null {
  try {
    return window.localStorage.getItem(CHAVE);
  } catch {
    return null;
  }
}

export function gravarEscolaAtiva(id: string | null): void {
  try {
    if (id) window.localStorage.setItem(CHAVE, id);
    else window.localStorage.removeItem(CHAVE);
  } catch {
    // navegador sem armazenamento: o servidor usa a primeira escola da pessoa
  }
}

function urlDe(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function ehChamadaDaApi(url: string): boolean {
  try {
    const u = new URL(url, window.location.href);
    return u.origin === window.location.origin && u.pathname.includes("/api/") && !u.pathname.includes("/__clerk");
  } catch {
    return false;
  }
}

/** Instala uma vez: acrescenta X-Escola-Id nas chamadas a /api do proprio site. */
export function instalarCabecalhoEscola(): void {
  const w = window as Window & { __nexgradeEscolaFetch?: boolean };
  if (w.__nexgradeEscolaFetch) return;
  w.__nexgradeEscolaFetch = true;
  const original = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const escola = lerEscolaAtiva();
    if (!escola || !ehChamadaDaApi(urlDe(input))) return original(input, init);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    if (!headers.has("x-escola-id")) headers.set("x-escola-id", escola);
    return original(input, { ...init, headers });
  };
}

/** Troca de escola: grava a escolha e recarrega o app do zero (sem dados da escola anterior). */
export function trocarDeEscola(id: string, basePath: string): void {
  gravarEscolaAtiva(id);
  window.location.href = (basePath || "") + "/";
}
