'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PaymentMethod, PaymentSplit } from './types';

// A single line in the staff's draft order (the "bag"). Prices are snapshots
// for display only; the backend re-snapshots them when the sale is created.
export interface DraftItem {
  productId: string;
  name: string;
  brandName: string;
  unitPrice: number;
  image: string | null;
  quantity: number;
  discount?: number;
  paymentMethod: PaymentMethod;
  bankNote?: string | null;
  note?: string | null;
  paymentSplit?: PaymentSplit | null;
  // ISO timestamp of when this item was added to the draft.
  addedAt?: string;
}

// A staged "to dispose" line — same shape as DraftItem, minus a price
// (disposals are valued at the product's current selling price server-side).
export interface DraftDisposalItem {
  productId: string;
  name: string;
  brandName: string;
  image: string | null;
  quantity: number;
  reason?: string | null;
  addedAt?: string;
}

// A staged expense entry (e.g. ₱300, "Water bill").
export interface DraftExpense {
  amount: number;
  note: string;
  addedAt?: string;
}

interface DraftState {
  items: DraftItem[];
  disposalItems: DraftDisposalItem[];
  expenses: DraftExpense[];
  customerName: string;
  addItem: (item: Omit<DraftItem, 'quantity' | 'addedAt'>, quantity?: number) => void;
  setQuantity: (productId: string, quantity: number) => void;
  removeItem: (productId: string) => void;
  updateItemPayment: (productId: string, updates: {
    paymentMethod: PaymentMethod;
    bankNote?: string | null;
    paymentSplit?: PaymentSplit | null;
  }) => void;
  addDisposalItem: (item: Omit<DraftDisposalItem, 'quantity'>, quantity?: number) => void;
  setDisposalQuantity: (productId: string, quantity: number) => void;
  removeDisposalItem: (productId: string) => void;
  addExpense: (expense: DraftExpense) => void;
  removeExpense: (index: number) => void;
  setCustomerName: (name: string) => void;
  clear: () => void;
  // Adopt the server's current draft content wholesale — used to pull down
  // changes this device didn't make itself (e.g. an admin decline copying
  // an item back into the draft). Only called while idle (see DraftBag).
  replaceAll: (items: DraftItem[], disposalItems: DraftDisposalItem[], expenses: DraftExpense[]) => void;
}

/**
 * Client-side draft order for staff — items to sell, items to write off, and
 * expenses to log, all staged here before a single "Save Order" submits
 * everything together. Persisted to localStorage so an accidental refresh
 * doesn't lose an in-progress order.
 */
export const useDraftStore = create<DraftState>()(
  persist(
    (set) => ({
      items: [],
      disposalItems: [],
      expenses: [],
      customerName: '',
      addItem: (item, quantity = 1) =>
        set((state) => {
          const existing = state.items.find((i) => i.productId === item.productId);
          if (existing) {
            // Same product added again — treat as a separate line item to
            // avoid overwriting the first entry's payment details. The user
            // can remove duplicates if unintended.
            return {
              items: [...state.items, { ...item, quantity, addedAt: new Date().toISOString() }],
            };
          }
          return { items: [...state.items, { ...item, quantity, addedAt: new Date().toISOString() }] };
        }),
      setQuantity: (productId, quantity) =>
        set((state) => ({
          items: state.items.map((i) => {
            if (i.productId !== productId) return i;
            const newQty = Math.max(1, quantity);
            // If the item has a split payment, reset it when quantity changes
            // because the original split amounts are now stale (they were
            // calculated for the old quantity). The user must re-enter splits.
            if (i.paymentMethod === 'Split' && i.paymentSplit && newQty !== i.quantity) {
              return { ...i, quantity: newQty, paymentMethod: 'Cash' as PaymentMethod, paymentSplit: null };
            }
            return { ...i, quantity: newQty };
          }),
        })),
      removeItem: (productId) =>
        set((state) => ({ items: state.items.filter((i) => i.productId !== productId) })),

      updateItemPayment: (productId, updates) =>
        set((state) => ({
          items: state.items.map((i) =>
            i.productId === productId ? { ...i, ...updates } : i,
          ),
        })),

      addDisposalItem: (item, quantity = 1) =>
        set((state) => {
          const existing = state.disposalItems.find((i) => i.productId === item.productId);
          if (existing) {
            return {
              disposalItems: state.disposalItems.map((i) =>
                i.productId === item.productId
                  ? { ...i, quantity: i.quantity + quantity }
                  : i,
              ),
            };
          }
          return { disposalItems: [...state.disposalItems, { ...item, quantity, addedAt: new Date().toISOString() }] };
        }),
      setDisposalQuantity: (productId, quantity) =>
        set((state) => ({
          disposalItems: state.disposalItems.map((i) =>
            i.productId === productId ? { ...i, quantity: Math.max(1, quantity) } : i,
          ),
        })),
      removeDisposalItem: (productId) =>
        set((state) => ({
          disposalItems: state.disposalItems.filter((i) => i.productId !== productId),
        })),

      addExpense: (expense) => set((state) => ({ expenses: [...state.expenses, { ...expense, addedAt: new Date().toISOString() }] })),
      removeExpense: (index) =>
        set((state) => ({ expenses: state.expenses.filter((_, i) => i !== index) })),

      setCustomerName: (name) => set({ customerName: name }),

      clear: () => set({ items: [], disposalItems: [], expenses: [], customerName: '' }),

      replaceAll: (items, disposalItems, expenses) => set({ items, disposalItems, expenses }),
    }),
    { name: 'vape-shop-draft' },
  ),
);
