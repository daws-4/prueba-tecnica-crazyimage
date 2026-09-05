import { z } from 'zod';

/**
 * Configuracion del proceso, validada al arrancar.
 *
 * Si falta algo o viene mal, el API no arranca. Es preferible a descubrirlo en
 * la primera peticion: un fallo de configuracion tiene que doler en el
 * despliegue, no en la pantalla de Camila.
 */
const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  MONGODB_URI: z.string().min(1).default('mongodb://localhost:27017'),
  MONGODB_DB: z.string().min(1).default('andina'),

  /**
   * Tope de eventos por lote.
   *
   * La ingesta responde de forma sincrona, asi que el tiempo de respuesta hay
   * que acotarlo por diseno y no por confianza. El cliente dice "hasta cinco
   * mil"; el doble deja margen sin dejar la puerta abierta.
   */
  MAX_BATCH_SIZE: z.coerce.number().int().min(1).default(10_000),

  /** Tamano del bloque de escritura. Ni un evento por viaje ni cinco mil de golpe. */
  WRITE_CHUNK_SIZE: z.coerce.number().int().min(1).default(1_000),
});

export type Env = z.infer<typeof envSchema>;

export const loadEnv = (source: NodeJS.ProcessEnv = process.env): Env => {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Configuracion invalida -> ${detail}`);
  }
  return parsed.data;
};

export const ENV = Symbol('ENV');
