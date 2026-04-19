import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import * as compression from 'compression';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });

  // Trust the first proxy (Nginx) in production so req.ip reflects the real
  // client IP. Required for HostThrottlerGuard to correctly fingerprint
  // rate-limit buckets per-IP (fallback when request is unauthenticated).
  app.set('trust proxy', 1);

  // Response compression
  app.use(compression());

  // Serve uploaded files from /uploads/* as static assets
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' });

  // Global prefix
  app.setGlobalPrefix('api/v1');

  // CORS
  app.enableCors({
    origin:
      process.env.NODE_ENV === 'production'
        ? process.env.FRONTEND_URL || 'https://teameet.kr'
        : true,
    credentials: true,
  });

  // Global pipes, filters, interceptors
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('TeamMeet API')
    .setDescription('AI 기반 멀티스포츠 소셜 매칭 플랫폼 API')
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.API_PORT || 8111;
  await app.listen(port);
  logger.log(`TeamMeet API running on http://localhost:${port}`);
  logger.log(`Swagger docs: http://localhost:${port}/docs`);
}

bootstrap();
