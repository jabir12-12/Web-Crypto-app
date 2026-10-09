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

  const getTierColor = (t: string) => {
    switch (t) {
      case 'FULL': return 'text-[#26a69a]';
      case 'DEGRADED': return 'text-yellow-500';
      case 'MINIMAL': return 'text-[#ef5350]';
      default: return 'text-gray-400';
    }
  };

  return (
    <div className="flex flex-col bg-transparent p-4 text-xs">
      
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-white/10 bg-white/[0.025] p-3">
          <span className="eyebrow">Connection Status</span>
          <span className={`mt-2 flex items-center gap-2 font-semibold ${isConnected && !isStale ? 'text-gray-200' : 'text-amber-300'}`}>
            <span className={`h-2.5 w-2.5 rounded-full ${!isConnected ? 'bg-red-400' : isStale ? 'bg-amber-400' : 'bg-emerald-400'}`} />
            {!isConnected ? 'Disconnected' : isStale ? 'Stale' : 'Connected'}
          </span>
          <span className="mt-1 block text-[10px] text-gray-500">Receiving live data</span>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.025] p-3">
          <span className="eyebrow">Active Delivery Tier</span>
          <span className="mt-2 inline-block rounded-md bg-emerald-500 px-3 py-1 font-bold text-white">{tier}</span>
          <span className="mt-1 block text-[10px] text-gray-500">Adaptive update frequency</span>
        </div>
        <div className="flex flex-col">
          <span className="eyebrow">Latency</span>
          <span className="mt-1 font-mono text-gray-200">{rtt} <small className="text-gray-500">ms</small></span>
        </div>
        <div className="flex flex-col">
          <span className="eyebrow">Jitter</span>
          <span className="mt-1 font-mono text-gray-200">{jitter} <small className="text-gray-500">ms</small></span>
        </div>
        <div className="flex flex-col">
          <span className="eyebrow">Updates/sec</span>
          <span className="mt-1 font-mono text-gray-200">{updateRate}</span>
        </div>
        <div className="flex flex-col">
          <span className="eyebrow">Last Update</span>
          <span className="mt-1 font-mono text-gray-400">{orderBook.lastUpdateId || '---'}</span>
        </div>
      </div>

      <div className="mt-auto border-t border-white/10 pt-3">
        <button 
          onClick={() => setShowDemoControls(!showDemoControls)}
          className="flex w-full items-center justify-between text-left text-[11px] font-semibold tracking-wide text-gray-400 outline-none transition-colors hover:text-gray-100"
        >
          <span>DEMO CONTROLS</span>
          <span>{showDemoControls ? '▼' : '▶'}</span>
        </button>
        
        {showDemoControls && (
          <div className="mt-3 flex flex-col gap-2 rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-500 text-[10px] uppercase">Force Tier</span>
              <select 
                value={forcedTier}
                onChange={(e) => forceTier(e.target.value)}
                className="w-28 rounded-md border border-white/10 bg-[#0b0e14] p-1.5 text-xs text-gray-200 outline-none"
              >
                <option value="AUTO">Auto</option>
                <option value="FULL">Full</option>
                <option value="DEGRADED">Degraded</option>
                <option value="MINIMAL">Minimal</option>
              </select>
            </div>
            {/* Additional demo controls can go here */}
          </div>
        )}
      </div>

    </div>
  );
}
