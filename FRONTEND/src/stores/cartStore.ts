import { create } from "zustand";
import type { Cart } from "../types";

interface CartState {
  quantities: Cart;
  hydrated: boolean;
  setCart: (cart: Cart) => void;
  addItem: (productId: number | string, quantity?: number) => void;
  removeItem: (productId: number | string) => void;
  clear: () => void;
}

const normalizeCart = (cart: Cart): Cart =>
  Object.fromEntries(
    Object.entries(cart || {}).map(([productId, quantity]) => [
      String(productId),
      Number(quantity),
    ])
  );

export const useCartStore = create<CartState>()((set) => ({
  quantities: {},
  hydrated: false,
  setCart: (cart) => set({ quantities: normalizeCart(cart), hydrated: true }),
  addItem: (productId, quantity = 1) =>
    set((state) => {
      const key = String(productId);
      return {
        quantities: {
          ...state.quantities,
          [key]: (state.quantities[key] || 0) + quantity,
        },
        hydrated: true,
      };
    }),
  removeItem: (productId) =>
    set((state) => {
      const quantities = { ...state.quantities };
      delete quantities[String(productId)];
      return { quantities, hydrated: true };
    }),
  clear: () => set({ quantities: {}, hydrated: false }),
}));
