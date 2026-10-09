'use client';
import { useMarketStore } from '../store/useMarketStore';

export default function OrderBook() {
  const { orderBook } = useMarketStore();

  const topAsks = orderBook.asks.slice(0, 10).reverse();
  const topBids = orderBook.bids.slice(0, 10);

  const renderRow = (entry: { price: number, quantity: number }, type: 'bid' | 'ask') => (
    <div key={entry.price} className="data-row flex min-h-6 items-center justify-between px-2 py-0.5 text-xs font-mono cursor-default">
      <span className={type === 'bid' ? 'text-[#26a69a]' : 'text-[#ef5350]'}>{entry.price.toFixed(2)}</span>
      <span className="text-gray-300">{entry.quantity.toFixed(4)}</span>
    </div>
  );

  return (
    <div className="flex h-full flex-col bg-transparent">
      <div className="eyebrow flex justify-between px-5 pb-2 pt-3">
        <span>PRICE(USD)</span>
        <span>AMOUNT(BTC)</span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-3">
        <div className="pb-1 text-xs font-semibold text-[#ef5350]">Asks (Sell) · 10</div>
        <div className="min-h-0 flex-1 overflow-hidden">
        {topAsks.length > 0 ? topAsks.map(a => renderRow(a, 'ask')) : (
          <div className="text-gray-600 text-xs text-center py-2">No asks</div>
        )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col border-t border-white/10 px-3 pt-2">
        <div className="pb-1 text-xs font-semibold text-[#26a69a]">Bids (Buy) · 10</div>
        <div className="min-h-0 flex-1 overflow-hidden">
        {topBids.length > 0 ? topBids.map(b => renderRow(b, 'bid')) : (
          <div className="text-gray-600 text-xs text-center py-2">No bids</div>
        )}
        </div>
      </div>
    </div>
  );
}
