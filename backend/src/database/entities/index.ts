import { AuditLog } from './audit-log.entity';
import { Category } from './category.entity';
import { Claim } from './claim.entity';
import { LicenseBatch } from './license-batch.entity';
import { LicenseItem } from './license-item.entity';
import { NotificationLog } from './notification-log.entity';
import { OrderItem } from './order-item.entity';
import { Order } from './order.entity';
import { Payment } from './payment.entity';
import { Plan } from './plan.entity';
import { Product } from './product.entity';
import { User } from './user.entity';

export {
  AuditLog, Category, Claim, LicenseBatch, LicenseItem, NotificationLog,
  Order, OrderItem, Payment, Plan, Product, User,
};

export const ENTITIES = [
  AuditLog, Category, Claim, LicenseBatch, LicenseItem, NotificationLog,
  Order, OrderItem, Payment, Plan, Product, User,
];
