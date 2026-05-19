import type { PlanStatus } from '../types';

interface PlanStatusBannerProps {
  status: PlanStatus;
}

function daysRemaining(expiresAt: string | null): number {
  if (!expiresAt) return 0;
  return Math.max(
    0,
    Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  );
}

export function PlanStatusBanner({ status }: PlanStatusBannerProps) {
  if (status.plan === 'credits') {
    const balance = status.credits.balance;
    const low = balance <= 10;

    return (
      <div
        className={`flex items-center justify-between rounded-lg px-3 py-2 text-[12px] mb-3 ${
          low
            ? 'bg-amber-500/10 border border-amber-500/20 text-amber-300'
            : 'bg-white/[0.04] border border-white/[0.06] text-muted'
        }`}
      >
        <span>
          {low ? '⚠️ ' : '✦ '}
          <span className="font-semibold text-text">{balance}</span>{' '}
          {balance === 1 ? 'credit' : 'credits'} remaining
        </span>
        {low && (
          <a
            href="https://ahmadparizaad.github.io/twitter-automation/#pricing"
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-400 font-semibold hover:text-amber-300 transition-colors"
          >
            Top up →
          </a>
        )}
      </div>
    );
  }

  // Trial plan
  const { trial } = status;

  if (!trial.active) {
    return (
      <div className="flex items-center justify-between rounded-lg px-3 py-2 text-[12px] mb-3 bg-red-500/10 border border-red-500/20 text-red-300">
        <span>🔒 Free trial ended</span>
        <a
          href="https://ahmadparizaad.github.io/twitter-automation/#pricing"
          target="_blank"
          rel="noopener noreferrer"
          className="text-red-400 font-semibold hover:text-red-300 transition-colors"
        >
          Get credits →
        </a>
      </div>
    );
  }

  const days = daysRemaining(trial.expiresAt);
  const used = trial.usedToday;
  const limit = trial.dailyLimit;
  const remaining = trial.remainingToday;
  const pct = Math.round((used / limit) * 100);
  const urgent = days <= 1 || remaining <= 2;

  return (
    <div
      className={`rounded-lg px-3 py-2 text-[12px] mb-3 ${
        urgent
          ? 'bg-amber-500/10 border border-amber-500/20'
          : 'bg-white/[0.04] border border-white/[0.06]'
      }`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className={urgent ? 'text-amber-300' : 'text-muted'}>
          {urgent ? '⚡ ' : '🎯 '}
          Free trial — <span className="font-semibold text-text">{days}</span>{' '}
          {days === 1 ? 'day' : 'days'} left
        </span>
        <span className={urgent ? 'text-amber-300' : 'text-muted'}>
          <span className="font-semibold text-text">{remaining}</span>/{limit} today
        </span>
      </div>
      {/* Progress bar */}
      <div className="w-full h-1 bg-white/[0.06] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            pct >= 80 ? 'bg-amber-400' : 'bg-accent-3'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
