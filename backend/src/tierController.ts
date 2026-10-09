export enum Tier {
    FULL,
    DEGRADED,
    MINIMAL
}

export const THROTTLE_RATES = {
    [Tier.FULL]: 0,
    [Tier.DEGRADED]: 500,
    [Tier.MINIMAL]: 2000,
} as const;

const TIER_THRESHOLDS = {
    DOWNGRADE_DEGRADED: 120,
    DOWNGRADE_MINIMAL: 320,
    UPGRADE_FULL: 80,
    UPGRADE_DEGRADED: 240,
} as const;

const REQUIRED_TIER_VOTES = 3;
export const REPORT_TIMEOUT_MS = 10000;

export function tierName(tier: Tier): string {
    return tier === Tier.FULL ? 'FULL' : tier === Tier.DEGRADED ? 'DEGRADED' : 'MINIMAL';
}

export function tierRate(tier: Tier): number {
    return tier === Tier.FULL ? 20 : tier === Tier.DEGRADED ? 2 : 0.5;
}

export class TierController {
    public tier = Tier.FULL;
    public forceTier: Tier | null = null;
    public lastReportAt: number;

    private readonly rttHistory: number[] = [];
    private tierChangeVotes = 0;

    constructor(
        now = Date.now(),
        private readonly onTierChange: () => void = () => undefined
    ) {
        this.lastReportAt = now;
    }

    public report(rtt: number, now = Date.now()): void {
        this.lastReportAt = now;
        this.rttHistory.push(rtt);
        if (this.rttHistory.length > 5) this.rttHistory.shift();

        if (this.forceTier !== null) {
            this.setTier(this.forceTier);
            return;
        }

        const averageRtt = this.rttHistory.reduce((sum, value) => sum + value, 0) / this.rttHistory.length;
        let desiredTier = this.tier;
        if (this.tier === Tier.FULL && averageRtt > TIER_THRESHOLDS.DOWNGRADE_MINIMAL) desiredTier = Tier.MINIMAL;
        else if (this.tier !== Tier.MINIMAL && averageRtt > TIER_THRESHOLDS.DOWNGRADE_DEGRADED) desiredTier = Tier.DEGRADED;
        else if (this.tier === Tier.MINIMAL && averageRtt < TIER_THRESHOLDS.UPGRADE_DEGRADED) desiredTier = Tier.DEGRADED;
        else if (this.tier === Tier.DEGRADED && averageRtt < TIER_THRESHOLDS.UPGRADE_FULL) desiredTier = Tier.FULL;

        if (desiredTier === this.tier) {
            this.tierChangeVotes = 0;
        } else {
            this.tierChangeVotes++;
            if (this.tierChangeVotes >= REQUIRED_TIER_VOTES) {
                this.setTier(desiredTier);
                this.tierChangeVotes = 0;
            }
        }
    }

    public force(tier: Tier | null): void {
        this.forceTier = tier;
        if (tier !== null) this.setTier(tier);
    }

    public checkReportTimeout(now = Date.now()): void {
        if (this.forceTier === null && now - this.lastReportAt > REPORT_TIMEOUT_MS) {
            this.setTier(Tier.MINIMAL);
            this.tierChangeVotes = 0;
        }
    }

    private setTier(tier: Tier): void {
        if (this.tier === tier) return;
        this.tier = tier;
        this.onTierChange();
    }
}
