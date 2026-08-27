with open("artifacts/api-server/src/routes/horarios.ts", "r", encoding="utf-8") as f:
    conteudo = f.read()

antigo = """      const controller = new AbortController();
      const timeoutMs = ((tempoLimiteS ?? 120) + 30) * 1000;
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch(`${CPSAT_SERVICE_URL}/gerar-grade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`Servico CP-SAT respondeu ${response.status}: ${errBody}`);
      }
      resultado = (await response.json()) as typeof resultado;"""

novo = """      const timeoutMs = ((tempoLimiteS ?? 120) + 30) * 1000;
      // [FIX-AXIOS] Trocado fetch nativo (undici) por axios -- suspeita de
      // que o undici trava/falha silenciosamente com corpos de requisicao
      // medios/grandes (60KB+) na rede interna do Render, mesmo dentro do
      // timeout configurado. axios usa http/https nativos do Node.
      const axiosResponse = await axios.post(`${CPSAT_SERVICE_URL}/gerar-grade`, payload, {
        headers: { "Content-Type": "application/json" },
        timeout: timeoutMs,
        validateStatus: () => true,
      });
      if (axiosResponse.status < 200 || axiosResponse.status >= 300) {
        throw new Error(`Servico CP-SAT respondeu ${axiosResponse.status}: ${JSON.stringify(axiosResponse.data)}`);
      }
      resultado = axiosResponse.data as typeof resultado;"""

if antigo not in conteudo:
    print("AVISO: bloco nao encontrado exatamente -- confira manualmente.")
else:
    conteudo = conteudo.replace(antigo, novo)
    with open("artifacts/api-server/src/routes/horarios.ts", "w", encoding="utf-8") as f:
        f.write(conteudo)
    print("OK: fetch substituido por axios.")
