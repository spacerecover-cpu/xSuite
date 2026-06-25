import React, { useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Upload,
  FileText,
  AlertTriangle,
  CheckCircle,
  Loader,
  Download,
  ArrowRight,
} from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import {
  EntityType,
  ENTITY_CONFIGS,
  parseCSV,
  csvToObjects,
  suggestFieldMapping,
  validateField,
  generateTemplate,
  generateNameBasedTemplate,
  bulkLookupNames,
  resolveNamesToUUIDs,
  BulkLookupResults,
} from '../../lib/importExportService';
import { logger } from '../../lib/logger';
import type { Database } from '../../types/database.types';

type TableName = keyof Database['public']['Tables'];

interface ImportWizardProps {
  entityType: EntityType;
  onClose: () => void;
}

interface ValidationResult {
  rowNumber: number;
  field: string;
  error: string;
  rowData: Record<string, any>;
}

export const ImportWizard: React.FC<ImportWizardProps> = ({ entityType, onClose }) => {
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<Record<string, any>[]>([]);
  const [sourceFields, setSourceFields] = useState<string[]>([]);
  const [fieldMappings, setFieldMappings] = useState<Record<string, string>>({});
  const [validationResults, setValidationResults] = useState<ValidationResult[]>([]);
  const [importResult, setImportResult] = useState<{ success: number; errors: number } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [useNameBasedLookup, setUseNameBasedLookup] = useState(false);
  const [lookupResults, setLookupResults] = useState<BulkLookupResults | null>(null);
  const [unresolvedNames, setUnresolvedNames] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const config = ENTITY_CONFIGS[entityType];

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      readFile(selectedFile);
    }
  };

  const readFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const rows = parseCSV(content);
      const objects = csvToObjects(rows);

      setParsedData(objects);
      setSourceFields(rows[0] || []);

      // Auto-generate field mappings
      const suggestions = suggestFieldMapping(rows[0] || [], entityType);
      const mappings: Record<string, string> = {};
      for (const [source, { target }] of Object.entries(suggestions)) {
        mappings[source] = target;
      }
      setFieldMappings(mappings);

      setStep(2);
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && (droppedFile.type === 'text/csv' || droppedFile.name.endsWith('.csv'))) {
      setFile(droppedFile);
      readFile(droppedFile);
    }
  };

  const handleValidate = async () => {
    const errors: ValidationResult[] = [];
    let dataToValidate = parsedData;

    // If using name-based lookup and it's inventory, perform lookups
    if (useNameBasedLookup && entityType === 'inventory') {
      try {
        const lookups = await bulkLookupNames(parsedData);
        setLookupResults(lookups);

        // Check for unresolved names
        const unresolved: string[] = [];
        lookups.brands.forEach((result, name) => {
          if (!result.resolved) unresolved.push(`Brand: ${name}`);
        });
        lookups.deviceTypes.forEach((result, name) => {
          if (!result.resolved) unresolved.push(`Device Type: ${name}`);
        });
        lookups.capacities.forEach((result, name) => {
          if (!result.resolved) unresolved.push(`Capacity: ${name}`);
        });
        lookups.interfaces.forEach((result, name) => {
          if (!result.resolved) unresolved.push(`Interface: ${name}`);
        });
        lookups.storageLocations.forEach((result, name) => {
          if (!result.resolved) unresolved.push(`Storage Location: ${name}`);
        });
        lookups.countries.forEach((result, name) => {
          if (!result.resolved) unresolved.push(`Country: ${name}`);
        });
        lookups.statusTypes.forEach((result, name) => {
          if (!result.resolved) unresolved.push(`Status Type: ${name}`);
        });
        lookups.conditionTypes.forEach((result, name) => {
          if (!result.resolved) unresolved.push(`Condition Type: ${name}`);
        });

        setUnresolvedNames(unresolved);

        // Resolve names to UUIDs for validation
        dataToValidate = parsedData.map((row) => resolveNamesToUUIDs(row, lookups));
      } catch (error) {
        logger.error('Name lookup error:', error);
        errors.push({
          rowNumber: 0,
          field: 'general',
          error: 'Failed to resolve names to IDs. Please check your data.',
          rowData: {},
        });
      }
    }

    dataToValidate.forEach((row, index) => {
      // Check each mapped field
      Object.entries(fieldMappings).forEach(([sourceField, targetField]) => {
        const value = row[sourceField];
        const validation = validateField(entityType, targetField, value);

        if (!validation.valid) {
          errors.push({
            rowNumber: index + 2, // +2 for header row and 1-based index
            field: targetField,
            error: validation.error || 'Invalid value',
            rowData: row,
          });
        }
      });
    });

    setValidationResults(errors);
    setStep(3);
  };

  const handleImport = async () => {
    setIsImporting(true);
    setStep(4);
    setImportResult({ success: 0, errors: 0 });
    setImportError(null);

    try {
      const { supabase } = await import('../../lib/supabaseClient');
      const config = ENTITY_CONFIGS[entityType];

      // Get valid rows (exclude rows with validation errors)
      const errorRowNumbers = new Set(validationResults.map(v => v.rowNumber));
      const validRows = parsedData.filter((_, index) => !errorRowNumbers.has(index + 2));

      // EXP-063: server preflight — enforce the bulk_import feature + max_expenses_per_month
      // quota before any insert (wizard-scoped; expenses_insert RLS is unchanged). Aborts the
      // whole import on denial with a clear upgrade/limit message.
      if (entityType === 'expenses') {
        const { error: gateErr } = await supabase.rpc('assert_expense_import_allowed', {
          p_row_count: validRows.length,
        });
        if (gateErr) {
          logger.error('Expense import gate denied:', gateErr);
          setImportError(gateErr.message || 'This import is not allowed on your current plan.');
          setImportResult({ success: 0, errors: parsedData.length });
          setIsImporting(false);
          return;
        }
      }

      let successCount = 0;
      let errorCount = validationResults.length;
      const rowErrors: string[] = [];

      // Process rows in batches of 100 for better performance
      const batchSize = 100;
      for (let i = 0; i < validRows.length; i += batchSize) {
        const batch = validRows.slice(i, i + batchSize);

        // Transform CSV data to database format
        const recordsToInsert = batch.map(row => {
          // If using name-based lookup, resolve names first
          if (useNameBasedLookup && lookupResults) {
            row = resolveNamesToUUIDs(row, lookupResults);
          }
          const record: Record<string, any> = {};

          // Map each field from CSV to database column
          Object.entries(fieldMappings).forEach(([sourceField, targetField]) => {
            if (!targetField) return;

            const value = row[sourceField];

            // Skip empty values except for booleans and numbers with defaults
            if (!value && value !== 0 && value !== false) {
              // Don't add the field if it's empty
              return;
            }

            // Handle different data types
            if (config.numberFields.includes(targetField)) {
              const numValue = parseFloat(value);
              if (!isNaN(numValue)) {
                record[targetField] = numValue;
              }
            } else if (config.booleanFields.includes(targetField)) {
              const lowerValue = value.toString().toLowerCase();
              record[targetField] = ['true', '1', 'yes'].includes(lowerValue);
            } else if (config.dateFields.includes(targetField)) {
              if (value && value.trim()) {
                record[targetField] = value;
              }
            } else if (targetField === 'usable_donor_parts' && value && value.toString().trim()) {
              // Handle JSONB field - parse JSON string
              try {
                record[targetField] = typeof value === 'string' ? JSON.parse(value) : value;
              } catch (error) {
                // If parsing fails, skip this field
                logger.error(`Failed to parse usable_donor_parts for row:`, value);
              }
            } else if (value && value.toString().trim()) {
              // Only add non-empty string values
              record[targetField] = value.toString().trim();
            }
          });

          return record;
        });

        // Insert batch into database. The dynamic table name expands into a
        // 200+ table union that triggers TS2589 — cast supabase to a loose
        // shape limited to the methods we use.
        type LooseInsertBuilder = {
          insert: (rows: unknown[]) => {
            select: () => Promise<{
              data: unknown[] | null;
              error: { message: string; details?: string; hint?: string; code?: string } | null;
            }>;
          };
        };
        type LooseClient = { from: (table: string) => LooseInsertBuilder };
        const sb = supabase as unknown as LooseClient;
        const { data, error } = await sb
          .from(config.tableName as TableName)
          .insert(recordsToInsert)
          .select();

        if (error) {
          logger.error('Batch insert error:', error);
          // EXP-064: don't lose the whole batch on one bad row (e.g. a bad category_id/
          // case_id FK). Fall back to per-row inserts so the good rows still land and each
          // failure is counted/surfaced individually.
          for (const rec of recordsToInsert) {
            const { error: rowErr } = await sb
              .from(config.tableName as TableName)
              .insert([rec])
              .select();
            if (rowErr) {
              errorCount += 1;
              if (rowErrors.length < 10) rowErrors.push(rowErr.message);
              logger.error('Row insert error:', rowErr.message);
            } else {
              successCount += 1;
            }
          }
        } else {
          successCount += data?.length || 0;
        }

        // Update progress
        setImportResult({ success: successCount, errors: errorCount });
      }

      if (rowErrors.length > 0) {
        setImportError(`${errorCount} row(s) failed. First error: ${rowErrors[0]}`);
      }

      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['import_export_jobs_recent'] });
      queryClient.invalidateQueries({ queryKey: ['entity_counts'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventory_items'] });

    } catch (error) {
      logger.error('Import error:', error);
      setImportResult({ success: 0, errors: parsedData.length });
    } finally {
      setIsImporting(false);
    }
  };

  const downloadTemplate = (useNames = false) => {
    const template = useNames && entityType === 'inventory'
      ? generateNameBasedTemplate()
      : generateTemplate(entityType);
    const blob = new Blob([template], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${config.label.toLowerCase()}_import_template${useNames ? '_names' : ''}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadErrors = () => {
    if (validationResults.length === 0) return;

    const headers = ['Row', 'Field', 'Error', ...sourceFields];
    const rows = validationResults.map((error) => [
      error.rowNumber.toString(),
      error.field,
      error.error,
      ...sourceFields.map((field) => error.rowData[field] || ''),
    ]);

    const csv = [headers, ...rows].map((row) => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${config.label.toLowerCase()}_import_errors.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Modal isOpen={true} onClose={onClose} size="xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Import {config.label}</h2>
          <p className="text-slate-600 mt-1">Step {step} of 4</p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          {[1, 2, 3, 4].map((s) => (
            <div
              key={s}
              className={`flex-1 h-2 rounded-full mx-1 transition-colors ${
                s <= step ? 'bg-primary' : 'bg-slate-200'
              }`}
            />
          ))}
        </div>
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span className={step >= 1 ? 'text-primary font-medium' : ''}>Upload</span>
          <span className={step >= 2 ? 'text-primary font-medium' : ''}>Map Fields</span>
          <span className={step >= 3 ? 'text-primary font-medium' : ''}>Validate</span>
          <span className={step >= 4 ? 'text-primary font-medium' : ''}>Complete</span>
        </div>
      </div>

      {/* Step 1: File Upload */}
      {step === 1 && (
        <div className="space-y-6">
          {entityType === 'inventory' && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useNameBasedLookup}
                  onChange={(e) => setUseNameBasedLookup(e.target.checked)}
                  className="w-4 h-4 text-primary border-slate-300 rounded focus:ring-primary"
                />
                <div>
                  <p className="font-medium text-slate-900">Use Name-Based Import</p>
                  <p className="text-sm text-slate-600">
                    Import using friendly names like "Seagate", "1TB", "SATA" instead of UUIDs
                  </p>
                </div>
              </label>
            </div>
          )}

          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="border-2 border-dashed border-slate-300 rounded-xl p-12 text-center hover:border-primary/60 transition-colors cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="w-16 h-16 text-slate-400 mx-auto mb-4" />
            <p className="text-lg font-medium text-slate-900 mb-2">
              Drop your CSV file here, or click to browse
            </p>
            <p className="text-sm text-slate-600 mb-4">
              Supports CSV files up to 100MB with up to 10,000 records
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          <div className="bg-info-muted border border-info/30 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <FileText className="w-5 h-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium text-info mb-1">Need a template?</p>
                <p className="text-sm text-info mb-3">
                  Download a pre-formatted CSV template with the correct column headers for {config.label}.
                  {entityType === 'inventory' && (
                    <span className="block mt-1">
                      {useNameBasedLookup
                        ? 'The name-based template uses friendly names instead of UUIDs for easier data entry.'
                        : 'The template includes all available fields with UUID-based references.'}
                    </span>
                  )}
                </p>
                {entityType === 'inventory' && useNameBasedLookup ? (
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => downloadTemplate(true)} className="text-primary">
                      <Download className="w-4 h-4 mr-2" />
                      Download Name-Based Template
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => downloadTemplate(false)} className="text-primary">
                      <Download className="w-4 h-4 mr-2" />
                      Download UUID Template
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => downloadTemplate(false)} className="text-primary">
                    <Download className="w-4 h-4 mr-2" />
                    Download Template
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
            <h4 className="font-medium text-slate-900 mb-2">Required Fields for {config.label}:</h4>
            <div className="flex flex-wrap gap-2">
              {config.requiredFields.map((field) => (
                <span
                  key={field}
                  className="px-3 py-1 bg-white border border-slate-300 rounded-full text-sm text-slate-700"
                >
                  {field}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Field Mapping */}
      {step === 2 && (
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold text-slate-900 mb-2">Map Your Fields</h3>
            <p className="text-sm text-slate-600 mb-4">
              We've automatically mapped your CSV columns to database fields. Review and adjust if needed.
            </p>
          </div>

          <div className="space-y-3 max-h-96 overflow-y-auto">
            {sourceFields.map((sourceField) => (
              <div
                key={sourceField}
                className="flex items-center gap-4 p-3 bg-slate-50 rounded-lg border border-slate-200"
              >
                <div className="flex-1">
                  <p className="font-medium text-slate-900">{sourceField}</p>
                  <p className="text-xs text-slate-500">Source column</p>
                </div>

                <ArrowRight className="w-5 h-5 text-slate-400" />

                <div className="flex-1">
                  <select
                    value={fieldMappings[sourceField] || ''}
                    onChange={(e) =>
                      setFieldMappings({ ...fieldMappings, [sourceField]: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  >
                    <option value="">Skip this field</option>
                    {entityType === 'inventory' ? (
                      <>
                        <optgroup label="Basic Information">
                          <option value="name">name (required)</option>
                          <option value="description">description</option>
                          <option value="item_type">item_type</option>
                          <option value="category_id">category_id (Category)</option>
                        </optgroup>
                        <optgroup label="Identification">
                          <option value="item_number">item_number</option>
                          <option value="sku_code">sku_code</option>
                          <option value="barcode">barcode</option>
                          <option value="serial_number">serial_number</option>
                        </optgroup>
                        <optgroup label="Device Specifications">
                          {useNameBasedLookup ? (
                            <>
                              <option value="device_type_name">device_type_name (e.g., "HDD")</option>
                              <option value="brand_name">brand_name (e.g., "Seagate")</option>
                              <option value="model">model</option>
                              <option value="capacity_name">capacity_name (e.g., "1TB")</option>
                            </>
                          ) : (
                            <>
                              <option value="device_type_id">device_type_id</option>
                              <option value="brand_id">brand_id</option>
                              <option value="model">model</option>
                              <option value="capacity_id">capacity_id</option>
                            </>
                          )}
                        </optgroup>
                        <optgroup label="Status & Condition">
                          <option value="status">status</option>
                          {useNameBasedLookup ? (
                            <>
                              <option value="status_type_name">status_type_name (e.g., "Available")</option>
                              <option value="condition_type_name">condition_type_name (e.g., "Good")</option>
                            </>
                          ) : (
                            <>
                              <option value="status_type_id">status_type_id</option>
                              <option value="condition_type_id">condition_type_id</option>
                            </>
                          )}
                          <option value="condition_rating">condition_rating</option>
                          <option value="condition_notes">condition_notes</option>
                        </optgroup>
                        <optgroup label="Technical Specifications">
                          <option value="firmware_version">firmware_version</option>
                          <option value="pcb_number">pcb_number</option>
                          <option value="manufacture_date">manufacture_date</option>
                          {useNameBasedLookup ? (
                            <>
                              <option value="interface_name">interface_name (e.g., "SATA")</option>
                              <option value="country_name">country_name (e.g., "Thailand")</option>
                            </>
                          ) : (
                            <>
                              <option value="interface_id">interface_id</option>
                              <option value="product_country_id">product_country_id</option>
                            </>
                          )}
                          <option value="dcm">dcm</option>
                          <option value="head_map">head_map</option>
                          <option value="preamp">preamp</option>
                          <option value="part_number">part_number</option>
                          <option value="platter_heads">platter_heads</option>
                          <option value="spindle_speed">spindle_speed</option>
                          <option value="manufacturer_part_number">manufacturer_part_number</option>
                        </optgroup>
                        <optgroup label="Stock Management">
                          <option value="quantity_available">quantity_available</option>
                          <option value="quantity_in_use">quantity_in_use</option>
                          <option value="quantity_depleted">quantity_depleted</option>
                          <option value="quantity_defective">quantity_defective</option>
                          <option value="quantity_purchased">quantity_purchased</option>
                          <option value="reserved_quantity">reserved_quantity</option>
                          <option value="reorder_threshold">reorder_threshold</option>
                          <option value="minimum_stock_level">minimum_stock_level</option>
                          <option value="maximum_stock_level">maximum_stock_level</option>
                        </optgroup>
                        <optgroup label="Location & Storage">
                          {useNameBasedLookup ? (
                            <option value="storage_location_name">storage_location_name</option>
                          ) : (
                            <option value="storage_location_id">storage_location_id</option>
                          )}
                          <option value="storage_notes">storage_notes</option>
                        </optgroup>
                        <optgroup label="Supplier & Sourcing">
                          <option value="supplier_name">supplier_name</option>
                          <option value="supplier_contact">supplier_contact</option>
                          <option value="vendor">vendor</option>
                          <option value="purchase_order_number">purchase_order_number</option>
                        </optgroup>
                        <optgroup label="Financial Information">
                          <option value="acquisition_cost">acquisition_cost</option>
                          <option value="unit_cost">unit_cost</option>
                          <option value="current_value">current_value</option>
                          <option value="depreciation_rate">depreciation_rate</option>
                          <option value="acquisition_date">acquisition_date</option>
                          <option value="purchase_date">purchase_date</option>
                          <option value="warranty_expiry">warranty_expiry</option>
                        </optgroup>
                        <optgroup label="Donor Parts">
                          <option value="available_for_donor">available_for_donor</option>
                          <option value="usable_donor_parts">usable_donor_parts (JSON)</option>
                          <option value="compatibility_notes">compatibility_notes</option>
                        </optgroup>
                        <optgroup label="Additional">
                          <option value="last_verified_date">last_verified_date</option>
                          <option value="last_verified_by">last_verified_by</option>
                          <option value="created_by">created_by</option>
                          <option value="notes">notes</option>
                          <option value="tags">tags</option>
                          <option value="is_active">is_active</option>
                        </optgroup>
                      </>
                    ) : (
                      [...config.requiredFields, ...config.uniqueFields, ...Object.keys(config.referenceFields), ...config.dateFields, ...config.numberFields, ...(config.stringFields ?? []), ...config.booleanFields]
                        .filter((v, i, a) => a.indexOf(v) === i)
                        .map((field) => (
                          <option key={field} value={field}>
                            {field} {config.requiredFields.includes(field) ? '(required)' : ''}
                          </option>
                        ))
                    )}
                  </select>
                  <p className="text-xs text-slate-500 mt-1">Target field</p>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <p className="text-sm text-slate-600">
              <strong>Preview:</strong> {parsedData.length.toLocaleString()} records found in file
            </p>
          </div>
        </div>
      )}

      {/* Step 3: Validation Results */}
      {step === 3 && (
        <div className="space-y-4">
          {unresolvedNames.length > 0 && (
            <div className="bg-warning-muted border border-warning/30 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-warning mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-warning mb-2">
                    Unresolved Names ({unresolvedNames.length})
                  </p>
                  <p className="text-sm text-warning mb-2">
                    The following names could not be found in the database:
                  </p>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {unresolvedNames.slice(0, 10).map((name, index) => (
                      <p key={index} className="text-sm text-warning">
                        {name}
                      </p>
                    ))}
                    {unresolvedNames.length > 10 && (
                      <p className="text-sm text-warning">
                        ... and {unresolvedNames.length - 10} more
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-900">Validation Results</h3>
              <p className="text-sm text-slate-600 mt-1">
                {validationResults.length === 0 && unresolvedNames.length === 0
                  ? 'All records passed validation!'
                  : `Found ${validationResults.length + unresolvedNames.length} issues in your data`}
              </p>
            </div>

            {validationResults.length > 0 && (
              <Button size="sm" variant="ghost" onClick={downloadErrors}>
                <Download className="w-4 h-4 mr-2" />
                Download Errors
              </Button>
            )}
          </div>

          {validationResults.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-success-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-10 h-10 text-success" />
              </div>
              <p className="text-lg font-medium text-slate-900 mb-2">Ready to Import!</p>
              <p className="text-slate-600">
                All {parsedData.length.toLocaleString()} records passed validation
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {validationResults.slice(0, 50).map((error, index) => (
                <div key={index} className="p-3 bg-danger-muted border border-danger/30 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-danger mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-danger">
                        Row {error.rowNumber}: {error.field}
                      </p>
                      <p className="text-sm text-danger">{error.error}</p>
                    </div>
                  </div>
                </div>
              ))}
              {validationResults.length > 50 && (
                <p className="text-sm text-slate-600 text-center py-2">
                  ... and {validationResults.length - 50} more errors
                </p>
              )}
            </div>
          )}

          <div className="bg-warning-muted border border-warning/30 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-warning mt-0.5" />
              <div>
                <p className="text-sm text-warning">
                  {validationResults.length > 0
                    ? 'You can proceed with the import, but records with errors will be skipped.'
                    : 'Once imported, this action cannot be undone. Make sure your data is correct.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 4: Import Complete */}
      {step === 4 && (
        <div className="text-center py-8">
          {isImporting ? (
            <>
              <div className="w-16 h-16 bg-info-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <Loader className="w-10 h-10 text-primary animate-spin" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-2">Importing Records...</h3>
              <p className="text-slate-600 mb-6">
                {importResult && importResult.success > 0 ? (
                  <>
                    Imported {importResult.success.toLocaleString()} of {parsedData.length.toLocaleString()} records
                  </>
                ) : (
                  <>Processing your data...</>
                )}
              </p>
            </>
          ) : (
            <>
              <div className="w-16 h-16 bg-success-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-10 h-10 text-success" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-2">Import Complete!</h3>
              <p className="text-slate-600 mb-6">
                {importResult && (
                  <>
                    Successfully imported {importResult.success.toLocaleString()} records
                    {importResult.errors > 0 && ` (${importResult.errors} records skipped due to errors)`}
                  </>
                )}
              </p>

              {importError && (
                <div className="mb-6 mx-auto max-w-md rounded-lg border border-danger/30 bg-danger-muted px-4 py-3 text-sm text-danger">
                  {importError}
                </div>
              )}

              <Button onClick={onClose} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                Done
              </Button>
            </>
          )}
        </div>
      )}

      {/* Footer Actions */}
      <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-200">
        <Button
          variant="ghost"
          onClick={step === 1 ? onClose : () => setStep(step - 1)}
          disabled={step === 4}
        >
          {step === 1 ? 'Cancel' : step === 4 ? '' : 'Back'}
        </Button>

        {step < 4 && (
          <Button
            onClick={() => {
              if (step === 2) handleValidate();
              else if (step === 3) handleImport();
            }}
            disabled={step === 1 && !file}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {step === 2 ? 'Validate Data' : step === 3 ? 'Import Now' : 'Next'}
          </Button>
        )}
      </div>
    </Modal>
  );
};
