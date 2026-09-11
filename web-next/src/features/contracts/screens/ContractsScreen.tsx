import { Outlet } from 'react-router';
import { useCanFulfilContracts } from '../hooks/useContractRequests';
import { SegmentedTabs, type SegmentedTabItem } from '../../../shared/ui/SegmentedTabs';
import styles from './ContractsScreen.module.css';

// CONTRACT_OF_SALE_BLUEPRINT.md §6.1 -- adds the real Template Studio as a
// second peer screen under the existing single "Contract Requests"
// sidebar entry, via the same shell+SegmentedTabs+<Outlet/> nested-route
// pattern already proven for Attendance/Leave/Ops-Tracker. This app
// previously had no tab bar because it never needed one; Templates is
// exactly the situation that pattern exists for -- never a second
// top-level sidebar entry.
export function ContractsScreen() {
  const canManageTemplates = useCanFulfilContracts();

  const tabs: SegmentedTabItem[] = [
    { key: 'requests', label: 'Requests', to: '/app/office/contracts', end: true },
    ...(canManageTemplates ? [{ key: 'templates', label: 'Templates', to: '/app/office/contracts/templates' }] : []),
  ];

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>Contract of Sale</h1>
      <p className={styles.sub}>Request, template, and generate the real Contract of Sale document.</p>
      {tabs.length > 1 && <SegmentedTabs items={tabs} />}
      <Outlet />
    </div>
  );
}
