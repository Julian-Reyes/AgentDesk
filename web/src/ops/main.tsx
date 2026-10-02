import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../styles.css";
import { Ops } from "./Ops.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Ops />
  </StrictMode>,
);
