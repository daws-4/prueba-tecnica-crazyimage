import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';
import {
  listShipmentsQuerySchema,
  type ShipmentDetail,
  type ShipmentListResponse,
} from '@andina/contracts';

import { ShipmentsService } from './shipments.service';

@Controller('shipments')
export class ShipmentsController {
  constructor(private readonly shipments: ShipmentsService) {}

  /**
   * `GET /shipments?status=&carrierId=&stalledForHours=&cursor=&limit=`
   *
   * La validacion la hace el **mismo esquema** que usa el panel para construir
   * la peticion. No hay dos definiciones que puedan divergir, y los valores
   * llegan ya convertidos: `"48"` entra como cadena en la URL y sale como
   * numero, sin que el controlador convierta nada a mano.
   */
  @Get()
  async list(@Query() query: unknown): Promise<ShipmentListResponse> {
    const parsed = listShipmentsQuerySchema.safeParse(query);
    if (!parsed.success) {
      // Error util para quien lo recibe: dice que campo y por que, no un
      // "peticion invalida" que obliga a adivinar.
      throw new BadRequestException(
        parsed.error.issues.map((issue) => `${issue.path.join('.') || 'query'}: ${issue.message}`),
      );
    }
    return this.shipments.list(parsed.data);
  }

  /** `GET /shipments/:trackingNumber` — estado actual y linea de tiempo ordenada. */
  @Get(':trackingNumber')
  async detail(@Param('trackingNumber') trackingNumber: string): Promise<ShipmentDetail> {
    const trimmed = trackingNumber.trim();
    if (trimmed.length === 0) {
      throw new BadRequestException('El numero de guia no puede estar vacio');
    }
    return this.shipments.findByTrackingNumber(trimmed);
  }
}
