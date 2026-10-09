import { OrderBookEntry } from './types';

export class OrderBookManager {
    public bids: Map<number, number> = new Map();
    public asks: Map<number, number> = new Map();
    public lastUpdateId: number = 0;

    constructor() {}

    public updateBookAroundPrice(price: number): { bids: OrderBookEntry[], asks: OrderBookEntry[], updateId: number } {
        this.lastUpdateId++;
        
        const deltaBids: OrderBookEntry[] = [];
        const deltaAsks: OrderBookEntry[] = [];

        // Randomly remove some existing bids/asks
        const removeRandom = (map: Map<number, number>, deltaList: OrderBookEntry[]) => {
            const keys = Array.from(map.keys());
            if (keys.length > 0 && Math.random() > 0.5) {
                const keyToRemove = keys[Math.floor(Math.random() * keys.length)];
                map.delete(keyToRemove);
                deltaList.push({ price: keyToRemove, quantity: 0 }); // 0 quantity means delete in standard order book deltas
            }
        };

        removeRandom(this.bids, deltaBids);
        removeRandom(this.asks, deltaAsks);

        // Add or update some bids
        let currentBid = price - (Math.random() * 0.5 + 0.1);
        for (let i = 0; i < 2; i++) { // only update 2 levels for delta
            const p = parseFloat(currentBid.toFixed(2));
            const q = parseFloat((Math.random() * 2 + 0.1).toFixed(4));
            this.bids.set(p, q);
            deltaBids.push({ price: p, quantity: q });
            currentBid -= (Math.random() * 0.5 + 0.1);
        }

        // Add or update some asks
        let currentAsk = price + (Math.random() * 0.5 + 0.1);
        for (let i = 0; i < 2; i++) {
            const p = parseFloat(currentAsk.toFixed(2));
            const q = parseFloat((Math.random() * 2 + 0.1).toFixed(4));
            this.asks.set(p, q);
            deltaAsks.push({ price: p, quantity: q });
            currentAsk += (Math.random() * 0.5 + 0.1);
        }

        // Keep map size reasonable (top 20)
        // Sort bids descending
        const sortedBids = Array.from(this.bids.entries()).sort((a, b) => b[0] - a[0]);
        if (sortedBids.length > 20) {
            const toRemove = sortedBids.slice(20);
            toRemove.forEach(([p, _]) => {
                this.bids.delete(p);
                deltaBids.push({ price: p, quantity: 0 });
            });
        }

        // Sort asks ascending
        const sortedAsks = Array.from(this.asks.entries()).sort((a, b) => a[0] - b[0]);
        if (sortedAsks.length > 20) {
            const toRemove = sortedAsks.slice(20);
            toRemove.forEach(([p, _]) => {
                this.asks.delete(p);
                deltaAsks.push({ price: p, quantity: 0 });
            });
        }

        return {
            bids: deltaBids,
            asks: deltaAsks,
            updateId: this.lastUpdateId
        };
    }

    public getSnapshot() {
        return {
            bids: Array.from(this.bids.entries()).map(([price, quantity]) => ({ price, quantity })),
            asks: Array.from(this.asks.entries()).map(([price, quantity]) => ({ price, quantity })),
            lastUpdateId: this.lastUpdateId
        };
    }
}
