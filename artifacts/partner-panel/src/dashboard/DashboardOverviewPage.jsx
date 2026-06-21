import TaxiDashboardCockpit from "../components/TaxiDashboardCockpit.jsx";

/**
 * @deprecated Nutzt dasselbe Cockpit wie TaxiMasterPanel — Props durchreichen.
 * @param {Parameters<typeof TaxiDashboardCockpit>[0]} props
 */
export default function DashboardOverviewPage(props) {
  return <TaxiDashboardCockpit variant="fleet" {...props} />;
}
