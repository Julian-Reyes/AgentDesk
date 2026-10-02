import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../styles.css";
import { Storefront } from "./Storefront.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Storefront />
  </StrictMode>,
);
