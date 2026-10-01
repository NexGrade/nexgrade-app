// [PAPEL-RESERVAS] papeis da organizacao Clerk usados no frontend.
// O backend tem as mesmas constantes em artifacts/api-server/src/lib/permissao.ts.
import { useAuth } from "@clerk/react";

export const PAPEL_ADMIN = "org:admin";
export const PAPEL_RESERVAS = "org:reservas"; // gestor da agenda de reservas

// [CONSULTA-GESTOR] true quando o usuario logado e gestor de reservas (so consulta a grade)
export function useEhGestorReservas(): boolean {
  const { orgRole } = useAuth();
  return orgRole === PAPEL_RESERVAS;
}
