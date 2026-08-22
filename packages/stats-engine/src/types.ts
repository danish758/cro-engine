export type VariantStats = {
  variantKey: string;
  visitors: number; // unique exposures
  conversions: number; // unique converting users
};

export type SignificanceResult = {
  variantKey: string;
  conversionRate: number;
  relativeLift: number | null; // vs. control, null if this IS the control
  pValue: number | null; // null if this IS the control
  isSignificant: boolean; // p < 0.05 against control
  confidenceIntervalLower: number;
  confidenceIntervalUpper: number;
};
