import { supabase } from './supabaseClient';
import { checkRateLimit, RATE_LIMITS } from './rateLimiter';
import { logger } from './logger';

export interface UploadResult {
  success: boolean;
  filePath?: string;
  publicUrl?: string;
  error?: string;
  metadata?: {
    size: number;
    width?: number;
    height?: number;
    format?: string;
  };
}

export interface FileMetadata {
  width?: number;
  height?: number;
  size: number;
  format: string;
  uploadedAt: string;
}

const BUCKETS = {
  ASSETS: 'company-assets',
  QRCODES: 'company-qrcodes',
  CUSTOMER_PHOTOS: 'customer-profile-photos',
} as const;

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export const uploadCompanyAsset = async (
  file: File,
  bucketName: 'company-assets' | 'company-qrcodes' | 'customer-profile-photos',
  folder: string = '',
  metadata?: Partial<FileMetadata>
): Promise<UploadResult> => {
  const rl = checkRateLimit(RATE_LIMITS.FILE_UPLOAD);
  if (!rl.allowed) {
    return { success: false, error: rl.message };
  }

  try {
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return {
        success: false,
        error: `File type "${file.type}" is not allowed. Accepted types: JPEG, PNG, GIF, WebP, SVG, PDF.`,
      };
    }

    if (file.size > MAX_FILE_SIZE) {
      return {
        success: false,
        error: `File size (${(file.size / 1024 / 1024).toFixed(1)} MB) exceeds the maximum allowed size of ${MAX_FILE_SIZE / 1024 / 1024} MB.`,
      };
    }

    const timestamp = Date.now();
    const fileExt = file.name.split('.').pop();
    const fileName = `${folder ? folder + '/' : ''}${timestamp}.${fileExt}`;

    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      logger.error('Upload error:', error);
      return {
        success: false,
        error: error.message || 'Failed to upload file',
      };
    }

    const { data: publicUrlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(data.path);

    return {
      success: true,
      filePath: data.path,
      publicUrl: publicUrlData.publicUrl,
      metadata: {
        size: file.size,
        format: file.type,
        ...metadata,
      },
    };
  } catch (error) {
    logger.error('Upload exception:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
};

export const deleteCompanyAsset = async (
  filePath: string,
  bucketName: 'company-assets' | 'company-qrcodes' | 'customer-profile-photos'
): Promise<{ success: boolean; error?: string }> => {
  try {
    if (!filePath) {
      return { success: true };
    }

    const { error } = await supabase.storage.from(bucketName).remove([filePath]);

    if (error) {
      logger.error('Delete error:', error);
      return {
        success: false,
        error: error.message || 'Failed to delete file',
      };
    }

    return { success: true };
  } catch (error) {
    logger.error('Delete exception:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
};

export const getPublicUrl = (
  filePath: string,
  bucketName: 'company-assets' | 'company-qrcodes' | 'customer-profile-photos'
): string | null => {
  if (!filePath) return null;

  const { data } = supabase.storage.from(bucketName).getPublicUrl(filePath);

  return data.publicUrl;
};

export const uploadLogo = async (
  file: File,
  type: 'primary' | 'light' | 'favicon',
  metadata?: Partial<FileMetadata>
): Promise<UploadResult> => {
  return uploadCompanyAsset(file, BUCKETS.ASSETS, `logos/${type}`, metadata);
};

export const uploadQRCode = async (
  file: File,
  type: 'invoice' | 'quote' | 'label' | 'general',
  metadata?: Partial<FileMetadata>
): Promise<UploadResult> => {
  return uploadCompanyAsset(file, BUCKETS.QRCODES, `qrcodes/${type}`, metadata);
};

export const deleteLogo = async (
  filePath: string
): Promise<{ success: boolean; error?: string }> => {
  return deleteCompanyAsset(filePath, BUCKETS.ASSETS);
};

export const uploadStamp = async (file: File, metadata?: Partial<FileMetadata>): Promise<UploadResult> =>
  uploadCompanyAsset(file, BUCKETS.ASSETS, 'stamps', metadata);

export const uploadSignature = async (file: File, metadata?: Partial<FileMetadata>): Promise<UploadResult> =>
  uploadCompanyAsset(file, BUCKETS.ASSETS, 'signatures', metadata);

export const deleteStamp = async (filePath: string): Promise<{ success: boolean; error?: string }> =>
  deleteCompanyAsset(filePath, BUCKETS.ASSETS);

export const deleteSignature = async (filePath: string): Promise<{ success: boolean; error?: string }> =>
  deleteCompanyAsset(filePath, BUCKETS.ASSETS);

export const deleteQRCode = async (
  filePath: string
): Promise<{ success: boolean; error?: string }> => {
  return deleteCompanyAsset(filePath, BUCKETS.QRCODES);
};

export const updateCompanyBranding = async (
  field: string,
  value: any
): Promise<{ success: boolean; error?: string }> => {
  try {
    const { data: currentSettings } = await supabase
      .from('company_settings')
      .select('branding')
      .limit(1)
      .maybeSingle();

    const currentBranding = (currentSettings?.branding as Record<string, unknown> | null) || {};

    const updatedBranding = {
      ...currentBranding,
      [field]: value,
      last_branding_update: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('company_settings')
      .update({ branding: updatedBranding })
      .not('id', 'is', null);

    if (error) {
      logger.error('Update branding error:', error);
      return {
        success: false,
        error: error.message || 'Failed to update branding',
      };
    }

    return { success: true };
  } catch (error) {
    logger.error('Update branding exception:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
};

export const getCompanyLogo = async (
  type: 'primary' | 'light' = 'primary'
): Promise<string | null> => {
  try {
    const { data } = await supabase
      .from('company_settings')
      .select('branding')
      .limit(1)
      .maybeSingle();

    if (!data?.branding) return null;

    const branding = data.branding as Record<string, string | undefined>;
    const fieldName = type === 'primary' ? 'logo_url' : 'logo_light_url';
    return branding[fieldName] || null;
  } catch (error) {
    logger.error('Get logo error:', error);
    return null;
  }
};

export const getCompanyStamp = async (): Promise<string | null> => {
  try {
    const { data } = await supabase
      .from('company_settings')
      .select('branding')
      .limit(1)
      .maybeSingle();

    if (!data?.branding) return null;

    const branding = data.branding as Record<string, string | undefined>;
    return branding.stamp_url || null;
  } catch (error) {
    logger.error('Get stamp error:', error);
    return null;
  }
};

export const getCompanySignature = async (): Promise<string | null> => {
  try {
    const { data } = await supabase
      .from('company_settings')
      .select('branding')
      .limit(1)
      .maybeSingle();

    if (!data?.branding) return null;

    const branding = data.branding as Record<string, string | undefined>;
    return branding.signature_url || null;
  } catch (error) {
    logger.error('Get signature error:', error);
    return null;
  }
};

export const getCompanyQRCode = async (
  type: 'invoice' | 'quote' | 'label' | 'general'
): Promise<string | null> => {
  try {
    const { data } = await supabase
      .from('company_settings')
      .select('branding')
      .limit(1)
      .maybeSingle();

    if (!data?.branding) return null;

    const branding = data.branding as Record<string, string | undefined>;
    const fieldName = `qr_code_${type}_url`;
    return branding[fieldName] || null;
  } catch (error) {
    logger.error('Get QR code error:', error);
    return null;
  }
};

export const uploadCustomerProfilePhoto = async (
  file: File,
  customerId: string,
  metadata?: Partial<FileMetadata>
): Promise<UploadResult> => {
  return uploadCompanyAsset(file, BUCKETS.CUSTOMER_PHOTOS, `customers/${customerId}`, metadata);
};

export const deleteCustomerProfilePhoto = async (
  filePath: string
): Promise<{ success: boolean; error?: string }> => {
  return deleteCompanyAsset(filePath, BUCKETS.CUSTOMER_PHOTOS);
};

export const getCustomerProfilePhotoUrl = (
  filePath: string | null
): string | null => {
  if (!filePath) return null;
  return getPublicUrl(filePath, BUCKETS.CUSTOMER_PHOTOS);
};
