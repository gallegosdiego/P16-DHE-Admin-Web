import { NextRequest, NextResponse } from "next/server";

const PUBLIC_ROUTES = ["/login"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublicRoute = PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith("/_next") || pathname.startsWith("/api")
  );
  const hasToken = Boolean(request.cookies.get("dhe_auth_token")?.value);

  if (!hasToken && !isPublicRoute) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (hasToken && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon-192.png|icon-512.png|manifest.webmanifest).*)"],
};
