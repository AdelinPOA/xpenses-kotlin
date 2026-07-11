import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/login" || pathname.startsWith("/_next") || pathname.startsWith("/api") || pathname === "/favicon.ico" || pathname === "/manifest.json" || pathname === "/sw.js" || pathname.startsWith("/icons/") || pathname.endsWith(".png")) {
    return NextResponse.next();
  }

  const accessToken = request.cookies.get("access_token");
  const refreshToken = request.cookies.get("refresh_token");
  if (!accessToken && !refreshToken) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|favicon-32x32.png|manifest.json|sw.js|icons/).*)"],
};
