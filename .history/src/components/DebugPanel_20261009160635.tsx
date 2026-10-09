'use client';
import { useMarketStore } from '../store/useMarketStore';
import { useState } from 'react';

export default function DebugPanel({ ws }: { ws: WebSocket | null }) {
  const { isConnected, isStale, rtt, jitter, tier, updateRate, orderBook } = useMarketStore();
  const [forcedTier, setForcedTier] = useState<string>('AUTO');
  const [showDemoControls, setShowDemoControls] = useState(false);

  const forceTier = (t: string) => {
    setForcedTier(t);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'forceTier', tier: t === 'AUTO' ? null : t }));
    }
  };

  return (
    <div className="flex flex-col gap-3 bg-transparent p-3 text-xs">

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        <div className="rounded-lg border border-white/10 bg-white/[0.025] p-3 shadow-inner shadow-white/[0.02]">
          <span className="eyebrow">Connection Status</span>
          <span className={`mt-2 flex items-center gap-2 font-semibold ${isConnected && !isStale ? 'text-gray-200' : 'text-amber-300'}`}>
            <span className={`h-2.5 w-2.5 rounded-full ${!isConnected ? 'bg-red-400' : isStale ? 'bg-amber-400' : 'bg-emerald-400'}`} />
            {!isConnected ? 'Disconnected' : isStale ? 'Stale' : 'Connected'}
          </span>
          <span className="mt-1 block text-[10px] text-gray-500">Receiving live data</span>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.025] p-3 shadow-inner shadow-white/[0.02]">
          <span className="eyebrow">Active Delivery Tier</span>
          <span className="mt-2 inline-block rounded-md bg-emerald-500 px-3 py-1 font-bold text-white">{tier}</span>
          <span className="mt-1 block text-[10px] text-gray-500">Adaptive update frequency</span>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.025] p-3 shadow-inner shadow-white/[0.02]">
          <span className="eyebrow">Latency</span>
          <span className="mt-2 block font-mono text-lg text-gray-200">{rtt} <small className="text-xs text-gray-500">ms</small></span>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.025] p-3 shadow-inner shadow-white/[0.02]">
          <span className="eyebrow">Jitter</span>
          <span className="mt-2 block font-mono text-lg text-gray-200">{jitter} <small className="text-xs text-gray-500">ms</small></span>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.025] p-3 shadow-inner shadow-white/[0.02]">
          <span className="eyebrow">Updates/sec</span>
          <span className="mt-2 block font-mono text-lg text-gray-200">{updateRate}<small className="ml-1 text-xs text-gray-500">/ sec</small></span>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.025] p-3 shadow-inner shadow-white/[0.02]">
          <span className="eyebrow">Last Update</span>
          <span className="mt-2 block font-mono text-lg text-gray-400">{orderBook.lastUpdateId || '---'}</span>
        </div>
      </div>

      <div className="border-t border-white/10 pt-3">
        <button
          onClick={() => setShowDemoControls(!showDemoControls)}
          className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-white/[0.025] px-3 py-2 text-left text-[11px] font-semibold tracking-wide text-gray-300 outline-none transition-colors hover:bg-white/[0.05] hover:text-gray-100"
        >
          <span>Delivery Tier Control</span>
          <span className="text-gray-500">{showDemoControls ? '−' : '+'}</span>
        </button>

        {showDemoControls && (
          <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 p-3">
            <div>
              <span className="block text-[10px] font-semibold uppercase tracking-wider text-gray-300">Force delivery mode</span>
              <span className="mt-1 block text-[10px] text-gray-500">Override adaptive updates for the demo</span>
            </div>
              <select
                value={forcedTier}
                onChange={(e) => forceTier(e.target.value)}
                className="w-32 shrink-0 rounded-md border border-white/10 bg-[#0b0e14] px-2 py-2 text-xs font-semibold text-gray-200 outline-none"
              >
                <option value="AUTO">Auto</option>
                <option value="FULL">Full</option>
                <option value="DEGRADED">Degraded</option>
                <option value="MINIMAL">Minimal</option>
              </select>
          </div>
        )}
      </div>

    </div>
  );
}
