// [USUARIOS-CARGOS] (2026-10-01) Acessos da escola direto do Clerk (fonte da verdade
// de quem entra e com qual papel). A tabela "usuarios" antiga nao controla acesso.
// Leitura so para a coordenacao (a lista tem e-mails); alteracoes ja passam pelo
// filtro geral (lib/permissao.ts), que so libera org:admin.
import { Router } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { z } from "zod";
import { getEscolaId } from "../lib/escola-id";

const router = Router();

export const CARGOS = {
  direcao: { papel: "org:admin", rotulo: "Direção" },
  coordenacao: { papel: "org:admin", rotulo: "Coordenação" },
  reservas: { papel: "org:reservas", rotulo: "Gestor de reservas" },
  professor: { papel: "org:member", rotulo: "Professor" },
} as const;
type Cargo = keyof typeof CARGOS;
const CargoEnum = z.enum(["direcao", "coordenacao", "reservas", "professor"]);

function cargoDe(papel: string, meta: unknown): Cargo {
  const c = (meta as { cargo?: string } | null | undefined)?.cargo;
  if (c && c in CARGOS && CARGOS[c as Cargo].papel === papel) return c as Cargo;
  if (papel === "org:admin") return "coordenacao";
  if (papel === "org:reservas") return "reservas";
  return "professor";
}

// as versoes do SDK do Clerk devolvem lista pura ou { data, totalCount }
const lista = (r: any): any[] => (Array.isArray(r) ? r : r?.data ?? []);

function mensagemClerk(err: any): { status: number; error: string } {
  const bruto: string = err?.errors?.[0]?.longMessage ?? err?.errors?.[0]?.message ?? "";
  const codigo: string = err?.errors?.[0]?.code ?? "";
  const t = (codigo + " " + bruto).toLowerCase();
  if (t.includes("already a member")) return { status: 409, error: "Este e-mail já tem acesso à escola. Para mudar o cargo, use a lista." };
  if ((t.includes("already") && t.includes("invit")) || t.includes("duplicate")) return { status: 409, error: "Já existe um convite pendente para este e-mail." };
  if (t.includes("role")) return { status: 422, error: "Esse cargo ainda não existe no Clerk. Para Gestor de reservas, crie o papel 'reservas' em Organizations > Roles & Permissions." };
  if (t.includes("email") && (t.includes("invalid") || t.includes("format"))) return { status: 422, error: "E-mail inválido." };
  if (t.includes("last") && t.includes("admin")) return { status: 422, error: "A escola precisa manter pelo menos um usuário da coordenação." };
  return { status: 422, error: bruto || "Não foi possível concluir a operação no Clerk." };
}

function exigirCoordenacao(req: any, res: any): { userId: string; orgId: string } | null {
  const { userId, orgId, orgRole } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Não autenticado." }); return null; }
  if (!orgId) { res.status(400).json({ error: "Escola ainda não configurada." }); return null; }
  if (orgRole !== "org:admin") { res.status(403).json({ error: "Apenas a coordenação da escola pode gerenciar usuários." }); return null; }
  return { userId, orgId };
}

router.get("/", async (req, res) => {
  const ctx = exigirCoordenacao(req, res);
  if (!ctx) return;
  const organizationId = getEscolaId(req);
  try {
    const org: any = clerkClient.organizations;
    const [membros, convites] = await Promise.all([
      org.getOrganizationMembershipList({ organizationId, limit: 500 }),
      org.getOrganizationInvitationList({ organizationId, status: ["pending"], limit: 500 }),
    ]);
    const itens = [
      ...lista(membros).map((m: any) => {
        const u = m.publicUserData ?? {};
        const cargo = cargoDe(m.role, m.publicMetadata);
        const nome = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.identifier || "Sem nome";
        return {
          tipo: "membro" as const, id: u.userId as string, nome, email: (u.identifier ?? "") as string,
          cargo, rotuloCargo: CARGOS[cargo].rotulo, papel: m.role as string, ehVoce: u.userId === ctx.userId,
        };
      }),
      ...lista(convites).map((i: any) => {
        const cargo = cargoDe(i.role, i.publicMetadata);
        const nome = (i.publicMetadata?.nome as string) || i.emailAddress;
        return {
          tipo: "convite" as const, id: i.id as string, nome, email: i.emailAddress as string,
          cargo, rotuloCargo: CARGOS[cargo].rotulo, papel: i.role as string, ehVoce: false,
        };
      }),
    ].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    res.json(itens);
  } catch (err) {
    const m = mensagemClerk(err);
    res.status(m.status).json({ error: m.error });
  }
});

router.post("/convites", async (req, res) => {
  const ctx = exigirCoordenacao(req, res);
  if (!ctx) return;
  const parsed = z.object({
    nome: z.string().trim().min(2, "Informe o nome."),
    email: z.string().trim().email("E-mail inválido."),
    cargo: CargoEnum,
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }); return; }
  const { nome, email, cargo } = parsed.data;
  try {
    await (clerkClient.organizations as any).createOrganizationInvitation({
      organizationId: getEscolaId(req),
      inviterUserId: ctx.userId,
      emailAddress: email,
      role: CARGOS[cargo].papel,
      publicMetadata: { cargo, nome },
    });
    res.status(201).json({ ok: true, mensagem: "Convite enviado para " + email + " como " + CARGOS[cargo].rotulo + "." });
  } catch (err) {
    const m = mensagemClerk(err);
    res.status(m.status).json({ error: m.error });
  }
});

router.patch("/membros/:userId", async (req, res) => {
  const ctx = exigirCoordenacao(req, res);
  if (!ctx) return;
  const userId = String(req.params.userId);
  if (userId === ctx.userId) { res.status(400).json({ error: "Você não pode alterar o seu próprio cargo." }); return; }
  const parsed = z.object({ cargo: CargoEnum }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Cargo inválido." }); return; }
  const cargo = parsed.data.cargo;
  const organizationId = getEscolaId(req);
  const org: any = clerkClient.organizations;
  try {
    await org.updateOrganizationMembership({ organizationId, userId, role: CARGOS[cargo].papel });
    try { // so para exibir Direcao x Coordenacao; nao muda acesso
      await org.updateOrganizationMembershipMetadata({ organizationId, userId, publicMetadata: { cargo } });
    } catch { /* nao bloqueia */ }
    res.json({ ok: true, mensagem: "Cargo alterado para " + CARGOS[cargo].rotulo + "." });
  } catch (err) {
    const m = mensagemClerk(err);
    res.status(m.status).json({ error: m.error });
  }
});

router.delete("/membros/:userId", async (req, res) => {
  const ctx = exigirCoordenacao(req, res);
  if (!ctx) return;
  const userId = String(req.params.userId);
  if (userId === ctx.userId) { res.status(400).json({ error: "Você não pode remover o seu próprio acesso." }); return; }
  try {
    await (clerkClient.organizations as any).deleteOrganizationMembership({ organizationId: getEscolaId(req), userId });
    res.json({ ok: true, mensagem: "Acesso removido." });
  } catch (err) {
    const m = mensagemClerk(err);
    res.status(m.status).json({ error: m.error });
  }
});

router.delete("/convites/:id", async (req, res) => {
  const ctx = exigirCoordenacao(req, res);
  if (!ctx) return;
  try {
    await (clerkClient.organizations as any).revokeOrganizationInvitation({
      organizationId: getEscolaId(req),
      invitationId: String(req.params.id),
      requestingUserId: ctx.userId,
    });
    res.json({ ok: true, mensagem: "Convite cancelado." });
  } catch (err) {
    const m = mensagemClerk(err);
    res.status(m.status).json({ error: m.error });
  }
});

export default router;
