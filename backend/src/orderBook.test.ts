import assert from 'node:assert/strict';
import test from 'node:test';
import { OrderBookManager } from './orderBook.js';

test('seeds at least ten bids and asks and advances ordered update IDs', () => {
    const book = new OrderBookManager(() => 0.5);
    book.seedLevels(50000);

    const snapshot = book.getSnapshot();
    assert.equal(snapshot.bids.length, 10);
    assert.equal(snapshot.asks.length, 10);
    assert.equal(snapshot.lastUpdateId, 0);

    const firstDelta = book.updateBookAroundPrice(50000);
    const secondDelta = book.updateBookAroundPrice(50001);
    assert.equal(firstDelta.updateId, 1);
    assert.equal(secondDelta.updateId, 2);
    assert.ok(firstDelta.bids.length + firstDelta.asks.length > 0);
});

test('snapshot contains the latest state after updates and can recover a missed delta', () => {
    const book = new OrderBookManager(() => 0.5);
    book.seedLevels(50000);
    book.updateBookAroundPrice(50000);
    const missedDelta = book.updateBookAroundPrice(50001);
    const recoverySnapshot = book.getSnapshot();

    assert.equal(missedDelta.updateId, 2);
    assert.equal(recoverySnapshot.lastUpdateId, missedDelta.updateId);
    assert.ok(recoverySnapshot.bids.length >= 10);
    assert.ok(recoverySnapshot.asks.length >= 10);
});
