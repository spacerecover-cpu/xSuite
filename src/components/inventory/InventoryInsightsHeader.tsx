import { HardDrive, Cpu, CircuitBoard, DollarSign, Package, TrendingUp } from 'lucide-react';
import { useCurrency } from '../../hooks/useCurrency';

interface InventoryInsightsHeaderProps {
  hddCount: number;
  ssdCount: number;
  pcbCount: number;
  totalValue: number;
  totalItems: number;
  inUseCount: number;
  loading?: boolean;
}

interface InsightCardProps {
  icon: React.ElementType;
  label: string;
  value: string;
  iconColor: string;
  iconBgColor: string;
}

const InsightCard: React.FC<InsightCardProps> = ({ icon: Icon, label, value, iconColor, iconBgColor }) => {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className={`p-2.5 rounded-lg ${iconBgColor}`}>
        <Icon className={`w-5 h-5 ${iconColor}`} />
      </div>
      <div className="flex flex-col">
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</span>
        <span className="text-2xl font-bold text-slate-900 leading-tight">{value}</span>
      </div>
    </div>
  );
};

const SkeletonCard: React.FC = () => {
  return (
    <div className="flex items-center gap-3 px-4 py-3 animate-pulse">
      <div className="w-10 h-10 bg-slate-200 rounded-lg"></div>
      <div className="flex flex-col gap-1.5">
        <div className="h-3 w-16 bg-slate-200 rounded"></div>
        <div className="h-7 w-20 bg-slate-200 rounded"></div>
      </div>
    </div>
  );
};

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

  const formatNumber = (value: number): string => {
    return new Intl.NumberFormat('en-US').format(value);
  };

  const isLoading = loading || currencyLoading;

  return (
    <div className="bg-gradient-to-r from-slate-50 to-slate-100 border border-slate-200 rounded-lg shadow-sm overflow-hidden">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 divide-x divide-y lg:divide-y-0 divide-slate-200">
        {isLoading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          <>
            <InsightCard
              icon={Package}
              label="Total Items"
              value={formatNumber(totalItems)}
              iconColor="text-slate-700"
              iconBgColor="bg-slate-100"
            />
            <InsightCard
              icon={HardDrive}
              label="Hard Drives"
              value={formatNumber(hddCount)}
              iconColor="text-cat-1"
              iconBgColor="bg-cat-1/10"
            />
            <InsightCard
              icon={Cpu}
              label="Solid State"
              value={formatNumber(ssdCount)}
              iconColor="text-cat-2"
              iconBgColor="bg-cat-2/10"
            />
            <InsightCard
              icon={CircuitBoard}
              label="PCB Boards"
              value={formatNumber(pcbCount)}
              iconColor="text-cat-5"
              iconBgColor="bg-cat-5/10"
            />
            <InsightCard
              icon={TrendingUp}
              label="In Use"
              value={formatNumber(inUseCount)}
              iconColor="text-cat-6"
              iconBgColor="bg-cat-6/10"
            />
            <InsightCard
              icon={DollarSign}
              label="Total Value"
              value={formatCurrency(totalValue)}
              iconColor="text-cat-3"
              iconBgColor="bg-cat-3/10"
            />
          </>
        )}
      </div>
    </div>
  );
};
