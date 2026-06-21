import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  
  // Allow login and auth routes without authentication
  if (pathname === '/login' || pathname.startsWith('/auth/')) {
    return NextResponse.next();
  }

  // Check for JWT token in cookies
  const token = request.cookies.get('auth_token')?.value;

  if (!token) {
    // Redirect to login if no token
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Token exists; allow the request
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/ (API routes handle auth manually inside route files)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - all image/video asset files (png, svg, jpg, etc.)
     */
    '/((?!api/|auth/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
