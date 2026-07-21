import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Bot, User, Sparkles, AlertCircle, Plus, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

type AcaoPendente =
  | { tipo: "definir_disponibilidade"; payload: { professorId: number; diaSemana: number; horarioSlot: number; disponivel: boolean; motivo?: string } }
  | { tipo: "gerar_horario_turma"; payload: { turmaId: number; substituir: boolean } };

type Msg = {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  acaoPendente?: AcaoPendente | null;
  acaoResolvida?: boolean;
};

const SUGESTOES = [
  "Como está a distribuição de aulas da semana?",
  "Quais professores têm mais janelas no horário?",
  "Marque o professor [nome] como indisponível na sexta, 3ª aula",
  "Gere o horário da turma [nome]",
  "Quantas turmas estão sem horário gerado?",
];

export default function AssistentePage() {
  const queryClient = useQueryClient();
  const [mensagens, setMensagens] = useState<Msg[]>([
    {
      role: "assistant",
      content: "Olá! Sou o Assistente de IA do **NexGrade**. Posso ajudar você a analisar a grade horária, identificar conflitos e sugerir melhorias — e, quando você pedir, também posso marcar disponibilidade de professor ou gerar o horário de uma turma (sempre pedindo sua confirmação antes). O que deseja fazer?",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [executandoAcao, setExecutandoAcao] = useState(false);
  const [conversaId, setConversaId] = useState<number | null>(null);
  const [aiIndisponivel, setAiIndisponivel] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens]);

  const enviar = async (texto?: string) => {
    const msg = (texto ?? input).trim();
    if (!msg || loading) return;
    setInput("");
    setLoading(true);

    setMensagens(prev => [...prev, { role: "user", content: msg }]);

    try {
      const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
      console.log("[DEBUG] enviando pra", `${basePath}/api/ai/chat`);
      const res = await fetch(`${basePath}/api/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensagem: msg, conversaId }),
      });
      console.log("[DEBUG] status recebido:", res.status, "content-type:", res.headers.get("content-type"));

      if (res.status === 503) {
        setAiIndisponivel(true);
        setMensagens(prev => [...prev, {
          role: "assistant",
          // [TROCADO] Provedor de IA agora é o Google Gemini (tem camada
          // gratuita), não mais a OpenAI -- ver artifacts/api-server/src/routes/ai.ts
          content: "⚠️ O Assistente de IA ainda não está configurado. Adicione sua `GEMINI_API_KEY` nas configurações do projeto (aba Secrets) para habilitar esta funcionalidade.",
        }]);
        setLoading(false);
        return;
      }

      if (!res.ok) {
        const corpoErro = await res.text().catch(() => "(sem corpo)");
        console.log("[DEBUG] resposta com erro, status", res.status, "corpo:", corpoErro);
        setMensagens(prev => [...prev, { role: "assistant", content: `❌ Erro ${res.status} ao chamar o assistente. Detalhe: ${corpoErro.slice(0, 200)}` }]);
        setLoading(false);
        return;
      }

      const newCid = res.headers.get("X-Conversa-Id");
      if (newCid) setConversaId(Number(newCid));

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let partial = "";

      setMensagens(prev => [...prev, { role: "assistant", content: "", streaming: true }]);

      while (true) {
        const { done, value } = await reader.read();
        console.log("[DEBUG] chunk lido, done:", done, "bytes:", value?.length ?? 0);
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        console.log("[DEBUG] buffer acumulado:", JSON.stringify(buffer));
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            console.log("[DEBUG] evento parseado:", data);
            if (data.content) {
              partial += data.content;
              setMensagens(prev => {
                const copy = [...prev];
                copy[copy.length - 1] = { role: "assistant", content: partial, streaming: true };
                return copy;
              });
            }
            if (data.done) {
              setMensagens(prev => {
                const copy = [...prev];
                copy[copy.length - 1] = { role: "assistant", content: partial, acaoPendente: data.acaoPendente ?? null };
                return copy;
              });
            }
          } catch (e) {
            console.log("[DEBUG] falha ao parsear linha:", JSON.stringify(line), e);
          }
        }
      }
      console.log("[DEBUG] loop de leitura terminou normalmente");
    } catch (e) {
      console.log("[DEBUG] excecao capturada:", e);
      setMensagens(prev => [...prev, { role: "assistant", content: "❌ Erro ao conectar com o assistente. Tente novamente." }]);
    } finally {
      setLoading(false);
    }
  };

  const confirmarAcao = async (index: number, acao: AcaoPendente) => {
    setExecutandoAcao(true);
    try {
      const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${basePath}/api/ai/executar-acao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: acao.tipo, payload: acao.payload, conversaId }),
      });
      const data = await res.json();

      setMensagens(prev => {
        const copy = [...prev];
        copy[index] = { ...copy[index]!, acaoResolvida: true };
        return [...copy, { role: "assistant", content: res.ok ? data.mensagem : `❌ ${data.error ?? "Erro ao executar a ação"}` }];
      });

      // Reflete a mudança em outras telas que dependem desses dados.
      queryClient.invalidateQueries();
    } catch {
      setMensagens(prev => [...prev, { role: "assistant", content: "❌ Erro ao executar a ação. Tente novamente." }]);
    } finally {
      setExecutandoAcao(false);
    }
  };

  const cancelarAcao = (index: number) => {
    setMensagens(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index]!, acaoResolvida: true };
      return [...copy, { role: "assistant", content: "Ação cancelada. Se quiser, posso ajudar de outra forma." }];
    });
  };

  const novaConversa = () => {
    setConversaId(null);
    setMensagens([{
      role: "assistant",
      content: "Nova conversa iniciada! Como posso ajudar com sua grade horária?",
    }]);
  };

  // RNF-SEG: a resposta da IA (e o histórico salvo) nunca deve ser
  // injetada como HTML bruto — um prompt injection ou uma mensagem
  // antiga poderia conter tags/script. Escapa entidades HTML primeiro,
  // só then aplica as transformações visuais simples (negrito/código).
  const escapeHtml = (text: string) =>
    text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const renderMd = (text: string) =>
    escapeHtml(text)
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/`(.*?)`/g, "<code class='bg-muted px-1 rounded text-xs'>$1</code>")
      .replace(/\n/g, "<br/>");

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)] max-h-[800px]">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2 font-heading">
            <Sparkles className="w-7 h-7 text-[#1565C0]" />
            Assistente de IA
          </h1>
          <p className="text-muted-foreground mt-1">Análise inteligente em linguagem natural da sua grade horária.</p>
        </div>
        <Button variant="outline" size="sm" onClick={novaConversa} className="gap-1.5">
          <Plus className="w-3.5 h-3.5" />Nova conversa
        </Button>
      </div>

      {aiIndisponivel && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 mb-4 flex items-start gap-2 text-sm text-amber-800">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <p>Para usar o Assistente de IA, adicione sua <strong>GEMINI_API_KEY</strong> na aba <strong>Secrets</strong> do projeto. Crie em <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="underline">aistudio.google.com</a>.</p>
        </div>
      )}

      <Card className="flex-1 overflow-hidden flex flex-col">
        <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
          {mensagens.map((m, i) => (
            <div key={i} className={cn("flex flex-col gap-2 max-w-[85%]", m.role === "user" ? "ml-auto items-end" : "items-start")}>
              <div className={cn("flex gap-3", m.role === "user" ? "flex-row-reverse" : "")}>
                <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0", m.role === "assistant" ? "bg-[#42A5F5]/15 text-[#1565C0]" : "bg-primary text-primary-foreground")}>
                  {m.role === "assistant" ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
                </div>
                <div className={cn("rounded-2xl px-4 py-3 text-sm leading-relaxed", m.role === "assistant" ? "bg-muted" : "bg-primary text-primary-foreground")}>
                  <span dangerouslySetInnerHTML={{ __html: renderMd(m.content) }} />
                  {m.streaming && <span className="inline-block w-1.5 h-4 bg-current ml-1 animate-pulse rounded" />}
                </div>
              </div>

              {m.acaoPendente && !m.acaoResolvida && (
                <div className="flex gap-2 ml-11">
                  <Button size="sm" onClick={() => confirmarAcao(i, m.acaoPendente!)} disabled={executandoAcao} className="gap-1.5">
                    <Check className="w-3.5 h-3.5" />
                    {executandoAcao ? "Aplicando..." : "Confirmar"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => cancelarAcao(i)} disabled={executandoAcao} className="gap-1.5">
                    <X className="w-3.5 h-3.5" />
                    Cancelar
                  </Button>
                </div>
              )}
            </div>
          ))}
          <div ref={bottomRef} />
        </CardContent>

        <div className="border-t p-4 space-y-3">
          {mensagens.length <= 2 && (
            <div className="flex flex-wrap gap-2">
              {SUGESTOES.map(s => (
                <button key={s} onClick={() => enviar(s)} className="text-xs px-3 py-1.5 rounded-full border border-border hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
                  {s}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }}
              placeholder="Pergunte sobre a grade, professores, conflitos... (Enter para enviar)"
              rows={2}
              className="resize-none"
              disabled={loading}
            />
            <Button onClick={() => enviar()} disabled={loading || !input.trim()} size="icon" className="h-auto aspect-square">
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
