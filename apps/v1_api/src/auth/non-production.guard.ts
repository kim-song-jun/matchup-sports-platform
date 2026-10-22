import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';

/** For routes that exist only for local and CI runs: production mode (alpha included) answers 404 before any other guard. */
@Injectable()
export class NonProductionGuard implements CanActivate {
  canActivate(): boolean {
    if (process.env.NODE_ENV === 'production') throw new NotFoundException();
    return true;
  }
}
