import { getClientBillingData } from './queries'
import { createPaymentAction, purchasePackageAction } from './actions'
import { OdemelerView } from '@/screens/client-payments-view'

export async function OdemelerTab({ clientId }: { clientId: string }) {
  const { clientPackages, payments, availablePackages } = await getClientBillingData(clientId)
  return <OdemelerView clientPackages={clientPackages} payments={payments} availablePackages={availablePackages} onCreatePayment={createPaymentAction.bind(null, clientId)} onPurchasePackage={purchasePackageAction.bind(null, clientId)} />
}
