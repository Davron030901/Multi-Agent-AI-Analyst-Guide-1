/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The backend URL is read client-side from NEXT_PUBLIC_API_URL (see .env.local.example).
  // Nothing secret lives in the frontend - it only ever talks to your own API.
};

export default nextConfig;
