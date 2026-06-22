import { NextResponse, type NextRequest } from 'next/server';

function isJwtExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (typeof payload.exp !== 'number') return false;
    return Date.now() >= payload.exp * 1000;
  } catch {
    return true;
  }
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  
  // Allow login and auth routes without authentication
  if (pathname === '/login' || pathname.startsWith('/auth/')) {
    return NextResponse.next();
  }

  // Check for JWT token in cookies
  const token = request.cookies.get('auth_token')?.value;

  if (!token || isJwtExpired(token)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    const response = NextResponse.redirect(url);
    if (token) {
      response.cookies.delete('auth_token');
    }
    return response;
  }

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
