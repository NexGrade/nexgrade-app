// [VIDEO-LOCAL] Substituto do @clerk/react SÓ para gravar os vídeos no PC (nunca vai para a main).
// O vite.config da worktree descartável aponta "@clerk/react" para este arquivo (ver preparar-worktree.sh).
// A pessoa "logada" é uma coordenação simulada na Escola Demonstração (cópia local do banco).
import React from "react";

const ESCOLA_ID = "esc_1ce4d2d30c4146a99fb7ffa5";
const ESCOLA_NOME = "Escola Demonstração NexGrade";
const usuario = {
  id: "u_video",
  fullName: "Coordenação",
  firstName: "Coordenação",
  primaryEmailAddress: { emailAddress: "coordenacao@demonstracao.local" },
  imageUrl: "",
};
const organizacao = { id: ESCOLA_ID, name: ESCOLA_NOME, imageUrl: "" };

export const ClerkProvider = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
export const SignIn = () => null;
export const SignUp = () => null;
export const Show = ({ when, children }: { when: string; children?: React.ReactNode }) => (when === "signed-in" ? <>{children}</> : null);
export const SignOutButton = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
export const UserButton = () => null;
export const OrganizationSwitcher = () => (
  <span className="px-3 py-1.5 text-sm font-medium text-slate-700">{ESCOLA_NOME}</span>
);

const auth = {
  isLoaded: true,
  isSignedIn: true,
  userId: usuario.id,
  orgId: ESCOLA_ID,
  orgRole: "org:admin",
  getToken: async () => "token-video-local",
  signOut: async () => {},
};
export const useAuth = () => auth;
export const useUser = () => ({ isLoaded: true, isSignedIn: true, user: usuario });
export const useClerk = () => ({ signOut: async () => {} });
export const useOrganization = () => ({ isLoaded: true, organization: organizacao, membership: { role: "org:admin", publicMetadata: {} } });
export const useOrganizationList = () => ({
  isLoaded: true,
  userMemberships: { data: [{ organization: organizacao }] },
  setActive: async () => {},
});

// "@clerk/react/internal" e "@clerk/themes"
export const publishableKeyFromHost = () => "pk_test_video_local";
export const shadcn = {};
