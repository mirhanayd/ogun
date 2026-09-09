'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { db } from '@ogun/db'
import {
  addPlatformFoodReference,
  createPlatformFood,
  replacePlatformFoodNutrients,
  replacePlatformFoodPortions,
  transitionPlatformFood,
  updatePlatformFood,
} from '@ogun/db/queries'
import { foodPreparationEnum, type CatalogEditorialStatus } from '@ogun/db/schema'
import { requirePlatformPermission } from '@/lib/platform-authz'
import { getPlatformRequestMetadata } from '@/lib/platform-audit'

const field = (form: FormData, name: string) => {
  const value = form.get(name)
  return typeof value === 'string' ? value.trim() : ''
}
const values = (form: FormData, name: string) => form.getAll(name).map(String)
const messageUrl = (path: string, key: 'mesaj' | 'hata', message: string) => {
  const url = new URL(path, 'http://admin.local')
  url.searchParams.set(key, message)
  return `${url.pathname}${url.search}`
}
async function actor(permission: 'foods.write' | 'foods.publish') {
  const ctx = await requirePlatformPermission(permission)
  return {
    actorUserId: ctx.user.id,
    platformStaffId: ctx.staff.id,
    ...(await getPlatformRequestMetadata()),
  }
}
const preparation = (value: string) =>
  foodPreparationEnum.enumValues.includes(value as never)
    ? (value as (typeof foodPreparationEnum.enumValues)[number])
    : undefined

export async function createFoodAction(formData: FormData) {
  const input = await actor('foods.write')
  let food
  try {
    food = await createPlatformFood(db, {
      ...input,
      nameTr: field(formData, 'nameTr'),
      nameEn: field(formData, 'nameEn'),
      groupCode: field(formData, 'groupCode'),
      groupNameTr: field(formData, 'groupNameTr'),
      preparation: preparation(field(formData, 'preparation')),
    })
  } catch (error) {
    redirect(
      messageUrl(
        '/besinler/yeni',
        'hata',
        error instanceof Error ? error.message : 'Besin oluşturulamadı.',
      ),
    )
  }
  redirect(
    `/besinler/${food.id}?mesaj=${encodeURIComponent('Taslak oluşturuldu. Besin öğeleri, porsiyon ve kaynak ekleyin.')}`,
  )
}

export async function updateFoodAction(formData: FormData) {
  const input = await actor('foods.write'),
    foodId = field(formData, 'foodId')
  try {
    await updatePlatformFood(db, {
      ...input,
      foodId,
      nameTr: field(formData, 'nameTr'),
      nameEn: field(formData, 'nameEn'),
      groupCode: field(formData, 'groupCode'),
      groupNameTr: field(formData, 'groupNameTr'),
      preparation: preparation(field(formData, 'preparation')),
    })
  } catch (error) {
    redirect(
      messageUrl(
        `/besinler/${foodId}`,
        'hata',
        error instanceof Error ? error.message : 'Kaydedilemedi.',
      ),
    )
  }
  revalidatePath(`/besinler/${foodId}`)
  redirect(messageUrl(`/besinler/${foodId}`, 'mesaj', 'Genel bilgiler kaydedildi.'))
}

export async function saveFoodNutrientsAction(formData: FormData) {
  const input = await actor('foods.write'),
    foodId = field(formData, 'foodId')
  const rows = [...formData.entries()].flatMap(([key, value]) =>
    key.startsWith('nutrient:') && typeof value === 'string' && value.trim() !== ''
      ? [{ nutrientId: key.slice(9), valuePer100g: value }]
      : [],
  )
  try {
    await replacePlatformFoodNutrients(db, { ...input, foodId, values: rows })
  } catch (error) {
    redirect(
      messageUrl(
        `/besinler/${foodId}`,
        'hata',
        error instanceof Error ? error.message : 'Besin öğeleri kaydedilemedi.',
      ),
    )
  }
  revalidatePath(`/besinler/${foodId}`)
  redirect(messageUrl(`/besinler/${foodId}`, 'mesaj', 'Besin öğeleri kaydedildi.'))
}

export async function saveFoodPortionsAction(formData: FormData) {
  const input = await actor('foods.write'),
    foodId = field(formData, 'foodId'),
    labels = values(formData, 'portionLabel'),
    grams = values(formData, 'portionGrams'),
    defaultIndex = Number(field(formData, 'defaultIndex'))
  const portions = labels.flatMap((label, index) =>
    label.trim() || grams[index]?.trim()
      ? [{ label, grams: grams[index] ?? '', isDefault: index === defaultIndex, sortOrder: index }]
      : [],
  )
  try {
    await replacePlatformFoodPortions(db, { ...input, foodId, portions })
  } catch (error) {
    redirect(
      messageUrl(
        `/besinler/${foodId}`,
        'hata',
        error instanceof Error ? error.message : 'Porsiyonlar kaydedilemedi.',
      ),
    )
  }
  revalidatePath(`/besinler/${foodId}`)
  redirect(messageUrl(`/besinler/${foodId}`, 'mesaj', 'Porsiyonlar kaydedildi.'))
}

export async function addFoodReferenceAction(formData: FormData) {
  const input = await actor('foods.write'),
    foodId = field(formData, 'foodId')
  try {
    await addPlatformFoodReference(db, {
      ...input,
      foodId,
      title: field(formData, 'title'),
      citation: field(formData, 'citation'),
      url: field(formData, 'url'),
      note: field(formData, 'note'),
    })
  } catch (error) {
    redirect(
      messageUrl(
        `/besinler/${foodId}`,
        'hata',
        error instanceof Error ? error.message : 'Kaynak eklenemedi.',
      ),
    )
  }
  revalidatePath(`/besinler/${foodId}`)
  redirect(messageUrl(`/besinler/${foodId}`, 'mesaj', 'Kaynak eklendi.'))
}

export async function submitFoodForReviewAction(formData: FormData) {
  const input = await actor('foods.write'),
    foodId = field(formData, 'foodId')
  try {
    await transitionPlatformFood(db, { ...input, foodId, toStatus: 'in_review' })
  } catch (error) {
    redirect(
      messageUrl(
        `/besinler/${foodId}`,
        'hata',
        error instanceof Error ? error.message : 'Kontrole gönderilemedi.',
      ),
    )
  }
  revalidatePath('/besinler')
  redirect(messageUrl(`/besinler/${foodId}`, 'mesaj', 'Kontrole gönderildi.'))
}

export async function transitionFoodAction(formData: FormData) {
  const input = await actor('foods.publish'),
    foodId = field(formData, 'foodId'),
    target = field(formData, 'toStatus') as CatalogEditorialStatus
  try {
    await transitionPlatformFood(db, { ...input, foodId, toStatus: target })
  } catch (error) {
    redirect(
      messageUrl(
        `/besinler/${foodId}`,
        'hata',
        error instanceof Error ? error.message : 'Durum değiştirilemedi.',
      ),
    )
  }
  revalidatePath('/besinler')
  redirect(messageUrl(`/besinler/${foodId}`, 'mesaj', `Durum ${target} olarak güncellendi.`))
}
