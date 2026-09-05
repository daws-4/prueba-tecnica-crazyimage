import { SHIPMENT_STATUS_LABELS, type ShipmentStatus } from '@andina/contracts';

/**
 * La etiqueta de estado.
 *
 * El texto que se ve sale del contrato compartido, no de un diccionario propio
 * del panel: si algun dia se renombra un estado, se renombra en un sitio.
 */
export function StatusBadge({ status }: { status: ShipmentStatus }): React.JSX.Element {
  return (
    <span className="estado" data-estado={status}>
      {SHIPMENT_STATUS_LABELS[status]}
    </span>
  );
}
