import { BadRequestException, Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import type { BatchIngestReport } from '@andina/contracts';
import { z } from 'zod';

import { IngestionService } from './ingestion.service';

/**
 * Se acepta tanto un array desnudo como un sobre `{ "events": [...] }`.
 *
 * A un transportista no se le puede pedir nada, ni siquiera que se adapte a
 * nuestra forma preferida. Aceptar las dos cuesta tres lineas y ahorra un
 * intercambio de correos que puede tardar semanas.
 *
 * Lo que NO se valida aqui es el contenido de cada evento: eso es trabajo del
 * adaptador del transportista, que es quien conoce su formato. Aqui solo se
 * comprueba el sobre.
 */
const batchSchema = z.union([
  z.array(z.unknown()),
  z.object({ events: z.array(z.unknown()) }).transform((body) => body.events),
]);

@Controller('ingest')
export class IngestionController {
  constructor(private readonly ingestion: IngestionService) {}

  /**
   * `POST /ingest/:carrierId`
   *
   * Codigos de respuesta, y por que cada uno:
   *
   * - `200` aunque haya eventos en cuarentena. La cuarentena es un resultado
   *   normal del proceso, no un fallo de la peticion: el lote se recibio, se
   *   proceso y aqui esta el detalle de que paso con cada parte.
   * - `400` si el sobre no es interpretable. Es lo unico que impide trabajar.
   * - `404` si no hay adaptador para ese transportista.
   * - `413` si el lote supera el maximo configurado.
   */
  @Post(':carrierId')
  @HttpCode(200)
  async ingest(@Param('carrierId') carrierId: string, @Body() body: unknown): Promise<BatchIngestReport> {
    const parsed = batchSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        'El cuerpo debe ser un array de eventos o un objeto con la propiedad "events"',
      );
    }
    return this.ingestion.ingest(carrierId, parsed.data);
  }
}
