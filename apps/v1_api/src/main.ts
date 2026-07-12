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

async function bootstrap() {
  const logger = new Logger('V1Bootstrap');

  const isProduction = process.env.NODE_ENV === 'production';
  const allowHeaderAuth = process.env.V1_ALLOW_HEADER_AUTH === 'true';
  if (isProduction && !allowHeaderAuth) {
    logger.error(
      'SECURITY: v1 헤더 신뢰 인증(x-v1-user-*)은 프로덕션에 안전하지 않습니다. ' +
        '서명 세션 인증으로 전환하거나, 의도적으로 위험을 감수할 경우에만 V1_ALLOW_HEADER_AUTH=true 를 설정하세요. 부팅을 중단합니다.',
    );
    throw new Error('V1_HEADER_AUTH_DISABLED_IN_PRODUCTION');
  }
  if (isProduction && allowHeaderAuth) {
    logger.warn(
      'SECURITY WARNING: 헤더 신뢰 인증이 V1_ALLOW_HEADER_AUTH=true 로 프로덕션에서 활성화되어 있습니다. ' +
        '검증되지 않은 x-v1-user-* 헤더를 신뢰합니다. 가능한 한 빨리 서명 세션 인증으로 전환하세요.',
    );
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.enableShutdownHooks();
  app.set('trust proxy', 1);
  app.use(compression());

  // Serve locally stored upload files at /uploads/*
  // This is a no-op when S3/CDN is configured, as URLs returned by the service
  // would point to the external host instead.
  app.useStaticAssets(path.resolve(UploadsService.UPLOAD_BASE), {
    prefix: UploadsService.SERVE_PREFIX,
  });
  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: process.env.NODE_ENV === 'production' ? process.env.FRONTEND_URL : true,
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
