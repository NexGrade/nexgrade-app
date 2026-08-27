const net = require("net");
const tls = require("tls");

const HOST = "aws-1-sa-east-1.pooler.supabase.com";
const PORT = 5432;

const socket = net.connect(PORT, HOST, () => {
  console.log("TCP conectado. Enviando SSLRequest do protocolo Postgres...");
  // Pacote SSLRequest do protocolo Postgres: length=8, code=80877103
  const buf = Buffer.alloc(8);
  buf.writeInt32BE(8, 0);
  buf.writeInt32BE(80877103, 4);
  socket.write(buf);
});

socket.on("data", (data) => {
  console.log("Recebeu resposta:", data.toString("hex"), "=", data.toString());
  socket.end();
});

socket.on("error", (err) => {
  console.log("ERRO no socket:", err.message);
});

socket.on("close", (hadError) => {
  console.log("Socket fechado. Teve erro:", hadError);
});

setTimeout(() => {
  console.log("Timeout - nenhuma resposta em 5s");
  socket.destroy();
}, 5000);
