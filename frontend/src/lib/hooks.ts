'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import { api } from './api';
import type { DraftItem, DraftDisposalItem, DraftExpense } from './draft';
import type {
  ActivityLog,
  AuthUser,
  Branch,
  BranchSummary,
  Brand,
  DashboardStats,
  Disposal,
  DisposalSummary,
  Expense,
  ExpenseSummary,
  FullUser,
  Pagination,
  PaymentMethod,
  PaymentSplit,
  Product,
  RoleOption,
  Sale,
  SalesOverviewPoint,
  SalesSummary,
  StaffDraft,
  TopProduct,
} from './types';

// Staff Drafts / Pending Disposals / Pending Expenses poll this often on the
// admin's Pending Sales page so it feels close to real-time.
const LIVE_POLL_MS = 10_000;

// Returns false when the browser tab is hidden or the device is offline,
// pausing polling to save bandwidth and battery.
function shouldPoll(): number | false {
  if (typeof document !== 'undefined' && document.hidden) return false;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return false;
  return LIVE_POLL_MS;
}

// Every backend response is wrapped as { success, data, pagination?, summary? }.
async function getData<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const res = await api.get(url, { params });
  return res.data.data as T;
}

interface ListResult<T> {
  data: T[];
  pagination?: Pagination;
  summary?: SalesSummary;
}

async function getList<T>(
  url: string,
  params?: Record<string, unknown>,
): Promise<ListResult<T>> {
  const res = await api.get(url, { params });
  return {
    data: (res.data.data ?? []) as T[],
    pagination: res.data.pagination,
    summary: res.data.summary,
  };
}

// Helper to invalidate several query-key prefixes after a mutation.
function useInvalidate() {
  const qc = useQueryClient();
  return (...keys: QueryKey[]) =>
    keys.forEach((key) => qc.invalidateQueries({ queryKey: key }));
}

// ===========================================================================
// BRANCHES (Shops)
// ===========================================================================
export function useBranches() {
  return useQuery({
    queryKey: ['branches'],
    queryFn: () => getList<Branch>('/branches', { limit: 200 }),
  });
}

export function useArchivedBranches() {
  return useQuery({
    queryKey: ['branches', 'archived'],
    queryFn: () => getData<Branch[]>('/branches/archived'),
  });
}

export function useCreateBranch() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: { name: string; address?: string }) =>
      api.post('/branches', body).then((r) => r.data.data),
    onSuccess: () => invalidate(['branches'], ['stats']),
  });
}

export function useUpdateBranch() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; address?: string }) =>
      api.patch(`/branches/${id}`, body).then((r) => r.data.data),
    onSuccess: () => invalidate(['branches']),
  });
}

export function useArchiveBranch() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/branches/${id}`).then((r) => r.data.data),
    onSuccess: () => invalidate(['branches'], ['stats']),
  });
}

export function useRestoreBranch() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) =>
      api.post(`/branches/${id}/restore`).then((r) => r.data.data),
    onSuccess: () => invalidate(['branches'], ['stats']),
  });
}

// ===========================================================================
// BRANDS
// ===========================================================================
export function useBrands(search?: string) {
  return useQuery({
    queryKey: ['brands', { search }],
    queryFn: () => getList<Brand>('/brands', { limit: 200, search: search || undefined }),
  });
}

export function useArchivedBrands() {
  return useQuery({
    queryKey: ['brands', 'archived'],
    queryFn: () => getList<Brand>('/brands/archived', { limit: 200 }),
  });
}

export function useCreateBrand() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: { name: string; coverImage?: string | null }) =>
      api.post('/brands', body).then((r) => r.data.data),
    onSuccess: () => invalidate(['brands'], ['stats']),
  });
}

export function useUpdateBrand() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; coverImage?: string | null }) =>
      api.patch(`/brands/${id}`, body).then((r) => r.data.data),
    onSuccess: () => invalidate(['brands']),
  });
}

export function useArchiveBrand() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/brands/${id}`).then((r) => r.data.data),
    onSuccess: () => invalidate(['brands'], ['stats']),
  });
}

export function useRestoreBrand() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.post(`/brands/${id}/restore`).then((r) => r.data.data),
    onSuccess: () => invalidate(['brands'], ['stats']),
  });
}

// ===========================================================================
// PRODUCTS
// ===========================================================================
export interface ProductMutationInput {
  name: string;
  brandId: string;
  variantType?: string;
  sellingPrice: number;
  costPrice?: number;
  quantityAlert?: number;
  image?: string;
  quantities?: { branchId: string; quantity: number }[];
}

export function useProducts(params?: { search?: string; brandId?: string; branchId?: string; page?: number; limit?: number }) {
  return useQuery({
    queryKey: ['products', params ?? {}],
    queryFn: () =>
      getList<Product>('/products', {
        limit: params?.limit ?? 20,
        page: params?.page ?? 1,
        search: params?.search || undefined,
        brandId: params?.brandId || undefined,
        branchId: params?.branchId || undefined,
      }),
  });
}

export function useArchivedProducts() {
  return useQuery({
    queryKey: ['products', 'archived'],
    queryFn: () => getList<Product>('/products/archived', { limit: 200 }),
  });
}

export interface ImportProductRow {
  name: string;
  brand: string;
  sellingPrice: number;
  quantityAlert?: number;
  quantities?: { branchName: string; quantity: number }[];
}

export function useImportProducts() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (products: ImportProductRow[]) =>
      api.post('/products/import', { products }).then((r) => r.data.data),
    onSuccess: () => invalidate(['products'], ['brands'], ['stats']),
  });
}

export interface RestockItem {
  productId?: string;
  productName?: string;
  branchId?: string;
  branchName?: string;
  quantity: number;
}

export function useRestock() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (items: RestockItem[]) =>
      api.post('/products/restock', { items }).then((r) => r.data.data),
    onSuccess: () => invalidate(['products'], ['stats']),
  });
}

export function useCreateProduct() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: ProductMutationInput) =>
      api.post('/products', body).then((r) => r.data.data),
    onSuccess: () => invalidate(['products'], ['stats']),
  });
}

export function useUpdateProduct() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...body }: ProductMutationInput & { id: string }) =>
      api.patch(`/products/${id}`, body).then((r) => r.data.data),
    onSuccess: () => invalidate(['products']),
  });
}

export function useArchiveProduct() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/products/${id}`).then((r) => r.data.data),
    onSuccess: () => invalidate(['products'], ['stats']),
  });
}

export function useRestoreProduct() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) =>
      api.post(`/products/${id}/restore`).then((r) => r.data.data),
    onSuccess: () => invalidate(['products'], ['stats']),
  });
}

// ===========================================================================
// PRODUCT VARIANTS (Flavors)
// ===========================================================================
export function useVariants(productId?: string) {
  return useQuery({
    queryKey: ['variants', productId],
    queryFn: () => getData<import('./types').ProductVariant[]>(`/products/${productId}/variants`),
    enabled: !!productId,
  });
}

export function useCreateVariant() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ productId, ...body }: { productId: string; name: string; sellingPrice: number; costPrice?: number }) =>
      api.post(`/products/${productId}/variants`, body).then((r) => r.data.data),
    onSuccess: () => invalidate(['products'], ['variants']),
  });
}

export function useUpdateVariant() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ variantId, ...body }: { variantId: string; name?: string; sellingPrice?: number; costPrice?: number }) =>
      api.patch(`/products/variants/${variantId}`, body).then((r) => r.data.data),
    onSuccess: () => invalidate(['products'], ['variants']),
  });
}

export function useDeleteVariant() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (variantId: string) =>
      api.delete(`/products/variants/${variantId}`).then((r) => r.data.data),
    onSuccess: () => invalidate(['products'], ['variants']),
  });
}

// ===========================================================================
// USERS
// ===========================================================================
export function useUsers(search?: string) {
  return useQuery({
    queryKey: ['users', { search }],
    queryFn: () => getList<FullUser>('/users', { limit: 100, search: search || undefined }),
  });
}

export function useArchivedUsers() {
  return useQuery({
    queryKey: ['users', 'archived'],
    queryFn: () => getList<FullUser>('/users/archived', { limit: 100 }),
  });
}

export function useRoles() {
  return useQuery({
    queryKey: ['roles'],
    queryFn: () => getData<RoleOption[]>('/users/roles'),
  });
}

export interface UserCreateInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  middleInitial?: string;
  roleId: string;
  branchId?: string;
  avatarUrl?: string;
}

export function useCreateUser() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: UserCreateInput) =>
      api.post('/users', body).then((r) => r.data.data),
    onSuccess: () => invalidate(['users'], ['stats']),
  });
}

export interface UserUpdateInput {
  id: string;
  firstName?: string;
  lastName?: string;
  middleInitial?: string;
  email?: string;
  roleId?: string;
  branchId?: string | null;
  isActive?: boolean;
  avatarUrl?: string;
}

export function useUpdateUser() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...body }: UserUpdateInput) =>
      api.patch(`/users/${id}`, body).then((r) => r.data.data),
    onSuccess: () => invalidate(['users']),
  });
}

export function useResetUserPassword() {
  return useMutation({
    mutationFn: ({ id, newPassword, confirmPassword }: { id: string; newPassword: string; confirmPassword: string }) =>
      api.patch(`/users/${id}/password`, { newPassword, confirmPassword }).then((r) => r.data.data),
  });
}

export function useArchiveUser() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`).then((r) => r.data),
    onSuccess: () => invalidate(['users'], ['stats']),
  });
}

export function useRestoreUser() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.post(`/users/${id}/restore`).then((r) => r.data.data),
    onSuccess: () => invalidate(['users'], ['stats']),
  });
}

// ===========================================================================
// SALES
// ===========================================================================
export interface SaleItemInput {
  productId: string;
  variantId?: string;
  quantity: number;
  discount?: number;
  paymentMethod: PaymentMethod;
  bankNote?: string;
  note?: string;
  paymentSplit?: PaymentSplit;
}

export interface SaleCreateInput {
  branchId?: string;
  customerName?: string;
  items: SaleItemInput[];
}

export function useSalesRecords(params?: {
  search?: string;
  branchId?: string;
  startDate?: string;
  endDate?: string;
}) {
  return useQuery({
    queryKey: ['sales', 'records', params ?? {}],
    queryFn: () =>
      getList<Sale>('/sales/records', {
        limit: 200,
        search: params?.search || undefined,
        branchId: params?.branchId || undefined,
        startDate: params?.startDate || undefined,
        endDate: params?.endDate || undefined,
      }),
  });
}

export function useSalesPending(params?: {
  search?: string;
  branchId?: string;
  startDate?: string;
  endDate?: string;
}) {
  return useQuery({
    queryKey: ['sales', 'pending', params ?? {}],
    queryFn: () =>
      getList<Sale>('/sales/pending', {
        limit: 200,
        search: params?.search || undefined,
        branchId: params?.branchId || undefined,
        startDate: params?.startDate || undefined,
        endDate: params?.endDate || undefined,
      }),
    refetchInterval: shouldPoll,
  });
}

export function useCreateSale() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: SaleCreateInput) => api.post('/sales', body).then((r) => r.data.data),
    onSuccess: () => invalidate(['sales'], ['stats']),
  });
}

export function useUpdateSale() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Partial<SaleCreateInput>) =>
      api.patch(`/sales/${id}`, body).then((r) => r.data.data),
    onSuccess: () => invalidate(['sales']),
  });
}

export function useApproveSale() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.post(`/sales/${id}/approve`).then((r) => r.data.data),
    onSuccess: () => invalidate(['sales'], ['products'], ['stats']),
  });
}

export function useDeclineSale() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.post(`/sales/${id}/decline`).then((r) => r.data.data),
    onSuccess: () => invalidate(['sales'], ['stats']),
  });
}

export function useDeleteSale() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/sales/${id}`).then((r) => r.data.data),
    onSuccess: () => invalidate(['sales'], ['stats']),
  });
}

// ===========================================================================
// STAFF DRAFT CARTS
// ===========================================================================

// Staff: push their current draft cart to the server so an Admin can see it.
export interface DraftSyncInput {
  items: {
    productId: string;
    variantId?: string | null;
    name: string;
    brandName: string;
    variantName?: string | null;
    unitPrice: number;
    quantity: number;
    image?: string | null;
    discount?: number;
    paymentMethod: PaymentMethod;
    bankNote?: string | null;
    note?: string | null;
    paymentSplit?: PaymentSplit | null;
  }[];
  disposalItems?: {
    productId: string;
    variantId?: string | null;
    name: string;
    brandName: string;
    variantName?: string | null;
    quantity: number;
    image?: string | null;
  }[];
  expenses?: { amount: number; note: string }[];
  customerName?: string;
}

export function useSaveDraft() {
  return useMutation({
    mutationFn: (body: DraftSyncInput) => {
      // Strip fields the backend DTO doesn't whitelist (e.g. addedAt) to
      // avoid "property X should not exist" validation errors.
      const cleaned = {
        ...body,
        items: body.items.map(({ productId, variantId, name, brandName, variantName, unitPrice, quantity, image, discount, paymentMethod, bankNote, note, paymentSplit }) => ({
          productId, variantId, name, brandName, variantName, unitPrice, quantity, image, discount, paymentMethod, bankNote, note, paymentSplit,
        })),
        disposalItems: body.disposalItems?.map(({ productId, variantId, name, brandName, variantName, quantity, image }) => ({
          productId, variantId, name, brandName, variantName, quantity, image,
        })),
        expenses: body.expenses?.map(({ amount, note }) => ({ amount, note })),
      };
      return api.put('/sales/draft', cleaned).then((r) => r.data.data);
    },
  });
}

export function useClearDraftSync() {
  return useMutation({
    mutationFn: () => api.delete('/sales/draft').then((r) => r.data.data),
  });
}

// Staff: submit their own draft (sale + staged disposals + staged expenses)
// in one call. The server creates each part independently and reports back
// which (if any) failed, e.g. if stock ran out between staging and submit.
export interface SaveDraftResult {
  sale: unknown;
  disposals: unknown[];
  expenses: unknown[];
  errors: string[];
}

export function useSaveMyDraft() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: () => api.post('/sales/draft/save').then((r) => r.data.data as SaveDraftResult),
    onSuccess: () => invalidate(['sales'], ['disposals'], ['expenses'], ['stats']),
  });
}

// Staff: poll whether a draft still exists server-side for them. Used to
// detect an admin submitting their draft on their behalf (via the admin's
// "Save Draft" button) so the local cart can be cleared to match — otherwise
// the staff's device would still show the already-submitted items and could
// resubmit them as duplicates.
export interface MyDraftContent {
  exists: boolean;
  items: DraftItem[];
  disposalItems: DraftDisposalItem[];
  expenses: DraftExpense[];
}

export function useMyDraftExists() {
  return useQuery({
    queryKey: ['my-draft-exists'],
    queryFn: () => getData<MyDraftContent>('/sales/draft'),
    refetchInterval: shouldPoll,
  });
}

// Admin: poll every staff member's current draft cart, optionally scoped to
// a branch. Short interval so it feels close to live on the Pending Sales page.
export function useStaffDrafts(branchId?: string) {
  return useQuery({
    queryKey: ['staff-drafts', { branchId }],
    queryFn: () => getData<StaffDraft[]>('/sales/drafts', { branchId: branchId || undefined }),
    refetchInterval: shouldPoll,
  });
}

// Admin: submit a staff member's draft on their behalf (they forgot to hit
// Save Order). Creates the real PENDING sale/disposal(s)/expense(s).
export function useSaveDraftForStaff() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (staffId: string) =>
      api.post(`/sales/drafts/${staffId}/save`).then((r) => r.data.data),
    onSuccess: () =>
      invalidate(['staff-drafts'], ['sales'], ['disposals'], ['expenses'], ['stats']),
  });
}

// ===========================================================================
// STATS + ACTIVITY LOGS
// ===========================================================================
export function useDashboardStats() {
  return useQuery({
    queryKey: ['stats', 'dashboard'],
    queryFn: () => getData<DashboardStats>('/stats/dashboard'),
  });
}

export function useActivityLogs(params?: { search?: string; category?: string; startDate?: string; endDate?: string }) {
  return useQuery({
    queryKey: ['activity-logs', params ?? {}],
    queryFn: () =>
      getList<ActivityLog>('/activity-logs', {
        limit: 100,
        search: params?.search || undefined,
        category: params?.category && params.category !== 'All' ? params.category : undefined,
        startDate: params?.startDate || undefined,
        endDate: params?.endDate || undefined,
      }),
  });
}

export function useSalesOverview(period: string, branchId?: string) {
  return useQuery({
    queryKey: ['stats', 'sales-overview', { period, branchId }],
    queryFn: () => getData<SalesOverviewPoint[]>('/stats/sales-overview', { period, branchId: branchId || undefined }),
  });
}

export function useTopProducts(branchId?: string) {
  return useQuery({
    queryKey: ['stats', 'top-products', { branchId }],
    queryFn: () => getData<TopProduct[]>('/stats/top-products', { branchId: branchId || undefined }),
  });
}

// ===========================================================================
// DISPOSALS
// ===========================================================================
export function useDisposals(params?: { search?: string; branchId?: string; startDate?: string; endDate?: string; status?: string }) {
  return useQuery({
    queryKey: ['disposals', params ?? {}],
    queryFn: async () => {
      const res = await api.get('/disposals', {
        params: {
          limit: 200,
          search: params?.search || undefined,
          branchId: params?.branchId || undefined,
          startDate: params?.startDate || undefined,
          endDate: params?.endDate || undefined,
          status: params?.status || undefined,
        },
      });
      return {
        data: (res.data.data ?? []) as Disposal[],
        summary: (res.data.summary ?? { totalValue: 0, totalQuantity: 0, count: 0 }) as DisposalSummary,
      };
    },
  });
}

export function useCreateDisposal() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: { branchId?: string; productId: string; quantity: number; reason?: string }) =>
      api.post('/disposals', body).then((r) => r.data.data),
    onSuccess: () => invalidate(['disposals'], ['products'], ['stats']),
  });
}

export function useDisposalsPending(params?: { search?: string; branchId?: string }) {
  return useQuery({
    queryKey: ['disposals', 'pending', params ?? {}],
    queryFn: async () => {
      const res = await api.get('/disposals/pending', {
        params: {
          limit: 200,
          search: params?.search || undefined,
          branchId: params?.branchId || undefined,
        },
      });
      return {
        data: (res.data.data ?? []) as Disposal[],
        summary: (res.data.summary ?? { totalValue: 0, totalQuantity: 0, count: 0 }) as DisposalSummary,
      };
    },
    refetchInterval: shouldPoll,
  });
}

export function useApproveDisposal() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.post(`/disposals/${id}/approve`).then((r) => r.data.data),
    onSuccess: () => invalidate(['disposals'], ['products'], ['stats']),
  });
}

export function useDeclineDisposal() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.post(`/disposals/${id}/decline`).then((r) => r.data.data),
    onSuccess: () => invalidate(['disposals']),
  });
}

// ===========================================================================
// EXPENSES
// ===========================================================================
export function useCreateExpense() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: { branchId?: string; amount: number; note: string }) =>
      api.post('/expenses', body).then((r) => r.data.data),
    onSuccess: () => invalidate(['expenses'], ['stats']),
  });
}

export function useExpenses(params?: {
  search?: string;
  branchId?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
}) {
  return useQuery({
    queryKey: ['expenses', params ?? {}],
    queryFn: async () => {
      const res = await api.get('/expenses', {
        params: {
          limit: 200,
          search: params?.search || undefined,
          branchId: params?.branchId || undefined,
          startDate: params?.startDate || undefined,
          endDate: params?.endDate || undefined,
          status: params?.status || undefined,
        },
      });
      return {
        data: (res.data.data ?? []) as Expense[],
        summary: (res.data.summary ?? { totalAmount: 0, count: 0 }) as ExpenseSummary,
      };
    },
  });
}

export function useExpensesPending(params?: { search?: string; branchId?: string }) {
  return useQuery({
    queryKey: ['expenses', 'pending', params ?? {}],
    queryFn: async () => {
      const res = await api.get('/expenses/pending', {
        params: {
          limit: 200,
          search: params?.search || undefined,
          branchId: params?.branchId || undefined,
        },
      });
      return {
        data: (res.data.data ?? []) as Expense[],
        summary: (res.data.summary ?? { totalAmount: 0, count: 0 }) as ExpenseSummary,
      };
    },
    refetchInterval: shouldPoll,
  });
}

export function useApproveExpense() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.post(`/expenses/${id}/approve`).then((r) => r.data.data),
    onSuccess: () => invalidate(['expenses'], ['stats']),
  });
}

export function useDeclineExpense() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.post(`/expenses/${id}/decline`).then((r) => r.data.data),
    onSuccess: () => invalidate(['expenses']),
  });
}

// Today's approved Total Sales / Total Expenses / Net for a branch. Used on
// both the admin Pending Sales page and the staff Daily Report page.
export function useBranchSummary(branchId?: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['stats', 'branch-summary', { branchId }],
    queryFn: () => getData<BranchSummary>('/stats/branch-summary', { branchId: branchId || undefined }),
    refetchInterval: shouldPoll,
    // Admin/Owner must pass a specific branch — skip the query entirely
    // when none is selected (e.g. "All Shops" on the Sales Records page)
    // instead of firing a request that's guaranteed to 400.
    enabled: options?.enabled ?? true,
  });
}

// ===========================================================================
// PROFILE (self)
// ===========================================================================
export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => getData<AuthUser>('/auth/me'),
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      firstName?: string;
      lastName?: string;
      middleInitial?: string;
      email?: string;
      avatarUrl?: string;
    }) => api.patch('/auth/profile', body).then((r) => r.data.data as AuthUser),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me'] });
      qc.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useChangeOwnPassword() {
  return useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string; confirmPassword: string }) =>
      api.post('/auth/change-password', body).then((r) => r.data.data),
  });
}


// ===========================================================================
// STOCK MOVEMENTS (product history per branch)
// ===========================================================================
export function useStockMovements(params?: { productId?: string; branchId?: string; page?: number; limit?: number }) {
  return useQuery({
    queryKey: ['stock-movements', params ?? {}],
    queryFn: async () => {
      const res = await api.get('/stock-movements', {
        params: {
          productId: params?.productId || undefined,
          branchId: params?.branchId || undefined,
          page: params?.page ?? 1,
          limit: params?.limit ?? 50,
        },
      });
      // The backend wraps via TransformInterceptor: { success, data: { data: [...], pagination } }
      const body = res.data?.data ?? res.data;
      const movements = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
      const pagination = body?.pagination ?? res.data?.pagination;
      return {
        data: movements as import('./types').StockMovement[],
        pagination: pagination as import('./types').Pagination | undefined,
      };
    },
    enabled: !!params?.productId,
  });
}
