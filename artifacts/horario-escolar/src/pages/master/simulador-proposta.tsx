// [SIMULADOR-PROPOSTA] (28/10/2026) Aba "Simulador" do Painel Master: monta a proposta comercial pelo
// numero de turmas (assinatura + implantacao), com PIX/boleto e cartao. No cartao, a taxa do Asaas e
// repassada para a Nexus Core receber o valor cheio: cobrar = (receber + fixo) / (1 - taxa%), parcela
// arredondada para cima no centavo (pode ficar alguns centavos acima do simulador do Asaas).
// Gera a mensagem pronta para o WhatsApp. Precos e taxas ficam guardados no navegador.
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Copy, Calculator } from "lucide-react";

type Config = {
  precoTurma: string; implTurma: string;
  t1p: string; t1f: string; tnp: string; tnf: string; tpp: string; tpf: string;
};
const PADRAO: Config = { precoTurma: "30", implTurma: "20", t1p: "2.99", t1f: "0.49", tnp: "3.99", tnf: "0.49", tpp: "0", tpf: "0" };
const CHAVE = "nexgrade.simuladorProposta";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (s: string) => { const v = parseFloat(String(s).replace(",", ".")); return Number.isFinite(v) && v >= 0 ? v : 0; };
const ceilCent = (v: number) => Math.ceil(Math.round(v * 1000) / 10) / 100;
const bruto = (liquido: number, pct: number, fixo: number) => (liquido <= 0 ? 0 : (liquido + fixo) / (1 - pct / 100));

type Opcoes = { pix: number; avista: number; n: number; parc: number; totalParc: number };
function calcular(liquido: number, c: Config, n: number): Opcoes {
  const parc = ceilCent(bruto(liquido, num(c.tnp), num(c.tnf)) / n);
  return {
    pix: ceilCent(bruto(liquido, num(c.tpp), num(c.tpf))),
    avista: ceilCent(bruto(liquido, num(c.t1p), num(c.t1f))),
    n, parc, totalParc: Math.round(parc * n * 100) / 100,
  };
}

function lerConfig(): Config {
  try { return { ...PADRAO, ...JSON.parse(localStorage.getItem(CHAVE) || "{}") }; } catch { return PADRAO; }
}

export default function SimuladorProposta() {
  const { toast } = useToast();
  const [turmas, setTurmas] = useState("20");
  const [escola, setEscola] = useState("");
  const [comImpl, setComImpl] = useState(true);
  const [parcelas, setParcelas] = useState("12");
  const [cfg, setCfg] = useState<Config>(lerConfig);
  useEffect(() => { try { localStorage.setItem(CHAVE, JSON.stringify(cfg)); } catch { /* sem armazenamento */ } }, [cfg]);
  const set = (k: keyof Config) => (e: React.ChangeEvent<HTMLInputElement>) => setCfg((c) => ({ ...c, [k]: e.target.value }));

  const r = useMemo(() => {
    const t = Math.max(0, Math.floor(num(turmas)));
    const n = parseInt(parcelas, 10);
    const preco = num(cfg.precoTurma), impl = num(cfg.implTurma);
    const assin = Math.round(t * preco * 100) / 100, implV = Math.round(t * impl * 100) / 100;
    return {
      t, preco, impl, assin, implV,
      oAssin: calcular(assin, cfg, n),
      oImpl: comImpl ? calcular(implV, cfg, n) : null,
      oTotal: comImpl ? calcular(implV + assin, cfg, n) : null,
    };
  }, [turmas, parcelas, cfg, comImpl]);

  const mensagem = useMemo(() => {
    if (r.t <= 0) return "";
    const linhas = (o: Opcoes) => `• PIX ou boleto: ${brl(o.pix)}\n• Cartão à vista: ${brl(o.avista)}\n• Cartão em ${o.n}x: ${o.n}x de ${brl(o.parc)}`;
    let m = `*NexGrade — Gestão de Horários Escolares* 📚\n*Proposta comercial${escola.trim() ? " — " + escola.trim() : ""} (${r.t} turmas)*\n\n`;
    if (r.oImpl) m += `🛠️ *Implantação (valor único): ${brl(r.implV)}*\n(${brl(r.impl)} por turma)\nEntregamos o sistema completo, já com o banco de dados da escola: turmas, disciplinas, professores, grade atual, disponibilidade, hora-atividade e calendário letivo. A escola já começa usando.\n\n`;
    m += `💰 *Assinatura anual: ${brl(r.assin)}*\n(${brl(r.preco)} por turma, por ano, tudo incluso)\n\n💳 *Valores e formas de pagamento*\n\n`;
    if (r.oImpl) m += `*Implantação*\n${linhas(r.oImpl)}\n\n`;
    m += `*Assinatura (por ano)*\n${linhas(r.oAssin)}\n\n`;
    if (r.oTotal) m += `*Primeiro ano (implantação + assinatura)*\n${linhas(r.oTotal)}\n\n`;
    m += `No cartão, o valor inclui a taxa da operadora.${r.oImpl ? " Do segundo ano em diante, só a assinatura." : ""}\n\n`;
    m += `👥 *Acessos inclusos (sem limite de usuários)*\n• *Direção e coordenação:* acesso completo ao sistema\n• *Secretaria:* cadastro de professores, turmas e disciplinas, impressão da grade e relatórios\n• *Gestor de reservas:* reservas de laboratórios, quadra e demais espaços\n• *Professores:* "Minha Agenda" no celular, com o horário da semana, hora-atividade e calendário da escola\n\n`;
    m += `✅ *Tudo incluso na assinatura*\n• Montagem automática da grade de horários (manhã, tarde, noite e integral)\n• Hora-atividade calculada pela tabela oficial da SEED-PR\n• Disponibilidade de cada professor e aviso de conflitos\n• Aulas assíncronas, trio e co-docência (Recomposição)\n• Grade em PDF: por turma, por professor, por disciplina e quadro geral\n• Reservas de espaços com PDF da semana\n• Calendário letivo oficial SEED-PR\n• Licenças, comunicados e assistente com inteligência artificial\n• Suporte pelo WhatsApp\n\n`;
    m += `🎁 30 dias de avaliação gratuita.\n\nQualquer dúvida, estou à disposição!\n*Simone Barros — NexGrade*`;
    return m;
  }, [r, escola]);

  const copiar = async () => {
    try { await navigator.clipboard.writeText(mensagem); toast({ title: "Mensagem copiada" }); }
    catch { toast({ title: "Não foi possível copiar", description: "Selecione o texto e use Ctrl+C.", variant: "destructive" }); }
  };

  const Bloco = ({ titulo, base, liquido, o, destaque }: { titulo: string; base: string; liquido: number; o: Opcoes; destaque?: boolean }) => (
    <Card className={destaque ? "border-primary" : undefined}>
      <CardHeader className={`pb-2 ${destaque ? "bg-primary/5" : ""}`}>
        <CardTitle className="text-base flex flex-wrap items-baseline justify-between gap-2">
          {titulo}<span className="text-sm font-normal text-muted-foreground">{base}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-2 overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead><tr className="text-xs uppercase tracking-wide text-muted-foreground">
            <th className="text-left font-medium py-1">Forma</th><th className="text-right font-medium">Escola paga</th>
            <th className="text-right font-medium">Parcela</th><th className="text-right font-medium">Você recebe</th></tr></thead>
          <tbody className="divide-y">
            <tr><td className="py-2 font-medium">PIX ou boleto</td><td className="text-right">{brl(o.pix)}</td><td /><td className="text-right text-green-700 dark:text-green-400">{brl(liquido)}</td></tr>
            <tr><td className="py-2 font-medium">Cartão à vista</td><td className="text-right">{brl(o.avista)}</td><td /><td className="text-right text-green-700 dark:text-green-400">{brl(liquido)}</td></tr>
            <tr><td className="py-2 font-medium">Cartão {o.n}x</td><td className="text-right">{brl(o.totalParc)}</td>
              <td className="text-right font-semibold text-primary whitespace-nowrap">{o.n}x de {brl(o.parc)}</td><td className="text-right text-green-700 dark:text-green-400">{brl(liquido)}</td></tr>
          </tbody>
        </table>
      </CardContent>
    </Card>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)] items-start">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Calculator className="w-4 h-4" /> Simulador de proposta</CardTitle>
          <CardDescription>No cartão, a taxa do Asaas já vai somada para você receber o valor cheio.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sim-turmas">Número de turmas</Label>
            <Input id="sim-turmas" type="number" min={1} value={turmas} onChange={(e) => setTurmas(e.target.value)} className="text-2xl font-bold h-12" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sim-escola">Nome da escola (opcional)</Label>
            <Input id="sim-escola" value={escola} onChange={(e) => setEscola(e.target.value)} placeholder="Ex.: C.E. ..." />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="sim-impl">Incluir implantação</Label>
            <Switch id="sim-impl" checked={comImpl} onCheckedChange={setComImpl} />
          </div>
          <div className="space-y-1.5">
            <Label>Parcelas no cartão</Label>
            <Select value={parcelas} onValueChange={setParcelas}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Array.from({ length: 11 }, (_, i) => i + 2).map((n) => <SelectItem key={n} value={String(n)}>{n}x</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <details className="border-t pt-3">
            <summary className="cursor-pointer text-sm font-medium text-primary">Preços e taxas</summary>
            <div className="grid grid-cols-2 gap-3 mt-3 text-sm">
              <div className="space-y-1"><Label htmlFor="sim-p">Assinatura/turma/ano (R$)</Label><Input id="sim-p" value={cfg.precoTurma} onChange={set("precoTurma")} /></div>
              <div className="space-y-1"><Label htmlFor="sim-i">Implantação/turma (R$)</Label><Input id="sim-i" value={cfg.implTurma} onChange={set("implTurma")} /></div>
              <div className="space-y-1"><Label htmlFor="sim-t1p">Cartão à vista (%)</Label><Input id="sim-t1p" value={cfg.t1p} onChange={set("t1p")} /></div>
              <div className="space-y-1"><Label htmlFor="sim-t1f">+ fixo (R$)</Label><Input id="sim-t1f" value={cfg.t1f} onChange={set("t1f")} /></div>
              <div className="space-y-1"><Label htmlFor="sim-tnp">Cartão 2 a 12x (%)</Label><Input id="sim-tnp" value={cfg.tnp} onChange={set("tnp")} /></div>
              <div className="space-y-1"><Label htmlFor="sim-tnf">+ fixo (R$)</Label><Input id="sim-tnf" value={cfg.tnf} onChange={set("tnf")} /></div>
              <div className="space-y-1"><Label htmlFor="sim-tpp">PIX/boleto (%)</Label><Input id="sim-tpp" value={cfg.tpp} onChange={set("tpp")} /></div>
              <div className="space-y-1"><Label htmlFor="sim-tpf">+ fixo (R$)</Label><Input id="sim-tpf" value={cfg.tpf} onChange={set("tpf")} /></div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Taxas do Asaas conferidas em 28/10/2026. Ficam guardadas neste navegador.</p>
            <Button variant="ghost" size="sm" className="mt-1 px-0" onClick={() => setCfg(PADRAO)}>Voltar aos valores padrão</Button>
          </details>
        </CardContent>
      </Card>

      <div className="space-y-4 min-w-0">
        {r.t <= 0 ? (
          <Card><CardContent className="py-8 text-center text-muted-foreground">Digite o número de turmas para ver os valores.</CardContent></Card>
        ) : (
          <>
            {r.oTotal && <Bloco titulo="Primeiro ano" base="implantação + assinatura" liquido={r.implV + r.assin} o={r.oTotal} destaque />}
            {r.oImpl && <Bloco titulo="Implantação" base={`${r.t} turmas × ${brl(r.impl)} · uma vez`} liquido={r.implV} o={r.oImpl} />}
            <Bloco titulo="Assinatura anual" base={`${r.t} turmas × ${brl(r.preco)} por ano`} liquido={r.assin} o={r.oAssin} />
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Mensagem para o WhatsApp</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Textarea readOnly value={mensagem} className="min-h-[220px] font-mono text-xs" aria-label="Mensagem pronta" />
                <Button onClick={copiar}><Copy className="w-4 h-4 mr-2" /> Copiar mensagem</Button>
              </CardContent>
            </Card>
          </>
        )}
        <p className="text-xs text-muted-foreground">Valores sem antecipação (uma parcela a cada 32 dias). Pode ficar alguns centavos acima do simulador do Asaas, sempre a seu favor.</p>
      </div>
    </div>
  );
}
