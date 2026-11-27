import test from 'node:test';
import assert from 'node:assert/strict';
import type { Customer } from '../engine/types';
import {
  filterCustomersForPicker,
  hasExactCustomerMatch,
  inferNewCustomerPrefill,
} from './customerPicker';

const sampleCustomers: Customer[] = [
  {
    id: 1,
    code: 'CUST-001',
    name: 'Walk-in Counter Customer',
    companyName: '',
    phone: '+880 1700-000000',
    email: '',
    binNumber: '',
    address: 'Gulshan-1, Dhaka',
    openingBalance: 0,
    creditLimit: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 2,
    code: 'CUST-002',
    name: 'রহিম এন্টারপ্রাইজ',
    companyName: 'Rahim Trading Co.',
    phone: '+880 1711-223344',
    email: 'rahim@example.com',
    binNumber: '001122334-0101',
    address: 'Chawkbazar, Dhaka',
    openingBalance: 0,
    creditLimit: 50000,
    createdAt: '2026-01-02T00:00:00.000Z',
  },
];

test('filterCustomersForPicker matches Bangla name, company, code, and normalized phone digits', () => {
  assert.equal(filterCustomersForPicker(sampleCustomers, '').length, 2);
  assert.equal(filterCustomersForPicker(sampleCustomers, 'রহিম').length, 1);
  assert.equal(filterCustomersForPicker(sampleCustomers, 'Rahim Trading').length, 1);
  assert.equal(filterCustomersForPicker(sampleCustomers, 'CUST-002').length, 1);
  assert.equal(filterCustomersForPicker(sampleCustomers, '01711223344').length, 1);
  assert.equal(filterCustomersForPicker(sampleCustomers, 'Nonexistent Buyer').length, 0);
});

test('hasExactCustomerMatch detects exact name or phone matches', () => {
  assert.equal(hasExactCustomerMatch(sampleCustomers, 'রহিম এন্টারপ্রাইজ'), true);
  assert.equal(hasExactCustomerMatch(sampleCustomers, '01711223344'), true);
  assert.equal(hasExactCustomerMatch(sampleCustomers, 'রহিম'), false);
  assert.equal(hasExactCustomerMatch(sampleCustomers, 'New Buyer'), false);
});

test('inferNewCustomerPrefill assigns phone-like input to phone and text to name', () => {
  assert.deepEqual(inferNewCustomerPrefill('01799-112233'), { name: '', phone: '01799-112233' });
  assert.deepEqual(inferNewCustomerPrefill('কামাল ট্রেডার্স'), { name: 'কামাল ট্রেডার্স', phone: '' });
  assert.deepEqual(inferNewCustomerPrefill('   '), { name: '', phone: '' });
});
