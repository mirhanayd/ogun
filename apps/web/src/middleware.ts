import { NextResponse, type NextRequest } from 'next/server'

const NATIVE_ORIGINS = new Set([
  'tauri://localhost',
  'http://tauri.localhost',
  'http://127.0.0.1:1420',
])

function corsHeaders(origin: string): HeadersInit {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type',
    'Access-Control-Expose-Headers': 'set-auth-token',
    Vary: 'Origin',
  }
}

export function middleware(request: NextRequest) {
  const origin = request.headers.get('origin') ?? ''
  if (!NATIVE_ORIGINS.has(origin)) return NextResponse.next()
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers: corsHeaders(origin) })
  }
  const response = NextResponse.next()
  for (const [name, value] of Object.entries(corsHeaders(origin))) response.headers.set(name, value)
  return response
}

export const config = { matcher: '/api/:path*' }
