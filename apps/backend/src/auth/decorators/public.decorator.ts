import { SetMetadata } from '@nestjs/common';

/**
 * 🛡️ Markiert eine Route als öffentlich zugänglich (kein JWT benötigt).
 * Ohne diesen Decorator sind ALLE Routen durch den globalen JwtAuthGuard geschützt.
 */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
