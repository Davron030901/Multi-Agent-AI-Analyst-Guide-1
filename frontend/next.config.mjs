/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Fonts are self-hosted automatically by next/font (see app/layout.tsx):
  // Google's files are downloaded at build time and served from our own origin
  // with font-display: swap. No runtime request to fonts.googleapis.com.
};

export default nextConfig;
