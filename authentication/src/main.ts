import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { ValidationPipe } from '@nestjs/common';
import './database/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ transform: true }));
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Seller Pundit API')
    .setDescription('The Seller Pundit API description')
    .setVersion('1.0')
    .addServer(process.env.HOST_URL)
    .addBearerAuth({
      type: 'http',
      scheme: 'Bearer',
      bearerFormat: 'Bearer',
      in: 'header',
      name: 'Authorization',
    })
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  app.enableCors({ origin: '*' });
  SwaggerModule.setup('docs', app, document);
  app.use(helmet());
  await app.listen(5000);
}
bootstrap();
