// Fund-flow stage geometry.
//
// Six nodes on a 3x2 grid inside the 700x440 box, all 190px wide:
//
//   row 1 (top 40)   Depositor(16)     Vault(255)         Borrower(494)
//   row 2 (top 250)  Broker 계정(16)   Broker cover(255)  Loan(494)
//
// The 49px column gutters carry the horizontal money paths (deposit/withdraw,
// loan/repay, coverDeposit); the 85px row gutter carries the two vertical links
// (cover, loanLink), which stop 20px clear of the node edges on either side so a
// travelling chip never rides over a card.
import type { FlowPathId } from '../viewModel';

export const STAGE_WIDTH = 700;
export const STAGE_HEIGHT = 440;

/** Column left edges and the shared node width. */
const COL_LEFT = 16;
const COL_MID = 255;
const COL_RIGHT = 494;
const NODE_W = 190;

/** Row tops. Node content is trimmed so no card grows past ~130px. */
const ROW_TOP = 40;
const ROW_BOTTOM = 250;

/** The 7 fund-flow path strings. */
export const FLOW_PATHS: Record<FlowPathId, string> = {
  // row 1, left gutter (x 206 -> 255)
  deposit: 'M 210 100 C 232 100, 230 76, 251 76',
  withdraw: 'M 251 100 C 230 100, 232 124, 210 124',
  // row 1, right gutter (x 445 -> 494)
  loan: 'M 449 76 C 470 76, 468 100, 490 100',
  repay: 'M 490 124 C 468 124, 470 100, 449 100',
  // row 2, left gutter (x 206 -> 255)
  coverDeposit: 'M 210 312 L 251 312',
  // same gutter, travelling back: Broker cover -> Broker 계정 (cover recovered)
  coverWithdraw: 'M 251 326 L 210 326',
  // centre column, row gutter: Broker cover -> Vault, travelling upwards
  cover: 'M 350 230 L 350 185',
  // right column, row gutter: Borrower -> Loan, travelling downwards
  loanLink: 'M 589 185 L 589 230',
};

export interface NodeBox {
  x: number;
  y: number;
  width: number;
}

export type StageNodeId = 'depositor' | 'vault' | 'borrower' | 'brokerAccount' | 'broker' | 'loan';

/** Absolute positions of the 6 stage nodes within the 700x440 box. */
export const NODE_POSITIONS: Record<StageNodeId, NodeBox> = {
  depositor: { x: COL_LEFT, y: ROW_TOP, width: NODE_W },
  vault: { x: COL_MID, y: ROW_TOP, width: NODE_W },
  borrower: { x: COL_RIGHT, y: ROW_TOP, width: NODE_W },
  brokerAccount: { x: COL_LEFT, y: ROW_BOTTOM, width: NODE_W },
  broker: { x: COL_MID, y: ROW_BOTTOM, width: NODE_W },
  loan: { x: COL_RIGHT, y: ROW_BOTTOM, width: NODE_W },
};
