import { useState, useEffect } from 'react';
import { classNames } from '~/utils/classNames';
import { getUsageStats, tokenUsageStore } from '~/lib/stores/tokenUsage';
import { useStore } from '@nanostores/react';

type TimeRange = '24h' | '7d' | '30d' | 'all';

interface TokenUsageProps {
  className?: string;
}

export const TokenUsage = ({ className }: TokenUsageProps) => {
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const tokenStore = useStore(tokenUsageStore);
  const [usageStats, setUsageStats] = useState(() => getUsageStats('7d'));

  useEffect(() => {
    setUsageStats(getUsageStats(timeRange));
  }, [timeRange, tokenStore]);

  return (
    <div className={classNames('flex flex-col gap-6', className)}>
      {/* Time range selector */}
      <div className="flex items-center gap-2">
        {(['24h', '7d', '30d', 'all'] as TimeRange[]).map((range) => (
          <button
            key={range}
            onClick={() => setTimeRange(range)}
            className={classNames(
              'px-3 py-1.5 text-sm font-medium rounded-lg transition-colors',
              timeRange === range
                ? 'bg-bolt-elements-background-depth-4 text-bolt-elements-textPrimary'
                : 'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3',
            )}
          >
            {range.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Usage overview cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
          <h3 className="text-sm font-medium text-bolt-elements-textSecondary">Total Tokens</h3>
          <p className="mt-2 text-2xl font-semibold text-bolt-elements-textPrimary">
            {usageStats.total.toLocaleString()}
          </p>
        </div>
        <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
          <h3 className="text-sm font-medium text-bolt-elements-textSecondary">Used Tokens</h3>
          <p className="mt-2 text-2xl font-semibold text-bolt-elements-textPrimary">
            {usageStats.used.toLocaleString()}
          </p>
        </div>
        <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
          <h3 className="text-sm font-medium text-bolt-elements-textSecondary">Remaining Tokens</h3>
          <p className="mt-2 text-2xl font-semibold text-bolt-elements-textPrimary">
            {usageStats.remaining.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Usage progress bar */}
      <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-bolt-elements-textSecondary">Usage Progress</h3>
          <span className="text-sm font-medium text-bolt-elements-textPrimary">
            {usageStats.percentUsed.toFixed(1)}%
          </span>
        </div>
        <div className="h-2 rounded-full bg-bolt-elements-background-depth-4">
          <div
            className="h-full rounded-full bg-bolt-elements-button-backgroundPrimary transition-all"
            style={{ width: `${Math.min(100, usageStats.percentUsed)}%` }}
          />
        </div>
      </div>

      {/* Usage chart */}
      <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
        <h3 className="text-sm font-medium text-bolt-elements-textSecondary mb-4">Daily Usage</h3>
        <div className="h-48 flex items-end gap-2">
          {usageStats.chartData.values.map((value, index) => {
            const height = value > 0 ? (value / Math.max(...usageStats.chartData.values)) * 100 : 0;
            return (
              <div key={index} className="flex-1 flex flex-col items-center gap-2">
                <div
                  className="w-full bg-bolt-elements-button-backgroundPrimary/20 rounded-t-sm hover:bg-bolt-elements-button-backgroundPrimary/30 transition-colors relative group"
                  style={{ height: `${height}%` }}
                >
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-bolt-elements-background-depth-4 text-bolt-elements-textPrimary px-2 py-1 rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                    {value.toLocaleString()}
                  </div>
                </div>
                <span className="text-xs text-bolt-elements-textTertiary">{usageStats.chartData.labels[index]}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Provider breakdown */}
      <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
        <h3 className="text-sm font-medium text-bolt-elements-textSecondary mb-4">Usage by Provider</h3>
        <div className="space-y-4">
          {usageStats.providerBreakdown.map((provider) => (
            <div key={provider.name}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-bolt-elements-textPrimary">{provider.name}</span>
                <span className="text-sm text-bolt-elements-textSecondary">
                  {provider.usage.toLocaleString()} ({provider.percentage.toFixed(1)}%)
                </span>
              </div>
              <div className="h-2 rounded-full bg-bolt-elements-background-depth-4">
                <div
                  className="h-full rounded-full bg-bolt-elements-button-backgroundPrimary/60 transition-all"
                  style={{ width: `${provider.percentage}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
