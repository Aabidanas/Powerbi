const names = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
const missing = names.filter(name => !process.env[name]?.trim());
if (missing.length) {
  console.error(`Missing configuration: ${missing.join(", ")}.`);
  process.exit(1);
}

let endpoint;
try {
  const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) || url.username || url.password) throw new Error();
  endpoint = new URL("/auth/v1/settings", url);
} catch {
  console.error("NEXT_PUBLIC_SUPABASE_URL must be an HTTPS project URL or a local Supabase URL.");
  process.exit(1);
}

console.log("Supabase URL and publishable key are configured.");
try {
  const response = await fetch(endpoint, {
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY },
    redirect: "error",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    console.error(`Supabase Auth verification failed (HTTP ${response.status}).`);
    process.exitCode = 1;
  } else {
    console.log(`Supabase Auth connection verified (HTTP ${response.status}).`);
  }
} catch {
  console.error("Could not reach the Supabase Auth endpoint. Check the project status and network access.");
  process.exitCode = 1;
}
