/* Canadian Realtor Expense Tracker — Central Config
 * Edit this file to adjust categories, deductible defaults, provinces, etc.
 * No components need to be rewritten to add/remove a category or subcategory.
 */
'use strict';

const REALTOR_CONFIG = {

  /* ── Expense Categories & Subcategories ──────────────────────────── */
  categories: {
    'Vehicle': [
      'Fuel', 'Maintenance', 'Insurance', 'Registration', 'Parking',
      'Tolls', 'Car Wash', 'Lease Payments', 'Vehicle Interest',
    ],
    'Marketing': [
      'Online Advertising', 'Print Advertising', 'Signage', 'Photography',
      'Videography', 'Website', 'SEO', 'Social Media Ads', 'Direct Mail',
      'Open House Marketing',
    ],
    'Professional': [
      'Brokerage Fees', 'MLS Fees', 'Real Estate Board Dues', 'Association Dues',
      'Licensing Fees', 'Continuing Education', 'Accounting Fees', 'Legal Fees',
      'Insurance / E&O',
    ],
    'Technology': [
      'CRM', 'Software Subscriptions', 'Mobile Phone', 'Internet',
      'Computer Equipment', 'Cloud Storage', 'Email Tools', 'Lead Generation Tools',
    ],
    'Office': [
      'Office Supplies', 'Printing', 'Postage', 'Home Office Expenses',
      'Desk Fees', 'Furniture', 'Utilities - Business Portion',
    ],
    'Travel': [
      'Airfare', 'Hotels', 'Transportation', 'Meals',
      'Conferences', 'Parking While Traveling',
    ],
    'Client Relations': [
      'Client Meals', 'Client Gifts', 'Closing Gifts', 'Client Events', 'Referral Gifts',
    ],
    'Capital Assets': [
      'Computers', 'Cameras', 'Furniture', 'Vehicle Purchases',
      'Office Equipment', 'Other Depreciable Assets',
    ],
  },

  /* ── Default Deductible Percentage by Category / Subcategory ──────── */
  // 50% rule applies to meals and entertainment per CRA guidelines.
  // All others default to 100%. User can override manually.
  defaultDeductiblePct(category, subcategory) {
    const mealKeys = new Set([
      'Travel|Meals',
      'Client Relations|Client Meals',
      'Client Relations|Client Events',
    ]);
    const key = `${category}|${subcategory}`;
    return mealKeys.has(key) ? 50 : 100;
  },

  /* ── Flat Category List (used for backend validation) ──────────────── */
  mainCategories: [
    'Vehicle', 'Marketing', 'Professional', 'Technology',
    'Office', 'Travel', 'Client Relations', 'Capital Assets',
  ],

  /* ── Whether a category is a Capital Asset ─────────────────────────── */
  isCapitalAsset(category) {
    return category === 'Capital Assets';
  },

  /* ── Whether a category shows Vehicle KM fields ────────────────────── */
  isVehicle(category) {
    return category === 'Vehicle';
  },

  /* ── Canadian Provinces & Territories ──────────────────────────────── */
  provinces: [
    { code: 'AB', name: 'Alberta',                 gstHstLabel: 'GST (5%)',      pstQstLabel: '' },
    { code: 'BC', name: 'British Columbia',        gstHstLabel: 'GST (5%)',      pstQstLabel: 'PST (7%)' },
    { code: 'MB', name: 'Manitoba',                gstHstLabel: 'GST (5%)',      pstQstLabel: 'PST (7%)' },
    { code: 'NB', name: 'New Brunswick',           gstHstLabel: 'HST (15%)',     pstQstLabel: '' },
    { code: 'NL', name: 'Newfoundland & Labrador', gstHstLabel: 'HST (15%)',     pstQstLabel: '' },
    { code: 'NS', name: 'Nova Scotia',             gstHstLabel: 'HST (15%)',     pstQstLabel: '' },
    { code: 'NT', name: 'Northwest Territories',   gstHstLabel: 'GST (5%)',      pstQstLabel: '' },
    { code: 'NU', name: 'Nunavut',                 gstHstLabel: 'GST (5%)',      pstQstLabel: '' },
    { code: 'ON', name: 'Ontario',                 gstHstLabel: 'HST (13%)',     pstQstLabel: '' },
    { code: 'PE', name: 'Prince Edward Island',    gstHstLabel: 'HST (15%)',     pstQstLabel: '' },
    { code: 'QC', name: 'Quebec',                  gstHstLabel: 'GST (5%)',      pstQstLabel: 'QST (9.975%)' },
    { code: 'SK', name: 'Saskatchewan',            gstHstLabel: 'GST (5%)',      pstQstLabel: 'PST (6%)' },
    { code: 'YT', name: 'Yukon',                   gstHstLabel: 'GST (5%)',      pstQstLabel: '' },
  ],

  /* ── Payment Methods ────────────────────────────────────────────────── */
  paymentMethods: [
    'Credit Card', 'Debit Card', 'Cash', 'E-Transfer', 'Cheque', 'Bank Transfer', 'Other',
  ],

  /* ── CCA Classes (Capital Cost Allowance) ───────────────────────────── */
  // For reference only — CCA calculations should be confirmed with an accountant.
  ccaClasses: [
    { cls: 'Class 8',    rate: '20%',    desc: 'Misc. tools, equipment, some furniture' },
    { cls: 'Class 10',   rate: '30%',    desc: 'Automotive vehicles & equipment' },
    { cls: 'Class 10.1', rate: '30%',    desc: 'Passenger vehicles over $36,000 (2023+)' },
    { cls: 'Class 12',   rate: '100%',   desc: 'Software, tools < $500' },
    { cls: 'Class 50',   rate: '55%',    desc: 'Computers & data handling equipment' },
    { cls: 'Class 55',   rate: '45%',    desc: 'Zero-emission passenger vehicles' },
    { cls: 'Other',      rate: 'Varies', desc: 'Confirm correct class with your accountant' },
  ],

  /* ── Helper text snippets ───────────────────────────────────────────── */
  helperText: {
    gstHst:         'GST/HST may be claimable as an Input Tax Credit (ITC) if you are GST/HST registered.',
    meals:          'Meals & entertainment are commonly limited to 50% deductibility per CRA rules.',
    vehicle:        'Vehicle expenses should be prorated by business-use kilometres.',
    capitalAsset:   'Capital assets may need to be handled through CCA (Capital Cost Allowance) by your accountant.',
    disclaimer:     'This tool is for expense organization only and is not tax, legal, or accounting advice. Confirm deductions with a qualified Canadian tax professional.',
  },
};

window.REALTOR_CONFIG = REALTOR_CONFIG;
