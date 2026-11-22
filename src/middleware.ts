import { NextResponse, type NextRequest } from "next/server";

const PROTECTED = ["/account", "/gardener", "/admin", "/checkout"];

/**
 * Fast edge check: protected areas require a session cookie.
 * Real authentication and authorization happen on the server in each layout and action.
 */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PROTECTED.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    if (!req.cookies.get("hg_session")) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.search = `?next=${encodeURIComponent(pathname + search)}`;
      return NextResponse.redirect(url);
    }
  }
  const res = NextResponse.next();
  res.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "img-src 'self' data: blob: https://images.unsplash.com https://images.pexels.com https://*.supabase.co",
      "script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""),
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'self'",
      "form-action 'self' https://checkout.paystack.com https://checkout.stripe.com https://www.paypal.com https://www.sandbox.paypal.com https://pay.hubtel.com",
      "base-uri 'self'",
      "object-src 'none'",
    ].join("; "),
  );
  return res;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|media/).*)"] };
