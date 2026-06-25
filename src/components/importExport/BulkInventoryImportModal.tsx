import React, { useState, useRef } from 'react';
import { Upload, Download, CheckCircle, AlertTriangle, Loader, FileText, ArrowRight, Info } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { BulkInventoryImporter, ImportProgress, downloadErrorReport } from '../../lib/bulkImportService';
import { parseCSV, csvToObjects, suggestFieldMapping } from '../../lib/importExportService';
import { logger } from '../../lib/logger';

interface BulkInventoryImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const BulkInventoryImportModal: React.FC<BulkInventoryImportModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [csvContent, setCsvContent] = useState<string>('');
  const [sourceFields, setSourceFields] = useState<string[]>([]);
  const [previewData, setPreviewData] = useState<Record<string, any>[]>([]);
  const [fieldMappings, setFieldMappings] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

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
      setCsvContent(content);

      const rows = parseCSV(content);
      const data = csvToObjects(rows);

      setSourceFields(rows[0] || []);
      setPreviewData(data.slice(0, 10));

      const suggestions = suggestFieldMapping(rows[0] || [], 'inventory');
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

  const handleStartImport = async () => {
    if (!csvContent) return;

    setIsImporting(true);
    setStep(3);

    const importer = new BulkInventoryImporter((updatedProgress) => {
      setProgress(updatedProgress);
    });

    try {
      const finalProgress = await importer.importFromCSV(csvContent, fieldMappings);
      setProgress(finalProgress);
      setIsImporting(false);

      if (finalProgress.successful > 0) {
        onSuccess();
      }
    } catch (error) {
      logger.error('Import error:', error);
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    setStep(1);
    setFile(null);
    setCsvContent('');
    setSourceFields([]);
    setPreviewData([]);
    setFieldMappings({});
    setProgress(null);
    setIsImporting(false);
    onClose();
  };

  const downloadTemplate = () => {
    const headers = [
      'name',
      'description',
      'category_id',
      'brand_id',
      'device_type_id',
      'model',
      'capacity_id',
      'serial_number',
      'item_number',
      'status_type_id',
      'condition_type_id',
      'item_type',
      'quantity_available',
      'quantity_in_use',
      'quantity_purchased',
      'storage_location_id',
      'storage_notes',
      'interface_id',
      'product_country_id',
      'pcb_number',
      'dcm',
      'head_map',
      'firmware_version',
      'manufacture_date',
      'acquisition_cost',
      'acquisition_date',
      'purchase_date',
      'supplier_name',
      'supplier_contact',
      'notes',
    ];

    const sampleRow = [
      'Seagate Barracuda 1TB',
      'Hard drive for donor parts',
      'Hard Drives',
      'Seagate',
      'HDD',
      'ST1000DM003',
      '1TB',
      'Z1D12345',
      'INV-2024-001',
      'Available',
      'Good',
      'donor_part',
      '5',
      '0',
      '5',
      'Main Warehouse',
      'Shelf A3',
      'SATA',
      'Thailand',
      '100664987',
      'CC45',
      '8-10',
      'CC45',
      '2023-03',
      '45.50',
      '2023-04-01',
      '2023-04-01',
      'Tech Parts Supply Co.',
      'sales@techparts.com',
      'Compatible with ST1000DM series',
    ];

    const csv = [headers.join(','), sampleRow.join(',')].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'inventory_bulk_import_template.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const getProgressPercentage = () => {
    if (!progress || progress.total === 0) return 0;
    return Math.round((progress.currentRow / progress.total) * 100);
  };

  return (
    <Modal isOpen={isOpen} onClose={isImporting ? () => {} : handleClose} size="xl" showCloseButton={!isImporting}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Bulk Inventory Import</h2>
          <p className="text-slate-600 mt-1">Step {step} of 3: {step === 1 ? 'Upload' : step === 2 ? 'Configure' : 'Import'}</p>
        </div>
      </div>

      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`flex-1 h-2 rounded-full mx-1 transition-colors ${
                s <= step ? 'bg-primary' : 'bg-slate-200'
              }`}
            />
          ))}
        </div>
      </div>

      {step === 1 && (
        <div className="space-y-6">
          <div className="bg-info-muted border border-info/30 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-medium text-info mb-2">Smart Import Features</p>
                <ul className="text-sm text-info space-y-1">
                  <li>• Automatic name-to-ID matching (e.g., "Seagate" → Brand ID)</li>
                  <li>• Batch processing for efficient large imports</li>
                  <li>• Real-time validation with detailed error reporting</li>
                  <li>• Flexible date and number format parsing</li>
                </ul>
              </div>
            </div>
          </div>

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
              Supports CSV files with inventory data
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <FileText className="w-5 h-5 text-slate-600 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-slate-900 mb-1">Need a template?</p>
                <p className="text-sm text-slate-600 mb-3">
                  Download a CSV template with example data showing the correct format.
                  Use friendly names like "Seagate", "1TB", "SATA" instead of UUIDs.
                </p>
                <Button size="sm" variant="ghost" onClick={downloadTemplate} className="text-primary">
                  <Download className="w-4 h-4 mr-2" />
                  Download Template
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6">
          <div>
            <h3 className="font-semibold text-slate-900 mb-2">Field Mapping</h3>
            <p className="text-sm text-slate-600 mb-4">
              Review the automatic field mapping. Fields using names (like "Seagate", "1TB") will be
              automatically converted to database IDs during import.
            </p>
          </div>

          <div className="space-y-3 max-h-96 overflow-y-auto">
            {sourceFields.map((sourceField) => (
              <div
                key={sourceField}
                className="flex items-center gap-4 p-3 bg-slate-50 rounded-lg border border-slate-200"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 truncate">{sourceField}</p>
                  <p className="text-xs text-slate-500">CSV Column</p>
                </div>

                <ArrowRight className="w-5 h-5 text-slate-400 flex-shrink-0" />

                <div className="flex-1">
                  <select
                    value={fieldMappings[sourceField] || ''}
                    onChange={(e) =>
                      setFieldMappings({ ...fieldMappings, [sourceField]: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-sm"
                  >
                    <option value="">Skip this field</option>
                    <optgroup label="Required Fields">
                      <option value="name">name (required)</option>
                    </optgroup>
                    <optgroup label="Basic Info">
                      <option value="description">description</option>
                      <option value="model">model</option>
                      <option value="serial_number">serial_number</option>
                      <option value="sku_code">sku_code</option>
                      <option value="item_number">item_number</option>
                    </optgroup>
                    <optgroup label="Reference Fields (Use Names)">
                      <option value="brand_id">brand_id (e.g., "Seagate")</option>
                      <option value="device_type_id">device_type_id (e.g., "HDD")</option>
                      <option value="capacity_id">capacity_id (e.g., "1TB")</option>
                      <option value="interface_id">interface_id (e.g., "SATA")</option>
                      <option value="storage_location_id">storage_location_id</option>
                      <option value="product_country_id">product_country_id</option>
                      <option value="status_type_id">status_type_id (e.g., "Available")</option>
                      <option value="condition_type_id">condition_type_id (e.g., "Good")</option>
                    </optgroup>
                    <optgroup label="Quantities">
                      <option value="quantity_available">quantity_available</option>
                      <option value="quantity_in_use">quantity_in_use</option>
                      <option value="quantity_defective">quantity_defective</option>
                    </optgroup>
                    <optgroup label="Technical">
                      <option value="pcb_number">pcb_number</option>
                      <option value="firmware_version">firmware_version</option>
                      <option value="manufacture_date">manufacture_date</option>
                      <option value="spindle_speed">spindle_speed</option>
                    </optgroup>
                    <optgroup label="Financial">
                      <option value="acquisition_cost">acquisition_cost</option>
                      <option value="unit_cost">unit_cost</option>
                      <option value="purchase_date">purchase_date</option>
                    </optgroup>
                  </select>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
            <h4 className="font-medium text-slate-900 mb-2">Preview (First 10 rows)</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-300">
                    {sourceFields.slice(0, 5).map((field) => (
                      <th key={field} className="text-left py-2 px-2 font-medium text-slate-700">
                        {field}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewData.map((row, idx) => (
                    <tr key={idx} className="border-b border-slate-200">
                      {sourceFields.slice(0, 5).map((field) => (
                        <td key={field} className="py-2 px-2 text-slate-600">
                          {String(row[field] || '').slice(0, 30)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-sm text-slate-600 mt-2">
              Total rows to import: <strong>{previewData.length > 0 ? parseCSV(csvContent).length - 1 : 0}</strong>
            </p>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-6">
          {isImporting ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-info-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <Loader className="w-10 h-10 text-primary animate-spin" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-2">
                {progress?.status === 'preparing' ? 'Preparing Import...' : 'Importing Records...'}
              </h3>
              <p className="text-slate-600 mb-4">
                {progress?.status === 'preparing'
                  ? 'Loading reference data and validating...'
                  : `Processing row ${progress?.currentRow || 0} of ${progress?.total || 0}`}
              </p>

              <div className="max-w-md mx-auto">
                <div className="bg-slate-200 rounded-full h-3 mb-2 overflow-hidden">
                  <div
                    className="bg-primary h-full transition-all duration-300"
                    style={{ width: `${getProgressPercentage()}%` }}
                  />
                </div>
                <p className="text-sm text-slate-600">{getProgressPercentage()}% Complete</p>
              </div>

              {progress && progress.processed > 0 && (
                <div className="mt-6 grid grid-cols-3 gap-4 max-w-md mx-auto">
                  <div className="bg-success-muted rounded-lg p-3">
                    <p className="text-2xl font-bold text-success">{progress.successful}</p>
                    <p className="text-xs text-success">Successful</p>
                  </div>
                  <div className="bg-danger-muted rounded-lg p-3">
                    <p className="text-2xl font-bold text-danger">{progress.failed}</p>
                    <p className="text-xs text-danger">Failed</p>
                  </div>
                  <div className="bg-warning-muted rounded-lg p-3">
                    <p className="text-2xl font-bold text-warning">{progress.warnings.length}</p>
                    <p className="text-xs text-warning">Warnings</p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <div
                className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
                  progress?.status === 'completed' && progress.failed === 0
                    ? 'bg-success-muted'
                    : 'bg-warning-muted'
                }`}
              >
                {progress?.status === 'completed' && progress.failed === 0 ? (
                  <CheckCircle className="w-10 h-10 text-success" />
                ) : (
                  <AlertTriangle className="w-10 h-10 text-warning" />
                )}
              </div>

              <h3 className="text-xl font-semibold text-slate-900 mb-2">Import Complete</h3>

              {progress && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4 max-w-md mx-auto mb-6">
                    <div className="bg-success-muted rounded-lg p-4">
                      <p className="text-3xl font-bold text-success">{progress.successful}</p>
                      <p className="text-sm text-success">Imported</p>
                    </div>
                    <div className="bg-danger-muted rounded-lg p-4">
                      <p className="text-3xl font-bold text-danger">{progress.failed}</p>
                      <p className="text-sm text-danger">Failed</p>
                    </div>
                    <div className="bg-warning-muted rounded-lg p-4">
                      <p className="text-3xl font-bold text-warning">{progress.warnings.length}</p>
                      <p className="text-sm text-warning">Warnings</p>
                    </div>
                  </div>

                  {(progress.errors.length > 0 || progress.warnings.length > 0) && (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 max-w-2xl mx-auto">
                      <h4 className="font-medium text-slate-900 mb-2">Issues Found</h4>
                      <div className="space-y-2 max-h-48 overflow-y-auto text-left">
                        {progress.errors.slice(0, 5).map((error, idx) => (
                          <div key={idx} className="text-sm bg-danger-muted border border-danger/30 rounded p-2">
                            <p className="font-medium text-danger">
                              Row {error.row}: {error.field}
                            </p>
                            <p className="text-danger">{error.message}</p>
                          </div>
                        ))}
                        {progress.warnings.slice(0, 3).map((warning, idx) => (
                          <div key={idx} className="text-sm bg-warning-muted border border-warning/30 rounded p-2">
                            <p className="font-medium text-warning">
                              Row {warning.row}: {warning.field}
                            </p>
                            <p className="text-warning">{warning.message}</p>
                          </div>
                        ))}
                        {(progress.errors.length > 5 || progress.warnings.length > 3) && (
                          <p className="text-sm text-slate-600 text-center py-2">
                            ... and more issues. Download the full report.
                          </p>
                        )}
                      </div>

                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => downloadErrorReport(progress, 'import_issues.csv')}
                        className="mt-3"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Download Full Report
                      </Button>
                    </div>
                  )}

                  <div className="flex gap-3 justify-center mt-6">
                    <Button onClick={handleClose} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                      Done
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {!isImporting && (
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-200">
          <Button
            variant="ghost"
            onClick={step === 1 ? handleClose : () => setStep(step - 1)}
            disabled={step === 3}
          >
            {step === 1 ? 'Cancel' : step === 3 ? '' : 'Back'}
          </Button>

          {step < 3 && (
            <Button
              onClick={() => {
                if (step === 2) handleStartImport();
              }}
              disabled={step === 1 && !file}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {step === 2 ? 'Start Import' : 'Next'}
            </Button>
          )}
        </div>
      )}
    </Modal>
  );
};
