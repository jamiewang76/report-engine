import { NextResponse } from "next/server";
import { clearSession } from "@/lib/auth/session";
import { env } from "@/lib/env";

export async function GET() {
  await clearSession();
  return NextResponse.redirect(`${env.appUrl}/`);
}
