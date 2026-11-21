import { type NextRequest } from "next/server";
import { raffraichirSession } from "./lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return raffraichirSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
