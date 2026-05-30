import AdminCollapsibleSection from "./AdminCollapsibleSection.jsx";

/** Aufklappbarer Block — gleiche Optik wie Admin-Standard (admin-section-block). */
export default function CollapsibleCard({ title, subtitle = "", children, defaultOpen = true }) {
  return (
    <AdminCollapsibleSection title={title} subtitle={subtitle} defaultOpen={defaultOpen}>
      {children}
    </AdminCollapsibleSection>
  );
}
