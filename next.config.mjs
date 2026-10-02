/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Não gerar automaticamente AGENTS.md/CLAUDE.md a cada build/dev.
  agentRules: false,
};

export default nextConfig;
