import { useEffect, useState } from 'react';
import type { LifeOSState } from '../types';
import { todayISO } from '../lib/storage';
import { getGymLauncherPlan, type GymLauncherChoice } from '../lib/gymLauncher';

export function useGymLauncher(state: LifeOSState, activeTab: string) {
  const [today, setToday] = useState(todayISO);
  const [choice, setChoice] = useState<GymLauncherChoice | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      clearTimeout(timer); setToday(todayISO());
      const now = new Date(); const midnight = new Date(now);
      midnight.setDate(now.getDate() + 1); midnight.setHours(0, 0, 0, 20);
      // Also notice a timezone change while this tab stays visible.
      timer = setTimeout(refresh, Math.min(60000, midnight.getTime() - now.getTime()));
    };
    refresh(); window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', refresh);
    return () => { clearTimeout(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [activeTab]);
  const explicitRest = (state.gym.restDays || []).includes(today) || Boolean(state.checkoutLog?.[today]?.trainedSkipped);
  const plan = getGymLauncherPlan(state.gym.routineTemplates, today, explicitRest, choice);
  const select = (templateId: string) => setChoice({ date: todayISO(), templateId });
  return { today, plan, select };
}
