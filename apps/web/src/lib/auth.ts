import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { nextCookies } from 'better-auth/next-js'
import { bearer, oneTimeToken } from 'better-auth/plugins'
import { db } from '@ogun/db'
import * as schema from '@ogun/db/schema'
import {
  AUTH_SESSION_ADDITIONAL_FIELDS,
  AUTH_SESSION_EXPIRES_IN_SECONDS,
  AUTH_SESSION_UPDATE_AGE_SECONDS,
} from './auth-session-fields'

// Better Auth kurulumu. Vercel'e özgü hiçbir API kullanılmıyor — düz Node.js
// üzerinde (Next.js App Router route handler'ı üzerinden) çalışır, bkz.
// apps/web/src/app/api/auth/[...all]/route.ts.
//
// Tablo adları çoğul (users, sessions, accounts, verifications) olduğu için
// usePlural: true veriyoruz; schema doğrudan packages/db/src/schema/tenancy.ts'ten.
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    usePlural: true,
    schema,
  }),
  secret: process.env.BETTER_AUTH_SECRET,
  // Web dağıtımı yapılandırılmış ana URL'i kullanır. Masaüstü sidecar'ı
  // ise loopback isteğinin host'unu dinamik çözer; Google callback'i aynı
  // yerel sunucuya döner.
  baseURL: {
    allowedHosts: ['127.0.0.1:*', 'localhost:*'],
    fallback: process.env.BETTER_AUTH_URL,
    protocol: 'auto',
  },
  // GitHub issue #52 / Prompt 9.2 — masaüstü (Tauri) uygulaması "şifremi
  // unuttum" e-postasındaki linki ogun://auth/reset-password gibi ÖZEL bir
  // URL şemasına yönlendirebilsin diye bu origin'i güvenilir listeye ekliyoruz.
  // Better Auth'un origin-check middleware'i (bkz. node_modules/better-auth
  // dist/auth/trusted-origins.mjs matchesOriginPattern) http(s) DIŞINDAKİ
  // şemalar için `url.startsWith(pattern)` eşleşmesi yapıyor — bu yüzden
  // "ogun://auth/" öneki YETERLİ ve doğru (resmi Better Auth deseni, bkz.
  // mobil/Expo istemcileri için trustedOrigins: ["myapp://"] dokümantasyonu).
  // baseURL zaten örtük olarak güvenilir olduğundan web akışı ETKİLENMEZ.
  // Yalnızca loopback origin'lerine güven; LAN veya keyfî HTTP origin'lerine
  // izin verme.
  trustedOrigins: [
    'ogun://auth/',
    'tauri://localhost',
    'http://tauri.localhost',
    'http://127.0.0.1:*',
    'http://localhost:*',
  ],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    // TODO: gerçek bir transactional e-posta sağlayıcısına (Resend, Postmark vb.)
    // bağla. Şimdilik geliştirme ortamında linki konsola yazar; MVP kapsamında
    // e-posta gönderim altyapısı bu prompt'un (3.1) kapsamı dışında.
    sendResetPassword: async ({ user, url }) => {
      console.info(`[auth] Şifre sıfırlama bağlantısı — ${user.email}: ${url}`)
    },
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    },
  },
  account: {
    accountLinking: {
      // Uygulamada e-posta doğrulama servisi henüz etkin olmadığı için
      // e-posta+şifreyle açılan mevcut hesaplar emailVerified=false
      // durumunda. Google ise e-posta sahipliğini doğruladığından, AYNI
      // e-posta adresiyle gelen Google kimliğini o hesaba güvenle bağlayabilir.
      // allowDifferentEmails varsayılan false kalır: farklı iki e-posta
      // hesabı hiçbir zaman örtük biçimde birleştirilmez.
      enabled: true,
      trustedProviders: ['google'],
      requireLocalEmailVerified: false,
    },
  },
  // KURAL (bkz. src/lib/authz.ts): bir kullanıcı birden fazla klinikte üye
  // olabildiği için "şu an hangi klinikte çalışıyor" bilgisi oturuma
  // (session'a) bağlıdır, kullanıcıya değil. Bu iki alan clinic_members
  // üzerinden giriş/klinik değişimi sırasında set edilir (bkz. authz.ts
  // requireClinic / setActiveClinic).
  session: {
    // Kullanıcı açıkça çıkış yapmadığı sürece masaüstü
    // oturumunun kendiliğinden sona ermemesi gerekir. Better Auth mutlak
    // olarak sonsuz oturum kullanmadığından tarayıcının izin verdiği en
    // uzun süre + günlük kayan yenileme kullanıyoruz. Her aktif kullanım
    // expiresAt'i tekrar ileri taşır; mevcut oturumlar da ilk başarılı
    // istekte yenilenir. 400 gün sınırının gerekçesi ve regresyon testi
    // auth-session-fields.ts dosyasındadır.
    expiresIn: AUTH_SESSION_EXPIRES_IN_SECONDS,
    updateAge: AUTH_SESSION_UPDATE_AGE_SECONDS,
    additionalFields: AUTH_SESSION_ADDITIONAL_FIELDS,
  },
  // GitHub issue #52 / Prompt 9.2, GÖREV 1 ve GÖREV 3 — masaüstü (Tauri)
  // native kimlik doğrulama akışı için eklenenler:
  //
  // - bearer(): istemcinin çerez YERİNE `Authorization: Bearer <token>`
  //   başlığıyla kimlik doğrulamasına izin verir; her başarılı auth
  //   isteğinde `set-auth-token` yanıt başlığını EKLER (bkz. node_modules/
  //   better-auth/dist/plugins/bearer/index.mjs). apps/web/src/lib/
  //   auth-client.ts bu başlığı yakalayıp Tauri'nin güvenli depolamasına
  //   (stronghold, bkz. apps/desktop/src-tauri/src/secure_storage.rs)
  //   yazar — böylece "tarayıcı çerezine güvenme, oturum uygulama kapanıp
  //   açıldığında devam etsin" gereksinimi (issue #52 GÖREV 3) karşılanır.
  //   Bu, Better Auth'un React Native/Expo istemcileri için DOKÜMANTE
  //   ettiği standart desenle AYNI — web akışını hiç ETKİLEMEZ (çerez
  //   tabanlı oturum web'de olduğu gibi çalışmaya devam eder).
  //
  // - oneTimeToken(): sistem tarayıcısında tamamlanan Google OAuth'tan
  //   sonra apps/web/src/app/api/auth/native/callback/route.ts tarafından
  //   üretilen KISA ÖMÜRLÜ (varsayılan 3 dk), TEK KULLANIMLIK opak bir
  //   token — ogun://auth/callback?ott=... deep link'ine konan DEĞER budur,
  //   gerçek/uzun ömürlü oturum tokenı ASLA URL'e konulmaz (güvenlik kararı,
  //   bkz. PR açıklaması). Masaüstü uygulaması bu token'ı /one-time-token/
  //   verify'a POST ederek GERÇEK oturumu (çerez + bearer token) alır.
  //
  // nextCookies() eklentisi, Better Auth eklenti listesinde SON sırada olmalı
  // (üst kütüphanenin kendi kuralı) — server action'lardan set-cookie
  // başlıklarını otomatik uygulamayı sağlar.
  plugins: [bearer(), oneTimeToken({ expiresIn: 10 }), nextCookies()],
})

export type Auth = typeof auth
