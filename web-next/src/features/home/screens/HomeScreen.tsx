import { useSessionStore } from '../../../auth/useSessionStore';
import { usePipelineSummary } from '../../pipeline/hooks/usePipelineSummary';
import { useTodayStreak } from '../../streak/hooks/useTodayStreak';
import { StreakCard } from '../../streak/components/StreakCard';
import { HeroCard } from '../components/HeroCard';

export function HomeScreen() {
  const profile = useSessionStore((s) => s.profile);
  const pipeline = usePipelineSummary();
  const streak = useTodayStreak();

  const firstName = profile?.name.split(' ')[0] ?? '';

  return (
    <div style={{ padding: '20px 16px 90px' }}>
      <HeroCard greetName={firstName} pipelineValue={pipeline.data?.pipelineValue ?? 0}>
        {streak.data && <StreakCard streak={streak.data} />}
      </HeroCard>
    </div>
  );
}
