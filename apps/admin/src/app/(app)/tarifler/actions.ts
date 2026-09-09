'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { db } from '@ogun/db'
import {
  addPlatformRecipeReference,
  createPlatformRecipe,
  replacePlatformRecipeIngredients,
  transitionPlatformRecipe,
  updatePlatformRecipe,
} from '@ogun/db/queries'
import type { CatalogEditorialStatus } from '@ogun/db/schema'
import { requirePlatformPermission } from '@/lib/platform-authz'
import { getPlatformRequestMetadata } from '@/lib/platform-audit'

const field = (form: FormData, name: string) =>
  typeof form.get(name) === 'string' ? String(form.get(name)).trim() : ''
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

export async function createRecipeAction(formData: FormData) {
  const input = await actor('foods.write')
  let recipe
  try {
    recipe = await createPlatformRecipe(db, {
      ...input,
      nameTr: field(formData, 'nameTr'),
      servings: Number(field(formData, 'servings')),
      totalYieldGrams: field(formData, 'totalYieldGrams'),
      cookingMethod: field(formData, 'cookingMethod'),
      instructions: field(formData, 'instructions'),
    })
  } catch (error) {
    redirect(
      messageUrl(
        '/tarifler/yeni',
        'hata',
        error instanceof Error ? error.message : 'Tarif oluşturulamadı.',
      ),
    )
  }
  redirect(
    `/tarifler/${recipe.id}?mesaj=${encodeURIComponent('Taslak tarif oluşturuldu. Malzeme ve kaynak ekleyin.')}`,
  )
}

export async function updateRecipeAction(formData: FormData) {
  const input = await actor('foods.write'),
    recipeId = field(formData, 'recipeId')
  try {
    await updatePlatformRecipe(db, {
      ...input,
      recipeId,
      nameTr: field(formData, 'nameTr'),
      servings: Number(field(formData, 'servings')),
      totalYieldGrams: field(formData, 'totalYieldGrams'),
      cookingMethod: field(formData, 'cookingMethod'),
      instructions: field(formData, 'instructions'),
    })
  } catch (error) {
    redirect(
      messageUrl(
        `/tarifler/${recipeId}`,
        'hata',
        error instanceof Error ? error.message : 'Tarif kaydedilemedi.',
      ),
    )
  }
  revalidatePath(`/tarifler/${recipeId}`)
  redirect(messageUrl(`/tarifler/${recipeId}`, 'mesaj', 'Tarif kaydedildi.'))
}

export async function saveRecipeIngredientsAction(formData: FormData) {
  const input = await actor('foods.write'),
    recipeId = field(formData, 'recipeId'),
    foodIds = values(formData, 'foodId'),
    grams = values(formData, 'amountGrams'),
    portionIds = values(formData, 'portionId'),
    removed = new Set(values(formData, 'removeFoodId'))
  const ingredients = foodIds.flatMap((foodId, index) =>
    removed.has(foodId)
      ? []
      : [{ foodId, amountGrams: grams[index] ?? '', portionId: portionIds[index] || null }],
  )
  const newFoodId = field(formData, 'newFoodId'),
    newGrams = field(formData, 'newAmountGrams')
  if (newFoodId) ingredients.push({ foodId: newFoodId, amountGrams: newGrams, portionId: null })
  try {
    await replacePlatformRecipeIngredients(db, { ...input, recipeId, ingredients })
  } catch (error) {
    redirect(
      messageUrl(
        `/tarifler/${recipeId}`,
        'hata',
        error instanceof Error ? error.message : 'Malzemeler kaydedilemedi.',
      ),
    )
  }
  revalidatePath(`/tarifler/${recipeId}`)
  redirect(messageUrl(`/tarifler/${recipeId}`, 'mesaj', 'Malzemeler kaydedildi.'))
}

export async function addRecipeReferenceAction(formData: FormData) {
  const input = await actor('foods.write'),
    recipeId = field(formData, 'recipeId')
  try {
    await addPlatformRecipeReference(db, {
      ...input,
      recipeId,
      title: field(formData, 'title'),
      citation: field(formData, 'citation'),
      url: field(formData, 'url'),
      note: field(formData, 'note'),
    })
  } catch (error) {
    redirect(
      messageUrl(
        `/tarifler/${recipeId}`,
        'hata',
        error instanceof Error ? error.message : 'Kaynak eklenemedi.',
      ),
    )
  }
  revalidatePath(`/tarifler/${recipeId}`)
  redirect(messageUrl(`/tarifler/${recipeId}`, 'mesaj', 'Kaynak eklendi.'))
}

export async function submitRecipeForReviewAction(formData: FormData) {
  const input = await actor('foods.write'),
    recipeId = field(formData, 'recipeId')
  try {
    await transitionPlatformRecipe(db, { ...input, recipeId, toStatus: 'in_review' })
  } catch (error) {
    redirect(
      messageUrl(
        `/tarifler/${recipeId}`,
        'hata',
        error instanceof Error ? error.message : 'Kontrole gönderilemedi.',
      ),
    )
  }
  revalidatePath('/tarifler')
  redirect(messageUrl(`/tarifler/${recipeId}`, 'mesaj', 'Kontrole gönderildi.'))
}

export async function transitionRecipeAction(formData: FormData) {
  const input = await actor('foods.publish'),
    recipeId = field(formData, 'recipeId'),
    target = field(formData, 'toStatus') as CatalogEditorialStatus
  try {
    await transitionPlatformRecipe(db, { ...input, recipeId, toStatus: target })
  } catch (error) {
    redirect(
      messageUrl(
        `/tarifler/${recipeId}`,
        'hata',
        error instanceof Error ? error.message : 'Durum değiştirilemedi.',
      ),
    )
  }
  revalidatePath('/tarifler')
  redirect(messageUrl(`/tarifler/${recipeId}`, 'mesaj', `Durum ${target} olarak güncellendi.`))
}
