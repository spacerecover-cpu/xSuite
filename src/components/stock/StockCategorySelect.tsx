import { useQuery } from '@tanstack/react-query';
import { getStockCategories, StockCategory } from '../../lib/stockService';
import { stockKeys } from '../../lib/queryKeys';

interface StockCategorySelectProps {
  value: string | null;
  onChange: (value: string | null) => void;
  type?: 'internal' | 'saleable';
  placeholder?: string;
  className?: string;
}

export function StockCategorySelect({
  value,
  onChange,
  type,
  placeholder = 'All Categories',
  className = '',
}: StockCategorySelectProps) {
  const { data: categories = [], isLoading } = useQuery({
    queryKey: [...stockKeys.categories(), type ?? 'all'],
    queryFn: () => getStockCategories(type),
  });

  const parentCategories = categories.filter((c) => !c.parent_id);
  const childCategories = categories.filter((c) => c.parent_id);

  const getChildren = (parentId: string): StockCategory[] =>
    childCategories.filter((c) => c.parent_id === parentId);

  const renderOptions = () => {
    const options: React.ReactNode[] = [];

    for (const parent of parentCategories) {
      const children = getChildren(parent.id);
      if (children.length > 0) {
        options.push(
          <option key={parent.id} value={parent.id}>
            {parent.name}
          </option>
        );
        for (const child of children) {
          options.push(
            <option key={child.id} value={child.id}>
              &nbsp;&nbsp;&nbsp;&nbsp;{child.name}
            </option>
          );
        }
      } else {
        options.push(
          <option key={parent.id} value={parent.id}>
            {parent.name}
          </option>
        );
      }
    }

    const orphans = childCategories.filter(
      (c) => !parentCategories.find((p) => p.id === c.parent_id)
    );
    for (const orphan of orphans) {
      options.push(
        <option key={orphan.id} value={orphan.id}>
          {orphan.name}
        </option>
      );
    }

    return options;
  };

  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
      disabled={isLoading}
      className={`w-full px-3 py-2 border border-slate-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
      <option value="">{isLoading ? 'Loading...' : placeholder}</option>
      {renderOptions()}
    </select>
  );
}
