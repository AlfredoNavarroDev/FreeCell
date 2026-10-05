export enum Role {
  CUSTOMER = 'CUSTOMER',
  ADMIN = 'ADMIN',
}

export enum LicenseKind {
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
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

export enum PaymentMethod {
  YAPE_PLIN = 'YAPE_PLIN',
  BANK_TRANSFER = 'BANK_TRANSFER',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum ClaimStatus {
  OPEN = 'OPEN',
  RESOLVED = 'RESOLVED',
  REJECTED = 'REJECTED',
}
