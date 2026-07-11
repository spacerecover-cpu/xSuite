export const DEVICE_INVENTORY_SEED_DATA = {
  catalog_device_types: [
    '2.5" HDD',
    '3.5" HDD',
    '2.5" SSD',
    'M.2 SSD',
    'NVMe SSD',
    'USB Drive',
    'SD Card',
    'MicroSD Card',
    'CF Card',
    'Memory Stick',
    'Mobile Phone',
    'Tablet',
    'RAID Array',
    'NAS Device',
    'Server',
    'DVR/Camera',
    'SSD External',
    'Hybrid Drive',
  ],

  catalog_device_brands: [
    'Seagate',
    'Western Digital',
    'Toshiba',
    'Hitachi',
    'Samsung',
    'Kingston',
    'SanDisk',
    'Crucial',
    'Intel',
    'Micron',
    'Transcend',
    'ADATA',
    'Corsair',
    'G.Skill',
    'Apple',
    'Dell',
    'HP',
    'Lenovo',
    'QNAP',
    'Synology',
    'Buffalo',
    'LaCie',
    'Maxtor',
    'Quantum',
  ],

  catalog_device_capacities: [
    '1.44MB',
    '720KB',
    '100MB',
    '250MB',
    '500MB',
    '1GB',
    '2GB',
    '4GB',
    '8GB',
    '10GB',
    '16GB',
    '20GB',
    '32GB',
    '40GB',
    '60GB',
    '64GB',
    '80GB',
    '100GB',
    '120GB',
    '128GB',
    '160GB',
    '180GB',
    '200GB',
    '250GB',
    '256GB',
    '320GB',
    '400GB',
    '480GB',
    '500GB',
    '512GB',
    '640GB',
    '750GB',
    '1TB',
    '1.5TB',
    '2TB',
    '2.5TB',
    '3TB',
    '3.5TB',
    '4TB',
    '5TB',
    '6TB',
    '7TB',
    '8TB',
    '10TB',
    '12TB',
    '14TB',
    '16TB',
    '18TB',
    '20TB',
    '22TB',
    '24TB',
    '26TB',
    '28TB',
    '30TB',
    '32TB',
  ],

  catalog_accessories: [
    'Power Cable',
    'USB Cable',
    'USB-C Cable',
    'Micro USB Cable',
    'SATA Cable',
    'SATA to USB Adapter',
    'IDE to USB Adapter',
    'External Enclosure',
    'Protective Case',
    'Anti-Static Bag',
    'Card Reader',
    'SIM Card',
    'Memory Card Adapter',
    'PCIe Adapter Card',
    'M.2 Enclosure',
    'Docking Station',
    'Power Adapter',
    'Thunderbolt Cable',
  ],

  catalog_interfaces: [
    'SATA I (1.5 Gb/s)',
    'SATA II (3 Gb/s)',
    'SATA III (6 Gb/s)',
    'IDE/PATA',
    'SCSI',
    'SAS',
    'USB 2.0',
    'USB 3.0',
    'USB 3.1',
    'USB 3.2',
    'USB-C',
    'Thunderbolt',
    'Thunderbolt 2',
    'Thunderbolt 3',
    'Thunderbolt 4',
    'PCIe x1',
    'PCIe x4',
    'PCIe x8',
    'PCIe x16',
    'M.2 SATA',
    'M.2 NVMe',
    'mSATA',
    'eSATA',
    'FireWire 400',
    'FireWire 800',
    'SD',
    'MicroSD',
    'CF',
    'Lightning',
    'Ethernet (RJ45)',
  ],

  catalog_device_made_in: [
    'China',
    'Thailand',
    'Malaysia',
    'Philippines',
    'Taiwan',
    'South Korea',
    'Japan',
    'USA',
    'Mexico',
    'Germany',
    'Singapore',
    'Vietnam',
    'India',
    'Indonesia',
    'Czech Republic',
    'Unknown',
  ],

  catalog_device_encryption: [
    'None',
    'AES 128-bit',
    'AES 256-bit',
    'Hardware Encrypted',
    'BitLocker',
    'FileVault',
    'FileVault 2',
    'VeraCrypt',
    'TrueCrypt',
    'LUKS',
    'dm-crypt',
    'Self-Encrypting Drive (SED)',
    'TCG Opal',
    'eDrive',
    'Secure Erase',
    'Password Protected',
    'PIN Protected',
    'Biometric Protected',
  ],

  catalog_device_platter_counts: [
    '0',
    '1',
    '2',
    '3',
    '4',
    '5',
    '6',
    '7',
    '8',
  ],

  catalog_device_head_counts: [
    '0',
    '1',
    '2',
    '4',
    '6',
    '8',
    '10',
    '12',
    '14',
    '16',
  ],

  inventory_locations: [
    'Main Lab - Workstation 1',
    'Main Lab - Workstation 2',
    'Main Lab - Workstation 3',
    'Main Lab - Workstation 4',
    'Clean Room - Class 100',
    'Clean Room - Class 10',
    'Storage Room A - Shelf 1',
    'Storage Room A - Shelf 2',
    'Storage Room B - Shelf 1',
    'Storage Room B - Shelf 2',
    'Secure Storage - Vault 1',
    'Secure Storage - Vault 2',
    'Customer Return Area',
    'Intake Counter',
    'Quality Control Station',
    'Quarantine Area',
    'Failed Recovery Storage',
    'Parts Inventory',
    'Tools Storage',
    'Shipping & Receiving',
  ],

  master_inventory_categories: [
    'Hard Drives',
    'SSDs',
    'PCB',
    'Tools',
    'Parts',
    'Supplies',
    'Other',
    'Donor Drives',
    'Head Assemblies',
    'Motors',
  ],
};

export const CLIENT_FINANCIAL_SEED_DATA = {
  customer_groups: [
    'Walk-In Individual',
    'Corporate / Business',
    'IT Service Provider',
    'Managed Service Provider (MSP)',
    'Computer Repair Shop',
    'Law Firm / Legal',
    'Accounting / Financial',
    'Medical / Healthcare',
    'Government / Military',
    'Education / University',
    'Insurance Claim',
    'Forensic / Law Enforcement',
    'Dealer - Bronze',
    'Dealer - Silver',
    'Dealer - Gold',
    'Dealer - Platinum',
    'VIP / Priority',
    'Non-Profit / NGO',
    'Enterprise',
  ],

  master_industries: [
    'Data Recovery Services',
    'Information Technology',
    'Healthcare & Medical',
    'Finance & Banking',
    'Legal & Law Firms',
    'Education & Training',
    'Government & Public Sector',
    'Insurance',
    'Real Estate',
    'Manufacturing',
    'Retail & E-commerce',
    'Media & Entertainment',
    'Telecommunications',
    'Transportation & Logistics',
    'Energy & Utilities',
    'Construction & Engineering',
    'Hospitality & Tourism',
    'Professional Services',
    'Non-Profit Organizations',
    'Agriculture',
    'Automotive',
    'Aviation & Aerospace',
    'Biotechnology',
    'Chemical Industry',
    'Defense & Security',
    'Environmental Services',
    'Food & Beverage',
    'Gaming',
    'Mining',
    'Pharmaceutical',
    'Research & Development',
    'Sports & Recreation',
  ],

  geo_countries: [
    { name: 'United Arab Emirates', code: 'AE' },
    { name: 'Oman', code: 'OM' },
    { name: 'Saudi Arabia', code: 'SA' },
    { name: 'Kuwait', code: 'KW' },
    { name: 'Bahrain', code: 'BH' },
    { name: 'Qatar', code: 'QA' },
    { name: 'United States', code: 'US' },
    { name: 'United Kingdom', code: 'GB' },
    { name: 'Canada', code: 'CA' },
    { name: 'Australia', code: 'AU' },
    { name: 'Germany', code: 'DE' },
    { name: 'France', code: 'FR' },
    { name: 'Italy', code: 'IT' },
    { name: 'Spain', code: 'ES' },
    { name: 'Netherlands', code: 'NL' },
    { name: 'Belgium', code: 'BE' },
    { name: 'Switzerland', code: 'CH' },
    { name: 'Austria', code: 'AT' },
    { name: 'Sweden', code: 'SE' },
    { name: 'Norway', code: 'NO' },
    { name: 'Denmark', code: 'DK' },
    { name: 'Finland', code: 'FI' },
    { name: 'Poland', code: 'PL' },
    { name: 'Czech Republic', code: 'CZ' },
    { name: 'Portugal', code: 'PT' },
    { name: 'Ireland', code: 'IE' },
    { name: 'Greece', code: 'GR' },
    { name: 'Turkey', code: 'TR' },
    { name: 'Russia', code: 'RU' },
    { name: 'China', code: 'CN' },
    { name: 'Japan', code: 'JP' },
    { name: 'South Korea', code: 'KR' },
    { name: 'India', code: 'IN' },
    { name: 'Singapore', code: 'SG' },
    { name: 'Malaysia', code: 'MY' },
    { name: 'Thailand', code: 'TH' },
    { name: 'Indonesia', code: 'ID' },
    { name: 'Philippines', code: 'PH' },
    { name: 'Vietnam', code: 'VN' },
    { name: 'Hong Kong', code: 'HK' },
    { name: 'Taiwan', code: 'TW' },
    { name: 'Pakistan', code: 'PK' },
    { name: 'Bangladesh', code: 'BD' },
    { name: 'Egypt', code: 'EG' },
    { name: 'South Africa', code: 'ZA' },
    { name: 'Nigeria', code: 'NG' },
    { name: 'Kenya', code: 'KE' },
    { name: 'Morocco', code: 'MA' },
    { name: 'Jordan', code: 'JO' },
    { name: 'Lebanon', code: 'LB' },
    { name: 'Israel', code: 'IL' },
    { name: 'Brazil', code: 'BR' },
    { name: 'Mexico', code: 'MX' },
    { name: 'Argentina', code: 'AR' },
    { name: 'Chile', code: 'CL' },
    { name: 'Colombia', code: 'CO' },
    { name: 'Peru', code: 'PE' },
    { name: 'New Zealand', code: 'NZ' },
  ],

  geo_cities: [
    'Muscat',
    'Salalah',
    'Sohar',
    'Nizwa',
    'Sur',
    'Dubai',
    'Abu Dhabi',
    'Sharjah',
    'Ajman',
    'Fujairah',
    'Riyadh',
    'Jeddah',
    'Dammam',
    'Mecca',
    'Medina',
    'Kuwait City',
    'Manama',
    'Doha',
    'London',
    'Manchester',
    'Birmingham',
    'Edinburgh',
    'New York',
    'Los Angeles',
    'Chicago',
    'Houston',
    'Miami',
    'San Francisco',
    'Seattle',
    'Boston',
    'Toronto',
    'Vancouver',
    'Montreal',
    'Calgary',
    'Sydney',
    'Melbourne',
    'Brisbane',
    'Perth',
    'Berlin',
    'Munich',
    'Frankfurt',
    'Hamburg',
    'Paris',
    'Lyon',
    'Marseille',
    'Rome',
    'Milan',
    'Madrid',
    'Barcelona',
    'Amsterdam',
    'Brussels',
    'Zurich',
    'Geneva',
    'Vienna',
    'Stockholm',
    'Oslo',
    'Copenhagen',
    'Helsinki',
    'Warsaw',
    'Prague',
    'Lisbon',
    'Dublin',
    'Athens',
    'Istanbul',
    'Ankara',
    'Moscow',
    'St. Petersburg',
    'Beijing',
    'Shanghai',
    'Guangzhou',
    'Shenzhen',
    'Tokyo',
    'Osaka',
    'Seoul',
    'Mumbai',
    'Delhi',
    'Bangalore',
    'Hyderabad',
    'Chennai',
    'Singapore',
    'Kuala Lumpur',
    'Bangkok',
    'Jakarta',
    'Manila',
    'Ho Chi Minh City',
    'Hong Kong',
    'Taipei',
    'Karachi',
    'Lahore',
    'Dhaka',
    'Cairo',
    'Cape Town',
    'Johannesburg',
    'Lagos',
    'Nairobi',
    'Casablanca',
    'Amman',
    'Beirut',
    'Tel Aviv',
    'São Paulo',
    'Rio de Janeiro',
    'Mexico City',
    'Buenos Aires',
    'Santiago',
    'Bogotá',
    'Lima',
    'Auckland',
    'Wellington',
  ],

  master_expense_categories: [
    'Parts & Components',
    'Replacement Drives',
    'Clean Room Supplies',
    'Tools & Equipment',
    'Software Licenses',
    'Shipping & Courier',
    'Office Supplies',
    'Utilities',
    'Rent & Facilities',
    'Insurance',
    'Marketing & Advertising',
    'Professional Services',
    'Training & Certification',
    'Travel & Transportation',
    'Telecommunications',
    'IT Infrastructure',
    'Maintenance & Repairs',
    'Salaries & Wages',
    'Employee Benefits',
    'Taxes & Compliance',
    'Bank Fees',
    'Subscriptions',
    'Research & Development',
    'Quality Control',
    'Security Services',
  ],

  master_payment_methods: [
    'Cash',
    'Credit Card',
    'Debit Card',
    'Bank Transfer',
    'Wire Transfer',
    'PayPal',
    'Stripe',
    'Check',
    'Mobile Payment',
    'ACH Transfer',
    'Cryptocurrency',
    'Store Credit',
    'Invoice/Net Terms',
    'Purchase Order',
    'Direct Debit',
  ],

  master_quote_statuses: [
    { name: 'Draft', color: '#94a3b8' },
    { name: 'Pending Review', color: '#f59e0b' },
    { name: 'Sent to Client', color: '#3b82f6' },
    { name: 'Follow-up Required', color: 'rgb(var(--color-accent))' },
    { name: 'Under Negotiation', color: '#06b6d4' },
    { name: 'Accepted', color: '#10b981' },
    { name: 'Declined', color: '#ef4444' },
    { name: 'Expired', color: '#6b7280' },
    { name: 'Converted to Job', color: '#059669' },
    { name: 'Cancelled', color: '#dc2626' },
  ],

  master_invoice_statuses: [
    { name: 'Draft', color: '#94a3b8' },
    { name: 'Pending Approval', color: '#f59e0b' },
    { name: 'Approved', color: '#3b82f6' },
    { name: 'Sent', color: '#0ea5e9' },
    { name: 'Viewed by Client', color: '#06b6d4' },
    { name: 'Partially Paid', color: 'rgb(var(--color-accent))' },
    { name: 'Paid', color: '#10b981' },
    { name: 'Overdue', color: '#dc2626' },
    { name: 'Payment Failed', color: '#ef4444' },
    { name: 'Refunded', color: '#f97316' },
    { name: 'Cancelled', color: '#6b7280' },
    { name: 'Written Off', color: '#64748b' },
  ],
};

export const CASE_SERVICE_SEED_DATA = {
  catalog_service_types: [
    { name: 'Data Recovery', estimatedDays: 5 },
    { name: 'Data Destruction', estimatedDays: 1 },
    { name: 'Forensic Analysis', estimatedDays: 10 },
    { name: 'IT Services', estimatedDays: 3 },
  ],

  catalog_service_problems: [
    'Hard Drive Not Detected',
    'Clicking/Grinding Noise',
    'Drive Not Spinning',
    'Deleted Files',
    'Formatted Drive',
    'Corrupted Partition',
    'Operating System Failure',
    'Bad Sectors',
    'File System Corruption',
    'Water Damage',
    'Fire Damage',
    'Physical Drop/Impact',
    'Power Surge Damage',
    'Electrical Short',
    'Logical Failure',
    'Mechanical Failure',
    'Head Crash',
    'Motor Failure',
    'PCB Failure',
    'Firmware Corruption',
    'SMART Errors',
    'Read/Write Errors',
    'Slow Performance',
    'Freezing/Hanging',
    'Blue Screen of Death',
    'Kernel Panic',
    'No Boot Device',
    'Missing Operating System',
    'Partition Table Error',
    'MBR/GPT Corruption',
    'RAID Array Failed',
    'RAID Degraded',
    'Multiple Drive Failure',
    'Controller Failure',
    'Virus/Malware Attack',
    'Ransomware Encryption',
    'Accidental Deletion',
    'Accidental Format',
    'Lost Partition',
    'Raw File System',
    'Access Denied',
    'Permission Errors',
    'Encryption Key Lost',
    'BitLocker Recovery',
    'FileVault Recovery',
    'Password Protected',
    'Unknown File System',
    'Cross-Platform Issue',
    'Database Corruption',
    'Email Database Corruption',
  ],

  master_case_priorities: [
    { name: 'Low', color: '#10b981', level: 1 },
    { name: 'Normal', color: '#3b82f6', level: 2 },
    { name: 'High', color: '#f59e0b', level: 3 },
  ],

  // Canonical case lifecycle (2026-07 standardization). `type` is the phase —
  // it MUST use the underscored vocabulary from src/lib/caseLifecycle.ts
  // (matches the live master_case_statuses rows and case_status_transitions
  // edges). Recovery outcome is data (cases.recovery_outcome), never a status.
  // Colors: one distinct 600–900-grade hue per status, grouped by lifecycle
  // type (intake=blues, diagnosis=cyan, qa=navy, quoting/waiting=warm,
  // approved=lime, recovery=teal, ready/delivered=greens, closed=slate/maroon,
  // cancelled=pink/red, no_solution=umber). Matches the live rows after the
  // distinct_case_status_colors migration — keep both in sync.
  master_case_statuses: [
    { name: 'Registered', type: 'intake', color: '#2563EB', sort_order: 10, is_default: true, customer_visible: true },
    { name: 'Device Received', type: 'intake', color: '#0369A1', sort_order: 20, is_default: false, customer_visible: true },
    { name: 'In Diagnosis', type: 'diagnosis', color: '#0E7490', sort_order: 30, is_default: false, customer_visible: true },
    { name: 'Preparing Quote', type: 'quoting', color: '#D97706', sort_order: 40, is_default: false, customer_visible: true },
    { name: 'Awaiting Customer Approval', type: 'awaiting_approval', color: '#C2410C', sort_order: 50, is_default: false, customer_visible: true },
    { name: 'Approved — In Queue', type: 'approved', color: '#4D7C0F', sort_order: 60, is_default: false, customer_visible: true },
    { name: 'Recovery in Progress', type: 'recovery', color: '#0F766E', sort_order: 70, is_default: false, customer_visible: true },
    { name: 'On Hold — Awaiting Parts', type: 'recovery', color: '#A16207', sort_order: 75, is_default: false, customer_visible: false },
    { name: 'Verification (QA)', type: 'qa', color: '#1E40AF', sort_order: 80, is_default: false, customer_visible: false },
    { name: 'Ready for Delivery', type: 'ready', color: '#15803D', sort_order: 90, is_default: false, customer_visible: true },
    { name: 'Data Delivered', type: 'delivered', color: '#065F46', sort_order: 100, is_default: false, customer_visible: true },
    { name: 'Closed — Device Returned', type: 'closed', color: '#334155', sort_order: 110, is_default: false, customer_visible: true },
    { name: 'Closed — Media Disposed', type: 'closed', color: '#7F1D1D', sort_order: 115, is_default: false, customer_visible: false },
    { name: 'Cancelled — Customer Declined', type: 'cancelled', color: '#BE185D', sort_order: 120, is_default: false, customer_visible: true },
    { name: 'Cancelled — Unrecoverable', type: 'cancelled', color: '#B91C1C', sort_order: 125, is_default: false, customer_visible: true },
    { name: 'No Solution — Future Follow-up', type: 'no_solution', color: '#78350F', sort_order: 130, is_default: false, customer_visible: true },
  ],

  // Structured reasons a case is parked as No Solution — Future Follow-up
  // (global master data; matches master_case_no_solution_reasons).
  master_case_no_solution_reasons: [
    { code: 'unsupported_firmware',   name: 'Unsupported Firmware / Family',    description: 'Drive firmware or family not yet supported by available tools', sort_order: 10 },
    { code: 'unsupported_controller', name: 'Unsupported SSD/Flash Controller', description: 'SSD or flash memory controller not yet supported',              sort_order: 20 },
    { code: 'no_method',              name: 'No Recovery Method Available',      description: 'No known recovery method currently exists for this failure',    sort_order: 30 },
    { code: 'severe_media_damage',    name: 'Severe Media Damage',              description: 'Physical media damage beyond current recovery capability',       sort_order: 40 },
    { code: 'tool_unavailable',       name: 'Required Tool/Donor Unavailable',  description: 'Required tool, donor part, or resource not currently available', sort_order: 50 },
    { code: 'other',                  name: 'Other (see notes)',                description: 'Other reason — see case notes',                                 sort_order: 90 },
  ],

  // The phase transition matrix (mirrors the live case_status_transitions
  // rows, incl. the no_solution edges). requires[] carries ONLY tokens
  // transition_case_status enforces.
  case_status_transitions: [
    { from_phase: 'intake', to_phase: 'diagnosis', allowed_roles: ['technician', 'manager', 'admin', 'owner'], requires: [], sort_order: 10, description: 'Devices received and logged — begin assessment' },
    { from_phase: 'intake', to_phase: 'cancelled', allowed_roles: ['technician', 'manager', 'admin', 'owner'], requires: ['cancellation_reason'], sort_order: 15, description: 'Cancel before assessment' },
    { from_phase: 'diagnosis', to_phase: 'quoting', allowed_roles: ['technician', 'manager', 'admin', 'owner'], requires: [], sort_order: 20, description: 'Diagnosis complete — prepare the quote' },
    { from_phase: 'diagnosis', to_phase: 'cancelled', allowed_roles: ['technician', 'manager', 'admin', 'owner'], requires: ['cancellation_reason'], sort_order: 25, description: 'Cancel during diagnosis' },
    { from_phase: 'quoting', to_phase: 'awaiting_approval', allowed_roles: ['technician', 'manager', 'admin', 'owner'], requires: [], sort_order: 30, description: 'Quote sent to the customer' },
    { from_phase: 'quoting', to_phase: 'cancelled', allowed_roles: ['technician', 'manager', 'admin', 'owner'], requires: ['cancellation_reason'], sort_order: 35, description: 'Cancel during quoting' },
    { from_phase: 'awaiting_approval', to_phase: 'approved', allowed_roles: ['technician', 'manager', 'admin', 'owner'], requires: [], sort_order: 40, description: 'Customer approved the quote' },
    { from_phase: 'awaiting_approval', to_phase: 'quoting', allowed_roles: ['technician', 'manager', 'admin', 'owner'], requires: [], sort_order: 42, description: 'Revise the quote' },
    { from_phase: 'awaiting_approval', to_phase: 'cancelled', allowed_roles: ['technician', 'manager', 'admin', 'owner'], requires: ['cancellation_reason'], sort_order: 45, description: 'Customer declined the quote' },
    { from_phase: 'approved', to_phase: 'recovery', allowed_roles: ['technician', 'manager', 'admin', 'owner'], requires: [], sort_order: 50, description: 'Begin recovery work' },
    { from_phase: 'approved', to_phase: 'cancelled', allowed_roles: ['technician', 'manager', 'admin', 'owner'], requires: ['cancellation_reason'], sort_order: 55, description: 'Cancel before recovery starts' },
    { from_phase: 'recovery', to_phase: 'qa', allowed_roles: ['technician', 'manager', 'admin', 'owner'], requires: ['recovery_outcome'], sort_order: 60, description: 'Recovery attempt recorded — send to QA verification' },
    { from_phase: 'recovery', to_phase: 'ready', allowed_roles: ['technician', 'manager', 'admin', 'owner'], requires: ['recovery_outcome'], sort_order: 65, description: 'Recovery complete — prepare deliverables (skips QA)' },
    { from_phase: 'recovery', to_phase: 'cancelled', allowed_roles: ['technician', 'manager', 'admin', 'owner'], requires: ['cancellation_reason'], sort_order: 68, description: 'Unrecoverable, or the customer stopped the work' },
    { from_phase: 'qa', to_phase: 'ready', allowed_roles: ['technician', 'manager', 'admin', 'owner'], requires: ['qa_passed'], sort_order: 70, description: 'QA passed — prepare deliverables' },
    { from_phase: 'qa', to_phase: 'recovery', allowed_roles: ['technician', 'manager', 'admin', 'owner'], requires: [], sort_order: 72, description: 'QA failed — return to recovery for rework' },
    { from_phase: 'ready', to_phase: 'delivered', allowed_roles: ['technician', 'manager', 'admin', 'owner'], requires: [], sort_order: 80, description: 'Release recovered data to the customer' },
    { from_phase: 'delivered', to_phase: 'closed', allowed_roles: ['technician', 'manager', 'admin', 'owner'], requires: ['device_returned'], sort_order: 85, description: 'Devices returned — close the case' },
    { from_phase: 'cancelled', to_phase: 'closed', allowed_roles: ['technician', 'manager', 'admin', 'owner'], requires: ['device_returned'], sort_order: 88, description: 'Devices returned — close the cancelled case' },
    { from_phase: 'cancelled', to_phase: 'intake', allowed_roles: ['admin', 'owner'], requires: ['reopen_reason'], sort_order: 90, description: 'Reopen a cancelled case' },
    { from_phase: 'delivered', to_phase: 'recovery', allowed_roles: ['admin', 'owner'], requires: ['reopen_reason'], sort_order: 92, description: 'Reopen after delivery (rework)' },
    { from_phase: 'closed', to_phase: 'recovery', allowed_roles: ['admin', 'owner'], requires: ['reopen_reason'], sort_order: 94, description: 'Reopen a closed case (rework)' },
    { from_phase: 'recovery', to_phase: 'no_solution', allowed_roles: ['technician', 'manager', 'admin', 'owner'], requires: ['no_solution_reason'], sort_order: 66, description: 'No method available today — park for future follow-up (device returned)' },
    { from_phase: 'diagnosis', to_phase: 'no_solution', allowed_roles: ['technician', 'manager', 'admin', 'owner'], requires: ['no_solution_reason'], sort_order: 28, description: 'No method available today — park for future follow-up (device returned)' },
    { from_phase: 'no_solution', to_phase: 'recovery', allowed_roles: ['admin', 'owner'], requires: ['reopen_reason'], sort_order: 96, description: 'A recovery method is now available — resume recovery' },
    { from_phase: 'no_solution', to_phase: 'diagnosis', allowed_roles: ['admin', 'owner'], requires: ['reopen_reason'], sort_order: 97, description: 'Re-assess with new tooling' },
    { from_phase: 'no_solution', to_phase: 'closed', allowed_roles: ['technician', 'manager', 'admin', 'owner'], requires: [], sort_order: 98, description: 'Permanently close — customer no longer interested' },
  ],

  catalog_service_locations: [
    'On-Site - Client Location',
    'In-Lab - Standard Workstation',
    'In-Lab - Clean Room Class 100',
    'In-Lab - Clean Room Class 10',
    'In-Lab - Secure Room',
    'Remote - Online Service',
    'Pick-up Service',
    'Drop-off Service',
    'Courier Service',
    'Express Counter Service',
    'Mobile Service Unit',
    'Partner Lab - Domestic',
    'Partner Lab - International',
    'Forensic Lab',
    'Data Center - Local',
    'Data Center - Regional',
    'Emergency Service Location',
    'Client Office',
    'Client Data Center',
    'Third-Party Facility',
  ],

  catalog_device_conditions: [
    'Good - No Visible Damage',
    'Fair - Minor Scratches',
    'Fair - Minor Dents',
    'Poor - Significant Physical Damage',
    'Poor - Cracked Casing',
    'Poor - Broken Components',
    'Water Damaged - Dry',
    'Water Damaged - Wet',
    'Fire Damaged - Minor',
    'Fire Damaged - Severe',
    'Burnt/Melted Components',
    'Corroded Contacts',
    'Oxidation Present',
    'Label Missing',
    'Label Damaged',
    'Opened Previously',
    'Tampered',
    'Sealed - Unopened',
    'Warranty Seal Intact',
    'Warranty Seal Broken',
  ],

  catalog_device_roles: [
    'Patient',
    'Backup',
    'Donor',
    'Clone',
  ],
};

export const TEMPLATE_SEED_DATA = {
  sampleTemplates: [
    {
      type_code: 'quote_terms',
      name: 'Standard Terms',
      content: `<div class="terms-content">
<h3>Terms & Conditions</h3>
<p><strong>No Data – No Fee:</strong> You only pay if recovery is successful.</p>
<p><strong>Payment:</strong> 50% advance (security deposit) and 50% after verification.</p>
<p>Please make payable to: <strong>{{company.name}}</strong></p>
<p><strong>Refund:</strong> Advance refunded if recovery fails (VAT excluded).</p>
<p><strong>Partial Recovery:</strong> Invoice adjusted after analysis (not proportional).</p>
<p><strong>Accepted Payments:</strong> Cash, Card, Cheque & Bank Transfer.</p>
</div>`,
      is_default: true,
    },
    {
      type_code: 'quote_terms',
      name: 'Non-Refundable Advance',
      content: `<div class="terms-content">
<h3>Terms & Conditions</h3>
<p><strong style="color: #dc2626;">Non-refundable advance due to case complexity and costly donor.</strong></p>
<p><strong>Payment:</strong> 50% advance (security deposit) & 50% after verification.</p>
<p>Payable to: <strong>{{company.name}}</strong></p>
<p><strong>Refund:</strong> If recovery fails, deposit refunded <strong>minus non-refundable amount</strong>.</p>
<p><strong>Partial Recovery:</strong> Invoice revised after analysis (not proportional).</p>
<p>Payments accepted: Cash, Card, Cheque, Bank Transfer.</p>
</div>`,
      is_default: false,
    },
    {
      type_code: 'invoice_terms',
      name: 'Standard Payment Terms',
      content: `<div class="payment-terms">
<h3>Payment Terms</h3>
<p><strong>Due Date:</strong> Payment due within {{invoice.due_days}} days</p>
<p><strong>Payment Methods:</strong> Bank Transfer, Cash, Card</p>
<p><strong>Bank Details:</strong></p>
<ul>
<li>Account Name: {{company.bank_account_name}}</li>
<li>Account Number: {{company.bank_account_number}}</li>
<li>Bank: {{company.bank_name}}</li>
</ul>
<p><strong>Late Payment:</strong> Interest may apply after due date</p>
</div>`,
      is_default: true,
    },
    {
      type_code: 'email',
      name: 'Quote Sent',
      document_type: 'quote',
      subject: 'Quote {{quote.number}} - {{company.name}}',
      content: `<p>Dear {{customer.name}},</p>

<p>Thank you for choosing {{company.name}} for your data recovery needs.</p>

<p>Please find attached quote <strong>{{quote.number}}</strong> for the recovery of your {{device.type}}.</p>

<p><strong>Quote Summary:</strong></p>
<ul>
<li>Device: {{device.brand}} {{device.type}}</li>
<li>Problem: {{device.problem}}</li>
<li>Estimated Time: {{service.estimated_days}} days</li>
<li>Total Amount: {{quote.total}} {{company.currency}}</li>
</ul>

<p>This quote is valid for {{quote.validity_days}} days from the date of issue.</p>

<p>If you have any questions or would like to proceed, please contact us.</p>

<p>Best regards,<br>
{{company.name}}<br>
{{company.phone}}<br>
{{company.email}}</p>`,
      is_default: true,
    },
    {
      type_code: 'email',
      name: 'Case Status Update',
      subject: 'Case {{case.number}} Status Update',
      content: `<p>Dear {{customer.name}},</p>

<p>We're writing to update you on the status of your case <strong>{{case.number}}</strong>.</p>

<p><strong>Current Status:</strong> {{case.status}}</p>

<p><strong>Update:</strong><br>
{{case.status_notes}}</p>

<p>If you have any questions, please don't hesitate to contact us.</p>

<p>Best regards,<br>
{{technician.name}}<br>
{{company.name}}<br>
{{company.phone}}</p>`,
      is_default: true,
    },
    {
      type_code: 'email',
      name: 'Office Receipt Email',
      document_type: 'office_receipt',
      subject: 'Office Receipt - Case #{{case.number}}',
      content: `Dear {{customer.name}},

Please find attached the Office Receipt for your case.

Case Reference: #{{case.number}}

This document confirms the receipt of your device(s) at our facility. Please keep this for your records.

If you have any questions, please don't hesitate to contact us.

Best regards,
{{company.name}} Team`,
      is_default: true,
    },
    {
      type_code: 'email',
      name: 'Customer Copy Email',
      document_type: 'customer_copy',
      subject: 'Device Receipt - Case #{{case.number}}',
      content: `Dear {{customer.name}},

Please find attached the Customer Copy receipt for your case.

Case Reference: #{{case.number}}

This document provides a summary of your device(s) and case details. Please review and keep this for your records.

If you have any questions or concerns, please don't hesitate to reach out.

Best regards,
{{company.name}} Team`,
      is_default: true,
    },
    {
      type_code: 'email',
      name: 'Checkout Confirmation Email',
      document_type: 'checkout_form',
      subject: 'Device Checkout Confirmation - Case #{{case.number}}',
      content: `Dear {{customer.name}},

Please find attached the Checkout Confirmation for your case.

Case Reference: #{{case.number}}

This document confirms the collection of your device(s) from our facility. Please keep this for your records.

Thank you for choosing our services.

Best regards,
{{company.name}} Team`,
      is_default: true,
    },
    {
      type_code: 'email',
      name: 'Case Label Email',
      document_type: 'case_label',
      subject: 'Case Label - #{{case.number}}',
      content: `Dear {{customer.name}},

Please find attached the Case Label for your reference.

Case Reference: #{{case.number}}

Best regards,
{{company.name}} Team`,
      is_default: true,
    },
    {
      type_code: 'email',
      name: 'Chain of Custody Email',
      document_type: 'chain_of_custody',
      subject: 'Chain of Custody - Case #{{case.number}}',
      content: `Dear {{customer.name}},

Please find attached the Chain of Custody document for your case.

Case Reference: #{{case.number}}

Best regards,
{{company.name}} Team`,
      is_default: true,
    },
    {
      type_code: 'email',
      name: 'Invoice Email',
      document_type: 'invoice',
      subject: 'Invoice {{invoice.number}} - {{company.name}}',
      content: `Dear {{customer.name}},

Please find attached invoice {{invoice.number}}.

Amount due: {{invoice.total}}
Due date: {{invoice.due_date}}

If you have any questions about this invoice, please contact us.

Best regards,
{{company.name}} Team`,
      is_default: true,
    },
    {
      type_code: 'email',
      name: 'Payment Receipt Email',
      document_type: 'payment_receipt',
      subject: 'Payment Receipt - Case #{{case.number}}',
      content: `Dear {{customer.name}},

Please find attached your payment receipt.

Thank you for your payment.

Best regards,
{{company.name}} Team`,
      is_default: true,
    },
    {
      type_code: 'email',
      name: 'Payslip Email',
      document_type: 'payslip',
      subject: 'Payslip - {{company.name}}',
      content: `Dear {{customer.name}},

Please find attached your payslip.

Best regards,
{{company.name}} Team`,
      is_default: true,
    },
    {
      type_code: 'sms',
      name: 'Case Received',
      content: 'Your device has been received. Case #{{case.number}}. We will contact you with updates. {{company.name}}',
      is_default: true,
    },
    {
      type_code: 'sms',
      name: 'Ready for Pickup',
      content: 'Good news! Your data recovery is complete. Case #{{case.number}} is ready for pickup. Please call {{company.phone}} to arrange collection. {{company.name}}',
      is_default: true,
    },
    {
      type_code: 'whatsapp',
      name: 'Quote Ready',
      content: `Hello {{customer.name}},

Your quote for Case #{{case.number}} is ready.

Device: {{device.type}}
Amount: {{quote.total}} {{company.currency}}
Valid until: {{quote.expiry_date}}

Reply YES to approve or call us with any questions.

{{company.name}}
{{company.phone}}`,
      is_default: true,
    },
    {
      type_code: 'service_report',
      name: 'Standard Recovery Report',
      content: `<div class="report-header">
<h2>Data Recovery Service Report</h2>
<p>Case Number: {{case.number}}</p>
<p>Date: {{report.date}}</p>
</div>

<div class="device-info">
<h3>Device Information</h3>
<table>
<tr><td>Device Type:</td><td>{{device.type}}</td></tr>
<tr><td>Brand:</td><td>{{device.brand}}</td></tr>
<tr><td>Model:</td><td>{{device.model}}</td></tr>
<tr><td>Serial Number:</td><td>{{device.serial}}</td></tr>
<tr><td>Capacity:</td><td>{{device.capacity}}</td></tr>
<tr><td>Condition:</td><td>{{device.condition}}</td></tr>
</table>
</div>

<div class="recovery-details">
<h3>Recovery Details</h3>
<p><strong>Problem Reported:</strong> {{case.problem}}</p>
<p><strong>Diagnosis:</strong> {{case.diagnosis}}</p>
<p><strong>Recovery Method:</strong> {{case.recovery_method}}</p>
<p><strong>Success Rate:</strong> {{case.success_rate}}%</p>
</div>

<div class="data-recovered">
<h3>Data Recovered</h3>
<p><strong>Total Size:</strong> {{recovery.total_size}}</p>
<p><strong>File Count:</strong> {{recovery.file_count}}</p>
<p><strong>File Types:</strong> {{recovery.file_types}}</p>
</div>

<div class="recommendations">
<h3>Recommendations</h3>
<p>{{report.recommendations}}</p>
</div>`,
      is_default: true,
    },
    {
      type_code: 'diagnostic_findings',
      name: 'Initial Assessment',
      content: `<div class="diagnostic-report">
<h2>Diagnostic Findings</h2>

<div class="device-assessment">
<h3>Device Received</h3>
<p><strong>Date Received:</strong> {{case.received_date}}</p>
<p><strong>Device:</strong> {{device.brand}} {{device.type}}</p>
<p><strong>Serial Number:</strong> {{device.serial}}</p>
<p><strong>Condition:</strong> {{device.condition}}</p>
</div>

<div class="problem-analysis">
<h3>Problem Analysis</h3>
<p><strong>Issue Reported:</strong> {{case.problem}}</p>
<p><strong>Symptoms:</strong> {{diagnosis.symptoms}}</p>
<p><strong>Initial Diagnosis:</strong> {{diagnosis.findings}}</p>
</div>

<div class="recovery-assessment">
<h3>Recovery Assessment</h3>
<p><strong>Complexity Level:</strong> {{diagnosis.complexity}}</p>
<p><strong>Estimated Success Rate:</strong> {{diagnosis.success_probability}}%</p>
<p><strong>Estimated Time:</strong> {{diagnosis.estimated_days}} days</p>
<p><strong>Recommended Action:</strong> {{diagnosis.recommendation}}</p>
</div>

<p><em>This is a preliminary assessment. Final results may vary based on detailed analysis.</em></p>
</div>`,
      is_default: true,
    },
  ],

  templateVariables: [
    { category: 'company', key: 'company.name', name: 'Company Name', sample: 'Future Space LLC' },
    { category: 'company', key: 'company.email', name: 'Company Email', sample: 'info@futurespace.om' },
    { category: 'company', key: 'company.phone', name: 'Company Phone', sample: '+968 1234 5678' },
    { category: 'company', key: 'company.address', name: 'Company Address', sample: 'Muscat, Oman' },
    { category: 'company', key: 'company.website', name: 'Company Website', sample: 'www.futurespace.om' },
    { category: 'company', key: 'company.currency', name: 'Currency', sample: 'USD' },

    { category: 'customer', key: 'customer.name', name: 'Customer Name', sample: 'Ahmed Al-Balushi' },
    { category: 'customer', key: 'customer.email', name: 'Customer Email', sample: 'ahmed@example.com' },
    { category: 'customer', key: 'customer.phone', name: 'Customer Phone', sample: '+968 9876 5432' },
    { category: 'customer', key: 'customer.company', name: 'Customer Company', sample: 'ABC Trading LLC' },

    { category: 'case', key: 'case.number', name: 'Case ID', sample: 'C-2025-000001' },
    { category: 'case', key: 'case.status', name: 'Case Status', sample: 'In Progress' },
    { category: 'case', key: 'case.priority', name: 'Priority', sample: 'High' },
    { category: 'case', key: 'case.problem', name: 'Problem Description', sample: 'Hard drive not detected' },
    { category: 'case', key: 'case.received_date', name: 'Date Received', sample: '15/11/2025' },

    { category: 'device', key: 'device.type', name: 'Device Type', sample: '2.5" HDD' },
    { category: 'device', key: 'device.brand', name: 'Brand', sample: 'Seagate' },
    { category: 'device', key: 'device.model', name: 'Model', sample: 'ST1000LM035' },
    { category: 'device', key: 'device.serial', name: 'Serial Number', sample: 'ABC123456' },
    { category: 'device', key: 'device.capacity', name: 'Capacity', sample: '1TB' },
    { category: 'device', key: 'device.condition', name: 'Condition', sample: 'Good - No Visible Damage' },

    { category: 'quote', key: 'quote.number', name: 'Quote Number', sample: 'QT-2025-00001' },
    { category: 'quote', key: 'quote.total', name: 'Quote Total', sample: '250.000' },
    { category: 'quote', key: 'quote.validity_days', name: 'Validity Days', sample: '30' },
    { category: 'quote', key: 'quote.expiry_date', name: 'Expiry Date', sample: '15/12/2025' },

    { category: 'invoice', key: 'invoice.number', name: 'Invoice Number', sample: 'INV-2025-00001' },
    { category: 'invoice', key: 'invoice.total', name: 'Invoice Total', sample: '250.000' },
    { category: 'invoice', key: 'invoice.due_date', name: 'Due Date', sample: '30/11/2025' },
    { category: 'invoice', key: 'invoice.due_days', name: 'Payment Terms Days', sample: '15' },

    { category: 'service', key: 'service.type', name: 'Service Type', sample: 'Data Recovery' },
    { category: 'service', key: 'service.estimated_days', name: 'Estimated Days', sample: '5' },
    { category: 'service', key: 'service.location', name: 'Service Location', sample: 'In-Lab - Clean Room' },

    { category: 'technician', key: 'technician.name', name: 'Technician Name', sample: 'Mohammed Al-Hinai' },
    { category: 'technician', key: 'technician.email', name: 'Technician Email', sample: 'tech@futurespace.om' },
  ],
};

export const STOCK_SEED_DATA = {
  categories: [
    { name: 'Consumables', category_type: 'internal', sort_order: 1 },
    { name: 'Anti-static Bags', category_type: 'internal', parent_name: 'Consumables', sort_order: 1 },
    { name: 'Labels & Stickers', category_type: 'internal', parent_name: 'Consumables', sort_order: 2 },
    { name: 'Packaging Materials', category_type: 'internal', parent_name: 'Consumables', sort_order: 3 },
    { name: 'Spare Parts', category_type: 'internal', sort_order: 2 },
    { name: 'PCB Components', category_type: 'internal', parent_name: 'Spare Parts', sort_order: 1 },
    { name: 'Head Assemblies', category_type: 'internal', parent_name: 'Spare Parts', sort_order: 2 },
    { name: 'Motors & Spindles', category_type: 'internal', parent_name: 'Spare Parts', sort_order: 3 },
    { name: 'Connectors & Cables', category_type: 'internal', parent_name: 'Spare Parts', sort_order: 4 },
    { name: 'Cleaning Supplies', category_type: 'internal', sort_order: 3 },
    { name: 'IPA & Solvents', category_type: 'internal', parent_name: 'Cleaning Supplies', sort_order: 1 },
    { name: 'Swabs & Wipes', category_type: 'internal', parent_name: 'Cleaning Supplies', sort_order: 2 },
    { name: 'Office Supplies', category_type: 'internal', sort_order: 4 },
    { name: 'External Hard Drives', category_type: 'saleable', sort_order: 1 },
    { name: 'Portable HDDs', category_type: 'saleable', parent_name: 'External Hard Drives', sort_order: 1 },
    { name: 'Desktop HDDs', category_type: 'saleable', parent_name: 'External Hard Drives', sort_order: 2 },
    { name: 'External SSDs', category_type: 'saleable', sort_order: 2 },
    { name: 'USB Flash Drives', category_type: 'saleable', sort_order: 3 },
    { name: 'Memory Cards', category_type: 'saleable', sort_order: 4 },
    { name: 'NAS Devices', category_type: 'saleable', sort_order: 5 },
    { name: 'Enclosures & Docks', category_type: 'saleable', sort_order: 6 },
  ],

  sampleBackupDevices: [
    {
      name: 'WD My Passport 1TB',
      brand: 'Western Digital',
      model: 'My Passport',
      capacity: '1TB',
      cost_price: 45,
      selling_price: 65,
      warranty_months: 24,
      item_type: 'saleable',
      unit_of_measure: 'pcs',
      reorder_level: 2,
      reorder_quantity: 5,
      quantity_on_hand: 10,
      is_featured: true,
    },
    {
      name: 'WD My Passport 2TB',
      brand: 'Western Digital',
      model: 'My Passport',
      capacity: '2TB',
      cost_price: 65,
      selling_price: 89,
      warranty_months: 24,
      item_type: 'saleable',
      unit_of_measure: 'pcs',
      reorder_level: 2,
      reorder_quantity: 5,
      quantity_on_hand: 8,
      is_featured: true,
    },
    {
      name: 'Seagate Backup Plus 1TB',
      brand: 'Seagate',
      model: 'Backup Plus',
      capacity: '1TB',
      cost_price: 42,
      selling_price: 59,
      warranty_months: 24,
      item_type: 'saleable',
      unit_of_measure: 'pcs',
      reorder_level: 2,
      reorder_quantity: 5,
      quantity_on_hand: 6,
      is_featured: false,
    },
    {
      name: 'Samsung T7 500GB',
      brand: 'Samsung',
      model: 'T7',
      capacity: '500GB',
      cost_price: 55,
      selling_price: 79,
      warranty_months: 36,
      item_type: 'saleable',
      unit_of_measure: 'pcs',
      reorder_level: 2,
      reorder_quantity: 3,
      quantity_on_hand: 5,
      is_featured: true,
    },
    {
      name: 'Samsung T7 1TB',
      brand: 'Samsung',
      model: 'T7',
      capacity: '1TB',
      cost_price: 85,
      selling_price: 119,
      warranty_months: 36,
      item_type: 'saleable',
      unit_of_measure: 'pcs',
      reorder_level: 2,
      reorder_quantity: 3,
      quantity_on_hand: 4,
      is_featured: true,
    },
    {
      name: 'SanDisk Extreme Pro 1TB',
      brand: 'SanDisk',
      model: 'Extreme Pro',
      capacity: '1TB',
      cost_price: 90,
      selling_price: 129,
      warranty_months: 60,
      item_type: 'saleable',
      unit_of_measure: 'pcs',
      reorder_level: 1,
      reorder_quantity: 3,
      quantity_on_hand: 3,
      is_featured: false,
    },
    {
      name: 'USB Drive 64GB',
      brand: 'SanDisk',
      model: 'Ultra',
      capacity: '64GB',
      cost_price: 8,
      selling_price: 15,
      warranty_months: 12,
      item_type: 'saleable',
      unit_of_measure: 'pcs',
      reorder_level: 5,
      reorder_quantity: 10,
      quantity_on_hand: 20,
      is_featured: false,
    },
    {
      name: 'USB Drive 128GB',
      brand: 'SanDisk',
      model: 'Ultra',
      capacity: '128GB',
      cost_price: 12,
      selling_price: 22,
      warranty_months: 12,
      item_type: 'saleable',
      unit_of_measure: 'pcs',
      reorder_level: 5,
      reorder_quantity: 10,
      quantity_on_hand: 15,
      is_featured: false,
    },
  ],

  internalSupplies: [
    {
      name: 'Anti-static Bags 6"x8"',
      brand: null,
      item_type: 'internal',
      unit_of_measure: 'pcs',
      cost_price: 0.15,
      quantity_on_hand: 200,
      reorder_level: 50,
      reorder_quantity: 200,
    },
    {
      name: 'IPA Isopropyl Alcohol 99.9% 1L',
      brand: null,
      item_type: 'internal',
      unit_of_measure: 'bottle',
      cost_price: 8,
      quantity_on_hand: 5,
      reorder_level: 2,
      reorder_quantity: 6,
    },
    {
      name: 'Foam-tipped Swabs',
      brand: null,
      item_type: 'internal',
      unit_of_measure: 'pack',
      cost_price: 5,
      quantity_on_hand: 10,
      reorder_level: 3,
      reorder_quantity: 10,
    },
    {
      name: 'Thermal Grease',
      brand: null,
      item_type: 'internal',
      unit_of_measure: 'tube',
      cost_price: 3,
      quantity_on_hand: 8,
      reorder_level: 2,
      reorder_quantity: 5,
    },
  ],
};
