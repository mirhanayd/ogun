import { PanelScreen } from '@/screens/panel-screen'
import { getPanelNotificationFeed } from './queries'

export default async function PanelPage() {
  return <PanelScreen feed={await getPanelNotificationFeed()} />
}
