import "server-only";

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.length < 16) {
    throw new Error(`Environment variable ${name} is missing or too short (use: openssl rand -hex 32)`);
  }
  return v;
}

export const env = {
  get sessionSecret() { return required("SESSION_SECRET"); },
  get adminAuthSecret() { return required("ADMIN_AUTH_SECRET"); },
  get pinHashSecret() { return required("PIN_HASH_SECRET"); },
  get isProd() { return process.env.NODE_ENV === "production"; },
  get appUrl() { return process.env.APP_URL ?? "http://localhost:3000"; },
};
