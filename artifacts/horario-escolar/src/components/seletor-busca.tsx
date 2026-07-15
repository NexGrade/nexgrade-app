import { useEffect, useRef, useState } from "react";
import { Search, ChevronDown, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Opcao {
  value: string;
  label: string;
  sublabel?: string;
}

export function SeletorBusca({
  options,
  value,
  onChange,
  placeholder = "Selecione...",
  buscarPlaceholder = "Buscar...",
  className = "",
}: {
  options: Opcao[];
  value: string;
  onChange: (v: string) => void;
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

  const selecionado = options.find((o) => o.value === value);
  const buscaNorm = busca.trim().toLowerCase();
  const filtradas = options.filter(
    (o) =>
      o.label.toLowerCase().includes(buscaNorm) ||
      (o.sublabel ?? "").toLowerCase().includes(buscaNorm),
  );

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        className="w-full flex items-center justify-between px-3 py-2 border border-input rounded-md bg-background text-sm hover:bg-accent/50 transition-colors"
      >
        <span className={cn("truncate text-left", !selecionado && "text-muted-foreground")}>
          {selecionado ? selecionado.label : placeholder}
        </span>
        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 ml-2" />
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
              filtradas.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => {
                    onChange(o.value);
                    setAberto(false);
                    setBusca("");
                  }}
                  className={cn(
                    "w-full flex items-center justify-between px-2 py-1.5 rounded text-sm text-left hover:bg-accent transition-colors",
                    o.value === value && "bg-accent",
                  )}
                >
                  <span className="truncate">
                    {o.label}
                    {o.sublabel && <span className="text-muted-foreground ml-1.5 text-xs">{o.sublabel}</span>}
                  </span>
                  {o.value === value && <Check className="h-4 w-4 text-primary shrink-0 ml-2" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
