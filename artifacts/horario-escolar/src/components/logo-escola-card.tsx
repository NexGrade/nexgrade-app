// [LOGO-ESCOLA] (21/10/2026) Card "Logo da Escola" da aba Configuracoes.
// Le a logo do GET /api/escolas/me e grava com PUT/DELETE /api/escolas/logo.
// A imagem e reduzida aqui no navegador (lado maior ate 400 px) e convertida
// em data URL de ate ~90 mil caracteres, para caber no limite de 100 KB do
// express.json() do backend. Aceita PNG, JPG e WEBP (SVG fica de fora).
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ImageIcon, Upload, Trash2, Save } from "lucide-react";

const URL_ESCOLA = "/api/escolas/me";
const URL_LOGO = "/api/escolas/logo";
const TIPOS_ACEITOS = ["image/png", "image/jpeg", "image/webp"];
const ARQUIVO_MAX_BYTES = 8 * 1024 * 1024; // arquivo original: ate 8 MB
const DATAURL_MAX = 90_000; // depois de reduzida (o backend aceita ate 95 mil)
const LADOS = [400, 320, 256, 200, 160];

type EscolaMe = { cadastrada?: boolean; logoDataUrl?: string | null };

function carregarImagem(arquivo: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("imagem invalida")); };
    img.src = url;
  });
}

// Tenta WEBP (mantem transparencia e e pequeno); se o navegador nao gerar WEBP,
// tenta PNG; por ultimo JPG com fundo branco. Diminui o tamanho ate caber.
function reduzirParaDataUrl(img: HTMLImageElement): string | null {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  for (const lado of LADOS) {
    const escala = Math.min(1, lado / Math.max(img.naturalWidth, img.naturalHeight));
    canvas.width = Math.max(1, Math.round(img.naturalWidth * escala));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * escala));

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const q of [0.9, 0.8, 0.7]) {
      const webp = canvas.toDataURL("image/webp", q);
      if (webp.startsWith("data:image/webp") && webp.length <= DATAURL_MAX) return webp;
    }
    const png = canvas.toDataURL("image/png");
    if (png.length <= DATAURL_MAX) return png;

    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const q of [0.9, 0.8, 0.7]) {
      const jpg = canvas.toDataURL("image/jpeg", q);
      if (jpg.length <= DATAURL_MAX) return jpg;
    }
  }
  return null;
}

function mensagemDeErro(err: unknown, padrao: string): string {
  const e = err as { data?: { error?: string }; message?: string } | null;
  return e?.data?.error ?? padrao;
}

export function LogoEscolaCard({ className }: { className?: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [processando, setProcessando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const { data: escola, isLoading } = useQuery({
    queryKey: [URL_ESCOLA, "logo-card"],
    queryFn: () => customFetch<EscolaMe>(URL_ESCOLA, { responseType: "json" }),
  });

  const logoAtual = escola?.logoDataUrl ?? null;
  const exibida = previa ?? logoAtual;

  const atualizarTelas = () =>
    queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0] ?? "").includes("/escolas/me") });

  const escolherArquivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0];
    e.target.value = ""; // permite escolher o mesmo arquivo de novo
    if (!arquivo) return;
    if (!TIPOS_ACEITOS.includes(arquivo.type)) {
      toast({ title: "Formato não aceito", description: "Use PNG, JPG ou WEBP.", variant: "destructive" });
      return;
    }
    if (arquivo.size > ARQUIVO_MAX_BYTES) {
      toast({ title: "Arquivo muito grande", description: "Use uma imagem de até 8 MB.", variant: "destructive" });
      return;
    }
    setProcessando(true);
    try {
      const img = await carregarImagem(arquivo);
      const dataUrl = reduzirParaDataUrl(img);
      if (!dataUrl) {
        toast({ title: "Não foi possível reduzir a imagem", description: "Tente uma imagem mais simples.", variant: "destructive" });
        return;
      }
      setPrevia(dataUrl);
    } catch {
      toast({ title: "Não foi possível abrir a imagem", variant: "destructive" });
    } finally {
      setProcessando(false);
    }
  };

  const salvar = async () => {
    if (!previa) return;
    setSalvando(true);
    try {
      await customFetch(URL_LOGO, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logoDataUrl: previa }),
        responseType: "json",
      } as any);
      setPrevia(null);
      await atualizarTelas();
      toast({ title: "Logo salva!" });
    } catch (err) {
      toast({ title: "Erro ao salvar a logo", description: mensagemDeErro(err, "Tente novamente."), variant: "destructive" });
    } finally {
      setSalvando(false);
    }
  };

  const remover = async () => {
    if (previa) { setPrevia(null); return; } // so descarta a previa ainda nao salva
    if (!window.confirm("Remover a logo da escola?")) return;
    setSalvando(true);
    try {
      await customFetch(URL_LOGO, { method: "DELETE", responseType: "json" } as any);
      await atualizarTelas();
      toast({ title: "Logo removida" });
    } catch (err) {
      toast({ title: "Erro ao remover a logo", description: mensagemDeErro(err, "Tente novamente."), variant: "destructive" });
    } finally {
      setSalvando(false);
    }
  };

  const ocupado = isLoading || processando || salvando;

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ImageIcon className="w-4 h-4" /> Logo da Escola
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="w-32 h-32 shrink-0 rounded-lg border bg-muted/30 flex items-center justify-center overflow-hidden">
            {exibida ? (
              <img src={exibida} alt="Logo da escola" className="max-w-full max-h-full object-contain p-2" />
            ) : (
              <ImageIcon className="w-10 h-10 text-muted-foreground/50" />
            )}
          </div>

          <div className="space-y-3 min-w-0">
            <p className="text-sm text-muted-foreground">
              {previa
                ? "Prévia da nova logo. Clique em Salvar logo para confirmar."
                : logoAtual
                  ? "Esta é a logo atual da escola."
                  : "A escola ainda não tem logo cadastrada."}
              {" "}PNG, JPG ou WEBP; a imagem é reduzida automaticamente.
            </p>
            <div className="flex flex-wrap gap-2">
              <input
                ref={inputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={escolherArquivo}
              />
              <Button type="button" variant="outline" disabled={ocupado} onClick={() => inputRef.current?.click()}>
                <Upload className="w-4 h-4 mr-2" />
                {processando ? "Preparando..." : logoAtual || previa ? "Trocar imagem" : "Escolher imagem"}
              </Button>
              {previa && (
                <Button type="button" disabled={ocupado} onClick={salvar}>
                  <Save className="w-4 h-4 mr-2" />
                  {salvando ? "Salvando..." : "Salvar logo"}
                </Button>
              )}
              {(previa || logoAtual) && (
                <Button type="button" variant="ghost" disabled={ocupado} onClick={remover} className="text-destructive hover:text-destructive">
                  <Trash2 className="w-4 h-4 mr-2" />
                  {previa ? "Descartar" : "Remover"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
