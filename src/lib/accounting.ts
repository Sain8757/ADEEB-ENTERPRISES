// ADEEB ENTERPRISES — Accounting Engine
// All financial calculations are centralized here.
// Uses Decimal.js for precision — no floating-point arithmetic.
//
// LEDGER SIGN CONVENTION:
//   DEBIT  = Party owes ADEEB ENTERPRISES (purchase posted as debit)
//   CREDIT = Party pays / we pay party (payment posted as credit or debit)
//   runningBalance > 0 = Party owes us (Receivable)
//   runningBalance < 0 = We owe party (Payable)

import Decimal from "decimal.js";

// ─────────────────────────────────────────────
// CONFIGURATION
// ─────────────────────────────────────────────

export const DEFAULT_CASH_EX_RATE = new Decimal(200);
export const DEFAULT_CASH_EX_BASIS = new Decimal(100000);

// ─────────────────────────────────────────────
// PURCHASE CALCULATIONS
// ─────────────────────────────────────────────

export interface PurchaseCalcInput {
  qty: number;
  totalWeight: Decimal | string | number;
  rate: Decimal | string | number;
}

export interface PurchaseCalcResult {
  avgWeight: Decimal;
  amount: Decimal;
}

/**
 * Calculate average weight and purchase amount.
 *
 * avgWeight = totalWeight / qty
 * amount    = totalWeight * rate
 *
 * @throws if qty <= 0, totalWeight <= 0, or rate <= 0
 */
export function calcPurchase(input: PurchaseCalcInput): PurchaseCalcResult {
  const qty = new Decimal(input.qty);
  const totalWeight = new Decimal(input.totalWeight);
  const rate = new Decimal(input.rate);

  if (qty.lte(0)) {
    throw new Error("Quantity must be greater than zero.");
  }
  if (totalWeight.lte(0)) {
    throw new Error("Total weight must be greater than zero.");
  }
  if (rate.lte(0)) {
    throw new Error("Rate must be greater than zero.");
  }

  const avgWeight = totalWeight.div(qty);
  const amount = totalWeight.mul(rate);

  return {
    avgWeight: avgWeight.toDecimalPlaces(3),
    amount: amount.toDecimalPlaces(2),
  };
}

// ─────────────────────────────────────────────
// CASH EX EXPENSE CALCULATION
// ─────────────────────────────────────────────

export interface CashExInput {
  cashReceived: Decimal | string | number;
  rate?: Decimal | string | number;   // default 200
  basis?: Decimal | string | number;  // default 100000
}

export interface CashExResult {
  expenseAmount: Decimal;
  rateApplied: Decimal;
  basisApplied: Decimal;
  formula: string;
}

/**
 * Calculate Cash EX expense.
 *
 * expense = cashReceived * rate / basis
 *
 * Default: cashReceived * 200 / 100000
 *
 * IMPORTANT:
 * - This is a SEPARATE expense entry.
 * - It does NOT reduce the party's ledger payment.
 * - The full cashReceived amount is posted to the party ledger.
 * - Only eligible cash RECEIVED transactions generate Cash EX.
 *
 * @throws if cashReceived <= 0
 */
export function calcCashEx(input: CashExInput): CashExResult {
  const cashReceived = new Decimal(input.cashReceived);
  const rate = new Decimal(input.rate ?? DEFAULT_CASH_EX_RATE);
  const basis = new Decimal(input.basis ?? DEFAULT_CASH_EX_BASIS);

  if (cashReceived.lte(0)) {
    throw new Error("Cash received amount must be greater than zero.");
  }
  if (basis.lte(0)) {
    throw new Error("Cash EX basis must be greater than zero.");
  }

  const expenseAmount = cashReceived.mul(rate).div(basis).toDecimalPlaces(2);

  return {
    expenseAmount,
    rateApplied: rate,
    basisApplied: basis,
    formula: `${formatINR(cashReceived)} × ${rate} ÷ ${formatINR(basis)} = ${formatINR(expenseAmount)}`,
  };
}

/**
 * Determine if a payment is eligible for Cash EX expense calculation.
 * Only CASH RECEIVED payments are eligible.
 * A/C transfers, Advance Jama, and cash paid out are NOT eligible.
 */
export function isCashExEligible(direction: string, method: string): boolean {
  return direction === "RECEIVED" && method === "CASH";
}

// ─────────────────────────────────────────────
// LEDGER BALANCE ENGINE
// ─────────────────────────────────────────────

export interface LedgerEntryInput {
  openingBalance: Decimal | string | number;
  openingDirection: "DR" | "CR";
  transactions: Array<{
    debit: Decimal | string | number;
    credit: Decimal | string | number;
  }>;
}

/**
 * Calculate running balances for a party ledger.
 *
 * Starting from opening balance, apply each transaction's debit/credit.
 * Balance = previous + debit - credit
 *
 * Positive balance = party owes us (Receivable / DR)
 * Negative balance = we owe party (Payable / CR)
 */
export function calcRunningBalances(
  input: LedgerEntryInput
): { balance: Decimal; direction: "DR" | "CR" | "NIL" }[] {
  // Convert opening balance to signed amount
  let runningBalance = new Decimal(input.openingBalance);
  if (input.openingDirection === "CR") {
    runningBalance = runningBalance.neg();
  }

  const results: { balance: Decimal; direction: "DR" | "CR" | "NIL" }[] = [];

  for (const tx of input.transactions) {
    const debit = new Decimal(tx.debit);
    const credit = new Decimal(tx.credit);
    runningBalance = runningBalance.plus(debit).minus(credit);
    results.push({
      balance: runningBalance.abs(),
      direction: runningBalance.isZero()
        ? "NIL"
        : runningBalance.gt(0)
        ? "DR"
        : "CR",
    });
  }

  return results;
}

/**
 * Get the signed running balance after an opening balance and list of transactions.
 * Returns the final balance with its direction.
 */
export function calcFinalBalance(input: LedgerEntryInput): {
  balance: Decimal;
  direction: "DR" | "CR" | "NIL";
} {
  const results = calcRunningBalances(input);
  if (results.length === 0) {
    return {
      balance: new Decimal(input.openingBalance),
      direction: input.openingDirection,
    };
  }
  return results[results.length - 1];
}

// ─────────────────────────────────────────────
// STATEMENT ARITHMETIC VALIDATION
// ─────────────────────────────────────────────

export interface StatementValidation {
  openingBalance: Decimal | string | number;
  openingDirection: "DR" | "CR";
  totalPurchases: Decimal | string | number;
  totalPayments: Decimal | string | number;
  reportedClosingBalance: Decimal | string | number;
  reportedClosingDirection: "DR" | "CR";
}

export interface StatementValidationResult {
  calculatedClosingBalance: Decimal;
  calculatedDirection: "DR" | "CR" | "NIL";
  reportedClosingBalance: Decimal;
  matches: boolean;
  discrepancy: Decimal;
}

/**
 * Validate a statement's arithmetic:
 * closing = opening + purchases - payments
 */
export function validateStatementArithmetic(
  input: StatementValidation
): StatementValidationResult {
  const opening = new Decimal(input.openingBalance);
  const openingSign = input.openingDirection === "CR" ? -1 : 1;
  const openingNet = opening.mul(openingSign);

  const purchases = new Decimal(input.totalPurchases);
  const payments = new Decimal(input.totalPayments);

  const calculated = openingNet.plus(purchases).minus(payments);

  const reported = new Decimal(input.reportedClosingBalance);
  const reportedSign = input.reportedClosingDirection === "CR" ? -1 : 1;
  const reportedNet = reported.mul(reportedSign);

  const discrepancy = calculated.minus(reportedNet).abs();

  return {
    calculatedClosingBalance: calculated.abs(),
    calculatedDirection: calculated.isZero()
      ? "NIL"
      : calculated.gt(0)
      ? "DR"
      : "CR",
    reportedClosingBalance: reported,
    matches: discrepancy.lte(0.01), // allow 1 paisa rounding
    discrepancy,
  };
}

// ─────────────────────────────────────────────
// FORMATTING UTILITIES
// ─────────────────────────────────────────────

/**
 * Format a number in Indian number system with ₹ symbol.
 * e.g. 100000 → ₹1,00,000.00
 */
export function formatINR(
  amount: Decimal | string | number,
  showSymbol = true,
  decimals = 2
): string {
  const d = new Decimal(amount);
  const isNeg = d.lt(0);
  const abs = d.abs().toFixed(decimals);

  const [intPart, decPart] = abs.split(".");

  // Indian grouping: last 3 digits, then groups of 2
  const formatted = intPart.replace(/^(\d+?)(?=(\d{2})+\d$)/g, (_, p1) => {
    // Handle the standard Indian number formatting
    return p1;
  });

  // Proper Indian grouping
  const indianGrouped = toIndianGrouping(intPart);

  const result = `${indianGrouped}.${decPart}`;
  const withSign = isNeg ? `-${result}` : result;
  return showSymbol ? `₹${withSign}` : withSign;
}

function toIndianGrouping(intStr: string): string {
  if (intStr.length <= 3) return intStr;
  const last3 = intStr.slice(-3);
  const rest = intStr.slice(0, -3);
  const grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${grouped},${last3}`;
}

/**
 * Parse an INR-formatted string back to a Decimal.
 * Handles ₹, commas, and negative signs.
 */
export function parseINR(str: string): Decimal {
  const cleaned = str.replace(/₹/g, "").replace(/,/g, "").trim();
  return new Decimal(cleaned);
}

/**
 * Format a weight value with up to 3 decimal places.
 */
export function formatWeight(
  weight: Decimal | string | number,
  decimals = 1
): string {
  return new Decimal(weight).toFixed(decimals);
}
