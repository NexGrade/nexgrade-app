with open("artifacts/horario-escolar/src/pages/professores/index.tsx", "r", encoding="utf-8") as f:
    conteudo = f.read()

antigo_import1 = 'import { useListProfessores, useDeleteProfessor, getListProfessoresQueryKey, useListDisciplinas } from "@workspace/api-client-react";'
novo_import1 = 'import { useListProfessores, useDeleteProfessor, useConvidarProfessorPortal, getListProfessoresQueryKey, useListDisciplinas } from "@workspace/api-client-react";'
assert antigo_import1 in conteudo, "IMPORT 1 NAO ENCONTRADO"
conteudo = conteudo.replace(antigo_import1, novo_import1)

antigo_import2 = 'import { Plus, Edit, Trash2, Users, Mail, Phone, LayoutGrid, List } from "lucide-react";'
novo_import2 = 'import { Plus, Edit, Trash2, Users, Mail, Phone, LayoutGrid, List, Send } from "lucide-react";'
assert antigo_import2 in conteudo, "IMPORT 2 NAO ENCONTRADO"
conteudo = conteudo.replace(antigo_import2, novo_import2)

antigo_hook = "  const deleteProfessor = useDeleteProfessor();"
novo_hook = """  const deleteProfessor = useDeleteProfessor();
  const { toast } = useToast();
  const convidar = useConvidarProfessorPortal({
    mutation: {
      onSuccess: () => toast({ title: "Convite enviado", description: "O professor vai receber um e-mail para acessar o portal." }),
      onError: (err: any) => toast({ title: "Nao foi possivel convidar", description: err?.response?.data?.error ?? "Tente novamente.", variant: "destructive" }),
    },
  });"""
assert antigo_hook in conteudo, "HOOK ANTIGO NAO ENCONTRADO"
conteudo = conteudo.replace(antigo_hook, novo_hook, 1)

antigo_botoes = """                  <div className="flex gap-1">
                    <Link href={`/professores/${professor.id}`}>
                      <Button variant="ghost" size="icon"><Edit className="w-4 h-4" /></Button>
                    </Link>
                    {dialogoExcluir(professor)}
                  </div>"""
novo_botoes = """                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Convidar para o portal do professor"
                      disabled={convidar.isPending}
                      onClick={() => convidar.mutate({ id: professor.id })}
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                    <Link href={`/professores/${professor.id}`}>
                      <Button variant="ghost" size="icon"><Edit className="w-4 h-4" /></Button>
                    </Link>
                    {dialogoExcluir(professor)}
                  </div>"""
assert antigo_botoes in conteudo, "BOTOES ANTIGOS NAO ENCONTRADOS"
conteudo = conteudo.replace(antigo_botoes, novo_botoes, 1)

with open("artifacts/horario-escolar/src/pages/professores/index.tsx", "w", encoding="utf-8") as f:
    f.write(conteudo)

print("OK: botao de convite adicionado")
