import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const result = (path: string) => {
    const response = NextResponse.redirect(new URL(path, request.url));
    response.headers.set("Cache-Control", "no-store");
    return response;
  };
  const token = request.nextUrl.searchParams.get("token_hash");
  const code = request.nextUrl.searchParams.get("code");
  const type = request.nextUrl.searchParams.get("type");
  if (token && (type === "email" || type === "signup" || type === "recovery")) {
    const params = new URLSearchParams({ token_hash: token, type });
    return result(`/confirm-email?${params}`);
  }
  const client = await supabaseServer();
  const verification = code ? await client.auth.exchangeCodeForSession(code) : null;
  if (type === "recovery") {
    return result(verification && !verification.error ? "/reset-password" : "/forgot-password?link=expired");
  }
  if (!verification || verification.error) return result("/login?confirmation=failed");
  return result("/register");
}
