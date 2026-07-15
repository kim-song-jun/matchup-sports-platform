import { BadRequestException, Logger, ValidationError, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as compression from 'compression';
import * as path from 'path';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { UploadsService } from './uploads/uploads.service';
import {
  assertV1SessionRuntimeConfiguration,
  currentRuntimeConfiguration,
} from './auth/v1-session';
import {
  createV1MutationOriginMiddleware,
  requireProductionFrontendOrigin,
} from './common/security/v1-mutation-origin';

async function bootstrap() {
  const logger = new Logger('V1Bootstrap');
  const isProduction = process.env.NODE_ENV === 'production';

  assertV1SessionRuntimeConfiguration(currentRuntimeConfiguration());
  const frontendOrigin = isProduction
    ? requireProductionFrontendOrigin(process.env.FRONTEND_URL)
    : null;

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.enableShutdownHooks();
  app.set('trust proxy', 1);
  app.use(compression());
  if (frontendOrigin) {
    app.use(createV1MutationOriginMiddleware(frontendOrigin));
  }

  // Serve locally stored upload files at /uploads/*
  // This is a no-op when S3/CDN is configured, as URLs returned by the service
  // would point to the external host instead.
  app.useStaticAssets(path.resolve(UploadsService.UPLOAD_BASE), {
    prefix: UploadsService.SERVE_PREFIX,
  });
  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: frontendOrigin ?? true,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      // 검증 실패를 일관된 코드/한글 메시지로 — class-validator 의 raw 영어 메시지가
      // 그대로 프론트에 노출되던 문제 해결. 필드별 상세는 details 로 전달.
      exceptionFactory: (errors: ValidationError[]) => {
        const details = errors.map((error) => ({
          field: error.property,
          messages: error.constraints ? Object.values(error.constraints) : [],
        }));
        return new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: '입력값을 다시 확인해 주세요.',
          details,
        });
      },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  const config = new DocumentBuilder()
    .setTitle('Teameet V1 API')
    .setDescription('Teameet v1 isolated API')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = Number(process.env.API_PORT || '8121');
  await app.listen(port, '0.0.0.0');
  logger.log(`Teameet V1 API running on http://localhost:${port}`);
}

bootstrap();
