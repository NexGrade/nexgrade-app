// [PAPEL-RESERVAS] papeis da organizacao Clerk usados no frontend.
// O backend tem as mesmas regras em artifacts/api-server/src/lib/permissao.ts.
// [GESTOR-METADATA] plano Hobby do Clerk: so 2 papeis. O gestor de reservas e
// org:member com publicMetadata.cargo = "reservas" na membership.
import { useAuth, useOrganization } from "@clerk/react";

export const PAPEL_ADMIN = "org:admin";
export const PAPEL_MEMBRO = "org:member";
export const PAPEL_RESERVAS = "org:reservas"; // so existe com plano pago do Clerk
export const CARGO_RESERVAS = "reservas";

/** Gestor de reservas pelo papel (plano pago) ou pela anotacao da membership. */
export function usePapelEfetivo(): { ehGestor: boolean; carregando: boolean } {
  const { orgRole } = useAuth();
  const { membership, isLoaded } = useOrganization();
  if (orgRole === PAPEL_RESERVAS) return { ehGestor: true, carregando: false };
  if (orgRole !== PAPEL_MEMBRO) return { ehGestor: false, carregando: false };
  if (!isLoaded) return { ehGestor: false, carregando: true };
  const cargo = (membership?.publicMetadata as { cargo?: string } | undefined)?.cargo;
  return { ehGestor: cargo === CARGO_RESERVAS, carregando: false };
}

// [CONSULTA-GESTOR] true quando o usuario logado e gestor de reservas (so consulta a grade)
export function useEhGestorReservas(): boolean {
  return usePapelEfetivo().ehGestor;
}
