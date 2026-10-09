import assert from 'node:assert/strict';
import test from 'node:test';
import { Tier, TierController } from './tierController.js';

test('requires three consecutive downgrade votes before changing tier', () => {
    const controller = new TierController(0);

    controller.report(150, 1);
    controller.report(150, 2);
    assert.equal(controller.tier, Tier.FULL);

    controller.report(150, 3);
    assert.equal(controller.tier, Tier.DEGRADED);
});

test('requires three upgrade votes and falls back to minimal after timeout', () => {
    const controller = new TierController(0);

    controller.force(Tier.DEGRADED);
    controller.force(null);
    controller.report(50, 1);
    controller.report(50, 2);
    assert.equal(controller.tier, Tier.DEGRADED);
    controller.report(50, 3);
    assert.equal(controller.tier, Tier.FULL);

    controller.checkReportTimeout(10004);
    assert.equal(controller.tier, Tier.MINIMAL);
});

test('forced tier bypasses automatic decisions until released', () => {
    const controller = new TierController(0);

    controller.force(Tier.MINIMAL);
    controller.report(0, 1);
    assert.equal(controller.tier, Tier.MINIMAL);

    controller.force(null);
    controller.report(0, 2);
    controller.report(0, 3);
    controller.report(0, 4);
    assert.equal(controller.tier, Tier.DEGRADED);
});
