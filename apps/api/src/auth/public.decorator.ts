import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';

// Skips the global AuthGuard (API section 2: login, refresh, health, debug).
export const Public = () => SetMetadata(IS_PUBLIC, true);
