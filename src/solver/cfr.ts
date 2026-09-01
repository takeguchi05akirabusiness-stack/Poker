/**
 * Generic chance-sampled Counterfactual Regret Minimization (CFR) engine.
 *
 * The tree structure (who acts, what actions are legal, when the hand ends)
 * must be fixed ahead of time and independent of the hidden cards ("world").
 * Only two things are allowed to depend on the sampled world: which
 * information set a decision node belongs to (`infoSet`) and the payoff at
 * a terminal node (`payoff`). This lets a single static tree be reused
 * across many sampled deals (Monte Carlo chance sampling), which is what
 * makes solving a poker subgame with a large number of possible deals
 * tractable.
 *
 * Reference: Zinkevich et al., "Regret Minimization in Games with
 * Incomplete Information" (2007); the per-iteration update below is the
 * standard chance-sampled CFR regret/strategy update from that paper.
 */

export type TerminalNode<World> = {
  type: 'terminal';
  payoff: (world: World) => number[];
};

export type DecisionNode<World> = {
  type: 'decision';
  id: number;
  player: number;
  actions: string[];
  infoSet: (world: World) => string;
  children: PublicNode<World>[];
};

export type PublicNode<World> = TerminalNode<World> | DecisionNode<World>;

export interface InfoSetStats {
  actions: string[];
  regretSum: number[];
  strategySum: number[];
  iterations: number;
}

export class CfrTrainer<World> {
  private readonly numPlayers: number;
  private readonly infoSets = new Map<string, InfoSetStats>();

  constructor(numPlayers: number) {
    this.numPlayers = numPlayers;
  }

  getInfoSets(): ReadonlyMap<string, InfoSetStats> {
    return this.infoSets;
  }

  private getInfoSet(key: string, actions: string[]): InfoSetStats {
    let stats = this.infoSets.get(key);
    if (!stats) {
      stats = {
        actions,
        regretSum: new Array(actions.length).fill(0),
        strategySum: new Array(actions.length).fill(0),
        iterations: 0,
      };
      this.infoSets.set(key, stats);
    }
    return stats;
  }

  private currentStrategy(stats: InfoSetStats): number[] {
    const n = stats.actions.length;
    let positiveSum = 0;
    const strategy = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      strategy[i] = Math.max(0, stats.regretSum[i]);
      positiveSum += strategy[i];
    }
    if (positiveSum > 0) {
      for (let i = 0; i < n; i++) strategy[i] /= positiveSum;
    } else {
      for (let i = 0; i < n; i++) strategy[i] = 1 / n;
    }
    return strategy;
  }

  /** Average strategy accumulated over training, normalized to sum to 1. */
  averageStrategy(key: string): number[] | null {
    const stats = this.infoSets.get(key);
    if (!stats) return null;
    const total = stats.strategySum.reduce((a, b) => a + b, 0);
    if (total <= 0) return stats.actions.map(() => 1 / stats.actions.length);
    return stats.strategySum.map((s) => s / total);
  }

  private walk(node: PublicNode<World>, world: World, reach: number[]): number[] {
    if (node.type === 'terminal') {
      return node.payoff(world);
    }

    const key = node.infoSet(world);
    const stats = this.getInfoSet(key, node.actions);
    const strategy = this.currentStrategy(stats);
    const player = node.player;

    const actionUtils: number[][] = [];
    const nodeUtil = new Array(this.numPlayers).fill(0);
    for (let i = 0; i < node.children.length; i++) {
      const childReach = reach.slice();
      childReach[player] *= strategy[i];
      const util = this.walk(node.children[i], world, childReach);
      actionUtils.push(util);
      for (let p = 0; p < this.numPlayers; p++) {
        nodeUtil[p] += strategy[i] * util[p];
      }
    }

    // Counterfactual reach probability: product of all other players' reach
    // (chance is already fixed by sampling, so it does not appear here).
    let cfReach = 1;
    for (let p = 0; p < this.numPlayers; p++) {
      if (p !== player) cfReach *= reach[p];
    }

    for (let i = 0; i < node.children.length; i++) {
      const regret = actionUtils[i][player] - nodeUtil[player];
      stats.regretSum[i] += cfReach * regret;
      stats.strategySum[i] += reach[player] * strategy[i];
    }
    stats.iterations += 1;

    return nodeUtil;
  }

  /** Run one CFR iteration against a freshly sampled world. */
  runIteration(root: PublicNode<World>, world: World): number[] {
    return this.walk(root, world, new Array(this.numPlayers).fill(1));
  }
}
