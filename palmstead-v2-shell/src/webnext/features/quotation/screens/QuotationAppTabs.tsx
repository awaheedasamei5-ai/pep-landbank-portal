"use client";

import styles from './QuotationAppTabs.module.css';

export type QuotationAppTab = 'calculator' | 'template' | 'pricing';

// Real user ask (2026-09-11): "add a settings tab" (Template Settings)
// and "add another settinsg tab called pricing and quotation setting"
// on "the quotation app, management version." Shared by both
// QuotationScreen and TechnicalQuotationScreen (same 3-tab shape on
// both) rather than duplicated -- the calculator itself is each
// screen's own real content; only the two settings tabs are identical
// across both.
export function QuotationAppTabs({ activeTab, onTabChange, calculatorLabel, isManager }: { activeTab: QuotationAppTab; onTabChange: (tab: QuotationAppTab) => void; calculatorLabel: string; isManager: boolean }) {
  if (!isManager) return null;
  return (
    <div className={styles.tabRow}>
      <button type="button" className={`${styles.tabBtn} ${activeTab === 'calculator' ? styles.tabBtnOn : ''}`} onClick={() => onTabChange('calculator')}>
        {calculatorLabel}
      </button>
      <button type="button" className={`${styles.tabBtn} ${activeTab === 'template' ? styles.tabBtnOn : ''}`} onClick={() => onTabChange('template')}>
        Template Settings
      </button>
      <button type="button" className={`${styles.tabBtn} ${activeTab === 'pricing' ? styles.tabBtnOn : ''}`} onClick={() => onTabChange('pricing')}>
        Pricing & Quotation Settings
      </button>
    </div>
  );
}
