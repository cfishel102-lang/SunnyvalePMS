/** The public address of this site, e.g. https://book.example.com */
export const APP_URL =
  process.env.APP_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");
