'use client';
import { useMarketStore } from '../store/useMarketStore';
import { useState } from 'react';

export function DeliveryTierControl({ ws }: { ws: WebSocket | null }) {
  const [forcedTier, setForcedTier] = useState<string>('AUTO');

  const forceTier = (t: string) => {
    setForcedTier(t);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'forceTier', tier: t === 'AUTO' ? null : t }));
    }
  };

  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/2.5 px-2 py-1.5">
      <span className="eyebrow hidden whitespace-nowrap sm:block">Delivery Mode</span>
      <select
        aria-label="Delivery mode"
        value={forcedTier}
        onChange={(e) => forceTier(e.target.value)}
        className="w-28 rounded-md border border-white/10 bg-[#0b0e14] px-2 py-1.5 text-xs font-semibold text-gray-200 outline-none"
      >
        <option value="AUTO">Auto</option>
        <option value="FULL">Full</option>
        <option value="DEGRADED">Degraded</option>
        <option value="MINIMAL">Minimal</option>
      </select>
    </div>
  );
}

export default function DebugPanel() {
  const { isConnected, isStale, tier, lastOrderBookUpdateAt } = useMarketStore();
  const lastUpdate = lastOrderBookUpdateAt
    ? new Date(lastOrderBookUpdateAt).toLocaleTimeString([], { hour12: false })
    : '---';

  return (
    <div className="flex flex-col gap-3 bg-transparent p-3 text-xs">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-white/10 bg-white/2.5 p-3 shadow-inner shadow-white/2">
          <span className="eyebrow">Connection Status</span>
          <span className={`mt-2 flex items-center gap-2 font-semibold ${isConnected && !isStale ? 'text-gray-200' : 'text-amber-300'}`}>
            <span className={`h-2.5 w-2.5 rounded-full ${!isConnected ? 'bg-red-400' : isStale ? 'bg-amber-400' : 'bg-emerald-400'}`} />
            {!isConnected ? 'Disconnected' : isStale ? 'Stale' : 'Connected'}
          </span>
          <span className="mt-1 block text-[10px] text-gray-500">Receiving live data</span>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/2.5 p-3 shadow-inner shadow-white/2">
          <span className="eyebrow">Active Delivery Tier</span>
          <span className="mt-2 inline-block rounded-md bg-emerald-500 px-3 py-1 font-bold text-white">{tier}</span>
          <span className="mt-1 block text-[10px] text-gray-500">Adaptive update frequency</span>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/2.5 p-3 shadow-inner shadow-white/2">
          <span className="eyebrow">Last Update</span>
          <span className="mt-2 block font-mono text-lg text-gray-400">{lastUpdate}</span>
        </div>
      </div>
    </div>
  );
}
