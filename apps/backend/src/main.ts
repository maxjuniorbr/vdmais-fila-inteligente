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
import { parseAllowedOrigins } from './common/allowed-origins'

function docsEnabled(flag: string | undefined): boolean {
  const nodeEnv = (process.env.NODE_ENV ?? '').toLowerCase()
  const relaxed = nodeEnv === 'development' || nodeEnv === 'test'
  return relaxed || (flag ?? '').toLowerCase() === 'true'
}

function docsCsp(_req: Request, res: Response, next: NextFunction) {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data:; font-src 'self' data:; " +
      "style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'",
  )
  next()
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
  app.use('/docs/integration', docsCsp)
  const document = SwaggerModule.createDocument(app, config, { include: [IntegrationModule] })
  SwaggerModule.setup('docs/integration', app, document, {
    customSiteTitle: 'API de Integração — VDMais Fila',
    customCss: '.swagger-ui .info .description, .swagger-ui .info .description p { line-height: 2; }',
  })
}

// Contrato completo da API que o frontend consome — é a fronteira entre os dois
// repositórios corporativos (plano de split), então precisa existir como documento
// publicável, não só como co-evolução implícita no monorepo.
function setupAppDocs(app: NestExpressApplication) {
  const config = new DocumentBuilder()
    .setTitle('VDMais Fila Inteligente — API do aplicativo')
    .setDescription(
      'Contrato da API consumida pelo frontend (autenticação, fila, senhas, caixas, ' +
        'painel e administração). Autentique com Bearer JWT emitido em `/auth/login`. ' +
        'Os endpoints M2M de `/integration` têm documento próprio em `/docs/integration`.',
    )
    .setVersion('v1')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .build()
  app.use('/docs/api', docsCsp)
  const document = SwaggerModule.createDocument(app, config)
  SwaggerModule.setup('docs/api', app, document, {
    customSiteTitle: 'API do aplicativo — VDMais Fila',
    customCss: '.swagger-ui .info .description, .swagger-ui .info .description p { line-height: 2; }',
  })
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule)
  // Trust a FIXED number of proxy hops (the platform load balancer), not every
  // hop. With `true`, Express derives req.ip from the left-most X-Forwarded-For
  // entry, which the client sets — making the rate-limit key spoofable. A fixed
  // hop count makes req.ip the address the trusted proxy actually saw.
  const trustProxyHops = Number.parseInt(process.env.TRUST_PROXY_HOPS ?? '1', 10)
  app.set('trust proxy', Number.isNaN(trustProxyHops) ? 1 : trustProxyHops)
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
    origin: parseAllowedOrigins(process.env.FRONTEND_URL),
    credentials: false,
  })

  if (docsEnabled(process.env.INTEGRATION_DOCS_ENABLED)) {
    setupIntegrationDocs(app)
  }
  if (docsEnabled(process.env.APP_DOCS_ENABLED)) {
    setupAppDocs(app)
  }

  const port = process.env.PORT ?? 3000
  await app.listen(port)
  Logger.log(`Backend running on port ${port}`, 'Bootstrap')
}

bootstrap()
