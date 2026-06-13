import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { Logger, ValidationPipe } from '@nestjs/common'
import { NestExpressApplication } from '@nestjs/platform-express'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import helmet from 'helmet'
import type { NextFunction, Request, Response } from 'express'
import { AppModule } from './app.module'
import { IntegrationModule } from './integration/integration.module'
import { validationExceptionFactory } from './common/validation-exception.factory'

function integrationDocsEnabled(): boolean {
  const nodeEnv = (process.env.NODE_ENV ?? '').toLowerCase()
  const relaxed = nodeEnv === 'development' || nodeEnv === 'test'
  const flag = (process.env.INTEGRATION_DOCS_ENABLED ?? '').toLowerCase() === 'true'
  return relaxed || flag
}

function setupIntegrationDocs(app: NestExpressApplication) {
  const config = new DocumentBuilder()
    .setTitle('VDMais Fila Inteligente — API de Integração')
    .setDescription(
      'Endpoints de integração M2M para sistemas corporativos marcarem início e fim do ' +
        'atendimento da revendedora. Autentique com Bearer JWT (OAuth2 client_credentials) ' +
        'portando o scope `tickets:start` ou `tickets:finish`. Idempotência opcional via ' +
        'header `Idempotency-Key`.',
    )
    .setVersion('v1')
    .addTag('integration', 'Início e fim de atendimento disparados pelo sistema legado')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .build()
  app.use('/docs/integration', (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; img-src 'self' data:; font-src 'self' data:; " +
        "style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'",
    )
    next()
  })
  const document = SwaggerModule.createDocument(app, config, { include: [IntegrationModule] })
  SwaggerModule.setup('docs/integration', app, document, {
    customSiteTitle: 'API de Integração — VDMais Fila',
    customCss: '.swagger-ui .info .description, .swagger-ui .info .description p { line-height: 2; }',
  })
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule)
  app.set('trust proxy', true)
  app.use(helmet())
  app.enableShutdownHooks()

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      stopAtFirstError: true,
      exceptionFactory: validationExceptionFactory,
    }),
  )

  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    credentials: false,
  })

  if (integrationDocsEnabled()) {
    setupIntegrationDocs(app)
  }

  const port = process.env.PORT ?? 3000
  await app.listen(port)
  Logger.log(`Backend running on port ${port}`, 'Bootstrap')
}

bootstrap()
