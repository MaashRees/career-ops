// Pas de télémétrie Next.js : l'app manipule des CV.
process.env.NEXT_TELEMETRY_DISABLED = "1";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Image Docker minimale (server.js + node_modules tracés). Activé par le
  // Dockerfile uniquement : `next start` ne fonctionne pas avec "standalone".
  ...(process.env.BUILD_STANDALONE === "1" ? { output: "standalone" } : {}),
  // Les prompts du moteur (engine/modes/*.md) sont lus à l'exécution : on les
  // inclut explicitement dans la trace (utile hors Docker, ex. Vercel).
  outputFileTracingIncludes: { "/**": ["./engine/**/*"] },
  // pdfjs (via unpdf) et cheerio/undici se chargent mieux hors bundle.
  serverExternalPackages: ["unpdf", "cheerio", "undici"],
  turbopack: { root: import.meta.dirname },
  poweredByHeader: false,
  // Import de CV : PDF jusqu'à 5 Mo (la limite par défaut des Server Actions est de 1 Mo).
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
