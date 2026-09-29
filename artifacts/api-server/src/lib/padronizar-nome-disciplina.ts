/**
 * [PADRAO-NOME-DISCIPLINA] Padrao de nomes de disciplina (29/09/2026), o mesmo do script
 * lib/db/padronizar-disciplinas.cjs: inicial maiuscula em cada palavra, conectivos em
 * minuscula (exceto no inicio), numero arabico no fim -> romano, romanos em maiuscula,
 * siglas curtas mantidas (PAEE, IA), hifen sem espaco ("Back-End").
 */
const CONECTIVOS = new Set(["a", "à", "ao", "aos", "as", "às", "com", "da", "das", "de", "do", "dos", "e", "em", "na", "nas", "no", "nos", "o", "os", "ou", "para", "pela", "pelas", "pelo", "pelos", "por", "sem", "sob", "um", "uma"]);
const ROMANOS = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
const EH_ROMANO = /^(i|ii|iii|iv|v|vi|vii|viii|ix|x)$/i;

function palavra(p: string, primeira: boolean, nomeGritado: boolean): string {
  if (!p) return p;
  const m = p.match(/^([^A-Za-zÀ-ÿ0-9]*)([A-Za-zÀ-ÿ0-9.]+)([^A-Za-zÀ-ÿ0-9]*)$/);
  if (!m) return p;
  const [, pre, core, pos] = m;
  if (EH_ROMANO.test(core) && !primeira) return pre + core.toUpperCase() + pos;
  if (!nomeGritado && core.length >= 2 && core.length <= 5 && core === core.toUpperCase() && /[A-ZÀ-Ý]/.test(core)) return p;
  if (/^\d/.test(core)) return p;
  const low = core.toLowerCase();
  if (!primeira && CONECTIVOS.has(low)) return pre + low + pos;
  return pre + low.charAt(0).toUpperCase() + low.slice(1) + pos;
}

export function padronizarNomeDisciplina(nome: string): string {
  let n = String(nome ?? "").replace(/\s+/g, " ").replace(/-\s+/g, "-").trim();
  n = n.replace(/\s(\d{1,2})$/, (_m, d) => (Number(d) >= 1 && Number(d) <= 10 ? " " + ROMANOS[Number(d)] : " " + d));
  const letras = n.replace(/[^A-Za-zÀ-ÿ]/g, "");
  const nomeGritado = letras.length > 5 && letras === letras.toUpperCase();
  return n.split(" ").map((p, i) => p.split("-").map((q, j) => palavra(q, i === 0 && j === 0, nomeGritado)).join("-")).join(" ");
}
