// Shared types describing the backend API responses.

export interface Role {
  id: string;
  name: string;
}

// Returned by GET /users/roles (used to populate the "add staff" role select).
export interface RoleOption {
  id: string;
  name: string;
  description?: string | null;
}

// A short branch summary embedded on the auth user / user list rows.
export interface BranchRef {
  id: string;
  name: string;
}

// The full branch object returned by GET /branches and /branches/:id.
export interface Branch {
  id: string;
  name: string;
  address: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  staffCount: number;
}

// The user object returned by POST /auth/login.
export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  middleInitial?: string | null;
  role: Role;
  branch?: BranchRef | null;
  avatarUrl?: string | null;
  mustChangePassword?: boolean;
}

// A user row returned by GET /users.
export interface UserListItem {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  isActive: boolean;
  isLocked: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  role: Role;
  branchId: string | null;
  branch: BranchRef | null;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// Every backend response is wrapped in this envelope by the TransformInterceptor.
export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  pagination?: Pagination;
  meta?: {
    timestamp: string;
    requestId: string;
  };
  error?: {
    code: string;
    message: string;
  };
}


// ---------------------------------------------------------------------------
// Catalog, sales, logs (backend feature modules)
// ---------------------------------------------------------------------------

export interface Brand {
  id: string;
  name: string;
  slug: string;
  coverImage: string | null;
  isActive: boolean;
  productCount: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ProductBranchQuantity {
  branchId: string;
  branchName: string | null;
  quantity: number;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  image: string | null;
  brand: { id: string; name: string; slug: string } | null;
  sellingPrice: number;
  quantityAlert: number;
  isActive: boolean;
  quantities: ProductBranchQuantity[];
  totalQuantity: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export type PaymentMethod = 'Cash' | 'Gcash';
export type SaleStatus = 'PENDING' | 'APPROVED' | 'DECLINED';

export interface SaleLineItem {
  id: string;
  productId: string | null;
  name: string;
  brandName: string;
  quantity: number;
  unitPrice: number;
  subTotal: number;
}

export interface Sale {
  id: string;
  number: number;
  customerName: string | null;
  branch: { id: string; name: string } | null;
  staff: { id: string; name: string; email: string } | null;
  paymentMethod: PaymentMethod;
  status: SaleStatus;
  total: number;
  items: SaleLineItem[];
  createdAt: string;
  decidedAt: string | null;
}

export interface SalesSummary {
  cash: number;
  gcash: number;
  total: number;
  count: number;
}

// A staff member's current in-progress (not-yet-submitted) cart, as seen by
// an Admin on the Pending Sales page.
export interface StaffDraft {
  id: string;
  staff: { id: string; name: string; email: string };
  branch: { id: string; name: string } | null;
  items: {
    productId: string;
    name: string;
    brandName: string;
    unitPrice: number;
    quantity: number;
    image?: string | null;
  }[];
  paymentMethod: PaymentMethod;
  customerName: string | null;
  total: number;
  updatedAt: string;
}

export interface ActivityLog {
  id: string;
  userName: string;
  userEmail: string;
  action: string;
  module: string;
  category: string;
  description: string;
  device: string;
  ipAddress: string;
  date: string;
}

export interface DashboardStats {
  shops: number;
  products: number;
  brands: number;
  pendingSales: number;
  approvedSales: number;
  staff: number;
  admins: number;
  approvedSalesTotal: number;
}

// User row including the optional fields added to the schema.
export interface FullUser extends UserListItem {
  middleInitial: string | null;
  avatarUrl: string | null;
  deletedAt?: string | null;
}


// ---------------------------------------------------------------------------
// Disposals + dashboard charts
// ---------------------------------------------------------------------------

export interface Disposal {
  id: string;
  branch: { id: string; name: string } | null;
  productId: string | null;
  name: string;
  brandName: string;
  quantity: number;
  unitPrice: number;
  value: number;
  reason: string | null;
  status: 'PENDING' | 'APPROVED' | 'DECLINED';
  createdBy: string;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export interface DisposalSummary {
  totalValue: number;
  totalQuantity: number;
  count: number;
}

export interface SalesOverviewPoint {
  date: string;
  total: number;
  count: number;
}

export interface TopProduct {
  name: string;
  brand: string;
  quantity: number;
  revenue: number;
}

export interface ImportResult {
  created: number;
  updated: number;
  total: number;
  warnings: string[];
}

export interface RestockResult {
  updated: number;
  total: number;
  warnings: string[];
}
