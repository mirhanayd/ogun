import { getClientAppointments } from '../../../randevular/queries'
import { ClientAppointmentsView } from '@/screens/client-appointments-view'

export async function AppointmentsTab({ clientId }: { clientId: string }) {
  const appointments = await getClientAppointments(clientId)
  return <ClientAppointmentsView appointments={appointments} />
}
