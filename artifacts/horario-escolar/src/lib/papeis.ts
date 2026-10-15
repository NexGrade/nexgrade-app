// [PAPEL-RESERVAS] papeis da organizacao Clerk usados no frontend.
// O backend tem as mesmas regras em artifacts/api-server/src/lib/permissao.ts.
// [GESTOR-METADATA] plano Hobby do Clerk: so 2 papeis. O gestor de reservas e
// org:member com publicMetadata.cargo = "reservas" na membership.
// [ACESSOS-ESCOLA] (15/10/2026) Quando o servidor tem ACESSOS_PELO_BANCO=1, escola e cargo
// vem de GET /api/eu (nosso banco) e o Clerk fica so para o login. Desligado, /api/eu
// responde { pelobanco: false } e tudo segue pelas organizacoes do Clerk, como antes.
import { useEffect, useState } from "react";
import { useAuth, useOrganization, useOrganizationList } from "@clerk/react";
import { useQuery } from "@tanstack/react-query";
import { customFetch, ApiError } from "@workspace/api-client-react";
import { lerEscolaAtiva, gravarEscolaAtiva } from "./escola-ativa";

export const PAPEL_ADMIN = "org:admin";
export const PAPEL_MEMBRO = "org:member";
export const PAPEL_RESERVAS = "org:reservas"; // so existe com plano pago do Clerk
export const CARGO_RESERVAS = "reservas";

export type CargoEscola = "direcao" | "coordenacao" | "secretaria" | "reservas" | "professor";
export type EscolaDoUsuario = { escolaId: string; nome: string; cargo: CargoEscola; rotuloCargo: string };
export type Eu =
  | { pelobanco: false }
  | {
      pelobanco: true;
      email: string | null;
      escolaAtual: string | null;
      nomeEscola: string | null;
      cargo: CargoEscola | null;
      rotuloCargo: string | null;
      escolas: EscolaDoUsuario[];
    };

const URL_EU = "/api/eu";

async function buscarEu(): Promise<Eu> {
  let eu: Eu;
  try {
    eu = await customFetch<Eu>(URL_EU, { responseType: "json" });
  } catch (e) {
    // escola guardada no navegador que a pessoa nao acessa mais: esquece e tenta de novo
    if (e instanceof ApiError && e.status === 403 && lerEscolaAtiva()) {
      gravarEscolaAtiva(null);
      eu = await customFetch<Eu>(URL_EU, { responseType: "json" });
    } else {
      throw e;
    }
  }
  if (eu.pelobanco && eu.escolaAtual && lerEscolaAtiva() !== eu.escolaAtual) gravarEscolaAtiva(eu.escolaAtual);
  return eu;
}

/** Quem esta logado, suas escolas e cargo (com a chave do servidor ligada). */
export function useEu() {
  const { isLoaded, isSignedIn } = useAuth();
  return useQuery({
    queryKey: ["eu"],
    queryFn: buscarEu,
    enabled: !!isLoaded && !!isSignedIn,
    staleTime: 60_000,
    retry: 1,
  });
}

export type PapelEfetivo = {
  carregando: boolean;
  /** escola e cargo pelo nosso banco (ACESSOS_PELO_BANCO=1) */
  pelobanco: boolean;
  /** com a chave ligada: e-mail sem nenhuma escola liberada */
  semEscola: boolean;
  ehGestor: boolean;
  /** so a Minha Agenda (professor, ou membro comum do Clerk) */
  ehProfessor: boolean;
};

/** Cargo da pessoa na escola atual: pelo nosso banco (chave ligada) ou pelo Clerk. */
export function usePapelEfetivo(): PapelEfetivo {
  const { orgRole, isSignedIn } = useAuth();
  const { membership, isLoaded } = useOrganization();
  const eu = useEu();

  if (isSignedIn && eu.isLoading) return { carregando: true, pelobanco: false, semEscola: false, ehGestor: false, ehProfessor: false };
  if (eu.data?.pelobanco) {
    const c = eu.data.cargo;
    return { carregando: false, pelobanco: true, semEscola: !c, ehGestor: c === "reservas", ehProfessor: c === "professor" };
  }

  // como antes: organizacoes do Clerk (tambem se /api/eu falhar)
  const base = { pelobanco: false, semEscola: false };
  if (orgRole === PAPEL_RESERVAS) return { ...base, carregando: false, ehGestor: true, ehProfessor: false };
  if (orgRole !== PAPEL_MEMBRO) return { ...base, carregando: false, ehGestor: false, ehProfessor: false };
  if (!isLoaded) return { ...base, carregando: true, ehGestor: false, ehProfessor: false };
  const cargo = (membership?.publicMetadata as { cargo?: string } | undefined)?.cargo;
  const ehGestor = cargo === CARGO_RESERVAS;
  return { ...base, carregando: false, ehGestor, ehProfessor: !ehGestor };
}

// [CONSULTA-GESTOR] true quando o usuario logado e gestor de reservas (so consulta a grade)
export function useEhGestorReservas(): boolean {
  return usePapelEfetivo().ehGestor;
}

// [ORG-AUTO] Convidado que entra sem escola ativa: ativa a primeira escola da qual
// ele ja e membro, em vez de cair no cadastro de escola nova (/onboarding).
// "aguardando" = ainda decidindo/ativando (nao redirecionar para o onboarding).
// [ACESSOS-ESCOLA] com a chave ligada nao ha organizacao do Clerk a ativar.
export function useAtivarEscolaDoMembro(): { aguardando: boolean; falhou: boolean } {
  const [falhou, setFalhou] = useState(false); // [ORG-AUTO] setActive recusado: nao ficar carregando para sempre
  const { orgId, isLoaded: authOk } = useAuth();
  const eu = useEu();
  const euPronto = !eu.isLoading;
  const pelobanco = !!eu.data?.pelobanco;
  const { isLoaded, userMemberships, setActive } = useOrganizationList({
    userMemberships: { infinite: false, pageSize: 5 },
  });
  const primeira = userMemberships?.data?.[0]?.organization?.id;
  useEffect(() => {
    if (euPronto && !pelobanco && authOk && !orgId && isLoaded && primeira && setActive) {
      setActive({ organization: primeira }).catch(() => setFalhou(true));
    }
  }, [euPronto, pelobanco, authOk, orgId, isLoaded, primeira, setActive]);
  if (pelobanco) return { aguardando: false, falhou: false };
  if (!euPronto && authOk) return { aguardando: true, falhou: false };
  if (!authOk || orgId) return { aguardando: false, falhou: false };
  if (falhou) return { aguardando: false, falhou: true };
  // espera a lista de escolas do usuario chegar de verdade: antes disso (data ainda
  // indefinido) nao da para saber se ele ja pertence a alguma escola
  if (!isLoaded || !userMemberships || userMemberships.isLoading || userMemberships.data === undefined) return { aguardando: true, falhou: false };
  return { aguardando: !!primeira, falhou: false };
}
