export const printReceipt = (caseId: string, _caseNumber: string): void => {
  const printUrl = `/print/receipt/${caseId}`;
  window.open(printUrl, '_blank');
};

export const printLabel = (caseId: string, _caseNumber: string): void => {
  const printUrl = `/print/label/${caseId}`;
  window.open(printUrl, '_blank');
};

/** Customer check-in copy — the intake form the customer signs/keeps. */
export const printCustomerCopy = (caseId: string, _caseNumber: string): void => {
  const printUrl = `/print/customer-copy/${caseId}`;
  window.open(printUrl, '_blank');
};
