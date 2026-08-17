/**
 * Ledger Service Layer (Phase 6)
 * Off-chain DPIP ledger: double-entry entries behind every transaction.
 */

export {
  supportsTransactions,
  assertTransactionalDatabase,
  newReference,
  transfer,
  hold,
  release,
  credit,
  getBalance,
  getStatement,
  reconcile
} from './ledgerService'

export type { LedgerKind, TransferKind } from './ledgerService'
