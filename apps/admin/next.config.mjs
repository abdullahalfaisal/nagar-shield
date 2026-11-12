/**
 * Next.js configuration for the Nagar Shield moderator console.
 *
 * The console is deployed to Vercel Hobby with the default Next.js build —
 * no custom server, no standalone output. `transpilePackages` lets the app
 * import the workspace `packages/shared` TypeScript source directly, so the
 * contracts are never duplicated inside `apps/admin`.
 *
 * The service-role key is **never** referenced here or anywhere else in this
 * package. Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
 * are read, and both are public by design — Row Level Security is the
 * authorization boundary.
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@nagar-shield/shared'],
};

export default nextConfig;
