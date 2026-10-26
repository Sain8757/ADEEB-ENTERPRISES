import { generateStatementPdfBuffer } from '../lib/statement-pdf';
import Decimal from 'decimal.js';

describe('Server-Side Vector Statement PDF Generator', () => {
  test('generates valid PDF binary buffer with %PDF header', async () => {
    const buf = await generateStatementPdfBuffer({
      business: { name: 'ADEEB ENTERPRISES', mobile: '7050047146' },
      party: { name: 'TEST KHATADAR', mobile: '9876543210' },
      purchases: [
        {
          date: new Date('2026-10-25'),
          qty: 15,
          category: 'BC',
          totalWeight: new Decimal(2250),
          avgWeight: new Decimal(150),
          rate: new Decimal(250),
          amount: new Decimal(562500),
          notes: 'Lot 1',
          receiptNo: '101',
        },
      ],
      payments: [
        {
          date: new Date('2026-10-25'),
          direction: 'RECEIVED',
          method: 'CASH',
          amount: new Decimal(400000),
          notes: 'Jama 1',
        },
      ],
      openingSigned: new Decimal(0),
      closingSigned: new Decimal(162500),
      totalPurchases: new Decimal(562500),
      totalPayments: new Decimal(400000),
      totalQty: 15,
      totalWeight: new Decimal(2250),
      catWeightMap: { 'B/C': new Decimal(2250) },
      methodBreakdown: { CASH: new Decimal(400000) },
    });

    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(1000);
    // PDF Magic bytes: %PDF-
    const header = buf.subarray(0, 5).toString('ascii');
    expect(header).toBe('%PDF-');
  });
});
