import { useEffect, useRef, useState } from "react";
import { Search, ChevronDown, Check, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Opcao {
  value: number;
  label: string;
}

export function MultiSelectBusca({
  options,
  value,
  onChange,
  placeholder = "Selecione...",
  buscarPlaceholder = "Buscar...",
  className = "",
}: {
  options: Opcao[];
  value: number[];
  onChange: (v: number[]) => void;
  placeholder?: string;
  buscarPlaceholder?: string;
  className?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickFora(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setAberto(false);
        setBusca("");
      }
    }
    document.addEventListener("mousedown", onClickFora);
    return () => document.removeEventListener("mousedown", onClickFora);
  }, []);

  const valorAtual = value ?? [];
  const selecionadas = options.filter((o) => valorAtual.includes(o.value));

  // Normaliza removendo acentos (NFD + remove marcas diacríticas) e
  // caixa, para a busca aceitar "eletrica", "Elétrica", "ELÉTRICA" etc.
  // como equivalentes, e casar em qualquer posição do nome, não só no
  // início.
  function normalizar(s: string) {
    return s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  const buscaNorm = normalizar(busca);
  const filtradas = options.filter((o) => normalizar(o.label).includes(buscaNorm));

  function alternar(id: number) {
    if (valorAtual.includes(id)) {
      onChange(valorAtual.filter((v) => v !== id));
    } else {
      onChange([...valorAtual, id]);
    }
  }

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        className="w-full min-h-10 flex items-center justify-between gap-2 px-3 py-2 border border-input rounded-md bg-background text-sm hover:bg-accent/50 transition-colors"
      >
        <div className="flex flex-wrap gap-1 flex-1">
          {selecionadas.length === 0 ? (
            <span className="text-muted-foreground">{placeholder}</span>
          ) : (
            selecionadas.map((o) => (
              <Badge key={o.value} variant="secondary" className="text-xs font-normal">
                {o.label}
              </Badge>
            ))
          )}
        </div>
        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
      </button>

      {aberto && (
        <div className="absolute z-50 mt-1 w-full bg-popover border border-border rounded-md shadow-md">
          <div className="relative p-2 border-b border-border">
            <Search className="absolute left-4.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              autoFocus
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder={buscarPlaceholder}
              className="pl-7 h-8 text-sm"
            />
          </div>
          <div className="max-h-64 overflow-y-auto p-1">
            {filtradas.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum resultado.</p>
            ) : (
              filtradas.map((o) => {
                const marcado = valorAtual.includes(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => alternar(o.value)}
                    className={cn(
                      "w-full flex items-center justify-between px-2 py-1.5 rounded text-sm text-left hover:bg-accent transition-colors",
                      marcado && "bg-accent/60",
                    )}
                  >
                    <span className="truncate">{o.label}</span>
                    {marcado && <Check className="h-4 w-4 text-primary shrink-0 ml-2" />}
                  </button>
                );
              })
            )}
          </div>
          {selecionadas.length > 0 && (
            <div className="p-2 border-t border-border">
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <X className="h-3 w-3" /> Limpar seleção ({selecionadas.length})
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
