import { supabase } from './supabaseClient';
import { logger } from './logger';
import {
  DEVICE_MEDIA_SEED_DATA,
  CLIENT_FINANCIAL_SEED_DATA,
  CASE_SERVICE_SEED_DATA,
  TEMPLATE_SEED_DATA,
} from '../config/seedData';
import { isTenantScopedTable } from '../config/settingsCategories';

interface SeedResult {
  success: boolean;
  message: string;
  error?: string;
  details?: TableSeedResult[];
}

interface TableSeedResult {
  tableName: string;
  tableLabel: string;
  status: 'seeded' | 'skipped' | 'error';
  beforeCount: number;
  afterCount: number;
  itemsInserted: number;
}

async function getTableCount(tableName: string): Promise<number> {
  try {
    const { count, error } = await (supabase as never as { from: (t: string) => { select: (s: string, o: { count: 'exact'; head: true }) => Promise<{ count: number | null; error: unknown }> } })
      .from(tableName)
      .select('*', { count: 'exact', head: true });

    if (error) {
      logger.error(`Error counting ${tableName}:`, error);
      return 0;
    }

    return count || 0;
  } catch (error) {
    logger.error(`Error counting ${tableName}:`, error);
    return 0;
  }
}

async function checkAllTablesPopulated(tables: readonly string[]): Promise<boolean> {
  try {
    for (const table of tables) {
      const count = await getTableCount(table);
      if (count === 0) {
        return false;
      }
    }
    return true;
  } catch (error) {
    logger.error('Error checking tables:', error);
    return false;
  }
}

export async function checkIfSeeded(category: string): Promise<boolean> {
  try {
    const tables: Record<string, readonly string[]> = {
      'device-media': [
        'catalog_device_types',
        'catalog_device_brands',
        'catalog_device_capacities',
        'catalog_accessories',
        'catalog_device_interfaces',
        'catalog_device_made_in',
        'catalog_device_encryption',
        'catalog_device_platter_counts',
        'catalog_device_head_counts',
        'inventory_locations',
        'master_inventory_categories',
      ],
      'client-financial': [
        'customer_groups',
        'master_industries',
        'geo_countries',
        'geo_cities',
        'master_expense_categories',
        'master_quote_statuses',
        'master_invoice_statuses',
        'master_payment_methods',
      ],
      'case-service': [
        'catalog_service_types',
        'catalog_service_problems',
        'master_case_priorities',
        'master_case_statuses',
        'catalog_service_locations',
        'catalog_device_conditions',
        'catalog_device_roles',
      ],
      'templates': [
        'document_templates',
      ],
    };

    const categoryTables = tables[category];
    if (!categoryTables) {
      return true;
    }

    return await checkAllTablesPopulated(categoryTables);
  } catch (error) {
    logger.error('Error checking seed status:', error);
    return false;
  }
}

export async function seedDeviceMediaData(): Promise<SeedResult> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return {
        success: false,
        message: 'User not authenticated',
      };
    }

    const { data: dmProfile } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .maybeSingle();

    const dmTenantId = dmProfile?.tenant_id;

    const tableLabels: Record<string, string> = {
      catalog_device_types: 'Device Types',
      catalog_device_brands: 'Brands',
      catalog_device_capacities: 'Capacities',
      catalog_accessories: 'Accessories',
      catalog_device_interfaces: 'Device Interface',
      catalog_device_made_in: 'Device Made In',
      catalog_device_encryption: 'Device Encryption',
      catalog_device_platter_counts: 'Device Platter No',
      catalog_device_head_counts: 'Device Head No',
      inventory_locations: 'Inventory Locations',
      master_inventory_categories: 'Inventory Categories',
    };

    const tables = [
      'catalog_device_types',
      'catalog_device_brands',
      'catalog_device_capacities',
      'catalog_accessories',
      'catalog_device_interfaces',
      'catalog_device_made_in',
      'catalog_device_encryption',
      'catalog_device_platter_counts',
      'catalog_device_head_counts',
      'inventory_locations',
      'master_inventory_categories',
    ] as const;

    let totalInserted = 0;
    const details: TableSeedResult[] = [];

    for (const table of tables) {
      const beforeCount = await getTableCount(table);

      if (beforeCount > 0) {
        details.push({
          tableName: table,
          tableLabel: tableLabels[table],
          status: 'skipped',
          beforeCount,
          afterCount: beforeCount,
          itemsInserted: 0,
        });
        continue;
      }

      const seedData = DEVICE_MEDIA_SEED_DATA[table];

      if (!seedData || seedData.length === 0) {
        logger.error(`No seed data found for table: ${table}`);
        details.push({
          tableName: table,
          tableLabel: tableLabels[table],
          status: 'error',
          beforeCount: 0,
          afterCount: 0,
          itemsInserted: 0,
        });
        continue;
      }

      const dmIsTenantTable = isTenantScopedTable(table as any);

      const records = seedData.map((item, index) => ({
        name: item,
        ...(dmIsTenantTable ? {} : { sort_order: index + 1 }),
        is_active: true,
        ...(dmIsTenantTable && dmTenantId ? { tenant_id: dmTenantId } : {}),
      }));

      const { error, count } = await supabase
        .from(table)
        .insert(records as any)
        .select();

      if (error) {
        logger.error(`Error seeding ${table}:`, error);
        details.push({
          tableName: table,
          tableLabel: tableLabels[table],
          status: 'error',
          beforeCount,
          afterCount: beforeCount,
          itemsInserted: 0,
        });
        continue;
      }

      const itemsInserted = count || records.length;
      totalInserted += itemsInserted;

      details.push({
        tableName: table,
        tableLabel: tableLabels[table],
        status: 'seeded',
        beforeCount: 0,
        afterCount: itemsInserted,
        itemsInserted,
      });
    }

    const seededCount = details.filter(d => d.status === 'seeded').length;
    const skippedCount = details.filter(d => d.status === 'skipped').length;

    let message = '';
    if (seededCount > 0 && skippedCount > 0) {
      message = `Seeded ${seededCount} empty tables (${totalInserted} items). Skipped ${skippedCount} tables that already had data.`;
    } else if (seededCount > 0) {
      message = `Successfully seeded ${totalInserted} records across ${seededCount} Device & Media tables`;
    } else if (skippedCount > 0) {
      message = `All Device & Media tables already have data. No seeding needed.`;
    } else {
      message = 'No tables were seeded';
    }

    return {
      success: seededCount > 0,
      message,
      details,
    };
  } catch (error) {
    logger.error('Seeding error:', error);
    return {
      success: false,
      message: 'Failed to seed data',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function seedClientFinancialData(): Promise<SeedResult> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return {
        success: false,
        message: 'User not authenticated',
      };
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .maybeSingle();

    const tenantId = profile?.tenant_id;

    const tableLabels: Record<string, string> = {
      customer_groups: 'Customer Groups',
      master_industries: 'Industries',
      geo_countries: 'Countries',
      geo_cities: 'Cities',
      master_expense_categories: 'Expense Categories',
      master_quote_statuses: 'Quote Statuses',
      master_invoice_statuses: 'Invoice Statuses',
      master_payment_methods: 'Client Payment Methods',
    };

    let totalInserted = 0;
    const details: TableSeedResult[] = [];

    const countriesCount = await getTableCount('geo_countries');
    if (countriesCount === 0) {
      const countryRecords = CLIENT_FINANCIAL_SEED_DATA.geo_countries.map((country, index) => ({
        name: country.name,
        code: country.code,
        sort_order: index + 1,
        is_active: true,
      }));

      const { error: countriesError, data: insertedCountries } = await supabase
        .from('geo_countries')
        .insert(countryRecords)
        .select();

      if (countriesError) {
        details.push({
          tableName: 'geo_countries',
          tableLabel: tableLabels.geo_countries,
          status: 'error',
          beforeCount: 0,
          afterCount: 0,
          itemsInserted: 0,
        });
      } else {
        const itemsInserted = insertedCountries?.length || 0;
        totalInserted += itemsInserted;
        details.push({
          tableName: 'geo_countries',
          tableLabel: tableLabels.geo_countries,
          status: 'seeded',
          beforeCount: 0,
          afterCount: itemsInserted,
          itemsInserted,
        });
      }
    } else {
      details.push({
        tableName: 'geo_countries',
        tableLabel: tableLabels.geo_countries,
        status: 'skipped',
        beforeCount: countriesCount,
        afterCount: countriesCount,
        itemsInserted: 0,
      });
    }

    const citiesCount = await getTableCount('geo_cities');
    if (citiesCount === 0) {
      const { data: omanCountry } = await supabase
        .from('geo_countries')
        .select('id')
        .eq('code', 'OM')
        .maybeSingle();

      if (omanCountry) {
        const cityRecords = CLIENT_FINANCIAL_SEED_DATA.geo_cities.map((city, index) => ({
          name: city,
          country_id: omanCountry.id,
          sort_order: index + 1,
          is_active: true,
        }));

        const { error: citiesError, count: insertedCitiesCount } = await supabase
          .from('geo_cities')
          .insert(cityRecords)
          .select();

        if (citiesError) {
          details.push({
            tableName: 'geo_cities',
            tableLabel: tableLabels.geo_cities,
            status: 'error',
            beforeCount: 0,
            afterCount: 0,
            itemsInserted: 0,
          });
        } else {
          const itemsInserted = insertedCitiesCount || cityRecords.length;
          totalInserted += itemsInserted;
          details.push({
            tableName: 'geo_cities',
            tableLabel: tableLabels.geo_cities,
            status: 'seeded',
            beforeCount: 0,
            afterCount: itemsInserted,
            itemsInserted,
          });
        }
      } else {
        details.push({
          tableName: 'geo_cities',
          tableLabel: tableLabels.geo_cities,
          status: 'error',
          beforeCount: 0,
          afterCount: 0,
          itemsInserted: 0,
        });
      }
    } else {
      details.push({
        tableName: 'geo_cities',
        tableLabel: tableLabels.geo_cities,
        status: 'skipped',
        beforeCount: citiesCount,
        afterCount: citiesCount,
        itemsInserted: 0,
      });
    }

    const simpleTables = ['customer_groups', 'master_industries', 'master_expense_categories', 'master_payment_methods'] as const;

    for (const table of simpleTables) {
      const beforeCount = await getTableCount(table);

      if (beforeCount > 0) {
        details.push({
          tableName: table,
          tableLabel: tableLabels[table],
          status: 'skipped',
          beforeCount,
          afterCount: beforeCount,
          itemsInserted: 0,
        });
        continue;
      }

      const seedData = CLIENT_FINANCIAL_SEED_DATA[table];

      if (!seedData || seedData.length === 0) {
        logger.error(`No seed data found for table: ${table}`);
        details.push({
          tableName: table,
          tableLabel: tableLabels[table],
          status: 'error',
          beforeCount: 0,
          afterCount: 0,
          itemsInserted: 0,
        });
        continue;
      }

      const isTenantTable = isTenantScopedTable(table as any);

      const records = seedData.map((item, index) => ({
        name: item,
        ...(isTenantTable ? {} : { sort_order: index + 1 }),
        is_active: true,
        ...(isTenantTable && tenantId ? { tenant_id: tenantId } : {}),
      }));

      const { error, count } = await supabase
        .from(table)
        .insert(records as any)
        .select();

      if (error) {
        logger.error(`Error seeding ${table}:`, error);
        details.push({
          tableName: table,
          tableLabel: tableLabels[table],
          status: 'error',
          beforeCount,
          afterCount: beforeCount,
          itemsInserted: 0,
        });
        continue;
      }

      const itemsInserted = count || records.length;
      totalInserted += itemsInserted;

      details.push({
        tableName: table,
        tableLabel: tableLabels[table],
        status: 'seeded',
        beforeCount: 0,
        afterCount: itemsInserted,
        itemsInserted,
      });
    }

    const quoteStatusCount = await getTableCount('master_quote_statuses');
    if (quoteStatusCount === 0) {
      const quoteStatusRecords = CLIENT_FINANCIAL_SEED_DATA.master_quote_statuses.map((status, index) => ({
        name: status.name,
        color: status.color,
        sort_order: index + 1,
        is_active: true,
      }));

      const { error: quoteStatusError, count } = await supabase
        .from('master_quote_statuses')
        .insert(quoteStatusRecords)
        .select();

      if (quoteStatusError) {
        details.push({
          tableName: 'master_quote_statuses',
          tableLabel: tableLabels.master_quote_statuses,
          status: 'error',
          beforeCount: 0,
          afterCount: 0,
          itemsInserted: 0,
        });
      } else {
        const itemsInserted = count || quoteStatusRecords.length;
        totalInserted += itemsInserted;
        details.push({
          tableName: 'master_quote_statuses',
          tableLabel: tableLabels.master_quote_statuses,
          status: 'seeded',
          beforeCount: 0,
          afterCount: itemsInserted,
          itemsInserted,
        });
      }
    } else {
      details.push({
        tableName: 'master_quote_statuses',
        tableLabel: tableLabels.master_quote_statuses,
        status: 'skipped',
        beforeCount: quoteStatusCount,
        afterCount: quoteStatusCount,
        itemsInserted: 0,
      });
    }

    const invoiceStatusCount = await getTableCount('master_invoice_statuses');
    if (invoiceStatusCount === 0) {
      const invoiceStatusRecords = CLIENT_FINANCIAL_SEED_DATA.master_invoice_statuses.map((status, index) => ({
        name: status.name,
        color: status.color,
        sort_order: index + 1,
        is_active: true,
      }));

      const { error: invoiceStatusError, count } = await supabase
        .from('master_invoice_statuses')
        .insert(invoiceStatusRecords)
        .select();

      if (invoiceStatusError) {
        details.push({
          tableName: 'master_invoice_statuses',
          tableLabel: tableLabels.master_invoice_statuses,
          status: 'error',
          beforeCount: 0,
          afterCount: 0,
          itemsInserted: 0,
        });
      } else {
        const itemsInserted = count || invoiceStatusRecords.length;
        totalInserted += itemsInserted;
        details.push({
          tableName: 'master_invoice_statuses',
          tableLabel: tableLabels.master_invoice_statuses,
          status: 'seeded',
          beforeCount: 0,
          afterCount: itemsInserted,
          itemsInserted,
        });
      }
    } else {
      details.push({
        tableName: 'master_invoice_statuses',
        tableLabel: tableLabels.master_invoice_statuses,
        status: 'skipped',
        beforeCount: invoiceStatusCount,
        afterCount: invoiceStatusCount,
        itemsInserted: 0,
      });
    }

    const seededCount = details.filter(d => d.status === 'seeded').length;
    const skippedCount = details.filter(d => d.status === 'skipped').length;

    let message = '';
    if (seededCount > 0 && skippedCount > 0) {
      message = `Seeded ${seededCount} empty tables (${totalInserted} items). Skipped ${skippedCount} tables that already had data.`;
    } else if (seededCount > 0) {
      message = `Successfully seeded ${totalInserted} records across ${seededCount} Client & Financial tables`;
    } else if (skippedCount > 0) {
      message = `All Client & Financial tables already have data. No seeding needed.`;
    } else {
      message = 'No tables were seeded';
    }

    return {
      success: seededCount > 0,
      message,
      details,
    };
  } catch (error) {
    logger.error('Seeding error:', error);
    return {
      success: false,
      message: 'Failed to seed data',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function seedCaseServiceData(): Promise<SeedResult> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return {
        success: false,
        message: 'User not authenticated',
      };
    }

    const tableLabels: Record<string, string> = {
      catalog_service_types: 'Service Types',
      catalog_service_problems: 'Service Problems',
      master_case_priorities: 'Case Priorities',
      master_case_statuses: 'Case Statuses',
      catalog_service_locations: 'Service Locations',
      catalog_device_conditions: 'Device Conditions',
      catalog_device_roles: 'Device Roles',
    };

    let totalInserted = 0;
    const details: TableSeedResult[] = [];

    const serviceTypesCount = await getTableCount('catalog_service_types');
    if (serviceTypesCount === 0) {
      const serviceTypeRecords = CASE_SERVICE_SEED_DATA.catalog_service_types.map((service, index) => ({
        name: service.name,
        estimated_days: service.estimatedDays,
        sort_order: index + 1,
        is_active: true,
      }));

      const { error: serviceTypeError, count } = await supabase
        .from('catalog_service_types')
        .insert(serviceTypeRecords as never)
        .select();

      if (serviceTypeError) {
        details.push({
          tableName: 'catalog_service_types',
          tableLabel: tableLabels.catalog_service_types,
          status: 'error',
          beforeCount: 0,
          afterCount: 0,
          itemsInserted: 0,
        });
      } else {
        const itemsInserted = count || serviceTypeRecords.length;
        totalInserted += itemsInserted;
        details.push({
          tableName: 'catalog_service_types',
          tableLabel: tableLabels.catalog_service_types,
          status: 'seeded',
          beforeCount: 0,
          afterCount: itemsInserted,
          itemsInserted,
        });
      }
    } else {
      details.push({
        tableName: 'catalog_service_types',
        tableLabel: tableLabels.catalog_service_types,
        status: 'skipped',
        beforeCount: serviceTypesCount,
        afterCount: serviceTypesCount,
        itemsInserted: 0,
      });
    }

    const serviceProblemsCount = await getTableCount('catalog_service_problems');
    if (serviceProblemsCount === 0) {
      const serviceProblemRecords = CASE_SERVICE_SEED_DATA.catalog_service_problems.map((problem, index) => ({
        name: problem,
        sort_order: index + 1,
        is_active: true,
      }));

      const { error: problemError, count } = await supabase
        .from('catalog_service_problems')
        .insert(serviceProblemRecords)
        .select();

      if (problemError) {
        details.push({
          tableName: 'catalog_service_problems',
          tableLabel: tableLabels.catalog_service_problems,
          status: 'error',
          beforeCount: 0,
          afterCount: 0,
          itemsInserted: 0,
        });
      } else {
        const itemsInserted = count || serviceProblemRecords.length;
        totalInserted += itemsInserted;
        details.push({
          tableName: 'catalog_service_problems',
          tableLabel: tableLabels.catalog_service_problems,
          status: 'seeded',
          beforeCount: 0,
          afterCount: itemsInserted,
          itemsInserted,
        });
      }
    } else {
      details.push({
        tableName: 'catalog_service_problems',
        tableLabel: tableLabels.catalog_service_problems,
        status: 'skipped',
        beforeCount: serviceProblemsCount,
        afterCount: serviceProblemsCount,
        itemsInserted: 0,
      });
    }

    const casePrioritiesCount = await getTableCount('master_case_priorities');
    if (casePrioritiesCount === 0) {
      const casePriorityRecords = CASE_SERVICE_SEED_DATA.master_case_priorities.map((priority, index) => ({
        name: priority.name,
        color: priority.color,
        level: priority.level,
        sort_order: index + 1,
        is_active: true,
      }));

      const { error: priorityError, count } = await supabase
        .from('master_case_priorities')
        .insert(casePriorityRecords as never)
        .select();

      if (priorityError) {
        details.push({
          tableName: 'master_case_priorities',
          tableLabel: tableLabels.master_case_priorities,
          status: 'error',
          beforeCount: 0,
          afterCount: 0,
          itemsInserted: 0,
        });
      } else {
        const itemsInserted = count || casePriorityRecords.length;
        totalInserted += itemsInserted;
        details.push({
          tableName: 'master_case_priorities',
          tableLabel: tableLabels.master_case_priorities,
          status: 'seeded',
          beforeCount: 0,
          afterCount: itemsInserted,
          itemsInserted,
        });
      }
    } else {
      details.push({
        tableName: 'master_case_priorities',
        tableLabel: tableLabels.master_case_priorities,
        status: 'skipped',
        beforeCount: casePrioritiesCount,
        afterCount: casePrioritiesCount,
        itemsInserted: 0,
      });
    }

    const caseStatusesCount = await getTableCount('master_case_statuses');
    if (caseStatusesCount === 0) {
      const caseStatusRecords = CASE_SERVICE_SEED_DATA.master_case_statuses.map((status, index) => ({
        name: status.name,
        type: status.type,
        color: status.color,
        sort_order: index + 1,
        is_active: true,
      }));

      const { error: statusError, count } = await supabase
        .from('master_case_statuses')
        .insert(caseStatusRecords)
        .select();

      if (statusError) {
        details.push({
          tableName: 'master_case_statuses',
          tableLabel: tableLabels.master_case_statuses,
          status: 'error',
          beforeCount: 0,
          afterCount: 0,
          itemsInserted: 0,
        });
      } else {
        const itemsInserted = count || caseStatusRecords.length;
        totalInserted += itemsInserted;
        details.push({
          tableName: 'master_case_statuses',
          tableLabel: tableLabels.master_case_statuses,
          status: 'seeded',
          beforeCount: 0,
          afterCount: itemsInserted,
          itemsInserted,
        });
      }
    } else {
      details.push({
        tableName: 'master_case_statuses',
        tableLabel: tableLabels.master_case_statuses,
        status: 'skipped',
        beforeCount: caseStatusesCount,
        afterCount: caseStatusesCount,
        itemsInserted: 0,
      });
    }

    const serviceLocationsCount = await getTableCount('catalog_service_locations');
    if (serviceLocationsCount === 0) {
      const serviceLocationRecords = CASE_SERVICE_SEED_DATA.catalog_service_locations.map((location, index) => ({
        name: location,
        sort_order: index + 1,
        is_active: true,
      }));

      const { error: locationError, count } = await supabase
        .from('catalog_service_locations')
        .insert(serviceLocationRecords)
        .select();

      if (locationError) {
        details.push({
          tableName: 'catalog_service_locations',
          tableLabel: tableLabels.catalog_service_locations,
          status: 'error',
          beforeCount: 0,
          afterCount: 0,
          itemsInserted: 0,
        });
      } else {
        const itemsInserted = count || serviceLocationRecords.length;
        totalInserted += itemsInserted;
        details.push({
          tableName: 'catalog_service_locations',
          tableLabel: tableLabels.catalog_service_locations,
          status: 'seeded',
          beforeCount: 0,
          afterCount: itemsInserted,
          itemsInserted,
        });
      }
    } else {
      details.push({
        tableName: 'catalog_service_locations',
        tableLabel: tableLabels.catalog_service_locations,
        status: 'skipped',
        beforeCount: serviceLocationsCount,
        afterCount: serviceLocationsCount,
        itemsInserted: 0,
      });
    }

    const deviceConditionsCount = await getTableCount('catalog_device_conditions');
    if (deviceConditionsCount === 0) {
      const deviceConditionRecords = CASE_SERVICE_SEED_DATA.catalog_device_conditions.map((condition, index) => ({
        name: condition,
        sort_order: index + 1,
        is_active: true,
      }));

      const { error: conditionError, count } = await supabase
        .from('catalog_device_conditions')
        .insert(deviceConditionRecords)
        .select();

      if (conditionError) {
        details.push({
          tableName: 'catalog_device_conditions',
          tableLabel: tableLabels.catalog_device_conditions,
          status: 'error',
          beforeCount: 0,
          afterCount: 0,
          itemsInserted: 0,
        });
      } else {
        const itemsInserted = count || deviceConditionRecords.length;
        totalInserted += itemsInserted;
        details.push({
          tableName: 'catalog_device_conditions',
          tableLabel: tableLabels.catalog_device_conditions,
          status: 'seeded',
          beforeCount: 0,
          afterCount: itemsInserted,
          itemsInserted,
        });
      }
    } else {
      details.push({
        tableName: 'catalog_device_conditions',
        tableLabel: tableLabels.catalog_device_conditions,
        status: 'skipped',
        beforeCount: deviceConditionsCount,
        afterCount: deviceConditionsCount,
        itemsInserted: 0,
      });
    }

    const deviceRolesCount = await getTableCount('catalog_device_roles');
    if (deviceRolesCount === 0) {
      const deviceRoleRecords = CASE_SERVICE_SEED_DATA.catalog_device_roles.map((role, index) => ({
        name: role,
        sort_order: index + 1,
        is_active: true,
      }));

      const { error: roleError, count } = await supabase
        .from('catalog_device_roles')
        .insert(deviceRoleRecords)
        .select();

      if (roleError) {
        details.push({
          tableName: 'catalog_device_roles',
          tableLabel: tableLabels.catalog_device_roles,
          status: 'error',
          beforeCount: 0,
          afterCount: 0,
          itemsInserted: 0,
        });
      } else {
        const itemsInserted = count || deviceRoleRecords.length;
        totalInserted += itemsInserted;
        details.push({
          tableName: 'catalog_device_roles',
          tableLabel: tableLabels.catalog_device_roles,
          status: 'seeded',
          beforeCount: 0,
          afterCount: itemsInserted,
          itemsInserted,
        });
      }
    } else {
      details.push({
        tableName: 'catalog_device_roles',
        tableLabel: tableLabels.catalog_device_roles,
        status: 'skipped',
        beforeCount: deviceRolesCount,
        afterCount: deviceRolesCount,
        itemsInserted: 0,
      });
    }

    const seededCount = details.filter(d => d.status === 'seeded').length;
    const skippedCount = details.filter(d => d.status === 'skipped').length;

    let message = '';
    if (seededCount > 0 && skippedCount > 0) {
      message = `Seeded ${seededCount} empty tables (${totalInserted} items). Skipped ${skippedCount} tables that already had data.`;
    } else if (seededCount > 0) {
      message = `Successfully seeded ${totalInserted} records across ${seededCount} Case & Service tables`;
    } else if (skippedCount > 0) {
      message = `All Case & Service tables already have data. No seeding needed.`;
    } else {
      message = 'No tables were seeded';
    }

    return {
      success: seededCount > 0,
      message,
      details,
    };
  } catch (error) {
    logger.error('Seeding error:', error);
    return {
      success: false,
      message: 'Failed to seed data',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function seedTemplates(): Promise<SeedResult> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return {
        success: false,
        message: 'User not authenticated',
      };
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .maybeSingle();
    if (!profile?.tenant_id) {
      return {
        success: false,
        message: 'No active tenant for the current user',
      };
    }

    const details: TableSeedResult[] = [];
    let totalInserted = 0;

    const documentTemplatesCount = await getTableCount('document_templates');

    if (documentTemplatesCount === 0) {
      for (const template of TEMPLATE_SEED_DATA.sampleTemplates) {
        const { data: templateType } = await supabase
          .from('master_template_types')
          .select('id')
          .eq('code', template.type_code)
          .maybeSingle();

        if (templateType) {
          const extras = template as { subject?: string; document_type?: string };
          const { error } = await supabase
            .from('document_templates')
            .insert({
              template_type_id: templateType.id,
              tenant_id: profile.tenant_id,
              name: template.name,
              content: template.content,
              subject_line: extras.subject || null,
              document_type: extras.document_type || null,
              is_default: template.is_default,
              is_active: true,
              created_by: user.id,
            });

          if (error) {
            logger.error(`Error seeding template ${template.name}:`, error);
          } else {
            totalInserted++;
          }
        }
      }

      details.push({
        tableName: 'document_templates',
        tableLabel: 'Document Templates',
        status: totalInserted > 0 ? 'seeded' : 'error',
        beforeCount: 0,
        afterCount: totalInserted,
        itemsInserted: totalInserted,
      });
    } else {
      details.push({
        tableName: 'document_templates',
        tableLabel: 'Document Templates',
        status: 'skipped',
        beforeCount: documentTemplatesCount,
        afterCount: documentTemplatesCount,
        itemsInserted: 0,
      });
    }

    const message = totalInserted > 0
      ? `Successfully seeded ${totalInserted} document templates`
      : 'Document templates already exist. No seeding needed.';

    return {
      success: totalInserted > 0,
      message,
      details,
    };
  } catch (error) {
    logger.error('Template seeding error:', error);
    return {
      success: false,
      message: 'Failed to seed templates',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function checkIfSeededTemplates(): Promise<boolean> {
  try {
    const count = await getTableCount('document_templates');
    return count > 0;
  } catch (error) {
    logger.error('Error checking template seed status:', error);
    return false;
  }
}

export async function getSeedStatistics() {
  try {
    const tables = [
      'catalog_device_types',
      'catalog_device_brands',
      'catalog_device_capacities',
      'catalog_accessories',
      'catalog_device_interfaces',
      'catalog_device_made_in',
      'catalog_device_encryption',
      'catalog_device_platter_counts',
      'catalog_device_head_counts',
      'inventory_locations',
    ];

    const counts: Record<string, number> = {};

    for (const table of tables) {
      const { count, error } = await (supabase as never as { from: (t: string) => { select: (s: string, o: { count: 'exact'; head: true }) => Promise<{ count: number | null; error: unknown }> } })
        .from(table)
        .select('*', { count: 'exact', head: true });

      if (!error) {
        counts[table] = count || 0;
      }
    }

    return counts;
  } catch (error) {
    logger.error('Error getting seed statistics:', error);
    return {};
  }
}
