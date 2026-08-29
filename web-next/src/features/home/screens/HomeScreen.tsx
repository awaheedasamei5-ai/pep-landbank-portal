import { useNavigate } from 'react-router';
import { useSessionStore } from '../../../auth/useSessionStore';
import { usePipelineSummary } from '../../pipeline/hooks/usePipelineSummary';
import { useTodayStreak } from '../../streak/hooks/useTodayStreak';
import { StreakCard } from '../../streak/components/StreakCard';
import { HeroCard } from '../components/HeroCard';
import { useMyCommission } from '../../commission/hooks/useMyCommission';
import { today } from '../../../shared/lib/format';

export function HomeScreen() {
  const navigate = useNavigate();
  const profile = useSessionStore((s) => s.profile);
  const pipeline = usePipelineSummary();
  const streak = useTodayStreak();
  const commission = useMyCommission(today().slice(0, 7));

  const firstName = profile?.name.split(' ')[0] ?? '';

  return (
    <div style={{ padding: '20px 16px 90px' }}>
      <HeroCard greetName={firstName} pipelineValue={pipeline.data?.pipelineValue ?? 0} myCommission={commission.data?.total} onCommissionClick={() => navigate('/app/commission')}>
        {streak.data && <StreakCard streak={streak.data} />}
      </HeroCard>
    </div>
  );
}
