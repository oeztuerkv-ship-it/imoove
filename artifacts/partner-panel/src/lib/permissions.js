export const canSee = (role, field) => {
  const matrix = {
    FAHRER: ['first_name', 'last_name', 'phone', 'pickup_address', 'dropoff_address', 'pickup_time', 'status', 'notes'],
    UNTERNEHMER: ['first_name', 'last_name', 'phone', 'pickup_address', 'dropoff_address', 'price', 'status', 'cost_center', 'billing_reference', 'audit_log', 'driver_data'],
    HOTEL: ['first_name', 'last_name', 'pickup_address', 'dropoff_address', 'pickup_time', 'status', 'price', 'cost_center', 'billing_reference', 'iban_own'],
    KRANKENKASSE: ['patient_id', 'pickup_address', 'dropoff_address', 'price', 'status', 'cost_center', 'billing_reference', 'audit_log', 'company_name'],
    BUCHHALTUNG: ['price', 'iban', 'billing_reference', 'cost_center', 'company_name', 'invoice_id'],
    ADMIN: ['*'] // Admin sieht alles, aber wir loggen es
  };

  if (matrix[role]?.includes('*')) return true;
  return matrix[role]?.includes(field) || false;
};

export const maskData = (role, field, value) => {
  if (canSee(role, field)) return value;
  return "********"; // Datenschutz-Schutzwall
};
