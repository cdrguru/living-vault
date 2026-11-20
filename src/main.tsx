import { createRoot } from "react-dom/client";

import App from "@/App";
import { AuthProvider } from "@/hooks/AuthContext";
import { bootstrapAuth } from "@/services/bootstrap";

import "./motion/registerGsap";
import "./main.css";

const root = createRoot(document.getElementById("root")!);
try {
  const authService = await bootstrapAuth();
  root.render(
    <AuthProvider authService={authService}>
      <App />
    </AuthProvider>,
  );
} catch (error) {
  root.render(
    <p role="alert">
      {error instanceof Error ? error.message : "Unable to initialize sign-in."}
    </p>,
  );
}
