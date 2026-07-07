import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, CheckCircle2, AlertCircle, Download } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const MODELOS = {
  professores: `nome,email,cpf,matricula,cargaHorariaTotal
João Silva,joao@escola.edu.br,123.456.789-00,MAT001,20
Maria Santos,maria@escola.edu.br,987.654.321-00,MAT002,24`,
  turmas: `nome,serie,turno,anoLetivo
1A,1º Ano EF,matutino,2026
2B,2º Ano EF,vespertino,2026
3EM,3º Ano EM,matutino,2026`,
  disciplinas: `nome,cargaSemanal,cor
Matemática,4,#6366f1
Português,4,#ec4899
Ciências,2,#10b981
História,2,#f59e0b`,
};

type Preview = {
  tipoDetectado: string;
  headers: string[];
  totalLinhas: number;
  preview: Record<string, string>[];
  erros: string[];
};

export default function ImportarPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [csv, setCsv] = useState("");
  const [tipo, setTipo] = useState("professores");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingImport, setLoadingImport] = useState(false);
  const [resultado, setResultado] = useState<{ importados: number; erros: string[]; total: number } | null>(null);

  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { setCsv(ev.target?.result as string ?? ""); setPreview(null); setResultado(null); };
    reader.readAsText(file, "UTF-8");
  };

  const handlePreview = async () => {
    if (!csv.trim()) { toast({ title: "Cole ou carregue um CSV primeiro", variant: "destructive" }); return; }
    setLoadingPreview(true);
    setResultado(null);
    try {
      const res = await fetch(`${basePath}/api/importar/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv, tipo }),
      });
      const data = await res.json();
      if (!res.ok) { toast({ title: data.error, variant: "destructive" }); return; }
      setPreview(data);
    } catch { toast({ title: "Erro ao processar CSV", variant: "destructive" }); }
    finally { setLoadingPreview(false); }
  };

  const handleImport = async () => {
    if (!preview) return;
    setLoadingImport(true);
    try {
      const res = await fetch(`${basePath}/api/importar/confirmar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv, tipo }),
      });
      const data = await res.json();
      if (!res.ok) { toast({ title: data.error, variant: "destructive" }); return; }
      setResultado(data);
      setPreview(null);
      setCsv("");
      await queryClient.invalidateQueries();
      toast({ title: `✅ ${data.importados} registro(s) importado(s) com sucesso!` });
    } catch { toast({ title: "Erro ao importar", variant: "destructive" }); }
    finally { setLoadingImport(false); }
  };

  const downloadModelo = () => {
    const blob = new Blob([MODELOS[tipo as keyof typeof MODELOS]], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `modelo_${tipo}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Upload className="w-7 h-7 text-emerald-500" />
          Importação Inteligente
        </h1>
        <p className="text-muted-foreground mt-1">
          Carregue professores, turmas e disciplinas via CSV sem digitação manual.
        </p>
      </div>

      {resultado ? (
        <Card className="border-green-200 bg-green-50/30">
          <CardContent className="pt-6 text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
            <h2 className="text-xl font-semibold text-green-800">Importação concluída!</h2>
            <p className="text-green-700">
              <strong>{resultado.importados}</strong> de <strong>{resultado.total}</strong> registros importados.
            </p>
            {resultado.erros.length > 0 && (
              <div className="text-left bg-white rounded-lg p-3 border border-green-200">
                <p className="text-sm font-medium text-amber-700 mb-1">Avisos ({resultado.erros.length}):</p>
                {resultado.erros.map((e, i) => <p key={i} className="text-xs text-amber-600">{e}</p>)}
              </div>
            )}
            <Button onClick={() => setResultado(null)}>Importar mais dados</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Dados CSV</CardTitle>
                    <CardDescription>Cole o conteúdo ou faça upload do arquivo.</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={downloadModelo}>
                      <Download className="w-3.5 h-3.5 mr-1.5" />Modelo
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                      <FileText className="w-3.5 h-3.5 mr-1.5" />Carregar arquivo
                    </Button>
                    <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFile} />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Tipo de dado</Label>
                  <Select value={tipo} onValueChange={v => { setTipo(v); setPreview(null); }}>
                    <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="professores">Professores</SelectItem>
                      <SelectItem value="turmas">Turmas</SelectItem>
                      <SelectItem value="disciplinas">Disciplinas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Textarea
                  value={csv}
                  onChange={e => { setCsv(e.target.value); setPreview(null); }}
                  placeholder={`Cole o CSV aqui:\n\n${MODELOS[tipo as keyof typeof MODELOS]}`}
                  rows={10}
                  className="font-mono text-xs"
                />
                <div className="flex gap-2">
                  <Button onClick={handlePreview} disabled={loadingPreview || !csv.trim()} variant="outline">
                    {loadingPreview ? "Analisando..." : "Analisar CSV"}
                  </Button>
                  {preview && (
                    <Button onClick={handleImport} disabled={loadingImport}>
                      {loadingImport ? "Importando..." : `Confirmar importação (${preview.totalLinhas} linhas)`}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {preview && (
              <Card className="border-[#1565C0]/20 bg-[#1565C0]/5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[#1565C0]" />
                    Pré-visualização — {preview.totalLinhas} linha(s) detectada(s)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b">
                          {preview.headers.map(h => <th key={h} className="text-left py-1.5 px-2 font-semibold text-muted-foreground">{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.preview.map((row, i) => (
                          <tr key={i} className="border-b border-border/30">
                            {preview.headers.map(h => <td key={h} className="py-1.5 px-2">{row[h]}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {preview.totalLinhas > 5 && (
                      <p className="text-xs text-muted-foreground mt-2">... e mais {preview.totalLinhas - 5} linha(s)</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Como usar</CardTitle></CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-3">
                <div className="flex gap-2"><span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center shrink-0 font-bold">1</span><p>Baixe o <strong className="text-foreground">modelo CSV</strong> para o tipo desejado.</p></div>
                <div className="flex gap-2"><span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center shrink-0 font-bold">2</span><p>Preencha com os dados da escola (Excel salva como CSV).</p></div>
                <div className="flex gap-2"><span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center shrink-0 font-bold">3</span><p>Cole o conteúdo ou faça upload e clique em <strong className="text-foreground">Analisar CSV</strong>.</p></div>
                <div className="flex gap-2"><span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center shrink-0 font-bold">4</span><p>Confira a pré-visualização e confirme a importação.</p></div>
              </CardContent>
            </Card>
            <Card className="border-amber-200 bg-amber-50/20">
              <CardContent className="pt-4 text-xs text-amber-800 space-y-1">
                <p className="font-semibold flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" />Dicas</p>
                <p>• Use vírgula (,) ou ponto-e-vírgula (;) como separador</p>
                <p>• A primeira linha deve ser o cabeçalho</p>
                <p>• Encoding: UTF-8 (sem BOM)</p>
                <p>• Dados duplicados são ignorados automaticamente</p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
