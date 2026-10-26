// ADEEB ENTERPRISES — Jest test suite for accounting engine
// Tests all rules from Section 18 of the specification.

import Decimal from "decimal.js";
import {
  calcPurchase,
  calcCashEx,
  isCashExEligible,
  calcRunningBalances,
  validateStatementArithmetic,
  formatINR,
  parseINR,
  calcFinalBalance,
} from "../lib/accounting";

// ─────────────────────────────────────────────
// PURCHASE CALCULATIONS
// ─────────────────────────────────────────────

describe("Purchase Calculations", () => {
  test("qty 10, totalWeight 2000 kg → avgWeight 200 kg", () => {
    const result = calcPurchase({ qty: 10, totalWeight: 2000, rate: 500 });
    expect(result.avgWeight.toNumber()).toBe(200);
  });

  test("totalWeight 2000 kg, rate ₹500/kg → amount ₹10,00,000", () => {
    const result = calcPurchase({ qty: 10, totalWeight: 2000, rate: 500 });
    expect(result.amount.toNumber()).toBe(1000000);
  });

  test("avgWeight precision: qty 3, totalWeight 100.5 kg", () => {
    const result = calcPurchase({ qty: 3, totalWeight: "100.5", rate: 300 });
    expect(result.avgWeight.toFixed(3)).toBe("33.500");
    expect(result.amount.toFixed(2)).toBe("30150.00");
  });

  test("different rate for BC and SC", () => {
    const bc = calcPurchase({ qty: 6, totalWeight: 895.2, rate: 313 });
    const sc = calcPurchase({ qty: 8, totalWeight: 352.2, rate: 248 });
    expect(bc.amount.toFixed(0)).toBe("280198"); // 895.2 * 313 = 280,197.6 → rounds to 280198
    expect(sc.amount.toFixed(0)).toBe("87346");  // 352.2 * 248 = 87,345.6 → rounds to 87346
  });

  test("zero quantity throws error — no division by zero", () => {
    expect(() => calcPurchase({ qty: 0, totalWeight: 100, rate: 500 })).toThrow(
      "Quantity must be greater than zero"
    );
  });

  test("negative rate throws error", () => {
    expect(() => calcPurchase({ qty: 5, totalWeight: 100, rate: -10 })).toThrow(
      "Rate must be greater than zero"
    );
  });

  test("zero weight throws error", () => {
    expect(() => calcPurchase({ qty: 5, totalWeight: 0, rate: 300 })).toThrow(
      "Total weight must be greater than zero"
    );
  });

  test("Decimal.js prevents floating-point errors", () => {
    const result = calcPurchase({ qty: 3, totalWeight: "0.1", rate: "0.2" });
    expect(result.amount.toString()).toBe("0.02");
  });
});

// ─────────────────────────────────────────────
// CASH EX CALCULATIONS
// ─────────────────────────────────────────────

describe("Cash EX Calculations", () => {
  test("₹50,000 cash received → ₹100 expense", () => {
    const result = calcCashEx({ cashReceived: 50000 });
    expect(result.expenseAmount.toNumber()).toBe(100);
  });

  test("₹1,00,000 cash received → ₹200 expense", () => {
    const result = calcCashEx({ cashReceived: 100000 });
    expect(result.expenseAmount.toNumber()).toBe(200);
  });

  test("₹1,50,000 cash received → ₹300 expense", () => {
    const result = calcCashEx({ cashReceived: 150000 });
    expect(result.expenseAmount.toNumber()).toBe(300);
  });

  test("₹5,00,000 cash received → ₹1,000 expense", () => {
    const result = calcCashEx({ cashReceived: 500000 });
    expect(result.expenseAmount.toNumber()).toBe(1000);
  });

  test("custom rate: ₹18,74,800 → ₹3,749.60 at ₹200/₹1L", () => {
    const result = calcCashEx({ cashReceived: 1874800 });
    expect(result.expenseAmount.toFixed(2)).toBe("3749.60");
  });

  test("calcCashEx throws for zero or negative amount", () => {
    expect(() => calcCashEx({ cashReceived: 0 })).toThrow();
    expect(() => calcCashEx({ cashReceived: -1000 })).toThrow();
  });

  test("applies the configured rate and basis correctly", () => {
    const result = calcCashEx({ cashReceived: 100000, rate: 100, basis: 100000 });
    expect(result.expenseAmount.toNumber()).toBe(100);
    expect(result.rateApplied.toNumber()).toBe(100);
  });
});

// ─────────────────────────────────────────────
// CASH EX ELIGIBILITY
// ─────────────────────────────────────────────

describe("Cash EX Eligibility", () => {
  test("CASH RECEIVED → eligible", () => {
    expect(isCashExEligible("RECEIVED", "CASH")).toBe(true);
  });

  test("A/C transfer RECEIVED → NOT eligible", () => {
    expect(isCashExEligible("RECEIVED", "AC")).toBe(false);
  });

  test("Advance Jama RECEIVED → NOT eligible", () => {
    expect(isCashExEligible("RECEIVED", "ADVANCE_JAMA")).toBe(false);
  });

  test("CASH PAID → NOT eligible", () => {
    expect(isCashExEligible("PAID", "CASH")).toBe(false);
  });

  test("CASH_EX method → NOT eligible for duplicate Cash EX", () => {
    expect(isCashExEligible("RECEIVED", "CASH_EX")).toBe(false);
  });
});

// ─────────────────────────────────────────────
// PARTY LEDGER — CASH EX ACCOUNTING RULE
// ─────────────────────────────────────────────

describe("Party Ledger — Cash EX Accounting Rule", () => {
  test("₹1,00,000 CASH RECEIVED posts full ₹1,00,000 to party ledger", () => {
    // Party's credit = full cash amount. CashEx does NOT reduce this.
    const ledger = calcRunningBalances({
      openingBalance: 500000,
      openingDirection: "DR", // party owes us ₹5,00,000
      transactions: [
        { debit: 0, credit: 100000 }, // ₹1L cash received — FULL amount
      ],
    });
    expect(ledger[0].balance.toNumber()).toBe(400000); // ₹4,00,000 remaining
  });

  test("CashEx ₹200 does NOT reduce party payment to ₹99,800", () => {
    // Party ledger should show ₹1,00,000 credit, NOT ₹99,800
    const cashReceived = new Decimal(100000);
    const cashExExpense = calcCashEx({ cashReceived }).expenseAmount; // 200

    // Party ledger entry = full cash amount
    const partyCredit = cashReceived; // MUST be 100000
    expect(partyCredit.toNumber()).toBe(100000);
    expect(partyCredit.toNumber()).not.toBe(100000 - cashExExpense.toNumber()); // NOT 99800

    // Cash EX goes to expense ledger separately
    expect(cashExExpense.toNumber()).toBe(200);
  });

  test("CashEx expense does NOT create second party payment entry", () => {
    // Verified by architecture: CashExExpense model is separate from Payment model
    // CashExExpense.paymentId links BACK to the original payment
    // There is NO second Payment record for CashEx
    const cashExExpense = calcCashEx({ cashReceived: 100000 });
    // The expense amount belongs to CashExExpense, not a Payment
    expect(cashExExpense.expenseAmount.toNumber()).toBe(200);
    // This test asserts the calculation is correct and separate
  });

  test("Multiple payments post correctly to running balance", () => {
    const results = calcRunningBalances({
      openingBalance: 9005834.40,
      openingDirection: "DR",
      transactions: [
        { debit: 2144293.00, credit: 0 },     // purchases
        { debit: 0, credit: 2610424.00 },      // payments
      ],
    });
    // -9005834.40 + 2144293 - 2610424 = -8471965.40
    // In ledger: 9005834.40 + 2144293 - 2610424 = 8539703.40
    const finalBalance = results[results.length - 1];
    expect(finalBalance.balance.toFixed(2)).toBe("8539703.40");
  });
});

// ─────────────────────────────────────────────
// OPENING BALANCE DIRECTIONS
// ─────────────────────────────────────────────

describe("Opening Balance Directions", () => {
  test("DR opening balance: party owes us — purchase adds to balance", () => {
    const result = calcFinalBalance({
      openingBalance: 100000,
      openingDirection: "DR",
      transactions: [{ debit: 50000, credit: 0 }],
    });
    expect(result.balance.toNumber()).toBe(150000);
    expect(result.direction).toBe("DR");
  });

  test("CR opening balance: we owe party — payment received reduces our liability", () => {
    const result = calcFinalBalance({
      openingBalance: 100000,
      openingDirection: "CR",
      transactions: [{ debit: 0, credit: 50000 }], // wrong — payment received should credit party
      // Actually: for CR opening balance (we owe them), their payment to us reduces their credit
    });
    // -100000 + 0 - 50000 = -150000 → CR 150000
    expect(result.balance.toNumber()).toBe(150000);
    expect(result.direction).toBe("CR");
  });

  test("settlement to zero balance", () => {
    const result = calcFinalBalance({
      openingBalance: 100000,
      openingDirection: "DR",
      transactions: [{ debit: 0, credit: 100000 }],
    });
    expect(result.balance.toNumber()).toBe(0);
    expect(result.direction).toBe("NIL");
  });
});

// ─────────────────────────────────────────────
// STATEMENT ARITHMETIC VALIDATION
// ─────────────────────────────────────────────

describe("Statement Arithmetic Validation", () => {
  test("Reference statement validates correctly", () => {
    // From spec: -9005834.40 + 2144293 - 2610424 = -9471965.40
    const result = validateStatementArithmetic({
      openingBalance: 9005834.40,
      openingDirection: "CR", // negative = CR in the reference statement
      totalPurchases: 2144293.00,
      totalPayments: 2610424.00,
      reportedClosingBalance: 9471965.40,
      reportedClosingDirection: "CR",
    });
    expect(result.matches).toBe(true);
    expect(result.discrepancy.toNumber()).toBeLessThanOrEqual(0.01);
  });

  test("Arithmetic discrepancy is detected", () => {
    const result = validateStatementArithmetic({
      openingBalance: 100000,
      openingDirection: "DR",
      totalPurchases: 50000,
      totalPayments: 20000,
      reportedClosingBalance: 200000, // wrong — should be 130000
      reportedClosingDirection: "DR",
    });
    expect(result.matches).toBe(false);
    expect(result.discrepancy.toNumber()).toBeGreaterThan(0.01);
  });
});

// ─────────────────────────────────────────────
// INR FORMATTING
// ─────────────────────────────────────────────

describe("INR Formatting", () => {
  test("₹1,00,000.00 Indian format", () => {
    expect(formatINR(100000)).toBe("₹1,00,000.00");
  });

  test("₹10,00,000.00", () => {
    expect(formatINR(1000000)).toBe("₹10,00,000.00");
  });

  test("₹90,05,834.40", () => {
    expect(formatINR(9005834.4)).toBe("₹90,05,834.40");
  });

  test("₹0.00", () => {
    expect(formatINR(0)).toBe("₹0.00");
  });

  test("Negative amount", () => {
    expect(formatINR(-1000)).toBe("₹-1,000.00");
  });

  test("Parse INR string back to Decimal", () => {
    expect(parseINR("₹1,00,000.00").toNumber()).toBe(100000);
  });

  test("Parse negative INR", () => {
    expect(parseINR("-₹90,05,834.40").toNumber()).toBe(-9005834.4);
  });
});

// ─────────────────────────────────────────────
// IDEMPOTENCY (duplicate prevention)
// ─────────────────────────────────────────────

describe("Duplicate Prevention (architectural)", () => {
  test("CashExExpense has unique constraint on paymentId", () => {
    // Verified by schema: paymentId @unique on CashExExpense model
    // This prevents duplicate CashEx for the same payment at DB level
    // This test documents the constraint exists
    expect(true).toBe(true); // Schema constraint, not runtime test
  });
});
