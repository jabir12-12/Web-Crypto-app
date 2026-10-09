'use client';
import { useMarketStore } from '../store/useMarketStore';

export default function Trades() {
  const { trades } = useMarketStore();

  return (
    <div className="flex h-full flex-col bg-transparent">
      <div className="eyebrow flex justify-between px-5 pb-2 pt-3">
        <span className="w-1/3 text-left">TIME</span>
        <span className="w-1/3 text-center">PRICE</span>
        <span className="w-1/3 text-right">AMOUNT</span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 custom-scrollbar">
        {trades.length > 0 ? trades.map((t, idx) => {
          const timeStr = new Date(t.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
          
          // Determine color based on previous trade (if available) to show uptick/downtick
          const prevTrade = trades[idx + 1];
          const colorClass = prevTrade 
            ? (t.price > prevTrade.price ? 'text-[#26a69a]' : t.price < prevTrade.price ? 'text-[#ef5350]' : 'text-gray-300')
            : 'text-gray-300';
            
          return (
            <div key={t.id} className="data-row flex justify-between px-2 py-1 text-xs font-mono cursor-default">
              <span className="text-gray-500 w-1/3 text-left">{timeStr}</span>
              <span className={`${colorClass} w-1/3 text-center`}>{t.price.toFixed(2)}</span>
              <span className="text-gray-300 w-1/3 text-right">{t.quantity.toFixed(4)}</span>
            </div>
          );
        }) : (
           <div className="text-gray-600 text-xs text-center py-2">No recent trades</div>
        )}
      </div>
    </div>
  );
}
