import { forwardRef, Module } from '@nestjs/common';
import { ProductService } from './product.service';
import { ProductController } from './product.controller';
import { ConfigModule } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { NotificationsGateway } from 'src/notifications/notifications.gateway';
import { JwtModule } from '@nestjs/jwt';
import { ProjectsService } from 'src/projects/projects.service';
import { ProjectsModule } from 'src/projects/projects.module';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot(),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'secret',
      signOptions: {
        expiresIn: 3600,
      },
    }),
    ClientsModule.register([
      {
        name: 'PRODUCT_SERVICE',
        transport: Transport.RMQ,
        options: {
          urls: [process.env.RABBITMQ_URL],
          queue: process.env.PRODUCTS_QUEUE,
          queueOptions: {
            durable: true,
          },
        },
      },
    ]),
    AuthModule,
    forwardRef(() => ProjectsModule),
  ],
  controllers: [ProductController],
  providers: [ProductService, NotificationsGateway, ProjectsService],
  exports: [ProductService],
})
export class ProductModule {}
