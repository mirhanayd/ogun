import { and, eq, type SQL } from 'drizzle-orm'
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core'

// ---------------------------------------------------------------------------
// Çok kiracılı erişim kontrolü — tip seviyesinde zorlama.
//
// KURAL (bkz. GitHub #10): Danışan verisine erişen HER sorgu clinicId ile
// filtrelenmelidir. Bunu sadece "hatırlayarak" uygulamak yerine iki katman
// halinde derleme zamanında zorluyoruz:
//
// 1. `ClinicId` markalı (branded) bir tiptir, düz bir `string` değildir.
//    Sadece `asClinicId()` üretebilir ve bu fonksiyon sadece
//    apps/web/src/lib/authz.ts içindeki requireClinic()/requireRole() gibi
//    "oturumdan doğrulanmış klinik" akışlarında çağrılır. Bir yerde elle
//    yazılmış bir string (`"abc123"`) `ClinicId` bekleyen bir parametreye
//    doğrudan geçirilemez — TypeScript hata verir. Böylece "kullanıcıdan
//    gelen ham clinicId'yi sorguya direkt bas" hatası derleme zamanında
//    yakalanır.
//
// 2. `clinicScopedWhere()` klinik filtresini AYRI, OPSİYONEL bir "where"
//    parametresi olarak değil, konumsal ve ZORUNLU bir argüman olarak alır.
//    `ClinicScopedTable` kısıtı da tabloda `clinicId` sütunu olmasını
//    (yapısal olarak) şart koşar — clinicId sütunu olmayan bir tabloyu
//    (örn. `foods`, klinikten bağımsız referans verisi) bu fonksiyona
//    geçirmeye çalışmak da derlenmez.
//
// Sonuç: "danışan verisi çeken ama clinicId almayan bir sorgu fonksiyonu"
// yazmak, bu yardımcıları kullandığınız sürece derlenmez.
// ---------------------------------------------------------------------------

declare const clinicIdBrand: unique symbol

/** Sadece requireClinic()/requireRole() gibi doğrulanmış akışların üretebildiği klinik kimliği. */
export type ClinicId = string & { readonly [clinicIdBrand]: true }

/**
 * Oturumdan/DB'den doğrulanmış bir klinik id'sini `ClinicId`'ye çevirir.
 * Bilerek tek giriş noktası — authz katmanı dışında kullanılmamalı.
 */
export function asClinicId(rawClinicId: string): ClinicId {
  return rawClinicId as ClinicId
}

/** clinicId sütunu taşıyan (yani klinik başına izole edilmesi gereken) tablolar. */
export type ClinicScopedTable = PgTable & { clinicId: PgColumn }

/**
 * `WHERE clinic_id = :clinicId [AND ...extra]` koşulunu üretir. `clinicId`
 * zorunlu ve konumsal olduğu için atlanamaz; `table` da clinicId sütunu
 * olmayan bir tabloyla çağrılırsa derlenmez.
 */
export function clinicScopedWhere<T extends ClinicScopedTable>(
  table: T,
  clinicId: ClinicId,
  ...extra: (SQL | undefined)[]
): SQL {
  const conditions = [eq(table.clinicId, clinicId), ...extra].filter(
    (condition): condition is SQL => condition !== undefined,
  )
  // conditions en az bir eleman içerir (clinicId koşulu), and(...) hiçbir zaman undefined dönmez.
  return and(...conditions) as SQL
}
