import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Observable, catchError, throwError } from 'rxjs';

@Injectable()
export class ResultEscalationValidationInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      catchError((error: unknown) => {
        if (error instanceof BadRequestException) {
          const response = error.getResponse();
          if (
            typeof response === 'object' &&
            response !== null &&
            'code' in response &&
            response.code === 'VALIDATION_ERROR'
          ) {
            return throwError(() => new UnprocessableEntityException(response));
          }
        }
        return throwError(() => error);
      }),
    );
  }
}
