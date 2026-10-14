import { PlanStockView } from '../views/plan-stock.view';
import { SalesLineView } from '../views/sales-line.view';
import { AuditLog } from './audit-log.entity';
import { Category } from './category.entity';
import { Claim } from './claim.entity';
import { LicenseBatch } from './license-batch.entity';
import { LicenseItem } from './license-item.entity';
import { NotificationLog } from './notification-log.entity';
import { OrderItem } from './order-item.entity';
import { Order } from './order.entity';
import { PaymentMethod } from './payment-method.entity';
import { Payment } from './payment.entity';
import { PlanPrice } from './plan-price.entity';
import { Plan } from './plan.entity';
import { Product } from './product.entity';
import { RefreshToken } from './refresh-token.entity';
import { Review } from './review.entity';
import { Setting } from './setting.entity';
import { SupportTicket } from './support-ticket.entity';
import { TicketMessage } from './ticket-message.entity';
import { User } from './user.entity';

export {
  AuditLog,
  Category,
  Claim,
  LicenseBatch,
  LicenseItem,
  NotificationLog,
  Order,
  OrderItem,
  Payment,
  PaymentMethod,
  Plan,
  PlanPrice,
  PlanStockView,
  Product,
  RefreshToken,
  Review,
  SalesLineView,
  Setting,
  SupportTicket,
  TicketMessage,
  User,
};

export const ENTITIES = [
  AuditLog,
  Category,
  Claim,
  LicenseBatch,
  LicenseItem,
  NotificationLog,
  Order,
  OrderItem,
  Payment,
  PaymentMethod,
  Plan,
  PlanPrice,
  Product,
  RefreshToken,
  Review,
  Setting,
  SupportTicket,
  TicketMessage,
  User,
  PlanStockView,
  SalesLineView,
];
