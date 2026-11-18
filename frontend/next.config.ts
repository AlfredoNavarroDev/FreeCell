import path from "node:path";
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
};

// Sin SENTRY_DSN configurado no hay nada que subir ni instrumentar; sigue siendo seguro envolver
// la config siempre (RNF-OBS-04, placeholder hasta que exista una cuenta de Sentry real).
export default withSentryConfig(nextConfig, {
  silent: true,
});
