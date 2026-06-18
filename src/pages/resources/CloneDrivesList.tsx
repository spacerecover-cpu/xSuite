import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Pager } from '../../components/ui/Pager';
import { Badge } from '../../components/ui/Badge';
import { statusToBadgeVariant } from '../../lib/ui/variants';
import { ResourceCloneDriveModal } from '../../components/resources/ResourceCloneDriveModal';
import { HardDrive, Search, Filter, Plus, Database, AlertCircle, CheckCircle, CreditCard as Edit2, MapPin, Calendar, ArrowUpDown, FileText, X } from 'lucide-react';

const PAGE_SIZE = 50;

export const CloneDrivesList: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [caseIdSearch, setCaseIdSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [driveTypeFilter, setDriveTypeFilter] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDrive, setEditingDrive] = useState<any>(null);
  const [sortField, setSortField] = useState<string>('clone_id');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  // Client-side pagination: the list is filtered/sorted in memory (and rows
  // expand), so we bound the DOM by slicing the sorted set. Reset to page 0 when
  // the filtered/sorted set changes so the view never lands on an empty page.
  useEffect(() => {
    setPage(0);
  }, [searchTerm, statusFilter, driveTypeFilter, sortField, sortDirection]);

  const { data: resourceCloneDrives = [], isLoading } = useQuery({
    queryKey: ['resource_clone_drives'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('resource_clone_drives')
        .select(`
          *,
          brand:catalog_device_brands(name),
          capacity_ref:catalog_device_capacities(name, gb_value),
          interface_ref:catalog_interfaces(name)
        `)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || []).map((item: any) => {
        const capacityGb =
          (item.capacity_ref?.gb_value && parseFloat(item.capacity_ref.gb_value) > 0)
            ? parseFloat(item.capacity_ref.gb_value)
            : 0;

        return {
          ...item,
          clone_id: item.label,
          location_name: item.location,
          brand_name: item.brand?.name,
          capacity_name: item.capacity_ref?.name,
          capacity_gb: capacityGb,
          current_used_gb: 0,
          available_space_gb: capacityGb,
          device_type_name: null,
          interface_name: item.interface_ref?.name,
          condition_name: item.condition,
        };
      });
    },
  });

  const { data: cloneAssignments = [] } = useQuery({
    queryKey: ['clone_drive_assignments_all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clone_drives')
        .select(`
          id,
          case_id,
          drive_label,
          serial_number,
          capacity,
          status,
          assigned_to,
          notes,
          created_at,
          cases!clone_drives_case_id_fkey(case_no)
        `)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });

  const { data: caseAssignments = [] } = useQuery({
    queryKey: ['clone_drive_assignments', caseIdSearch],
    queryFn: async () => {
      if (!caseIdSearch.trim()) return [];

      const { data: caseData, error: caseError } = await supabase
        .from('cases')
        .select('id, case_no')
        .ilike('case_no', `%${caseIdSearch}%`);

      if (caseError) throw caseError;
      if (!caseData || caseData.length === 0) return [];

      const caseIds = caseData.map(c => c.id);

      const { data: assignments, error: assignError } = await supabase
        .from('clone_drives')
        .select(`
          *,
          cases!clone_drives_case_id_fkey(case_no)
        `)
        .is('deleted_at', null)
        .in('case_id', caseIds);

      if (assignError) throw assignError;
      return assignments || [];
    },
    enabled: !!caseIdSearch.trim(),
  });

  const filteredDrives = resourceCloneDrives.filter((drive) => {
    const matchesSearch =
      searchTerm === '' ||
      drive.clone_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      drive.brand?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      drive.brand_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      drive.model?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      drive.serial_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      drive.location_name?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'all' || drive.status === statusFilter;
    const matchesDriveType = driveTypeFilter === 'all' || drive.drive_type === driveTypeFilter;

    return matchesSearch && matchesStatus && matchesDriveType;
  });

  const sortedDrives = [...filteredDrives].sort((a, b) => {
    let aVal = a[sortField];
    let bVal = b[sortField];

    if (sortField === 'brand') {
      aVal = a.brand_name || a.brand || '';
      bVal = b.brand_name || b.brand || '';
    } else if (sortField === 'location') {
      aVal = a.location_name || '';
      bVal = b.location_name || '';
    }

    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortDirection === 'asc'
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal);
    }

    if (aVal === null || aVal === undefined) aVal = 0;
    if (bVal === null || bVal === undefined) bVal = 0;

    return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
  });

  const pagedDrives = sortedDrives.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const stats = {
    total: resourceCloneDrives.length,
    available: resourceCloneDrives.filter((d) => d.status === 'available').length,
    inUse: resourceCloneDrives.filter((d) => d.status === 'in_use').length,
    totalCapacity: resourceCloneDrives
      .filter((d) => ['available', 'in_use'].includes(d.status) && d.is_active)
      .reduce((sum, d) => {
        const capacityValue = typeof d.capacity_gb === 'number' ? d.capacity_gb : parseFloat(d.capacity_gb) || 0;
        return sum + (capacityValue > 0 ? capacityValue : 0);
      }, 0),
    availableCapacity: resourceCloneDrives
      .filter((d) => ['available', 'in_use'].includes(d.status) && d.is_active)
      .reduce((sum, d) => {
        const availableValue = typeof d.available_space_gb === 'number' ? d.available_space_gb : parseFloat(d.available_space_gb) || 0;
        return sum + (availableValue > 0 ? availableValue : 0);
      }, 0),
    needsAttention: resourceCloneDrives.filter((d) =>
      d.condition_rating < 3 || d.health_percentage < 80 || d.status === 'maintenance'
    ).length,
  };

  const statusOptions = [
    { value: 'all', label: 'All Statuses' },
    { value: 'available', label: 'Available' },
    { value: 'in_use', label: 'In Use' },
    { value: 'maintenance', label: 'Maintenance' },
    { value: 'retired', label: 'Retired' },
    { value: 'lost', label: 'Lost' },
    { value: 'damaged', label: 'Damaged' },
  ];

  const driveTypeOptions = [
    { value: 'all', label: 'All Types' },
    { value: 'hdd', label: 'HDD' },
    { value: 'ssd', label: 'SSD' },
    { value: 'nvme', label: 'NVMe' },
    { value: 'sata', label: 'SATA' },
    { value: 'sas', label: 'SAS' },
    { value: 'other', label: 'Other' },
  ];

  const handleAddDrive = () => {
    setEditingDrive(null);
    setIsModalOpen(true);
  };

  const handleEditDrive = (drive: Record<string, unknown>) => {
    setEditingDrive(drive);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setEditingDrive(null);
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getStatusLabel = (status: string) => {
    return status.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  const formatCapacity = (gb: number) => {
    if (gb >= 1024) {
      return `${(gb / 1024).toFixed(2)} TB`;
    }
    return `${Math.round(gb)} GB`;
  };

  const getCapacityColor = (availableGb: number, totalGb: number) => {
    if (totalGb === 0) return '#64748b';
    const availablePercentage = (availableGb / totalGb) * 100;

    if (availablePercentage < 20) return '#ef4444';
    if (availablePercentage < 50) return '#f59e0b';
    return '#10b981';
  };


  const clearFilters = () => {
    setSearchTerm('');
    setCaseIdSearch('');
    setStatusFilter('all');
    setDriveTypeFilter('all');
  };

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Database className="w-12 h-12 text-slate-400 mx-auto mb-3 animate-pulse" />
            <p className="text-slate-600">Loading clone drives...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-full mx-auto">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg">
              <HardDrive className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Clone Drives Resources</h1>
              <p className="text-slate-600">
                Manage physical clone drives and track their usage across cases
              </p>
            </div>
          </div>
          <Button onClick={handleAddDrive} className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Add Clone Drive
          </Button>
        </div>
      </div>

      <Card className="mb-6">
        <div className="p-6">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <HardDrive className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-0.5">Total Drives</p>
                <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-success-muted flex items-center justify-center flex-shrink-0">
                <CheckCircle className="w-5 h-5 text-success" />
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-0.5">Available</p>
                <p className="text-2xl font-bold text-success">{stats.available}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-info-muted flex items-center justify-center flex-shrink-0">
                <Database className="w-5 h-5 text-info" />
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-0.5">In Use</p>
                <p className="text-2xl font-bold text-info">{stats.inUse}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-warning-muted flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-5 h-5 text-warning" />
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-0.5">Needs Attention</p>
                <p className="text-2xl font-bold text-warning">{stats.needsAttention}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center flex-shrink-0">
                <Database className="w-5 h-5 text-slate-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-0.5">Total Capacity</p>
                <p className="text-2xl font-bold text-slate-900">{formatCapacity(stats.totalCapacity)}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-success-muted flex items-center justify-center flex-shrink-0">
                <Database className="w-5 h-5 text-success" />
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-0.5">Available Capacity</p>
                <p className="text-2xl font-bold text-success">{formatCapacity(stats.availableCapacity)}</p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card className="mb-6">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <Filter className="w-5 h-5 text-slate-400" />
            <h2 className="text-lg font-semibold text-slate-900">Search & Filters</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                <Search className="w-4 h-4 inline mr-1" />
                Search Clone Drives
              </label>
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Clone ID, brand, model, serial, location..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                <FileText className="w-4 h-4 inline mr-1" />
                Search by Case ID
              </label>
              <Input
                value={caseIdSearch}
                onChange={(e) => setCaseIdSearch(e.target.value)}
                placeholder="Enter Case ID to find location..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {statusOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Drive Type
              </label>
              <select
                value={driveTypeFilter}
                onChange={(e) => setDriveTypeFilter(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {driveTypeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {caseIdSearch && caseAssignments.length > 0 && (
            <div className="mb-4 p-4 bg-info-muted border border-info/30 rounded-lg">
              <h3 className="text-sm font-semibold text-info mb-3 flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Case Assignment Results ({caseAssignments.length})
              </h3>
              <div className="space-y-2">
                {caseAssignments.map((assignment: any) => {
                  return (
                    <div key={assignment.id} className="bg-white p-3 rounded border border-info/20">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-1">
                            <span className="font-semibold text-slate-900">
                              Case: {assignment.cases?.case_no}
                            </span>
                            <span className="text-slate-600">→</span>
                            <span className="font-semibold text-primary font-mono">
                              {assignment.drive_label || 'N/A'}
                            </span>
                            <Badge
                              variant={statusToBadgeVariant(assignment.status || '')}
                              size="sm"
                            >
                              {(assignment.status || '').charAt(0).toUpperCase() + (assignment.status || '').slice(1)}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-slate-600">
                            {assignment.capacity && (
                              <span className="flex items-center gap-1">
                                <HardDrive className="w-3 h-3" />
                                {assignment.capacity}
                              </span>
                            )}
                            {assignment.serial_number && (
                              <span className="text-xs font-mono">
                                S/N: {assignment.serial_number}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {caseIdSearch && caseAssignments.length === 0 && (
            <div className="mb-4 p-4 bg-warning-muted border border-warning/30 rounded-lg">
              <p className="text-sm text-warning">
                No clone drive assignments found for case ID: <span className="font-semibold">{caseIdSearch}</span>
              </p>
            </div>
          )}

          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600">
              Showing <span className="font-semibold">{sortedDrives.length}</span> of{' '}
              <span className="font-semibold">{stats.total}</span> clone drives
            </p>
            {(searchTerm || caseIdSearch || statusFilter !== 'all' || driveTypeFilter !== 'all') && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 font-medium"
              >
                <X className="w-4 h-4" />
                Clear All Filters
              </button>
            )}
          </div>
        </div>
      </Card>

      {sortedDrives.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <HardDrive className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 mb-2">
              {searchTerm || statusFilter !== 'all' || driveTypeFilter !== 'all'
                ? 'No clone drives match your filters'
                : 'No clone drives in resources'}
            </h3>
            <p className="text-slate-600 mb-4">
              {searchTerm || statusFilter !== 'all' || driveTypeFilter !== 'all'
                ? 'Try adjusting your search criteria'
                : 'Add your first physical clone drive to start tracking'}
            </p>
            {!searchTerm && statusFilter === 'all' && driveTypeFilter === 'all' && (
              <Button onClick={handleAddDrive} className="inline-flex items-center gap-2">
                <Plus className="w-4 h-4" />
                Add First Clone Drive
              </Button>
            )}
          </div>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left p-4 text-sm font-semibold text-slate-700">
                    <button
                      onClick={() => handleSort('clone_id')}
                      className="flex items-center gap-1 hover:text-slate-900"
                    >
                      Clone ID
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="text-left p-4 text-sm font-semibold text-slate-700">
                    <button
                      onClick={() => handleSort('brand')}
                      className="flex items-center gap-1 hover:text-slate-900"
                    >
                      Brand / Model
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="text-left p-4 text-sm font-semibold text-slate-700">
                    <button
                      onClick={() => handleSort('capacity_gb')}
                      className="flex items-center gap-1 hover:text-slate-900"
                    >
                      Capacity
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="text-left p-4 text-sm font-semibold text-slate-700">
                    <button
                      onClick={() => handleSort('available_space_gb')}
                      className="flex items-center gap-1 hover:text-slate-900"
                    >
                      Available Capacity
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="text-left p-4 text-sm font-semibold text-slate-700">
                    Status
                  </th>
                  <th className="text-left p-4 text-sm font-semibold text-slate-700">
                    <button
                      onClick={() => handleSort('location')}
                      className="flex items-center gap-1 hover:text-slate-900"
                    >
                      Location
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="text-left p-4 text-sm font-semibold text-slate-700">
                    Condition
                  </th>
                  <th className="text-left p-4 text-sm font-semibold text-slate-700">
                    <button
                      onClick={() => handleSort('total_assignments')}
                      className="flex items-center gap-1 hover:text-slate-900"
                    >
                      Assignments
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="text-left p-4 text-sm font-semibold text-slate-700">
                    Last Used
                  </th>
                  <th className="text-center p-4 text-sm font-semibold text-slate-700">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {pagedDrives.map((drive) => (
                  <React.Fragment key={drive.id}>
                    <tr
                      className="border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer"
                      onClick={() => setExpandedRow(expandedRow === drive.id ? null : drive.id)}
                    >
                      <td className="p-4">
                        <span className="font-semibold text-slate-900">{drive.clone_id}</span>
                      </td>
                      <td className="p-4">
                        <div className="text-sm">
                          <div className="font-medium text-slate-900">
                            {drive.brand_name || drive.brand || 'Unknown'}
                          </div>
                          {drive.model && (
                            <div className="text-slate-600 text-xs">{drive.model}</div>
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="text-sm text-slate-900">
                          {drive.capacity_name || formatCapacity(drive.capacity_gb)}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <div
                            className="px-3 py-1.5 rounded-lg font-semibold text-sm"
                            style={{
                              color: getCapacityColor(drive.available_space_gb || 0, drive.capacity_gb || 0),
                              backgroundColor: `${getCapacityColor(drive.available_space_gb || 0, drive.capacity_gb || 0)}15`
                            }}
                          >
                            {formatCapacity(drive.available_space_gb || 0)}
                          </div>
                          {drive.capacity_gb > 0 && (
                            <div className="flex items-center gap-1">
                              <div className="w-16 bg-slate-200 rounded-full h-1.5">
                                <div
                                  className="h-1.5 rounded-full transition-all"
                                  style={{
                                    width: `${Math.min(((drive.available_space_gb || 0) / drive.capacity_gb) * 100, 100)}%`,
                                    backgroundColor: getCapacityColor(drive.available_space_gb || 0, drive.capacity_gb || 0)
                                  }}
                                />
                              </div>
                              <span className="text-xs text-slate-500">
                                {((drive.available_space_gb || 0) / drive.capacity_gb * 100).toFixed(0)}%
                              </span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <Badge
                          variant={statusToBadgeVariant(drive.status)}
                          size="sm"
                        >
                          {getStatusLabel(drive.status)}
                        </Badge>
                      </td>
                      <td className="p-4">
                        {drive.location_name ? (
                          <div className="flex items-center gap-1 text-sm text-slate-700">
                            <MapPin className="w-3 h-3 text-slate-400" />
                            {drive.location_name}
                          </div>
                        ) : (
                          <span className="text-sm text-slate-400">Not set</span>
                        )}
                      </td>
                      <td className="p-4">
                        {drive.condition_name ? (
                          <span className="text-sm text-slate-700">{drive.condition_name}</span>
                        ) : drive.condition_rating ? (
                          <span className="text-sm text-slate-700">{drive.condition_rating}/5</span>
                        ) : (
                          <span className="text-sm text-slate-400">N/A</span>
                        )}
                      </td>
                      <td className="p-4">
                        <span className="text-sm font-semibold text-slate-900">
                          {drive.total_assignments || 0}
                        </span>
                      </td>
                      <td className="p-4">
                        {drive.last_used_date ? (
                          <div className="flex items-center gap-1 text-sm text-slate-600">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            {new Date(drive.last_used_date).toLocaleDateString()}
                          </div>
                        ) : (
                          <span className="text-sm text-slate-400">Never</span>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditDrive(drive);
                            }}
                            className="p-2 hover:bg-primary/10 rounded-lg transition-colors group"
                            title="Edit Drive"
                          >
                            <Edit2 className="w-4 h-4 text-slate-600 group-hover:text-primary" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedRow === drive.id && (
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <td colSpan={10} className="p-6">
                          <div className="grid grid-cols-4 gap-6">
                            <div>
                              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">
                                Serial Number
                              </p>
                              <p className="text-sm text-slate-900 font-mono">
                                {drive.serial_number || 'Not recorded'}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">
                                Type / Interface
                              </p>
                              <p className="text-sm text-slate-900">
                                {drive.device_type_name || drive.drive_type?.toUpperCase() || 'N/A'} /{' '}
                                {drive.interface_name || drive.interface_type?.toUpperCase() || 'N/A'}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">
                                Health Status
                              </p>
                              <p className="text-sm text-slate-900">
                                {drive.health_percentage !== null
                                  ? `${drive.health_percentage}%`
                                  : 'Not monitored'}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">
                                Capacity Usage
                              </p>
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-slate-600">Used:</span>
                                  <span className="text-sm font-semibold text-primary">
                                    {formatCapacity(drive.current_used_gb || 0)}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-slate-600">Available:</span>
                                  <span
                                    className="text-sm font-semibold"
                                    style={{
                                      color: getCapacityColor(drive.available_space_gb || 0, drive.capacity_gb || 0)
                                    }}
                                  >
                                    {formatCapacity(drive.available_space_gb || 0)}
                                  </span>
                                </div>
                                {drive.capacity_gb > 0 && (
                                  <div className="mt-2">
                                    <div className="flex items-center justify-between text-xs text-slate-600 mb-1">
                                      <span>Utilization</span>
                                      <span className="font-medium">
                                        {((drive.current_used_gb / drive.capacity_gb) * 100).toFixed(1)}%
                                      </span>
                                    </div>
                                    <div className="w-full bg-slate-200 rounded-full h-2">
                                      <div
                                        className="h-2 rounded-full transition-all"
                                        style={{
                                          width: `${Math.min((drive.current_used_gb / drive.capacity_gb) * 100, 100)}%`,
                                          backgroundColor: (drive.current_used_gb / drive.capacity_gb) > 0.8 ? '#ef4444' : (drive.current_used_gb / drive.capacity_gb) > 0.5 ? '#f59e0b' : '#10b981'
                                        }}
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                            {drive.notes && (
                              <div className="col-span-4">
                                <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">
                                  Notes
                                </p>
                                <p className="text-sm text-slate-700">{drive.notes}</p>
                              </div>
                            )}
                            {cloneAssignments.length > 0 && (
                              <div className="col-span-4">
                                <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">
                                  Recent Clone Assignments ({cloneAssignments.length})
                                </p>
                                <div className="grid grid-cols-2 gap-2">
                                  {cloneAssignments
                                    .slice(0, 6)
                                    .map((assignment: any) => (
                                      <div key={assignment.id} className="flex items-center justify-between p-2 bg-slate-50 border border-slate-200 rounded">
                                        <div className="flex items-center gap-2">
                                          <FileText className="w-3 h-3 text-slate-400" />
                                          <span className="text-sm font-medium text-slate-900">
                                            {assignment.cases?.case_no || 'N/A'}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          {assignment.capacity && (
                                            <span className="text-xs text-slate-600">
                                              {assignment.capacity}
                                            </span>
                                          )}
                                          <Badge
                                            variant={statusToBadgeVariant(assignment.status || '')}
                                            size="sm"
                                          >
                                            {assignment.status}
                                          </Badge>
                                        </div>
                                      </div>
                                    ))}
                                </div>
                              </div>
                            )}
                            {(drive.health_percentage < 80 || drive.condition_rating < 3) && (
                              <div className="col-span-4">
                                <div className="flex items-center gap-2 p-3 bg-warning-muted border border-warning/30 rounded-lg">
                                  <AlertCircle className="w-4 h-4 text-warning flex-shrink-0" />
                                  <p className="text-sm text-warning">
                                    This drive needs attention - Consider maintenance or replacement
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <Pager
            page={page}
            pageSize={PAGE_SIZE}
            total={sortedDrives.length}
            onPageChange={setPage}
            itemNoun="clone drives"
          />
        </Card>
      )}

      <ResourceCloneDriveModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        editingDrive={editingDrive}
      />
    </div>
  );
};
