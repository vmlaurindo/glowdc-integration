import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const repositoryEnv = loadEnv(mode, "../..", "");
  const workspaceEnv = loadEnv(mode, "../../..", "");
  const publicEnv = { ...workspaceEnv, ...repositoryEnv };
  const definitions: Record<string, string> = {
    "import.meta.env.VITE_API_URL": JSON.stringify(publicEnv.VITE_API_URL || "https://app.maxio.com.br/glowdc")
  };

  const supabaseUrl = publicEnv.VITE_SUPABASE_URL || publicEnv.SUPABASE_URL;
  if (supabaseUrl) definitions["import.meta.env.VITE_SUPABASE_URL"] = JSON.stringify(supabaseUrl);
  if (publicEnv.VITE_SUPABASE_PUBLISHABLE_KEY) {
    definitions["import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY"] = JSON.stringify(publicEnv.VITE_SUPABASE_PUBLISHABLE_KEY);
  }

  return {
    plugins: [react()],
    base: "/glowdc/",
    build: { sourcemap: true },
    define: definitions
  };
});
