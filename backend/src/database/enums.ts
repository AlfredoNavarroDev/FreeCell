export enum Role {
  CUSTOMER = 'CUSTOMER',
  ADMIN = 'ADMIN',
}

export enum PlanKind {
  NEW = 'NEW',
  RENEWAL = 'RENEWAL',
}

export enum LicenseStatus {
  AVAILABLE = 'AVAILABLE',
  RESERVED = 'RESERVED',
  SOLD = 'SOLD',
  VOID = 'VOID',
}

export enum OrderStatus {
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  IN_REVIEW = 'IN_REVIEW',
  PENDING_ACTIVATION = 'PENDING_ACTIVATION',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum PaymentMethodKind {
  WALLET = 'WALLET',
  BANK_TRANSFER = 'BANK_TRANSFER',
  CRYPTO = 'CRYPTO',
}

export enum ClaimStatus {
  OPEN = 'OPEN',
  RESOLVED = 'RESOLVED',
  REJECTED = 'REJECTED',
}

export enum TicketStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}

export enum ReviewStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  HIDDEN = 'HIDDEN',
}

export enum RefreshRevokeReason {
  ROTATED = 'ROTATED',
  LOGOUT = 'LOGOUT',
  REUSE_DETECTED = 'REUSE_DETECTED',
}
