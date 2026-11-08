import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const NAVY = rgb(15 / 255, 27 / 255, 45 / 255);
const GOLD = rgb(201 / 255, 162 / 255, 75 / 255);
const MUTED = rgb(90 / 255, 100 / 255, 114 / 255);
const LINE = rgb(224 / 255, 227 / 255, 231 / 255);
const PAGE_W = 595.28, PAGE_H = 841.89, M = 42;

/* Helvetica (WinAnsi) prints Latin-1 and common typography (é, ü, ·, –, “ ”, …, €); anything else is simplified
   (accents dropped) or, as a last resort, shown as "?" (e.g. Arabic or Chinese names: the client page shows them). */
const printable = value => String(value ?? '').replace(/\r/g, '').normalize('NFC')
  .replace(/[^\x20-\x7e\n\u00a0-\u00ff\u2013\u2014\u2018\u2019\u201c\u201d\u2026\u20ac\u2022]/g,
    ch => ch.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '?'));
const fmt = (n, cur) => `${cur} ${(+n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = value => value ? new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';
const safeFile = value => String(value || 'document').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90);

function wrapped(text, font, size, max) {
  const lines = [];
  for (const paragraph of printable(text).split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean); let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && font.widthOfTextAtSize(candidate, size) > max) { lines.push(line); line = word; }
      else line = candidate;
    }
    lines.push(line);
  }
  return lines.length ? lines : [''];
}

function drawText(page, text, x, y, font, size, color = NAVY, max = Infinity, leading = size * 1.25) {
  const lines = max === Infinity ? printable(text).split('\n') : wrapped(text, font, size, max);
  lines.forEach((line, i) => page.drawText(line, { x, y: y - i * leading, font, size, color, maxWidth: max }));
  return y - lines.length * leading;
}

function sectionLabel(page, label, x, y, font) {
  page.drawText(printable(label).toUpperCase(), { x, y, font, size: 8, color: GOLD, characterSpacing: 1 });
}

function header(page, inv, st, regular, bold, pageNo) {
  page.drawRectangle({ x: 0, y: PAGE_H - 8, width: PAGE_W, height: 8, color: NAVY });
  page.drawRectangle({ x: 0, y: PAGE_H - 8, width: PAGE_W / 4, height: 8, color: GOLD });
  // Gotham's four-part mark, kept as vector artwork so it stays sharp when printed.
  page.drawRectangle({ x: M, y: PAGE_H - 54, width: 17, height: 23, color: NAVY });
  page.drawRectangle({ x: M + 22, y: PAGE_H - 53, width: 12, height: 16, color: NAVY });
  page.drawRectangle({ x: M + 3, y: PAGE_H - 74, width: 12, height: 16, color: NAVY });
  page.drawRectangle({ x: M + 20, y: PAGE_H - 75, width: 17, height: 23, color: NAVY });
  page.drawText(printable(st.co_name || 'Gotham Consult'), { x: M + 48, y: PAGE_H - 51, font: bold, size: 16, color: NAVY });
  page.drawText(printable(st.inv_co_address || 'Accra, Ghana'), { x: M + 48, y: PAGE_H - 68, font: regular, size: 9, color: MUTED });
  const kind = inv.kind === 'quote' ? 'QUOTATION' : inv.kind === 'credit' ? 'CREDIT NOTE' : (inv.tax_mode === 'standard' ? 'TAX INVOICE' : 'INVOICE');
  const w = bold.widthOfTextAtSize(kind, 21);
  page.drawText(kind, { x: PAGE_W - M - w, y: PAGE_H - 50, font: bold, size: 21, color: NAVY });
  const right = text => {
    const s = printable(text), tw = regular.widthOfTextAtSize(s, 9);
    page.drawText(s, { x: PAGE_W - M - tw, y: PAGE_H - 68 - (right.i++ * 13), font: regular, size: 9, color: MUTED });
  };
  right.i = 0; right(inv.number || ''); right(`Issued: ${date(inv.issue_date)}`);
  if (inv.kind === 'quote') right(`Valid until: ${date(inv.valid_until)}`);
  else if (inv.due_date) right(`Due: ${date(inv.due_date)}`);
  if (inv.evat_ref) right(`E-VAT ref: ${inv.evat_ref}`);
  if (pageNo > 1) page.drawText(`CONTINUED · ${pageNo}`, { x: M, y: PAGE_H - 97, font: regular, size: 8, color: MUTED });
}

function drawItems(page, inv, start, end, regular, bold, y) {
  const xDesc = M, xQty = 376, xUnit = 422, xAmount = 504, endX = PAGE_W - M;
  page.drawLine({ start: { x: M, y }, end: { x: endX, y }, thickness: 1.2, color: NAVY });
  page.drawText('Description', { x: xDesc, y: y - 15, font: bold, size: 8, color: MUTED });
  page.drawText('Qty', { x: xQty, y: y - 15, font: bold, size: 8, color: MUTED });
  page.drawText('Unit', { x: xUnit, y: y - 15, font: bold, size: 8, color: MUTED });
  page.drawText('Amount', { x: xAmount, y: y - 15, font: bold, size: 8, color: MUTED });
  y -= 25;
  for (let i = start; i < end; i++) {
    const l = inv.lines[i], gross = (+l.qty || 0) * (+l.unit || 0), amount = gross - gross * (+l.discount || 0) / 100;
    const details = `${l.description || ''}${+l.discount ? ` (discount ${+l.discount}%)` : ''}`;
    const allLines = wrapped(details, regular, 9, 285), lines = allLines.slice(0, 4);
    if (allLines.length > 4) lines[3] = `${lines[3].slice(0, Math.max(0, lines[3].length - 3))}...`;
    const rowH = Math.max(26, lines.length * 12 + 10);
    lines.slice(0, 5).forEach((line, j) => page.drawText(line, { x: xDesc, y: y - 11 - j * 12, font: regular, size: 9, color: NAVY }));
    page.drawText(String(+l.qty || 0), { x: xQty, y: y - 11, font: regular, size: 9, color: NAVY });
    page.drawText(fmt(l.unit, inv.currency), { x: xUnit, y: y - 11, font: regular, size: 8, color: NAVY });
    const am = fmt(amount, inv.currency), aw = regular.widthOfTextAtSize(am, 8);
    page.drawText(am, { x: endX - aw, y: y - 11, font: regular, size: 8, color: NAVY });
    y -= rowH;
    page.drawLine({ start: { x: M, y }, end: { x: endX, y }, thickness: 0.5, color: LINE });
    y -= 5;
  }
  return y;
}

function drawSummary(page, inv, regular, bold, y) {
  const x = 300, valueX = 430, total = inv.kind === 'credit' ? -Math.abs(+inv.total || 0) : +inv.total || 0;
  const rows = [
    [`Subtotal${+inv.discount ? ' after discounts' : ''}`, fmt(inv.taxable, inv.currency)],
    ...(inv.tax_mode === 'standard' ? [
      [`VAT ${+inv.rates?.vat || 0}%`, fmt(inv.vat, inv.currency)],
      [`NHIL ${+inv.rates?.nhil || 0}%`, fmt(inv.nhil, inv.currency)],
      [`GETFund levy ${+inv.rates?.getfund || 0}%`, fmt(inv.getfund, inv.currency)],
    ] : [[inv.tax_mode === 'zero' ? 'VAT zero-rated' : inv.tax_mode === 'exempt' ? 'VAT exempt' : 'No VAT charged', fmt(0, inv.currency)]]),
    [inv.kind === 'credit' ? 'Credit total' : 'Total due', fmt(total, inv.currency)],
  ];
  for (const [label, value] of rows) {
    y -= 16;
    if (label.includes('Total due') || label === 'Credit total') page.drawLine({ start: { x, y: y + 12 }, end: { x: PAGE_W - M, y: y + 12 }, thickness: 1, color: NAVY });
    page.drawText(printable(label), { x, y, font: label.includes('Total due') || label === 'Credit total' ? bold : regular, size: label.includes('Total due') || label === 'Credit total' ? 10 : 9, color: NAVY });
    const v = printable(value), vw = bold.widthOfTextAtSize(v, 9);
    page.drawText(v, { x: PAGE_W - M - vw, y, font: bold, size: 9, color: NAVY });
  }
  if (inv.currency !== 'GHS') {
    y -= 14;
    page.drawText(`GHS equivalent (reference): ${fmt(inv.total_ghs, 'GHS')} · rate ${+inv.fx_rate || 0} on ${date(inv.fx_date || inv.issue_date)}`, { x, y, font: regular, size: 7.5, color: MUTED });
  }
  return y - 12;
}

function paymentDetails(inv, st) {
  const accounts = st.bank?.accounts || [];
  const account = accounts.find(a => a.currency === inv.currency && a.is_default) || accounts.find(a => a.currency === inv.currency);
  const legacy = inv.currency === 'GHS' ? st.inv_bank_ghs : inv.currency === 'USD' ? st.inv_bank_usd : inv.currency === 'EUR' ? st.inv_bank_eur : '';
  const bankLines = account ? [account.label, account.bank_name, account.account_name, account.account_number, account.branch, account.swift && `SWIFT ${account.swift}`].filter(Boolean)
    : legacy ? [legacy] : [st.bank?.bank_name, st.bank?.account_name, inv.currency === 'GHS' ? st.bank?.account_ghs : st.bank?.fx?.[inv.currency], st.bank?.branch, st.bank?.swift && `SWIFT ${st.bank.swift}`].filter(Boolean);
  return { bankLines, momo: [st.momo_name, st.momo_number].filter(Boolean) };
}

/** Create a versioned issued invoice/quotation/credit-note PDF with client-only acknowledgement fields. */
export async function makeInvoicePdf(inv, st) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${inv.kind === 'quote' ? 'Quotation' : inv.kind === 'credit' ? 'Credit note' : 'Invoice'} ${inv.number || ''}`);
  pdf.setAuthor(st.co_name || 'Gotham Consult');
  pdf.setSubject('Issued CRM financial document. Client acknowledgement fields are editable.');
  pdf.setCreator('Gotham Consult CRM');
  const regular = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const lines = Array.isArray(inv.lines) ? inv.lines : [];
  const pages = [];
  const perPage = 8;
  const count = Math.max(1, Math.ceil(lines.length / perPage));
  for (let n = 0; n < count; n++) {
    const page = pdf.addPage([PAGE_W, PAGE_H]); pages.push(page);
    header(page, inv, st, regular, bold, n + 1);
    let y = PAGE_H - (n ? 112 : 108);
    if (n === 0) {
      const b = inv.bill_to || {};
      sectionLabel(page, inv.kind === 'quote' ? 'Prepared for' : inv.kind === 'credit' ? 'Credited to' : 'Bill to', M, y, bold); y -= 15;
      const client = b.company || b.name || '';
      y = drawText(page, client, M, y, bold, 10, NAVY, 255, 13) - 2;
      if (b.company && b.name) y = drawText(page, b.name, M, y, regular, 9, MUTED, 255, 12) - 1;
      for (const v of [b.address, b.country, b.tax_id ? `TIN / VAT: ${b.tax_id}` : '', b.email, b.phone ? `Phone: ${b.phone}` : ''].filter(Boolean)) y = drawText(page, v, M, y, regular, 8.5, MUTED, 255, 11) - 1;
      const rightX = 330;
      sectionLabel(page, 'Currency', rightX, PAGE_H - 108, bold);
      drawText(page, inv.currency, rightX, PAGE_H - 124, bold, 11);
      if (inv.currency !== 'GHS') drawText(page, `1 ${inv.currency} = GHS ${+inv.fx_rate || 0} · ${date(inv.fx_date || inv.issue_date)}`, rightX, PAGE_H - 140, regular, 8, MUTED, 205, 10);
      if (inv.evat_ref) drawText(page, `E-VAT ref: ${inv.evat_ref}`, rightX, PAGE_H - 157, regular, 8, MUTED, 205, 10);
      y = Math.min(y, PAGE_H - 174);
    }
    const start = n * perPage, end = Math.min(lines.length, start + perPage);
    y = drawItems(page, inv, start, end, regular, bold, y);
    if (n === count - 1) {
      y = drawSummary(page, inv, regular, bold, y);
      const pay = paymentDetails(inv, st);
      if (inv.kind === 'invoice' && inv.status !== 'paid' && y > 150 && (pay.bankLines.length || pay.momo.length)) {
        sectionLabel(page, 'How to pay', M, y, bold); y -= 14;
        if (pay.bankLines.length) {
          page.drawText('Bank transfer', { x: M, y, font: bold, size: 8, color: NAVY }); y -= 11;
          for (const row of pay.bankLines) { y = drawText(page, row, M, y, regular, 7.5, MUTED, 235, 9) - 1; }
        }
        if (pay.momo.length) {
          page.drawText('Mobile Money', { x: 310, y: y + 11, font: bold, size: 8, color: NAVY });
          pay.momo.forEach((row, i) => page.drawText(printable(row), { x: 310, y: y - i * 10, font: regular, size: 7.5, color: MUTED }));
        }
      }
      if (inv.notes && y > 105) {
        y -= 8; sectionLabel(page, 'Notes', M, y, bold); y -= 13;
        y = drawText(page, inv.notes, M, y, regular, 8, MUTED, PAGE_W - M * 2, 10) - 6;
      }
      let signPage = page, signPageNo = n + 1;
      if (y < 168) { signPage = pdf.addPage([PAGE_W, PAGE_H]); pages.push(signPage); signPageNo = count + 1; header(signPage, inv, st, regular, bold, signPageNo); }
      const signY = 102;
      signPage.drawLine({ start: { x: M, y: signY + 42 }, end: { x: PAGE_W - M, y: signY + 42 }, thickness: 0.7, color: LINE });
      signPage.drawText('CLIENT ACKNOWLEDGEMENT', { x: M, y: signY + 27, font: bold, size: 8, color: NAVY, characterSpacing: 0.7 });
      signPage.drawText('Type your full name and date, then tick to confirm receipt. DD/MM/YYYY.', { x: M, y: signY + 14, font: regular, size: 7.5, color: MUTED });
      const form = pdf.getForm();
      const name = form.createTextField('client.typed_name'); name.setMaxLength(90);
      name.addToPage(signPage, { x: M, y: signY - 16, width: 210, height: 22, font: regular, fontSize: 9, borderWidth: 0.7, borderColor: LINE, backgroundColor: rgb(1, 1, 1), textColor: NAVY });
      const ackDate = form.createTextField('client.acknowledgement_date'); ackDate.setMaxLength(10);
      ackDate.addToPage(signPage, { x: 260, y: signY - 16, width: 92, height: 22, font: regular, fontSize: 9, borderWidth: 0.7, borderColor: LINE, backgroundColor: rgb(1, 1, 1), textColor: NAVY });
      const check = form.createCheckBox('client.received'); check.addToPage(signPage, { x: 365, y: signY - 11, width: 14, height: 14, borderWidth: 0.7, borderColor: MUTED });
      signPage.drawText('Received', { x: 384, y: signY - 8, font: regular, size: 8, color: NAVY });
      signPage.drawText('Typing a name is an acknowledgement, not a certificate-based digital signature.', { x: M, y: 42, font: regular, size: 7, color: MUTED });
    }
  }
  pages.forEach((page, i) => page.drawText(`${printable(st.co_name || 'Gotham Consult')} · ${printable(inv.number || '')} · ${i + 1} / ${pages.length}`, { x: M, y: 23, font: regular, size: 7, color: MUTED }));
  const bytes = await pdf.save({ useObjectStreams: false });
  return { bytes: Buffer.from(bytes), filename: safeFile(`${inv.kind}-${inv.number || inv.id}-fillable.pdf`) };
}

