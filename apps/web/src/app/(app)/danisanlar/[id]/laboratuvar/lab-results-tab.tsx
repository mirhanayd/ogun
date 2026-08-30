import { listClientLabResults } from './queries'
import { createLabResultAction, deleteLabResultAction } from './actions'
import { LabResultsView, type LabResultChartPoint } from '@/screens/lab-results-view'

export async function LabResultsTab({ clientId }: { clientId: string }) {
  const rows = await listClientLabResults(clientId)
  const results: LabResultChartPoint[] = rows.map((row) => ({ id: row.id, testedAt: row.testedAt.toISOString(), analyte: row.analyte, value: row.value, unit: row.unit, refMin: row.refMin, refMax: row.refMax, isAbnormal: row.isAbnormal }))
  async function onDelete(id: string) { 'use server'; return deleteLabResultAction(id, clientId) }
  return <LabResultsView results={results} onSave={createLabResultAction.bind(null, clientId)} onDelete={onDelete} />
}
