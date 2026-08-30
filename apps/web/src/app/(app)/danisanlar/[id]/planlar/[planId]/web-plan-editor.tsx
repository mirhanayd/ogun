'use client'

import * as planActions from '@/app/(app)/planlar/actions'
import * as exchangeActions from '@/app/(app)/planlar/exchange-actions'
import { configurePlanEditorPersistence } from '@/screens/plan-editor-persistence'
import { PlanEditor, type PlanEditorProps } from './plan-editor'
import { SaveAsTemplateDialog } from './save-as-template-dialog'
import { PlanPdfDialog } from './plan-pdf-dialog'
import { ShareDialog } from './share-dialog'

configurePlanEditorPersistence({
  addAlternativeAction: planActions.addAlternativeAction,
  addItemAction: planActions.addItemAction,
  insertSavedMealAction: planActions.insertSavedMealAction,
  moveItemAction: planActions.moveItemAction,
  removeAlternativeAction: planActions.removeAlternativeAction,
  removeItemAction: planActions.removeItemAction,
  reorderItemsAction: planActions.reorderItemsAction,
  updateItemAction: planActions.updateItemAction,
  updateMealAction: planActions.updateMealAction,
  updatePlanAction: planActions.updatePlanAction,
  createSavedMealAction: planActions.createSavedMealAction,
  buildExchangeEquivalentsPreviewAction: exchangeActions.buildExchangeEquivalentsPreviewAction,
  listFoodsForExchangeGroupAction: exchangeActions.listFoodsForExchangeGroupAction,
})

export function WebPlanEditor(props: PlanEditorProps) {
  return <PlanEditor {...props} renderCloudDialogs={(state) => <>
    <SaveAsTemplateDialog planId={state.planId} currentPlanName={state.currentPlanName} open={state.templateDialogOpen} onOpenChange={state.setTemplateDialogOpen} />
    <PlanPdfDialog open={state.pdfDialogOpen} onOpenChange={state.setPdfDialogOpen} planId={state.planId} clientId={state.clientId} defaultDensity={props.pdfDefaultDensity} defaultShowCalories={props.pdfDefaultShowCalories} />
    <ShareDialog open={state.shareDialogOpen} onOpenChange={state.setShareDialogOpen} planId={state.planId} clientId={state.clientId} planName={state.currentPlanName} clientName={props.clientName} clientPhone={props.clientPhone} clientEmail={props.clientEmail} whatsappTemplate={props.whatsappTemplate} />
  </>} />
}
