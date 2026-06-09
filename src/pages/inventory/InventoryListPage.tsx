import { useState, useEffect } from 'react';
import { Plus, Search, Package, Zap, Edit2, Trash2, RefreshCw, Filter, ChevronLeft, ChevronRight, Upload } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../hooks/useToast';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import AddInventoryModal from '../../components/inventory/AddInventoryModal';
import InventoryDetailModal from '../../components/inventory/InventoryDetailModal';
import DeleteInventoryConfirmationModal from '../../components/inventory/DeleteInventoryConfirmationModal';
import { InventoryInsightsHeader } from '../../components/inventory/InventoryInsightsHeader';
import { BulkInventoryImportModal } from '../../components/importExport/BulkInventoryImportModal';
import {
  getInventoryItems,
  getInventoryCategories,
  getInventoryStatusTypes,
  getInventoryStatistics,
  getInventoryInsights,
  updateInventoryItem,
  deleteInventoryItem,
  type InventoryItemCategory,
  type InventoryStatusType,
  type InventoryInsights,
} from '../../lib/inventoryService';
import { format } from 'date-fns';
import { logger } from '../../lib/logger';

export default function InventoryListPage() {
  const navigate = useNavigate();
  const toast = useToast();

  const [items, setItems] = useState<any[]>([]);
  const [categories, setCategories] = useState<InventoryItemCategory[]>([]);
  const [statusTypes, setStatusTypes] = useState<InventoryStatusType[]>([]);
  const [statistics, setStatistics] = useState({
    totalItems: 0,
    totalInStock: 0,
    totalInUse: 0,
    totalValue: 0,
  });
  const [insights, setInsights] = useState<InventoryInsights>({
    hddCount: 0,
    ssdCount: 0,
    pcbCount: 0,
    totalValue: 0,
    totalInUse: 0,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [editingStatusId, setEditingStatusId] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const ITEMS_PER_PAGE = 7;

  useEffect(() => {
    loadData();
  }, [selectedCategory, selectedStatus, searchTerm, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedCategory, selectedStatus]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.status-dropdown')) {
        setEditingStatusId(null);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setEditingStatusId(null);
      }
    };

    if (editingStatusId) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [editingStatusId]);

  const loadData = async () => {
    try {
      if (!isRefreshing) {
        setLoading(true);
      }
      setError(null);

      const [itemsData, categoriesData, statusTypesData, statsData, insightsData] =
        await Promise.all([
          getInventoryItems({
            category_id: selectedCategory || undefined,
            status_id: selectedStatus || undefined,
            search: searchTerm || undefined,
          }),
          getInventoryCategories(),
          getInventoryStatusTypes(),
          getInventoryStatistics(),
          getInventoryInsights(),
        ]);

      setItems(itemsData || []);
      setCategories(categoriesData || []);
      setStatusTypes(statusTypesData || []);
      setStatistics(statsData || {
        totalItems: 0,
        totalInStock: 0,
        totalInUse: 0,
        totalValue: 0,
      });
      setInsights(insightsData || {
        hddCount: 0,
        ssdCount: 0,
        pcbCount: 0,
        totalValue: 0,
        totalInUse: 0,
      });
    } catch (error: unknown) {
      setIsRefreshing(false);
      logger.error('Error loading inventory data:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to load inventory data. Please try again.';
      setError(errorMessage);

      setItems([]);
      setCategories([]);
      setStatusTypes([]);
      setStatistics({
        totalItems: 0,
        totalInStock: 0,
        totalInUse: 0,
        totalValue: 0,
      });
      setInsights({
        hddCount: 0,
        ssdCount: 0,
        pcbCount: 0,
        totalValue: 0,
        totalInUse: 0,
      });
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
  };

  const handleSearch = (value: string) => {
    setSearchTerm(value);
  };

  const handleInventorySuccess = () => {
    loadData();
  };

  const handleRowClick = (item: { id: string }, e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.closest('.status-dropdown') ||
      target.closest('.action-button') ||
      target.closest('button')
    ) {
      return;
    }
    setSelectedItemId(item.id);
    setIsDetailModalOpen(true);
  };

  const handleDetailModalClose = () => {
    setIsDetailModalOpen(false);
    setSelectedItemId(null);
  };

  const handleItemUpdate = () => {
    loadData();
  };

  const handleStatusClick = (itemId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingStatusId(editingStatusId === itemId ? null : itemId);
  };

  const handleStatusChange = async (itemId: string, newStatusId: string) => {
    setUpdatingStatus(true);
    try {
      await updateInventoryItem(itemId, { status_id: newStatusId });
      setEditingStatusId(null);
      await loadData();
    } catch (error) {
      logger.error('Error updating status:', error);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const getStockColor = (count: number) => {
    if (count === 0) return 'text-danger';
    if (count <= 2) return 'text-warning';
    return 'text-gray-900';
  };

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'dd MMM yyyy');
    } catch {
      return 'N/A';
    }
  };

  const handleDeleteItem = async () => {
    if (!deletingItemId) return;

    try {
      await deleteInventoryItem(deletingItemId);
      setDeletingItemId(null);
      await loadData();
      toast.success('Item deleted successfully');
    } catch (error) {
      logger.error('Error deleting inventory item:', error);
      toast.error('Failed to delete item. Please try again.');
    }
  };

  const handleChangeItemStatus = async (statusId: string) => {
    if (!deletingItemId) return;

    try {
      await updateInventoryItem(deletingItemId, { status_id: statusId });
      setDeletingItemId(null);
      await loadData();
      toast.success('Item status changed successfully');
    } catch (error) {
      logger.error('Error changing item status:', error);
      toast.error('Failed to change status. Please try again.');
    }
  };

  const getDeletingItemName = () => {
    if (!deletingItemId) return '';
    const item = items.find(i => i.id === deletingItemId);
    if (!item) return 'Unknown Item';
    return `${item.brand?.name || ''} ${item.model || ''}`.trim() || 'Inventory Item';
  };

  const totalPages = Math.ceil(items.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE + 1;
  const endIndex = Math.min(currentPage * ITEMS_PER_PAGE, items.length);
  const paginatedItems = items.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  return (
    <div className="p-6 max-w-[1800px] mx-auto">
      <div className="mb-6 flex items-start justify-between">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center shadow-lg bg-primary">
            <Package className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 mb-1">Inventory Management</h1>
            <p className="text-slate-600 text-base">
              Track and manage physical inventory items
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => navigate('/inventory/donor-search')}
            variant="secondary"
          >
            <Zap className="w-4 h-4 mr-2" />
            Donor Search
          </Button>
          <Button
            onClick={() => setIsBulkImportOpen(true)}
            variant="secondary"
            className="bg-success-muted hover:bg-success-muted/80 text-success border-success/30"
          >
            <Upload className="w-4 h-4 mr-2" />
            Bulk Import
          </Button>
          <Button
            onClick={handleRefresh}
            variant="secondary"
            disabled={isRefreshing}
            title="Refresh inventory list"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
          <Button onClick={() => setIsAddModalOpen(true)} variant="primary">
            <Plus className="w-4 h-4 mr-2" />
            Add Item
          </Button>
        </div>
      </div>

      <div className="mb-6">
        <InventoryInsightsHeader
          hddCount={insights.hddCount}
          ssdCount={insights.ssdCount}
          pcbCount={insights.pcbCount}
          totalValue={insights.totalValue}
          totalItems={statistics.totalItems}
          inUseCount={insights.totalInUse}
          loading={loading}
        />
      </div>

      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 mb-6">
        <div className="p-6">
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center">
            <div className="w-full lg:w-80 relative flex-shrink-0">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search inventory..."
                value={searchTerm}
                onChange={(e) => handleSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>

            <div className="flex-1 flex flex-wrap items-center gap-2">
              {categories.slice(0, 3).map((category) => (
                <button
                  key={category.id}
                  onClick={() => setSelectedCategory(selectedCategory === category.id ? null : category.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    selectedCategory === category.id
                      ? 'bg-primary text-primary-foreground shadow-md'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {category.name}
                </button>
              ))}
              {(selectedCategory || selectedStatus) && (
                <button
                  onClick={() => {
                    setSelectedCategory(null);
                    setSelectedStatus(null);
                  }}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-200 text-slate-700 hover:bg-slate-300 transition-all"
                >
                  Clear All
                </button>
              )}
            </div>

            <Button
              variant="secondary"
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 flex-shrink-0"
            >
              <Filter className="w-4 h-4" />
              More Filters
              {(selectedCategory || selectedStatus) && (
                <span className="ml-1 w-2 h-2 rounded-full bg-primary"></span>
              )}
            </Button>
          </div>

          {showFilters && (
            <div className="mt-4 pt-4 border-t border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Category
                </label>
                <select
                  value={selectedCategory || ''}
                  onChange={(e) => setSelectedCategory(e.target.value || null)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                >
                  <option value="">All Categories</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Status
                </label>
                <select
                  value={selectedStatus || ''}
                  onChange={(e) => setSelectedStatus(e.target.value || null)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                >
                  <option value="">All Statuses</option>
                  {statusTypes.map((status) => (
                    <option key={status.id} value={status.id}>
                      {status.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-white rounded-2xl shadow-lg border border-danger/30 mb-6">
          <div className="bg-danger-muted p-4 rounded-2xl">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-danger" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3 flex-1">
                <h3 className="text-sm font-medium text-danger">Error Loading Inventory</h3>
                <p className="mt-1 text-sm text-danger">{error}</p>
                <div className="mt-3">
                  <Button
                    variant="secondary"
                    onClick={loadData}
                    className="bg-danger-muted text-danger hover:bg-danger-muted/80"
                  >
                    Try Again
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-6 w-20 rounded-full" />
                <Skeleton className="h-8 w-16" />
              </div>
            ))}
          </div>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-12 text-center">
          <Package className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 text-lg">
            {searchTerm || selectedCategory || selectedStatus
              ? 'No inventory items found matching your criteria.'
              : 'No inventory items yet. Add your first item to get started.'}
          </p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Item Details
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Category
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Technical Info
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      In-Stock
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Location
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Condition
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Added On
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {paginatedItems.map((item) => (
                    <tr
                      key={item.id}
                      onClick={(e) => handleRowClick(item, e)}
                      className="hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <td className="px-6 py-4">
                        <div className="space-y-1.5">
                          <div className="font-semibold text-slate-900">
                            {item.brand?.name || 'Unknown'} {item.model || 'N/A'}
                          </div>
                          {item.inventory_code && (
                            <div className="inline-flex items-center gap-1.5 bg-info-muted border border-info/30 rounded-md px-2.5 py-1">
                              <span className="text-xs font-medium text-info">INV#:</span>
                              <span className="text-sm font-bold text-info font-mono tracking-wide">{item.inventory_code}</span>
                            </div>
                          )}
                          {item.serial_number && (
                            <div className="text-xs text-slate-500">
                              <span className="text-slate-400">S/N:</span> {item.serial_number}
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <Badge
                          variant="custom"
                          size="sm"
                          style={{
                            backgroundColor: item.category?.color_code ? `${item.category.color_code}15` : '#f1f5f9',
                            color: item.category?.color_code || '#475569',
                            border: 'none',
                          }}
                        >
                          {item.category?.name || 'N/A'}
                        </Badge>
                      </td>

                      <td className="px-6 py-4">
                        <div className="space-y-1 text-sm">
                          {item.capacity && (
                            <div className="text-slate-900">
                              <span className="text-slate-500">Capacity:</span> {item.capacity.name}
                            </div>
                          )}
                          {item.interface && (
                            <div className="text-slate-900">
                              <span className="text-slate-500">Interface:</span> {item.interface.name}
                            </div>
                          )}
                          {item.pcb_number && (
                            <div className="text-slate-900">
                              <span className="text-slate-500">PCB:</span>{item.pcb_number}
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <div className="text-center">
                          <div className={`text-lg font-bold ${getStockColor(item.similarCount)}`}>
                            {item.similarCount}
                          </div>
                          <div className="text-xs text-slate-500">similar</div>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <span className="text-sm text-slate-600">
                          {item.storage_location?.name || 'Not specified'}
                        </span>
                      </td>

                      <td className="px-6 py-4">
                        {item.condition_type ? (
                          <Badge
                            variant="custom"
                            size="sm"
                            style={{
                              backgroundColor: item.condition_type.color_code ? `${item.condition_type.color_code}15` : '#f1f5f9',
                              color: item.condition_type.color_code || '#475569',
                              border: 'none',
                            }}
                          >
                            {item.condition_type.name}
                          </Badge>
                        ) : (
                          <span className="text-sm text-slate-400">N/A</span>
                        )}
                      </td>

                      <td className="px-6 py-4 text-sm text-slate-600">
                        {formatDate(item.created_at)}
                      </td>

                      <td className="px-6 py-4 relative">
                        <div className="status-dropdown">
                          <span
                            onClick={(e: React.MouseEvent) => handleStatusClick(item.id, e)}
                            className="inline-block cursor-pointer"
                          >
                            <Badge
                              variant="custom"
                              size="sm"
                              style={{
                                backgroundColor: item.status_type?.color_code ? `${item.status_type.color_code}15` : '#f1f5f9',
                                color: item.status_type?.color_code || '#475569',
                                cursor: 'pointer',
                              }}
                            >
                              {item.status_type?.name || item.status}
                            </Badge>
                          </span>

                          {editingStatusId === item.id && (
                            <div className="absolute z-10 mt-2 w-48 bg-white border border-slate-200 rounded-lg shadow-lg">
                              <div className="py-1 max-h-60 overflow-y-auto">
                                {statusTypes.map((status) => (
                                  <button
                                    key={status.id}
                                    onClick={() => handleStatusChange(item.id, status.id)}
                                    disabled={updatingStatus}
                                    className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                                  >
                                    <div className="flex items-center gap-2">
                                      <div
                                        className="w-3 h-3 rounded-full"
                                        style={{ backgroundColor: status.color_code ?? undefined }}
                                      />
                                      {status.name}
                                    </div>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingItemId(item.id);
                            }}
                            className="action-button p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors"
                            title="Edit item"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletingItemId(item.id);
                            }}
                            className="action-button p-2 text-danger hover:bg-danger-muted rounded-lg transition-colors"
                            title="Delete item"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {totalPages > 1 && (
            <div className="bg-white rounded-2xl shadow-lg border border-slate-200 mt-4 p-2.5">
              <div className="flex items-center justify-between">
                <div className="text-sm text-slate-600">
                  Showing <span className="font-medium text-slate-900">{startIndex}</span> to{' '}
                  <span className="font-medium text-slate-900">{endIndex}</span> of{' '}
                  <span className="font-medium text-slate-900">{items.length}</span> items
                </div>
                <div className="flex items-center gap-4">
                  <p className="text-sm text-slate-600">
                    Page <span className="font-medium text-slate-900">{currentPage}</span> of{' '}
                    <span className="font-medium text-slate-900">{totalPages}</span>
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1 || isRefreshing}
                      className="flex items-center gap-1"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Previous
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages || isRefreshing}
                      className="flex items-center gap-1"
                    >
                      Next
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <AddInventoryModal
        isOpen={isAddModalOpen || !!editingItemId}
        onClose={() => {
          setIsAddModalOpen(false);
          setEditingItemId(null);
        }}
        onSuccess={handleInventorySuccess}
        itemId={editingItemId}
      />

      {selectedItemId && (
        <InventoryDetailModal
          isOpen={isDetailModalOpen}
          onClose={handleDetailModalClose}
          itemId={selectedItemId}
          onUpdate={handleItemUpdate}
          onEdit={(itemId) => {
            setEditingItemId(itemId);
            setIsDetailModalOpen(false);
            setIsAddModalOpen(true);
          }}
        />
      )}

      {deletingItemId && (
        <DeleteInventoryConfirmationModal
          isOpen={!!deletingItemId}
          onClose={() => setDeletingItemId(null)}
          onDelete={handleDeleteItem}
          onChangeStatus={handleChangeItemStatus}
          itemName={getDeletingItemName()}
        />
      )}

      <BulkInventoryImportModal
        isOpen={isBulkImportOpen}
        onClose={() => setIsBulkImportOpen(false)}
        onSuccess={() => {
          setIsBulkImportOpen(false);
          loadData();
        }}
      />
    </div>
  );
}
