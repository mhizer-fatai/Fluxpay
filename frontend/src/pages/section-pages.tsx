import { DashboardShell, GenericPage } from '@/components/dashboard-shell'

export function SectionPage({ title, description }: { title: string; description: string }) {
  return <DashboardShell><GenericPage title={title} description={description} /></DashboardShell>
}
