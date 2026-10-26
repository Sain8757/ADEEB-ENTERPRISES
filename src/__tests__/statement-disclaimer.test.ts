// ADEEB ENTERPRISES — Statement PDF Disclaimer Verification Test
// Verifies that:
//  1. The exact disclaimer appears in the #running-footer (per-page CSS element)
//  2. The exact disclaimer appears in .doc-footer (end-of-document fallback)
//  3. The @page CSS rule includes the correct bottom margin for the footer
//  4. The disclaimer is NOT only in a comment or attribute — it's in content

import * as fs from 'fs';
import * as path from 'path';

const ROUTE_FILE = path.join(
  __dirname,
  '../app/api/statement/[partyId]/pdf/route.ts'
);

const DISCLAIMER = 'Computer-generated statement of account. Not a tax invoice.';

describe('Account Statement PDF — Disclaimer', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(ROUTE_FILE, 'utf-8');
  });

  test('source file exists', () => {
    expect(fs.existsSync(ROUTE_FILE)).toBe(true);
  });

  test('exact disclaimer string is declared once as the single source of truth', () => {
    // Should appear as the DISCLAIMER constant assignment
    expect(source).toContain(`'${DISCLAIMER}'`);
  });

  test('disclaimer appears inside #running-footer (per-page CSS element)', () => {
    // The running-footer div must contain the disclaimer
    const runningFooterBlock = source.match(
      /<div id="running-footer"[\s\S]*?<\/div>/
    );
    expect(runningFooterBlock).not.toBeNull();
    expect(runningFooterBlock![0]).toContain(DISCLAIMER);
  });

  test('disclaimer appears inside .doc-footer (end-of-document fallback)', () => {
    // The doc-footer section must contain the disclaimer
    const docFooterBlock = source.match(
      /<div class="doc-footer"[\s\S]*?<\/div>\s*\n\s*<\/body>/
    );
    expect(docFooterBlock).not.toBeNull();
    expect(docFooterBlock![0]).toContain(DISCLAIMER);
  });

  test('@page rule includes extra bottom margin for footer (≥ 25mm)', () => {
    // Must have at least 25mm bottom margin to ensure footer does not overlap content
    const pageRule = source.match(/@page\s*{[\s\S]*?}/);
    expect(pageRule).not.toBeNull();
    // e.g. "margin: 15mm 15mm 28mm 15mm" → bottom is ≥ 25mm
    const marginMatch = pageRule![0].match(/margin:\s*[\d.]+mm\s+[\d.]+mm\s+([\d.]+)mm/);
    if (marginMatch) {
      const bottomMm = parseFloat(marginMatch[1]);
      expect(bottomMm).toBeGreaterThanOrEqual(25);
    } else {
      // If using margin-bottom shorthand
      const bottomOnly = pageRule![0].match(/margin-bottom:\s*([\d.]+)mm/);
      if (bottomOnly) {
        expect(parseFloat(bottomOnly[1])).toBeGreaterThanOrEqual(25);
      } else {
        // Accept if shorthand includes ≥ 25mm in the fourth or third position
        // "15mm 15mm 28mm 15mm"  → 28mm bottom
        fail('Could not find a bottom margin ≥ 25mm in @page rule. Footer may overlap content.');
      }
    }
  });

  test('@bottom-center references the page-footer running element', () => {
    expect(source).toContain('@bottom-center');
    expect(source).toContain('element(page-footer)');
  });

  test('position:running() is declared on #running-footer', () => {
    expect(source).toContain('position: running(page-footer)');
  });

  test('disclaimer is in actual content, not only in CSS comments', () => {
    // Remove all CSS comment blocks then check disclaimer still present
    const noComments = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
    expect(noComments).toContain(DISCLAIMER);
  });

  test('@media print hides .no-print toolbar', () => {
    expect(source).toContain('@media print');
    expect(source).toContain('display: none');
    expect(source).toContain('.no-print');
  });

  test('page-break-inside: avoid on table rows prevents content/footer overlap', () => {
    expect(source).toContain('page-break-inside: avoid');
  });

  test('disclaimer does not appear only in JavaScript — it must be in HTML template', () => {
    // The template is inside generateStatementHtml() which returns a string literal.
    // Both occurrences should be inside the returned HTML string (backtick template).
    const templateStart = source.indexOf('return `');
    expect(templateStart).toBeGreaterThan(-1);
    const htmlTemplate = source.slice(templateStart);
    const count = (htmlTemplate.match(/Computer-generated statement of account\. Not a tax invoice\./g) ?? []).length;
    // At least 2: one in #running-footer, one in .doc-footer
    expect(count).toBeGreaterThanOrEqual(2);
  });
});
