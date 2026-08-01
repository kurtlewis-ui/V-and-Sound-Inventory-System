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
  paymentMethod: PaymentMethod;
  bankNote?: string | null;
  note?: string | null;
  paymentSplit?: PaymentSplit | null;
}

// A staged "to dispose" line — same shape as DraftItem, minus a price
// (disposals are valued at the product's current selling price server-side).
export interface DraftDisposalItem {
  productId: string;
  name: string;
  brandName: string;
  image: string | null;
  quantity: number;
}

// A staged expense entry (e.g. ₱300, "Water bill").
export interface DraftExpense {
  amount: number;
  note: string;
}

interface DraftState {
  items: DraftItem[];
  disposalItems: DraftDisposalItem[];
  expenses: DraftExpense[];
  addItem: (item: Omit<DraftItem, 'quantity'>, quantity?: number) => void;
  setQuantity: (productId: string, quantity: number) => void;
  removeItem: (productId: string) => void;
  addDisposalItem: (item: Omit<DraftDisposalItem, 'quantity'>, quantity?: number) => void;
  setDisposalQuantity: (productId: string, quantity: number) => void;
  removeDisposalItem: (productId: string) => void;
  addExpense: (expense: DraftExpense) => void;
  removeExpense: (index: number) => void;
  clear: () => void;
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
      addItem: (item, quantity = 1) =>
        set((state) => {
          const existing = state.items.find((i) => i.productId === item.productId);
          if (existing) {
            // Adding the same product again updates its payment choice to
            // whatever was just picked (most recent selection wins) while
            // accumulating quantity. If that second add used Split payment,
            // the split amounts reflect only the newest addition's total —
            // an acceptable rough edge for the rare case of staging the same
            // product twice with different splits.
            return {
              items: state.items.map((i) =>
                i.productId === item.productId
                  ? { ...i, ...item, quantity: i.quantity + quantity }
                  : i,
              ),
            };
          }
          return { items: [...state.items, { ...item, quantity }] };
        }),
      setQuantity: (productId, quantity) =>
        set((state) => ({
          items: state.items.map((i) =>
            i.productId === productId ? { ...i, quantity: Math.max(1, quantity) } : i,
          ),
        })),
      removeItem: (productId) =>
        set((state) => ({ items: state.items.filter((i) => i.productId !== productId) })),

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
          return { disposalItems: [...state.disposalItems, { ...item, quantity }] };
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

      addExpense: (expense) => set((state) => ({ expenses: [...state.expenses, expense] })),
      removeExpense: (index) =>
        set((state) => ({ expenses: state.expenses.filter((_, i) => i !== index) })),

      clear: () => set({ items: [], disposalItems: [], expenses: [] }),
    }),
    { name: 'vape-shop-draft' },
  ),
);
