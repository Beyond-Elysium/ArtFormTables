import { NextRequest, NextResponse } from "next/server";

interface SharedSecretOptions {
  env: string[];
  allowVercelCron?: boolean;
  allowDevQueryToken?: boolean;
}

function configuredSecret(names: string[]): string | null {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return null;
}

export function requireSharedSecret(
  req: NextRequest,
  { env, allowVercelCron = false, allowDevQueryToken = false }: SharedSecretOptions,
): NextResponse | null {
  if (allowVercelCron && req.headers.get("x-vercel-cron") !== null) return null;

  const secret = configuredSecret(env);
  if (!secret) {
    if (process.env.NODE_ENV === "development") return null;
    return NextResponse.json(
      { error: `${env.join(" or ")} not configured` },
      { status: 503 },
    );
  }

  if (req.headers.get("authorization") === "Bearer ".concat(secret)) return null;

  if (
    allowDevQueryToken &&
    process.env.NODE_ENV === "development" &&
    req.nextUrl.searchParams.get("token") === secret
  ) {
    return null;
  }

  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}
