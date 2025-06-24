import { forwardRef, Module } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';
import { ConfigModule } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ProductModule } from 'src/product/product.module';
import { JwtModule } from '@nestjs/jwt';
import { NotificationsGateway } from 'src/notifications/notifications.gateway';
import { AuthModule } from 'src/auth/auth.module';
import { MatchesModule } from 'src/matches/matches.module';

@Module({
  imports: [
    MatchesModule,
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
    forwardRef(() => ProductModule),
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService, NotificationsGateway],
  exports: [ProjectsService],
})
export class ProjectsModule {}
