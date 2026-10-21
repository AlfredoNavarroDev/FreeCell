import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { ListPaymentMethodsQueryDto } from './dto/list-payment-methods-query.dto';
import { PaymentMethodResponseDto } from './dto/payment-method-response.dto';
import { PaymentMethodsService } from './payment-methods.service';

@ApiTags('payment-methods')
@Public()
@Controller('payment-methods')
export class PaymentMethodsController {
  constructor(private readonly paymentMethods: PaymentMethodsService) {}

  @Get()
  list(
    @Query() query: ListPaymentMethodsQueryDto,
  ): Promise<PaymentMethodResponseDto[]> {
    return this.paymentMethods.listActive(query.currency);
  }
}
