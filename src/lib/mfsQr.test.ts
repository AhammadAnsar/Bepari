import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMfsPaymentQrPayload,
  computeCrc16Ccitt,
  formatShareablePaymentText,
  isValidBdMfsNumber,
  normalizeBdMfsNumber,
} from './mfsQr';

test('normalizeBdMfsNumber and isValidBdMfsNumber handle Bangladesh bKash, Nagad, and Rocket numbers', () => {
  assert.equal(normalizeBdMfsNumber('+880 1711-004821', 'bkash'), '01711004821');
  assert.equal(isValidBdMfsNumber('01711004821', 'bkash'), true);
  assert.equal(isValidBdMfsNumber('01819442190', 'nagad'), true);
  // 12-digit DBBL Rocket number with check digit
  assert.equal(normalizeBdMfsNumber('+88017110048219', 'rocket'), '017110048219');
  assert.equal(isValidBdMfsNumber('017110048219', 'rocket'), true);
  assert.equal(isValidBdMfsNumber('01711004821', 'rocket'), true);
  // Invalid numbers rejected
  assert.equal(isValidBdMfsNumber('01234567890', 'bkash'), false);
  assert.equal(isValidBdMfsNumber('12345', 'nagad'), false);
});

test('computeCrc16Ccitt produces standard EMVCo CRC-16/CCITT-FALSE checksum', () => {
  // Standard check vector: "123456789" -> 0x29B1
  assert.equal(computeCrc16Ccitt('123456789'), '29B1');
});

test('buildMfsPaymentQrPayload builds dynamic BanglaQR EMVCo TLV payloads for bKash, Nagad, and Rocket', () => {
  const bkash = buildMfsPaymentQrPayload({
    provider: 'bkash',
    merchantWallet: '+880 1711-004821',
    merchantName: 'Dhaka Trade & Textiles Ltd.',
    merchantCity: 'Dhaka',
    amount: 23460,
    invoiceNumber: 'INV-CTG-2026-00003',
    reference: 'BKS-00003-8812',
    customerName: 'Sajjad Hossain',
  });

  assert.equal(bkash.formattedAmount, '23460.00');
  assert.equal(bkash.merchantWallet, '01711004821');
  assert.ok(bkash.payload.startsWith('000201010212')); // Payload format 01 + Dynamic 12
  assert.ok(bkash.payload.includes('com.bkash.merchant'));
  assert.ok(bkash.payload.includes('5303050')); // ISO 4217 BDT = 050
  assert.ok(bkash.payload.includes('540823460.00')); // Dynamic amount tag 54
  assert.ok(bkash.payload.includes('5802BD')); // Bangladesh country code
  assert.ok(bkash.payload.includes('INV-CTG-2026-00003'));
  assert.ok(bkash.payload.endsWith(`6304${bkash.crc}`));
  assert.equal(computeCrc16Ccitt(bkash.payload.slice(0, -4)), bkash.crc);

  const nagad = buildMfsPaymentQrPayload({
    provider: 'nagad',
    merchantWallet: '01819-442190',
    merchantName: 'Dhaka Trade',
    amount: 1500.5,
    reference: 'NGD-1022',
  });
  assert.ok(nagad.payload.includes('com.nagad.merchant'));
  assert.ok(nagad.payload.includes('54071500.50'));

  const rocket = buildMfsPaymentQrPayload({
    provider: 'rocket',
    merchantWallet: '017110048219',
    merchantName: 'Dhaka Trade',
    amount: 8500,
    invoiceNumber: 'INV-DHK-2026-00004',
    reference: 'RKT-00004-1122',
  });
  assert.ok(rocket.payload.includes('com.dbbl.rocket'));
  assert.equal(rocket.formattedWallet, '01711-004821-9');
  assert.equal(computeCrc16Ccitt(rocket.payload.slice(0, -4)), rocket.crc);
});

test('buildMfsPaymentQrPayload rejects zero/negative amounts and invalid wallets', () => {
  assert.throws(() =>
    buildMfsPaymentQrPayload({
      provider: 'bkash',
      merchantWallet: '01711004821',
      merchantName: 'Test',
      amount: 0,
      reference: 'BKS-1',
    }),
  );
  assert.throws(() =>
    buildMfsPaymentQrPayload({
      provider: 'nagad',
      merchantWallet: '999',
      merchantName: 'Test',
      amount: 500,
      reference: 'NGD-1',
    }),
  );
});

test('formatShareablePaymentText produces clean bilingual collection message', () => {
  const res = buildMfsPaymentQrPayload({
    provider: 'bkash',
    merchantWallet: '01711004821',
    merchantName: 'Dhaka Trade',
    amount: 5000,
    invoiceNumber: 'INV-001',
    reference: 'BKS-001',
  });
  const bnText = formatShareablePaymentText(res, 'ঢাকা ট্রেড', '৳', 'bn');
  assert.ok(bnText.includes('বিকাশ'));
  assert.ok(bnText.includes('01711-004821'));
  assert.ok(bnText.includes('INV-001'));

  const enText = formatShareablePaymentText(res, 'Dhaka Trade', '৳', 'en');
  assert.ok(enText.includes('bKash Payment Request'));
  assert.ok(enText.includes('BKS-001'));
});
