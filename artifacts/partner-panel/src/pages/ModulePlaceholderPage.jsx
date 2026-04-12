export default function ModulePlaceholderPage({ title, lead }) {
  return (
    <div className="panel-page">
      <h2 className="panel-page__title">{title}</h2>
      <p className="panel-page__lead">{lead}</p>
      <div className="panel-card panel-card--hint">
        <p className="panel-page__lead" style={{ margin: 0 }}>
          Dieses Modul ist für Ihr Konto freigeschaltet. Die Funktion wird schrittweise ausgebaut — bei Bedarf
          kontaktieren Sie die Onroda-Zentrale.
        </p>
      </div>
    </div>
  );
}
