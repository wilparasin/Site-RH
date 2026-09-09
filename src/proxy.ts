import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

async function getRole(userId: string): Promise<string | null> {
  // Usa service role para evitar recursão nas políticas RLS
  const admin = createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data } = await admin
    .from('profiles')
    .select('role, ativo')
    .eq('id', userId)
    .single()

  if (!data || !data.ativo) return null
  return data.role
}

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Uma sessão antiga (token de renovação expirado ou revogado) faz o
  // getUser lançar erro. Nesse caso tratamos como "não logado" e limpamos os
  // cookies do Supabase — sem isso, toda requisição repete o erro.
  let user = null
  let sessaoInvalida = false
  try {
    const { data, error } = await supabase.auth.getUser()
    if (error && error.status !== 401 && error.name !== 'AuthSessionMissingError') {
      sessaoInvalida = true
    }
    user = data.user
  } catch {
    sessaoInvalida = true
  }

  const path = request.nextUrl.pathname

  if (sessaoInvalida) {
    const destino = path === '/login' ? supabaseResponse : NextResponse.redirect(new URL('/login', request.url))
    for (const cookie of request.cookies.getAll()) {
      if (cookie.name.startsWith('sb-')) destino.cookies.delete(cookie.name)
    }
    return destino
  }

  const isPublic = path === '/login' || path === '/nova-senha' || path.startsWith('/api/auth')

  if (isPublic) {
    if (user) {
      const role = await getRole(user.id)
      const dest = role === 'admin' ? '/admin' : '/dashboard'
      return NextResponse.redirect(new URL(dest, request.url))
    }
    return supabaseResponse
  }

  if (path === '/') {
    if (!user) return NextResponse.redirect(new URL('/login', request.url))
    const role = await getRole(user.id)
    const dest = role === 'admin' ? '/admin' : '/dashboard'
    return NextResponse.redirect(new URL(dest, request.url))
  }

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Redireciona admin que acessar /dashboard para /admin
  if (path.startsWith('/dashboard')) {
    const role = await getRole(user.id)
    if (role === 'admin') {
      return NextResponse.redirect(new URL('/admin', request.url))
    }
  }

  if (path.startsWith('/admin')) {
    const role = await getRole(user.id)
    if (role !== 'admin') {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
