function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

export const env = {
  get appUrl() { return req("APP_URL"); },
  get sessionSecret() { return req("SESSION_SECRET"); },
  get tokenKey() { return req("TOKEN_ENCRYPTION_KEY"); },
  get cronSecret() { return req("CRON_SECRET"); },
  get id4Issuer() { return req("ID4_ISSUER"); },
  get id4ClientId() { return req("ID4_CLIENT_ID"); },
  get id4ClientSecret() { return req("ID4_CLIENT_SECRET"); },
  get id4Scopes() { return process.env.ID4_SCOPES ?? "openid profile email crm-api offline_access"; },
  get crmApiBase() { return req("CRM_API_BASE"); },
  get supabaseUrl() { return req("SUPABASE_URL"); },
  get supabaseServiceKey() { return req("SUPABASE_SERVICE_ROLE_KEY"); },
};
