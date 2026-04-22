export const moduleCatalogAzForWorkspace = (fullCatalog, companyKind) => {
  if (!fullCatalog) return [];
  // Hier die einfache Logik: Hotels sehen kein "company_rides" etc.
  const forbiddenForHotel = ["company_rides", "recurring_rides"];
  
  if (companyKind === "hotel") {
    return fullCatalog.filter(m => !forbiddenForHotel.includes(m.id));
  }
  return fullCatalog;
};

export const matchesCompanyKindListTab = (item, tab) => {
  if (tab === "all") return true;
  if (tab === "insurer") return item.company_kind === "insurer" || item.company_kind === "medical";
  if (tab === "other") return !["taxi", "hotel", "insurer", "medical"].includes(item.company_kind);
  return item.company_kind === tab;
};
