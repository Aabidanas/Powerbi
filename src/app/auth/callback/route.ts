import { NextResponse, type NextRequest } from "next/server";
import { signedInDestination } from "@/lib/supabase/data";
import { supabaseAuth } from "@/lib/supabase/repository";

export async function GET(request: NextRequest) {
  const result = (path: string) => NextResponse.redirect(new URL(path, process.env.SITE_URL ?? request.url), {
    headers: { "Cache-Control": "no-store" },
  });
  const code = request.nextUrl.searchParams.get("code");
  if (!code) return result("/login?google=failed");

  const { error } = await supabaseAuth.exchangeCode(code);
  if (error) return result("/login?google=failed");

  return result(await signedInDestination() ?? "/login?google=failed");
}
