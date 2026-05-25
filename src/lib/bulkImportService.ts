import { supabase } from './supabaseClient';
import { parseCSV, csvToObjects } from './importExportService';
import { checkRateLimit, RATE_LIMITS } from './rateLimiter';
import { logger } from './logger';

export interface ImportProgress {
  total: number;
  processed: number;
  successful: number;
  failed: number;
  currentRow: number;
  status: 'preparing' | 'processing' | 'completed' | 'failed';
  errors: ImportError[];
  warnings: ImportWarning[];
}

export interface ImportError {
  row: number;
  field: string;
  message: string;
  value: any;
}

export interface ImportWarning {
  row: number;
  field: string;
  message: string;
  value: any;
}

export interface ReferenceLookupCache {
  brands: Map<string, string>;
  deviceTypes: Map<string, string>;
  capacities: Map<string, string>;
  interfaces: Map<string, string>;
  storageLocations: Map<string, string>;
  countries: Map<string, string>;
  statusTypes: Map<string, string>;
  conditionTypes: Map<string, string>;
}

let isImporting = false;

export class BulkInventoryImporter {
  private progress: ImportProgress = {
    total: 0,
    processed: 0,
    successful: 0,
    failed: 0,
    currentRow: 0,
    status: 'preparing',
    errors: [],
    warnings: [],
  };

  private cache: ReferenceLookupCache = {
    brands: new Map(),
    deviceTypes: new Map(),
    capacities: new Map(),
    interfaces: new Map(),
    storageLocations: new Map(),
    countries: new Map(),
    statusTypes: new Map(),
    conditionTypes: new Map(),
  };

  private onProgressUpdate?: (progress: ImportProgress) => void;

  constructor(onProgressUpdate?: (progress: ImportProgress) => void) {
    this.onProgressUpdate = onProgressUpdate;
  }

  async importFromCSV(csvContent: string, fieldMappings: Record<string, string>): Promise<ImportProgress> {
    if (isImporting) {
      this.progress.status = 'failed';
      this.progress.errors.push({ row: 0, field: '', message: 'An import is already in progress. Please wait for it to complete.', value: null });
      return this.progress;
    }

    const rl = checkRateLimit(RATE_LIMITS.BULK_IMPORT);
    if (!rl.allowed) {
      this.progress.status = 'failed';
      this.progress.errors.push({ row: 0, field: '', message: rl.message, value: null });
      return this.progress;
    }

    isImporting = true;
    try {
      this.progress.status = 'preparing';
      this.notifyProgress();

      const rows = parseCSV(csvContent);
      const data = csvToObjects(rows);

      this.progress.total = data.length;
      this.notifyProgress();

      await this.preloadReferenceLookups();

      this.progress.status = 'processing';
      this.notifyProgress();

      await this.processInBatches(data, fieldMappings);

      this.progress.status = 'completed';
      this.progress.currentRow = this.progress.total;
      this.notifyProgress();

      return this.progress;
    } catch (error) {
      this.progress.status = 'failed';
      this.progress.errors.push({
        row: 0,
        field: 'general',
        message: `Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        value: null,
      });
      this.notifyProgress();
      return this.progress;
    } finally {
      isImporting = false;
    }
  }

  private async preloadReferenceLookups(): Promise<void> {
    try {
      const [brands, deviceTypes, capacities, interfaces, locations, countries, statusTypes, conditionTypes] =
        await Promise.all([
          supabase.from('catalog_device_brands').select('id, name').eq('is_active', true),
          supabase.from('catalog_device_types').select('id, name').eq('is_active', true),
          supabase.from('catalog_device_capacities').select('id, name, gb_value').eq('is_active', true),
          supabase.from('catalog_interfaces').select('id, name').eq('is_active', true),
          supabase.from('inventory_locations').select('id, name').eq('is_active', true),
          supabase.from('geo_countries').select('id, name, code').eq('is_active', true),
          supabase.from('master_inventory_status_types').select('id, name').eq('is_active', true),
          supabase.from('master_inventory_condition_types').select('id, name, rating').eq('is_active', true),
        ]);

      brands.data?.forEach((brand) => {
        const nameLower = brand.name.toLowerCase().trim();
        this.cache.brands.set(nameLower, brand.id);
      });

      deviceTypes.data?.forEach((type) => {
        this.cache.deviceTypes.set(type.name.toLowerCase().trim(), type.id);
      });

      capacities.data?.forEach((cap) => {
        const nameLower = cap.name.toLowerCase().trim();
        this.cache.capacities.set(nameLower, cap.id);
        this.cache.capacities.set(nameLower.replace(/\s+/g, ''), cap.id);

        if (cap.gb_value) {
          this.cache.capacities.set(`${cap.gb_value}gb`, cap.id);
          this.cache.capacities.set(`${cap.gb_value} gb`, cap.id);

          if (cap.gb_value >= 1000) {
            const tbValue = cap.gb_value / 1000;
            this.cache.capacities.set(`${tbValue}tb`, cap.id);
            this.cache.capacities.set(`${tbValue} tb`, cap.id);
          }
        }
      });

      interfaces.data?.forEach((iface) => {
        this.cache.interfaces.set(iface.name.toLowerCase().trim(), iface.id);
      });

      locations.data?.forEach((loc) => {
        this.cache.storageLocations.set(loc.name.toLowerCase().trim(), loc.id);
      });

      countries.data?.forEach((country) => {
        this.cache.countries.set(country.name.toLowerCase().trim(), country.id);
        if (country.code) {
          this.cache.countries.set(country.code.toLowerCase().trim(), country.id);
        }
      });

      statusTypes.data?.forEach((status) => {
        this.cache.statusTypes.set(status.name.toLowerCase().trim(), status.id);
      });

      conditionTypes.data?.forEach((condition) => {
        this.cache.conditionTypes.set(condition.name.toLowerCase().trim(), condition.id);
      });
    } catch (error) {
      logger.error('Failed to preload reference lookups:', error);
      throw new Error('Failed to load reference data. Please try again.');
    }
  }

  private async processInBatches(data: Record<string, any>[], fieldMappings: Record<string, string>): Promise<void> {
    const BATCH_SIZE = 100;
    const batches: Record<string, any>[][] = [];

    for (let i = 0; i < data.length; i += BATCH_SIZE) {
      batches.push(data.slice(i, i + BATCH_SIZE));
    }

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      const batchStartRow = batchIndex * BATCH_SIZE + 2;

      const transformedRecords: Record<string, any>[] = [];

      for (let i = 0; i < batch.length; i++) {
        const rowNumber = batchStartRow + i;
        this.progress.currentRow = rowNumber - 1;

        try {
          const transformedRecord = await this.transformRow(batch[i], fieldMappings, rowNumber);

          if (transformedRecord) {
            transformedRecords.push(transformedRecord);
          }
        } catch (error) {
          this.progress.failed++;
          this.progress.errors.push({
            row: rowNumber,
            field: 'general',
            message: error instanceof Error ? error.message : 'Failed to transform row',
            value: batch[i],
          });
        }

        this.notifyProgress();
      }

      if (transformedRecords.length > 0) {
        await this.insertBatch(transformedRecords, batchStartRow);
      }
    }
  }

  private async transformRow(
    row: Record<string, any>,
    fieldMappings: Record<string, string>,
    rowNumber: number
  ): Promise<Record<string, any> | null> {
    const transformed: Record<string, any> = {};
    let hasRequiredFields = false;

    for (const [csvField, dbField] of Object.entries(fieldMappings)) {
      if (!dbField || dbField === '') continue;

      const value = row[csvField];

      if (dbField === 'name') {
        if (!value || !value.toString().trim()) {
          this.progress.errors.push({
            row: rowNumber,
            field: dbField,
            message: 'Name is required',
            value: value,
          });
          return null;
        }
        transformed[dbField] = value.toString().trim();
        hasRequiredFields = true;
        continue;
      }

      if (!value || value.toString().trim() === '') {
        continue;
      }

      const stringValue = value.toString().trim();

      if (dbField.endsWith('_id')) {
        const resolvedId = await this.resolveReferenceField(dbField, stringValue, rowNumber);
        if (resolvedId) {
          transformed[dbField] = resolvedId;
        }
      } else if (dbField.endsWith('_date') || ['manufacture_date', 'acquisition_date', 'purchase_date', 'warranty_expiry', 'last_verified_date'].includes(dbField)) {
        const dateValue = this.parseDate(stringValue);
        if (dateValue) {
          transformed[dbField] = dateValue;
        } else {
          this.progress.warnings.push({
            row: rowNumber,
            field: dbField,
            message: `Invalid date format: ${stringValue}`,
            value: stringValue,
          });
        }
      } else if (['quantity_available', 'quantity_in_use', 'quantity_depleted', 'quantity_defective', 'quantity_purchased', 'reserved_quantity', 'reorder_threshold', 'minimum_stock_level', 'maximum_stock_level', 'condition_rating', 'spindle_speed'].includes(dbField)) {
        const numValue = parseInt(stringValue);
        if (!isNaN(numValue)) {
          transformed[dbField] = numValue;
        }
      } else if (['acquisition_cost', 'unit_cost', 'current_value', 'depreciation_rate'].includes(dbField)) {
        const numValue = parseFloat(stringValue);
        if (!isNaN(numValue)) {
          transformed[dbField] = numValue;
        }
      } else if (['is_active', 'available_for_donor'].includes(dbField)) {
        transformed[dbField] = ['true', '1', 'yes', 't', 'y'].includes(stringValue.toLowerCase());
      } else if (dbField === 'usable_donor_parts') {
        try {
          transformed[dbField] = typeof stringValue === 'string' ? JSON.parse(stringValue) : stringValue;
        } catch (error) {
          this.progress.warnings.push({
            row: rowNumber,
            field: dbField,
            message: 'Invalid JSON format for usable_donor_parts',
            value: stringValue,
          });
        }
      } else if (dbField === 'tags') {
        if (stringValue.startsWith('[') && stringValue.endsWith(']')) {
          try {
            transformed[dbField] = JSON.parse(stringValue);
          } catch {
            transformed[dbField] = stringValue.split(',').map((t: string) => t.trim()).filter(Boolean);
          }
        } else {
          transformed[dbField] = stringValue.split(',').map((t: string) => t.trim()).filter(Boolean);
        }
      } else {
        transformed[dbField] = stringValue;
      }
    }

    if (!hasRequiredFields) {
      this.progress.errors.push({
        row: rowNumber,
        field: 'name',
        message: 'Name field is required but missing',
        value: row,
      });
      return null;
    }

    if (!transformed.item_type) {
      transformed.item_type = 'other';
    }

    if (transformed.quantity_available === undefined) {
      transformed.quantity_available = 1;
    }
    if (transformed.quantity_in_use === undefined) {
      transformed.quantity_in_use = 0;
    }
    if (transformed.quantity_depleted === undefined) {
      transformed.quantity_depleted = 0;
    }
    if (transformed.quantity_defective === undefined) {
      transformed.quantity_defective = 0;
    }
    if (transformed.quantity_purchased === undefined) {
      transformed.quantity_purchased = 0;
    }

    if (transformed.unit_cost === undefined) {
      transformed.unit_cost = 0;
    }
    if (transformed.acquisition_cost === undefined) {
      transformed.acquisition_cost = 0;
    }
    if (transformed.current_value === undefined) {
      transformed.current_value = 0;
    }
    if (transformed.depreciation_rate === undefined) {
      transformed.depreciation_rate = 0;
    }
    if (transformed.condition_rating === undefined) {
      transformed.condition_rating = 3;
    }

    if (transformed.is_active === undefined) {
      transformed.is_active = true;
    }

    return transformed;
  }

  private async resolveReferenceField(fieldName: string, value: string, rowNumber: number): Promise<string | null> {
    const valueLower = value.toLowerCase().trim();
    let resolvedId: string | undefined;

    switch (fieldName) {
      case 'brand_id':
        resolvedId = this.cache.brands.get(valueLower);
        if (!resolvedId) {
          this.progress.warnings.push({
            row: rowNumber,
            field: fieldName,
            message: `Brand not found: ${value}`,
            value: value,
          });
        }
        break;

      case 'device_type_id':
        resolvedId = this.cache.deviceTypes.get(valueLower);
        if (!resolvedId) {
          this.progress.warnings.push({
            row: rowNumber,
            field: fieldName,
            message: `Device type not found: ${value}`,
            value: value,
          });
        }
        break;

      case 'capacity_id':
        resolvedId = this.cache.capacities.get(valueLower);
        if (!resolvedId) {
          this.progress.warnings.push({
            row: rowNumber,
            field: fieldName,
            message: `Capacity not found: ${value}`,
            value: value,
          });
        }
        break;

      case 'interface_id':
        resolvedId = this.cache.interfaces.get(valueLower);
        if (!resolvedId) {
          this.progress.warnings.push({
            row: rowNumber,
            field: fieldName,
            message: `Interface not found: ${value}`,
            value: value,
          });
        }
        break;

      case 'storage_location_id':
        resolvedId = this.cache.storageLocations.get(valueLower);
        if (!resolvedId) {
          this.progress.warnings.push({
            row: rowNumber,
            field: fieldName,
            message: `Storage location not found: ${value}`,
            value: value,
          });
        }
        break;

      case 'product_country_id':
        resolvedId = this.cache.countries.get(valueLower);
        if (!resolvedId) {
          this.progress.warnings.push({
            row: rowNumber,
            field: fieldName,
            message: `Country not found: ${value}`,
            value: value,
          });
        }
        break;

      case 'status_type_id':
        resolvedId = this.cache.statusTypes.get(valueLower);
        if (!resolvedId) {
          this.progress.warnings.push({
            row: rowNumber,
            field: fieldName,
            message: `Status type not found: ${value}`,
            value: value,
          });
        }
        break;

      case 'condition_type_id':
        resolvedId = this.cache.conditionTypes.get(valueLower);
        if (!resolvedId) {
          this.progress.warnings.push({
            row: rowNumber,
            field: fieldName,
            message: `Condition type not found: ${value}`,
            value: value,
          });
        }
        break;
    }

    return resolvedId || null;
  }

  private parseDate(dateString: string): string | null {
    try {
      if (/^\d{4}-\d{2}-\d{2}/.test(dateString)) {
        return dateString;
      }

      if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(dateString)) {
        const [month, day, year] = dateString.split('/');
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }

      if (/^\d{1,2}-\d{1,2}-\d{4}/.test(dateString)) {
        const [day, month, year] = dateString.split('-');
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }

      const date = new Date(dateString);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }

      return null;
    } catch {
      return null;
    }
  }

  private async insertBatch(records: Record<string, any>[], startRow: number): Promise<void> {
    try {
      const { data, error } = await supabase
        .from('inventory_items')
        .insert(records as never)
        .select('id');

      if (error) {
        logger.error('Batch insert error:', error);
        this.progress.failed += records.length;

        for (let i = 0; i < records.length; i++) {
          this.progress.errors.push({
            row: startRow + i,
            field: 'general',
            message: `Database error: ${error.message}`,
            value: records[i],
          });
        }
      } else {
        this.progress.successful += data?.length || 0;
        this.progress.processed += records.length;
      }
    } catch (error) {
      logger.error('Batch insert exception:', error);
      this.progress.failed += records.length;

      for (let i = 0; i < records.length; i++) {
        this.progress.errors.push({
          row: startRow + i,
          field: 'general',
          message: error instanceof Error ? error.message : 'Unknown error during insert',
          value: records[i],
        });
      }
    }
  }

  private notifyProgress(): void {
    if (this.onProgressUpdate) {
      this.onProgressUpdate({ ...this.progress });
    }
  }

  getProgress(): ImportProgress {
    return { ...this.progress };
  }
}

export function downloadErrorReport(progress: ImportProgress, filename: string = 'import_errors.csv'): void {
  if (progress.errors.length === 0 && progress.warnings.length === 0) {
    return;
  }

  const headers = ['Row', 'Type', 'Field', 'Message', 'Value'];
  const rows: string[][] = [];

  progress.errors.forEach((error) => {
    rows.push([
      error.row.toString(),
      'Error',
      error.field,
      error.message,
      typeof error.value === 'object' ? JSON.stringify(error.value) : String(error.value || ''),
    ]);
  });

  progress.warnings.forEach((warning) => {
    rows.push([
      warning.row.toString(),
      'Warning',
      warning.field,
      warning.message,
      typeof warning.value === 'object' ? JSON.stringify(warning.value) : String(warning.value || ''),
    ]);
  });

  const csvContent = [
    headers.join(','),
    ...rows.map((row) =>
      row.map((cell) => {
        if (cell.includes(',') || cell.includes('"') || cell.includes('\n')) {
          return `"${cell.replace(/"/g, '""')}"`;
        }
        return cell;
      }).join(',')
    ),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
