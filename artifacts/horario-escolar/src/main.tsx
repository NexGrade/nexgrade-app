import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { instalarCabecalhoEscola } from "./lib/escola-ativa"; // [ACESSOS-ESCOLA]

instalarCabecalhoEscola(); // [ACESSOS-ESCOLA] antes de qualquer chamada a /api

createRoot(document.getElementById("root")!).render(<App />);
