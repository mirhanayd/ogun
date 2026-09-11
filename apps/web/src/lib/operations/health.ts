export async function readinessResponse(checkDatabase: () => Promise<unknown>) {
  try {
    await checkDatabase()
    return Response.json({ status: 'ready' })
  } catch {
    return Response.json({ status: 'not_ready' }, { status: 503 })
  }
}
