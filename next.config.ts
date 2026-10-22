import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Imagen de Docker liviana: solo lo necesario para correr el servidor
  output: "standalone",
  // Protección ante versiones mezcladas durante un despliegue. Coolify entrega el commit en SOURCE_COMMIT.
  deploymentId: process.env.SOURCE_COMMIT || undefined,
  // OpenCascade (wasm) convierte STEP/IGES en el servidor: se carga desde node_modules, sin empaquetar
  serverExternalPackages: ["occt-import-js"],
  outputFileTracingIncludes: {
    "/api/models": ["./node_modules/occt-import-js/dist/occt-import-js.wasm"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
