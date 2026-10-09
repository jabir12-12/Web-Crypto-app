'use client';
import { useMarketStore } from '../store/useMarketStore';

export default function OrderBook() {
  const { orderBook } = useMarketStore();

  const topAsks = orderBook.asks.slice(0, 10).reverse();
  const topBids = orderBook.bids.slice(0, 10);
  
  // Calculate spread
  const lowestAsk = orderBook.asks.length > 0 ? orderBook.asks[0].price : 0;
  const highestBid = orderBook.bids.length > 0 ? orderBook.bids[0].price : 0;
  const spread = lowestAsk > 0 && highestBid > 0 ? (lowestAsk - highestBid).toFixed(2) : '---';

  const renderRow = (entry: {price: number, quantity: number}, type: 'bid'|'ask') => (
    <div key={entry.price} className="flex justify-between text-xs py-[2px] font-mono hover:bg-[#2a2e39]/50 transition-colors cursor-default">
      <span className={type === 'bid' ? 'text-[#26a69a]' : 'text-[#ef5350]'}>{entry.price.toFixed(2)}</span>
      <span className="text-gray-300">{entry.quantity.toFixed(4)}</span>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-[#131722]">
      <div className="flex justify-between text-[10px] text-gray-500 border-b border-[#2a2e39] pb-1 mb-1 px-3">
        <span>PRICE(USD)</span>
        <span>AMOUNT(BTC)</span>
      </div>

      <div className="flex flex-col justify-end px-3" style={{ minHeight: '200px' }}>
        {topAsks.length > 0 ? topAsks.map(a => renderRow(a, 'ask')) : (
          <div className="text-gray-600 text-xs text-center py-2">No asks</div>
        )}
      </div>

      <div className="my-1 border-y border-[#2a2e39] py-1 text-center bg-[#1a1e29]">
        <span className="text-[11px] font-bold text-gray-400 tracking-wider">SPREAD {spread}</span>
      </div>

      <div className="flex flex-col justify-start px-3" style={{ minHeight: '200px' }}>
        {topBids.length > 0 ? topBids.map(b => renderRow(b, 'bid')) : (
          <div className="text-gray-600 text-xs text-center py-2">No bids</div>
        )}
      </div>
    </div>
  );
}
