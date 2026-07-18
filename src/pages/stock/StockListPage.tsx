import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import {
  Package,
  Plus,
  Search,
  LayoutGrid,
  LayoutList,
  TrendingDown,
  AlertCircle,
  DollarSign,
  Boxes,
  Settings,
  ClipboardList,
  Scan,
  SlidersHorizontal,
  TrendingUp,
  Printer,
  CheckSquare,
  MinusSquare,
  Square,
  X,
} from 'lucide-react';
import { EmptyState } from '../../components/shared/EmptyState';
import { stockKeys } from '../../lib/queryKeys';
import {
  getStockItemsPage,
  getStockStats,
  deleteStockItem,
  fetchAllStockItemsForLabels,
  type StockItemWithCategory,
  type StockFilters,
} from '../../lib/stockService';
import { ListPageTemplate } from '../../components/templates/ListPageTemplate';
import { StatCard } from '../../components/shared/StatCard';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { StockItemsTable } from '../../components/stock/StockItemsTable';
import { StockItemFormModal } from '../../components/stock/StockItemFormModal';
import { StockTransactionModal } from '../../components/stock/StockTransactionModal';
import { LowStockAlert } from '../../components/stock/LowStockAlert';
import { StockCategorySelect } from '../../components/stock/StockCategorySelect';
import { SaleableItemsGrid } from '../../components/stock/SaleableItemsGrid';
import { BarcodeLookupInput } from '../../components/stock/BarcodeLookupInput';
import { BulkAdjustmentModal } from '../../components/stock/BulkAdjustmentModal';
import { BulkPriceUpdateModal } from '../../components/stock/BulkPriceUpdateModal';
import { BulkLabelPrintModal } from '../../components/labels/BulkLabelPrintModal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../hooks/useToast';
import { useCurrency } from '../../hooks/useCurrency';
import { useCurrencyConfig } from '../../contexts/TenantConfigContext';
import { formatCurrencyWithConfig } from '../../lib/format';
import { pageAllSelected, pageSomeSelected, toggleOne, togglePage } from '../../lib/listSelection';
import { useListPageSize } from '../../hooks/useListPageSize';

type TabId = 'all' | 'saleable' | 'internal' | 'low_stock';

const TABS: { id: TabId; label: string }[] = [
  { id: 'all', label: 'All Items' },
  { id: 'saleable', label: 'Backup Devices' },
  { id: 'internal', label: 'Internal Supplies' },
  { id: 'low_stock', label: 'Low Stock' },
];

export const StockListPage: React.FC = () => {
  const { formatCurrency } = useCurrency();
  const currency = useCurrencyConfig();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<TabId>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const pageSize = useListPageSize();
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [alertDismissed, setAlertDismissed] = useState(false);

  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<StockItemWithCategory | null>(null);

  const [transactionModalOpen, setTransactionModalOpen] = useState(false);
  const [transactionMode, setTransactionMode] = useState<'receipt' | 'usage'>('receipt');
  const [transactionItem, setTransactionItem] = useState<StockItemWithCategory | null>(null);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingItem, setDeletingItem] = useState<StockItemWithCategory | null>(null);

  const [selectionMode, setSelectionMode] = useState(false);
  // Selection is a Map keyed by row id → row object, so a selection built up
  // across pages survives paging (the list only holds the current page) and can
  // still be printed. The header "select all" is page-scoped (see listSelection).
  const [selectedRows, setSelectedRows] = useState<Map<string, StockItemWithCategory>>(() => new Map());
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [bulkAdjustOpen, setBulkAdjustOpen] = useState(false);
  const [bulkPriceOpen, setBulkPriceOpen] = useState(false);
  const [printLabelsOpen, setPrintLabelsOpen] = useState(false);
  const [showPrice, setShowPrice] = useState(true);
  const [locationName, setLocationName] = useState('');
  const [companyName, setCompanyName] = useState('');

  useEffect(() => {
    if (searchParams.get('filter') === 'low-stock') {
      setActiveTab('low_stock');
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(0);
  }, [activeTab, debouncedSearch, categoryId, pageSize]);

  const filters = useMemo((): StockFilters => {
    const base: StockFilters = {
      search: debouncedSearch || undefined,
      category_id: categoryId ?? undefined,
    };
    if (activeTab === 'saleable') return { ...base, type: 'saleable' };
    if (activeTab === 'internal') return { ...base, type: 'internal' };
    if (activeTab === 'low_stock') return { ...base, lowStock: true };
    return base;
  }, [activeTab, debouncedSearch, categoryId]);

  const { data: itemsPage, isLoading: itemsLoading } = useQuery({
    queryKey: [...stockKeys.items(), filters, page, pageSize],
    queryFn: () => getStockItemsPage(filters, page, pageSize),
    staleTime: 30000,
    placeholderData: keepPreviousData,
  });
  const items = itemsPage?.rows ?? [];
  const total = itemsPage?.total ?? 0;

  const { data: stats } = useQuery({
    queryKey: stockKeys.stats(),
    queryFn: getStockStats,
    staleTime: 60000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteStockItem(id),
    onSuccess: () => {
      toast.success('Stock item deleted');
      queryClient.invalidateQueries({ queryKey: stockKeys.items() });
      queryClient.invalidateQueries({ queryKey: stockKeys.stats() });
      setDeleteDialogOpen(false);
      setDeletingItem(null);
    },
    onError: (err: Error) => {
      toast.error(err.message ?? 'Failed to delete item');
    },
  });

  const handleEdit = (item: StockItemWithCategory) => {
    setEditingItem(item);
    setFormModalOpen(true);
  };

  const handleViewDetail = (item: StockItemWithCategory) => {
    navigate(`/stock/${item.id}`);
  };

  const handleReceive = (item: StockItemWithCategory) => {
    setTransactionItem(item);
    setTransactionMode('receipt');
    setTransactionModalOpen(true);
  };

  const handleRecordUsage = (item: StockItemWithCategory) => {
    navigate(`/stock/${item.id}`);
  };

  const handleDelete = (item: StockItemWithCategory) => {
    setDeletingItem(item);
    setDeleteDialogOpen(true);
  };

  const handleFormSuccess = () => {
    queryClient.invalidateQueries({ queryKey: stockKeys.items() });
    queryClient.invalidateQueries({ queryKey: stockKeys.stats() });
  };

  const handleTransactionSuccess = () => {
    queryClient.invalidateQueries({ queryKey: stockKeys.items() });
    queryClient.invalidateQueries({ queryKey: stockKeys.stats() });
  };

  const showGrid = activeTab === 'saleable' && viewMode === 'grid';

  const selectedItems = useMemo(() => Array.from(selectedRows.values()), [selectedRows]);
  const allOnPageSelected = pageAllSelected(selectedRows, items);
  const someOnPageSelected = pageSomeSelected(selectedRows, items);

  const toggleSelected = (item: StockItemWithCategory) =>
    setSelectedRows((prev) => toggleOne(prev, item));

  // Select/deselect only the current page, preserving selections on other pages.
  const toggleSelectAll = () =>
    setSelectedRows((prev) => togglePage(prev, items, allOnPageSelected));

  const clearSelection = () => setSelectedRows(new Map());

  const exitSelectionMode = () => {
    setSelectionMode(false);
    clearSelection();
  };

  const handleBarcodeItemFound = (item: StockItemWithCategory) => {
    setScanModalOpen(false);
    toast.success(`Found: ${item.name}`);
    navigate(`/stock/${item.id}`);
  };

  const openBulkAdjust = () => {
    if (selectedRows.size < 2) {
      toast.error('Select at least 2 items for bulk adjustment');
      return;
    }
    setBulkAdjustOpen(true);
  };

  const openBulkPrice = () => {
    if (selectedRows.size < 2) {
      toast.error('Select at least 2 items for bulk price update');
      return;
    }
    setBulkPriceOpen(true);
  };

  const openPrintLabels = () => {
    if (selectedRows.size < 1) {
      toast.error('Select at least 1 item to print labels');
      return;
    }
    setPrintLabelsOpen(true);
  };

  return (
    <ListPageTemplate
      title="Stock"
      headerActions={
        <>
          <Button
            variant="secondary"
            size="sm"
            className="gap-2"
            onClick={() => setScanModalOpen(true)}
          >
            <Scan className="w-4 h-4" />
            Scan Barcode
          </Button>
          <Button
            variant={selectionMode ? 'primary' : 'secondary'}
            size="sm"
            className="gap-2"
            onClick={() => {
              if (selectionMode) exitSelectionMode();
              else setSelectionMode(true);
            }}
          >
            <CheckSquare className="w-4 h-4" />
            {selectionMode ? 'Exit Select' : 'Bulk Select'}
          </Button>
          <Link to="/stock/adjustments">
            <Button variant="secondary" size="sm" className="gap-2">
              <ClipboardList className="w-4 h-4" />
              Adjustments
            </Button>
          </Link>
          <Link to="/stock/categories">
            <Button variant="secondary" size="sm" className="gap-2">
              <Settings className="w-4 h-4" />
              Categories
            </Button>
          </Link>
          <Button
            variant="primary"
            size="sm"
            className="gap-2"
            onClick={() => {
              setEditingItem(null);
              setFormModalOpen(true);
            }}
          >
            <Plus className="w-4 h-4" />
            Add Item
          </Button>
        </>
      }
      kpis={
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <StatCard
              label="Total Items"
              value={stats?.totalItems ?? 0}
              tone="primary"
              icon={Boxes}
            />
            <StatCard
              label="Stock Value"
              value={formatCurrency(stats?.stockValue ?? 0)}
              tone="info"
              icon={DollarSign}
            />
            <StatCard
              label="Low Stock"
              value={stats?.lowStockCount ?? 0}
              tone="warning"
              icon={TrendingDown}
              onClick={() => {
                setActiveTab('low_stock');
                navigate('/stock?filter=low-stock');
              }}
            />
            <StatCard
              label="Out of Stock"
              value={stats?.outOfStockCount ?? 0}
              tone="danger"
              icon={AlertCircle}
            />
          </div>

          {!alertDismissed && (stats?.lowStockCount ?? 0) > 0 && (
            <div className="mb-6">
              <LowStockAlert
                count={stats?.lowStockCount ?? 0}
                onDismiss={() => setAlertDismissed(true)}
              />
            </div>
          )}
        </>
      }
      table={
        <>
          <div className="border-b border-slate-200 px-4">
          <div className="flex items-center gap-0 overflow-x-auto">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                {tab.label}
                {tab.id === 'low_stock' && (stats?.lowStockCount ?? 0) > 0 && (
                  <span className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-warning-muted text-warning text-xs font-bold">
                    {stats?.lowStockCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center border-b border-slate-100">
          <div className="relative flex-1 min-w-0 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, brand, SKU..."
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            />
          </div>

          <div className="w-full sm:w-56">
            <StockCategorySelect
              value={categoryId}
              onChange={setCategoryId}
              placeholder="All Categories"
            />
          </div>

          {activeTab === 'saleable' && (
            <div className="flex items-center gap-1 border border-slate-200 rounded-md p-1">
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded transition-colors ${
                  viewMode === 'table'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                }`}
                title="Table view"
              >
                <LayoutList className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                }`}
                title="Grid view"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="flex items-center gap-2 text-sm text-slate-500 ml-auto shrink-0">
            <span className="font-medium text-slate-700 tabular-nums">{total}</span>
            <span>item{total !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {selectionMode && (
          <div className="px-4 py-3 bg-info-muted/40 border-b border-info/20 flex flex-wrap items-center gap-3">
            <button
              onClick={toggleSelectAll}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 hover:text-primary transition-colors"
            >
              {allOnPageSelected ? (
                <CheckSquare className="w-4 h-4 text-primary" />
              ) : someOnPageSelected ? (
                <MinusSquare className="w-4 h-4 text-primary" />
              ) : (
                <Square className="w-4 h-4 text-slate-400" />
              )}
              {allOnPageSelected ? 'Deselect all on page' : 'Select all on page'}
            </button>
            <span className="text-sm text-slate-600">
              <span className="font-semibold text-primary">{selectedRows.size}</span> selected
            </span>
            <div className="flex items-center gap-2 ml-auto">
              <Button
                variant="secondary"
                size="sm"
                className="gap-1.5"
                onClick={openPrintLabels}
                disabled={selectedRows.size < 1}
              >
                <Printer className="w-4 h-4" />
                Print Labels
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="gap-1.5"
                onClick={openBulkAdjust}
                disabled={selectedRows.size < 2}
              >
                <SlidersHorizontal className="w-4 h-4" />
                Bulk Adjust
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="gap-1.5"
                onClick={openBulkPrice}
                disabled={selectedRows.size < 2}
              >
                <TrendingUp className="w-4 h-4" />
                Bulk Price
              </Button>
              <button
                onClick={clearSelection}
                disabled={selectedRows.size === 0}
                className="p-1 rounded hover:bg-white/60 text-slate-500 hover:text-slate-700 disabled:opacity-40 transition-colors"
                title="Clear selection"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        <div className={showGrid ? 'p-4' : ''}>
          {!itemsLoading && items.length === 0 ? (
            <EmptyState
              icon={Package}
              title="No stock items found"
              description={
                debouncedSearch || categoryId || activeTab !== 'all'
                  ? 'No stock items found matching your criteria.'
                  : 'No stock items yet. Add your first item to get started.'
              }
              action={{ label: 'Add Item', onClick: () => { setEditingItem(null); setFormModalOpen(true); } }}
            />
          ) : showGrid ? (
            <SaleableItemsGrid
              items={items}
              onSelect={(item) => (selectionMode ? toggleSelected(item) : handleEdit(item))}
              selectedIds={selectionMode ? Array.from(selectedRows.keys()) : []}
            />
          ) : selectionMode ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left w-10">
                      <button
                        onClick={toggleSelectAll}
                        className="text-slate-400 hover:text-primary"
                        aria-label={allOnPageSelected ? 'Deselect all on page' : 'Select all on page'}
                        title={allOnPageSelected ? 'Deselect all on page' : 'Select all on page'}
                      >
                        {allOnPageSelected ? (
                          <CheckSquare className="w-4 h-4 text-primary" />
                        ) : someOnPageSelected ? (
                          <MinusSquare className="w-4 h-4 text-primary" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      SKU
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Item
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Category
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Qty
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Cost
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Selling
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {items.map((item, idx) => {
                    const isSelected = selectedRows.has(item.id);
                    return (
                      <tr
                        key={item.id}
                        onClick={() => toggleSelected(item)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-info-muted/30 hover:bg-info-muted/50'
                            : idx % 2 === 0
                            ? 'bg-white hover:bg-slate-50'
                            : 'bg-slate-50/30 hover:bg-slate-50'
                        }`}
                      >
                        <td className="px-4 py-3">
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-primary" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-300" />
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {item.sku ? (
                            <span className="font-mono text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                              {item.sku}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-slate-900 truncate max-w-[260px]">{item.name}</p>
                          {item.brand && <p className="text-xs text-slate-500 truncate">{item.brand}</p>}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">
                          {item.stock_categories?.name ?? <span className="text-slate-400">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right text-sm tabular-nums text-slate-700">
                          {item.current_quantity ?? 0}
                        </td>
                        <td className="px-4 py-3 text-right text-sm tabular-nums text-slate-700">
                          {item.cost_price != null ? formatCurrency(item.cost_price) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-sm tabular-nums text-slate-700">
                          {item.selling_price != null ? formatCurrency(item.selling_price) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <StockItemsTable
              items={items}
              isLoading={itemsLoading}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onViewDetail={handleViewDetail}
              onReceive={handleReceive}
              onRecordUsage={handleRecordUsage}
            />
          )}
          </div>
        </>
      }
      pager={
        total > 0
          ? { page, pageSize, total, onPageChange: setPage, itemNoun: 'stock items' }
          : undefined
      }
    >
      <StockItemFormModal
        isOpen={formModalOpen}
        onClose={() => {
          setFormModalOpen(false);
          setEditingItem(null);
        }}
        item={editingItem}
        onSuccess={handleFormSuccess}
      />

      <StockTransactionModal
        isOpen={transactionModalOpen}
        onClose={() => {
          setTransactionModalOpen(false);
          setTransactionItem(null);
        }}
        item={transactionItem}
        mode={transactionMode}
        onSuccess={handleTransactionSuccess}
      />

      <ConfirmDialog
        isOpen={deleteDialogOpen}
        onClose={() => {
          setDeleteDialogOpen(false);
          setDeletingItem(null);
        }}
        onConfirm={() => {
          if (deletingItem) deleteMutation.mutate(deletingItem.id);
        }}
        title="Delete Stock Item"
        message={`Are you sure you want to delete "${deletingItem?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        variant="danger"
        isLoading={deleteMutation.isPending}
      />

      <Modal
        isOpen={scanModalOpen}
        onClose={() => setScanModalOpen(false)}
        title="Scan or Lookup Barcode"
        icon={Scan}
        size="md"
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Scan a barcode or paste a serial number to jump straight to the item.
          </p>
          <BarcodeLookupInput
            onItemFound={handleBarcodeItemFound}
            onSerialFound={(_serial, item) => {
              if (item) {
                handleBarcodeItemFound(item);
              } else {
                toast.error('Serial found but no parent item is linked');
              }
            }}
            placeholder="Scan or type barcode / serial..."
          />
        </div>
      </Modal>

      {bulkAdjustOpen && selectedItems.length > 0 && (
        <BulkAdjustmentModal
          selectedItems={selectedItems}
          onClose={() => {
            setBulkAdjustOpen(false);
            clearSelection();
          }}
        />
      )}

      {bulkPriceOpen && selectedItems.length > 0 && (
        <BulkPriceUpdateModal
          selectedItems={selectedItems}
          onClose={() => {
            setBulkPriceOpen(false);
            clearSelection();
          }}
        />
      )}

      {printLabelsOpen && selectedItems.length > 0 && (
        <BulkLabelPrintModal
          entity="stock"
          selected={selectedItems}
          fetchAllFiltered={() => fetchAllStockItemsForLabels(filters)}
          extraFields={
            <div className="space-y-4 border-t border-slate-100 pt-4">
              <h4 className="text-sm font-semibold text-slate-700">Label content</h4>
              <div>
                <label htmlFor="stock-label-company" className="block text-xs font-medium text-slate-600 mb-1">Company Name</label>
                <input
                  id="stock-label-company"
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Your company name (optional)"
                />
              </div>
              <div>
                <label htmlFor="stock-label-location" className="block text-xs font-medium text-slate-600 mb-1">Location</label>
                <input
                  id="stock-label-location"
                  type="text"
                  value={locationName}
                  onChange={(e) => setLocationName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Storage location (optional)"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showPrice}
                  onChange={(e) => setShowPrice(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-primary"
                />
                Show Price
              </label>
            </div>
          }
          onRun={(items, run) =>
            import('../../lib/pdf/labels/bulkLabelPrint').then(({ printStockLabelsBulk }) =>
              printStockLabelsBulk(
                items.map((item) => ({
                  item,
                  priceText:
                    showPrice && item.selling_price != null
                      ? formatCurrencyWithConfig(item.selling_price, currency)
                      : null,
                })),
                { ...run, locationName: locationName || undefined, companyName: companyName || undefined },
              )
            )
          }
          onClose={() => setPrintLabelsOpen(false)}
        />
      )}
    </ListPageTemplate>
  );
};

export default StockListPage;
