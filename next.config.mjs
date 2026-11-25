/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enables forbidden() so /admin pages return a real 403 (rendered by src/app/forbidden.tsx).
  experimental: { authInterrupts: true },
};
export default nextConfig;
