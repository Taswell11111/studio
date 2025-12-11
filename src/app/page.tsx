import ShipmentDashboard from '@/components/shipment-dashboard';
import { ClearDataButton } from '@/components/clear-data-button';
import { RefreshAllButton } from '@/components/refresh-all-button';

export default function Home() {
  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="flex justify-end gap-2 mb-4">
        <RefreshAllButton />
        <ClearDataButton />
      </div>
      <ShipmentDashboard />
    </main>
  );
}
