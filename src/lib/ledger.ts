// ADEEB ENTERPRISES — Ledger posting service
// Handles all party ledger entries atomically using DB transactions.
// Never directly updates ledger entries — always creates new entries or reversals.

import { prisma } from "./prisma";
import { calcCashEx, isCashExEligible, calcPurchase } from "./accounting";
import { audit, AUDIT_ACTIONS } from "./audit";
import Decimal from "decimal.js";
import type {
  Party,
  PurchaseEntry,
  Payment,
  CashExExpense,
} from "@prisma/client";

// ─────────────────────────────────────────────
// GET PARTY CURRENT BALANCE
// ─────────────────────────────────────────────

export async function getPartyBalance(partyId: string): Promise<{
  balance: Decimal;
  direction: "DR" | "CR" | "NIL";
}> {
  const lastEntry = await prisma.ledgerEntry.findFirst({
    where: { partyId, reversed: false },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });

  if (!lastEntry) {
    const party = await prisma.party.findUnique({ where: { id: partyId } });
    if (!party) throw new Error("Party not found");
    return {
      balance: new Decimal(party.openingBalance.toString()),
      direction: party.openingBalanceDirection as "DR" | "CR",
    };
  }

  const bal = new Decimal(lastEntry.runningBalance.toString());
  return {
    balance: bal.abs(),
    direction: bal.isZero() ? "NIL" : bal.gt(0) ? "DR" : "CR",
  };
}

// ─────────────────────────────────────────────
// POST PURCHASE TO LEDGER
// ─────────────────────────────────────────────

export async function postPurchase(
  purchase: PurchaseEntry,
  userId?: string
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const currentBalance = await getSignedBalance(purchase.partyId, tx);
    const amount = new Decimal(purchase.amount.toString());
    // Purchase = DEBIT (party owes us more)
    const newBalance = currentBalance.plus(amount);

    await tx.ledgerEntry.create({
      data: {
        partyId: purchase.partyId,
        date: purchase.date,
        txType: "PURCHASE",
        refNo: purchase.receiptNo,
        description: `Purchase — ${purchase.category} — Qty ${purchase.qty} — ${purchase.totalWeight}kg`,
        debit: amount.toFixed(2),
        credit: "0",
        runningBalance: newBalance.toFixed(2),
        sourceTxId: purchase.id,
        sourceTxType: "PURCHASE",
        createdById: userId,
      },
    });
  });
}

// ─────────────────────────────────────────────
// POST PAYMENT TO LEDGER
// ─────────────────────────────────────────────

export async function postPayment(
  payment: Payment,
  userId?: string,
  cashExSettings?: { rate: number; basis: number }
): Promise<{ cashExExpense?: CashExExpense }> {
  let cashExExpense: CashExExpense | undefined;

  await prisma.$transaction(async (tx) => {
    const currentBalance = await getSignedBalance(payment.partyId, tx);
    const amount = new Decimal(payment.amount.toString());

    let newBalance: Decimal;
    let debit = new Decimal(0);
    let credit = new Decimal(0);
    let description: string;

    if (payment.direction === "RECEIVED") {
      // Payment received from party = CREDIT (reduces what party owes us)
      credit = amount;
      newBalance = currentBalance.minus(amount);
      description = `Payment Received — ${payment.method}${payment.refNo ? ` — Ref: ${payment.refNo}` : ""}`;
    } else {
      // Payment paid to party = DEBIT (we owe them more, or reduces what they owe us)
      debit = amount;
      newBalance = currentBalance.plus(amount);
      description = `Payment Paid — ${payment.method}${payment.refNo ? ` — Ref: ${payment.refNo}` : ""}`;
    }

    await tx.ledgerEntry.create({
      data: {
        partyId: payment.partyId,
        date: payment.date,
        txType: payment.direction === "RECEIVED" ? "PAYMENT_RECEIVED" : "PAYMENT_PAID",
        refNo: payment.refNo,
        description,
        debit: debit.toFixed(2),
        credit: credit.toFixed(2),
        runningBalance: newBalance.toFixed(2),
        sourceTxId: payment.id,
        sourceTxType: "PAYMENT",
        createdById: userId,
      },
    });

    // ── CASH EX EXPENSE ──────────────────────────────
    // Only for CASH RECEIVED payments.
    // Cash EX is a SEPARATE expense — never deducted from party ledger.
    if (isCashExEligible(payment.direction, payment.method)) {
      const rate = cashExSettings?.rate ?? 200;
      const basis = cashExSettings?.basis ?? 100000;
      const cashExResult = calcCashEx({
        cashReceived: payment.amount.toString(),
        rate,
        basis,
      });

      cashExExpense = await tx.cashExExpense.create({
        data: {
          paymentId: payment.id,
          date: payment.date,
          cashAmount: payment.amount.toString(),
          expenseAmount: cashExResult.expenseAmount.toFixed(2),
          rateApplied: String(rate),
          basisApplied: String(basis),
          confirmedById: userId,
        },
      }) as CashExExpense;
    }
  });

  return { cashExExpense };
}

// ─────────────────────────────────────────────
// POST OPENING BALANCE TO LEDGER
// ─────────────────────────────────────────────

export async function postOpeningBalance(
  party: Party,
  userId?: string
): Promise<void> {
  if (!party.openingBalance || new Decimal(party.openingBalance.toString()).isZero()) return;

  const amount = new Decimal(party.openingBalance.toString());
  const signedBalance =
    party.openingBalanceDirection === "DR" ? amount : amount.neg();

  await prisma.ledgerEntry.create({
    data: {
      partyId: party.id,
      date: party.openingBalanceDate ?? new Date(),
      txType: "OPENING_BALANCE",
      description: `Opening Balance — ${party.openingBalanceDirection === "DR" ? "Receivable" : "Payable"}`,
      debit: party.openingBalanceDirection === "DR" ? amount.toFixed(2) : "0",
      credit: party.openingBalanceDirection === "CR" ? amount.toFixed(2) : "0",
      runningBalance: signedBalance.toFixed(2),
      createdById: userId,
    },
  });
}

// ─────────────────────────────────────────────
// REVERSE A LEDGER ENTRY
// ─────────────────────────────────────────────

export async function reverseTransaction(
  txId: string,
  txType: "PURCHASE" | "PAYMENT",
  userId: string,
  note: string
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Find the original ledger entry
    const original = await tx.ledgerEntry.findFirst({
      where: { sourceTxId: txId, reversed: false },
    });
    if (!original) throw new Error("Ledger entry not found for reversal");

    // Mark original as reversed
    await tx.ledgerEntry.update({
      where: { id: original.id },
      data: { reversed: true },
    });

    const currentBalance = await getSignedBalance(original.partyId, tx);
    const debit = new Decimal(original.debit.toString());
    const credit = new Decimal(original.credit.toString());

    // Reversal = swap debit and credit
    const newBalance = currentBalance.minus(debit).plus(credit);

    await tx.ledgerEntry.create({
      data: {
        partyId: original.partyId,
        date: new Date(),
        txType: "REVERSAL",
        description: `REVERSAL of ${original.description} — ${note}`,
        debit: credit.toFixed(2),  // swapped
        credit: debit.toFixed(2),  // swapped
        runningBalance: newBalance.toFixed(2),
        sourceTxId: txId,
        sourceTxType: txType,
        createdById: userId,
        reversed: false,
      },
    });

    // Mark source transaction as reversed
    if (txType === "PURCHASE") {
      await tx.purchaseEntry.update({
        where: { id: txId },
        data: { reversed: true, reversedById: userId, reversedAt: new Date(), reversalNote: note },
      });
    } else {
      await tx.payment.update({
        where: { id: txId },
        data: { reversed: true, reversedById: userId, reversedAt: new Date(), reversalNote: note },
      });
    }

    await audit({
      userId,
      action: AUDIT_ACTIONS.REVERSE,
      entity: txType === "PURCHASE" ? "PurchaseEntry" : "Payment",
      entityId: txId,
      note,
    });
  });
}

// ─────────────────────────────────────────────
// INTERNAL HELPER
// ─────────────────────────────────────────────

async function getSignedBalance(
  partyId: string,
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]
): Promise<Decimal> {
  const lastEntry = await tx.ledgerEntry.findFirst({
    where: { partyId, reversed: false },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });

  if (lastEntry) {
    return new Decimal(lastEntry.runningBalance.toString());
  }

  // Fall back to party opening balance
  const party = await tx.party.findUnique({ where: { id: partyId } });
  if (!party) throw new Error(`Party ${partyId} not found`);

  const ob = new Decimal(party.openingBalance.toString());
  return party.openingBalanceDirection === "DR" ? ob : ob.neg();
}

// ─────────────────────────────────────────────
// CREATE FULL PURCHASE ENTRY (with ledger posting)
// ─────────────────────────────────────────────

export async function createPurchaseEntry(data: {
  date: Date;
  partyId: string;
  receiptNo?: string;
  qty: number;
  category: "BC" | "SC" | "VC_HISTORICAL";
  totalWeight: string;
  rate: string;
  notes?: string;
  userId?: string;
  importBatchId?: string;
}): Promise<PurchaseEntry> {
  const calc = calcPurchase({
    qty: data.qty,
    totalWeight: data.totalWeight,
    rate: data.rate,
  });

  const purchase = await prisma.$transaction(async (tx) => {
    const entry = await tx.purchaseEntry.create({
      data: {
        date: data.date,
        partyId: data.partyId,
        receiptNo: data.receiptNo,
        qty: data.qty,
        category: data.category as any,
        totalWeight: data.totalWeight,
        avgWeight: calc.avgWeight.toFixed(3),
        rate: data.rate,
        amount: calc.amount.toFixed(2),
        notes: data.notes,
        createdById: data.userId,
        importBatchId: data.importBatchId,
      },
    });

    // Post to ledger immediately
    const currentBalance = await getSignedBalance(data.partyId, tx);
    const amount = calc.amount;
    const newBalance = currentBalance.plus(amount);

    await tx.ledgerEntry.create({
      data: {
        partyId: data.partyId,
        date: data.date,
        txType: "PURCHASE",
        refNo: data.receiptNo,
        description: `Purchase — ${data.category} — Qty ${data.qty} — ${data.totalWeight}kg @ ₹${data.rate}/kg`,
        debit: amount.toFixed(2),
        credit: "0",
        runningBalance: newBalance.toFixed(2),
        sourceTxId: entry.id,
        sourceTxType: "PURCHASE",
        createdById: data.userId,
      },
    });

    // Update rate history
    await tx.rateHistory.create({
      data: {
        partyId: data.partyId,
        category: data.category as any,
        rate: data.rate,
      },
    });

    return entry;
  });

  await audit({
    userId: data.userId,
    action: AUDIT_ACTIONS.CREATE,
    entity: "PurchaseEntry",
    entityId: purchase.id,
    after: purchase as unknown as object,
  });

  return purchase;
}

// ─────────────────────────────────────────────
// CREATE FULL PAYMENT ENTRY (with ledger posting + Cash EX)
// ─────────────────────────────────────────────

export async function createPaymentEntry(data: {
  date: Date;
  partyId: string;
  refNo?: string;
  direction: "RECEIVED" | "PAID";
  method: string;
  amount: string;
  notes?: string;
  bankRef?: string;
  userId?: string;
  importBatchId?: string;
  cashExRateConfig?: { rate: number; basis: number };
}): Promise<{ payment: Payment; cashExExpense?: CashExExpense }> {
  let createdPayment!: Payment;
  let cashExExpense: CashExExpense | undefined;

  await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        date: data.date,
        partyId: data.partyId,
        refNo: data.refNo,
        direction: data.direction as any,
        method: data.method,
        amount: data.amount,
        notes: data.notes,
        bankRef: data.bankRef,
        createdById: data.userId,
        importBatchId: data.importBatchId,
      },
    });
    createdPayment = payment as Payment;

    const currentBalance = await getSignedBalance(data.partyId, tx);
    const amount = new Decimal(data.amount);
    let newBalance: Decimal;
    let debit = new Decimal(0);
    let credit = new Decimal(0);

    if (data.direction === "RECEIVED") {
      credit = amount;
      newBalance = currentBalance.minus(amount);
    } else {
      debit = amount;
      newBalance = currentBalance.plus(amount);
    }

    await tx.ledgerEntry.create({
      data: {
        partyId: data.partyId,
        date: data.date,
        txType: data.direction === "RECEIVED" ? "PAYMENT_RECEIVED" : "PAYMENT_PAID",
        refNo: data.refNo,
        description: `${data.direction === "RECEIVED" ? "Payment Received" : "Payment Paid"} — ${data.method}`,
        debit: debit.toFixed(2),
        credit: credit.toFixed(2),
        runningBalance: newBalance.toFixed(2),
        sourceTxId: payment.id,
        sourceTxType: "PAYMENT",
        createdById: data.userId,
      },
    });

    // Cash EX — SEPARATE expense, never deducted from party ledger
    if (isCashExEligible(data.direction, data.method)) {
      const rate = data.cashExRateConfig?.rate ?? 200;
      const basis = data.cashExRateConfig?.basis ?? 100000;
      const cashExResult = calcCashEx({ cashReceived: data.amount, rate, basis });

      cashExExpense = await tx.cashExExpense.create({
        data: {
          paymentId: payment.id,
          date: data.date,
          cashAmount: data.amount,
          expenseAmount: cashExResult.expenseAmount.toFixed(2),
          rateApplied: String(rate),
          basisApplied: String(basis),
          confirmedById: data.userId,
        },
      }) as CashExExpense;
    }
  });

  await audit({
    userId: data.userId,
    action: AUDIT_ACTIONS.CREATE,
    entity: "Payment",
    entityId: createdPayment.id,
    after: createdPayment as unknown as object,
  });

  if (cashExExpense) {
    await audit({
      userId: data.userId,
      action: AUDIT_ACTIONS.CASHEX_CONFIRM,
      entity: "CashExExpense",
      entityId: cashExExpense.id,
      after: cashExExpense as unknown as object,
    });
  }

  return { payment: createdPayment, cashExExpense };
}
