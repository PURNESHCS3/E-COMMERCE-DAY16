import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const apiUrl = env.VITE_API_URL || "http://127.0.0.1:8000/api";
  const apiOrigin = new URL(apiUrl, "http://localhost").origin;

  return {
    plugins: [
      react(),
      {
        name: "api-preconnect",
        transformIndexHtml: {
          order: "pre",
          handler: (html) =>
            html.replace(
              "</head>",
              `  <link rel="preconnect" href="${apiOrigin}" crossorigin />\n  </head>`
            ),
        },
      },
    ],
    server: {
      port: 5173,
    },
  };
});