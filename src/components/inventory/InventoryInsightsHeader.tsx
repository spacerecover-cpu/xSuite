import { HardDrive, Cpu, CircuitBoard, DollarSign, Package, TrendingUp } from 'lucide-react';
import { useCurrency } from '../../hooks/useCurrency';
import { StatCard } from '../shared/StatCard';

interface InventoryInsightsHeaderProps {
  hddCount: number;
  ssdCount: number;
  pcbCount: number;
  totalValue: number;
  totalItems: number;
  inUseCount: number;
  loading?: boolean;
}

/**
 * Inventory KPI strip — six tiles on the cat-* identity palette via the shared
 * StatCard, so it follows the tenant's compact/vivid style like every other
 * KPI surface. "Total Value" is the lime cat-3 tone carrying a currency value
 * (truncates with a tooltip when long).
 */
export const InventoryInsightsHeader: React.FC<InventoryInsightsHeaderProps> = ({
  hddCount,
  ssdCount,
  pcbCount,
  totalValue,
  totalItems,
  inUseCount,
  loading = false,
}) => {
  const { formatCurrency, loading: currencyLoading } = useCurrency();
  const formatNumber = (value: number): string => new Intl.NumberFormat('en-US').format(value);
  const isLoading = loading || currencyLoading;

  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
      <StatCard tone="neutral" icon={Package} label="Total Items" value={formatNumber(totalItems)} loading={isLoading} />
      <StatCard tone="cat-1" icon={HardDrive} label="Hard Drives" value={formatNumber(hddCount)} loading={isLoading} />
      <StatCard tone="cat-2" icon={Cpu} label="Solid State" value={formatNumber(ssdCount)} loading={isLoading} />
      <StatCard tone="cat-5" icon={CircuitBoard} label="PCB Boards" value={formatNumber(pcbCount)} loading={isLoading} />
      <StatCard tone="cat-6" icon={TrendingUp} label="In Use" value={formatNumber(inUseCount)} loading={isLoading} />
      <StatCard tone="cat-3" icon={DollarSign} label="Total Value" value={formatCurrency(totalValue)} loading={isLoading} />
    </div>
  );
};
