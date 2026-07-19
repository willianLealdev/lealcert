import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Quando um novo Service Worker assume o controle, recarrega a página automaticamente
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    window.location.reload();
  });
}

createRoot(document.getElementById("root")!).render(<App />);
