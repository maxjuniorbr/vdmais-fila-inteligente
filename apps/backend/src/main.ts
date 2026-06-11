import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { Logger, ValidationPipe } from '@nestjs/common'
import helmet from 'helmet'
import { AppModule } from './app.module'
import { validationExceptionFactory } from './common/validation-exception.factory'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
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

  const port = process.env.PORT ?? 3000
  await app.listen(port)
  Logger.log(`Backend running on port ${port}`, 'Bootstrap')
}

bootstrap()
