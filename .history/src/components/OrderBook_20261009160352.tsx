'use client';
import { useMarketStore } from '../store/useMarketStore';

export default function OrderBook() {
  const { orderBook } = useMarketStore();

  const topAsks = orderBook.asks.slice(0, 10).reverse();
  const topBids = orderBook.bids.slice(0, 10);

  const renderRow = (entry: { price: number, quantity: number }, type: 'bid' | 'ask') => (
    <div key={entry.price} className="data-row grid min-h-6 grid-cols-2 items-center px-2 py-0.5 text-xs font-mono cursor-default">
      <span className={type === 'bid' ? 'text-[#26a69a]' : 'text-[#ef5350]'}>{entry.price.toFixed(2)}</span>
      <span className="text-right text-gray-300">{entry.quantity.toFixed(4)}</span>
    </div>
  );

  return (
    <div className="flex h-full flex-col bg-transparent">
      <div className="grid min-h-0 flex-1 grid-cols-2 divide-x divide-white/10">
        <div className="flex min-h-0 flex-col px-3 pt-3">
          <div className="pb-2 text-sm font-semibold text-[#ef5350]">Asks (Sell) · 10</div>
          <div className="eyebrow grid grid-cols-2 border-b border-white/10 pb-2">
            <span>Price (USD)</span>
            <span className="text-right">Amount (BTC)</span>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden pt-1">
            {topAsks.length > 0 ? topAsks.map(a => renderRow(a, 'ask')) : (
              <div className="py-2 text-center text-xs text-gray-600">No asks</div>
            )}
          </div>
        </div>

        <div className="flex min-h-0 flex-col px-3 pt-3">
          <div className="pb-2 text-sm font-semibold text-[#26a69a]">Bids (Buy) · 10</div>
          <div className="eyebrow grid grid-cols-2 border-b border-white/10 pb-2">
            <span>Price (USD)</span>
            <span className="text-right">Amount (BTC)</span>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden pt-1">
            {topBids.length > 0 ? topBids.map(b => renderRow(b, 'bid')) : (
              <div className="py-2 text-center text-xs text-gray-600">No bids</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
