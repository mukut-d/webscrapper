import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ProductModule } from './product/product.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
// import { MarketplacesModule } from './marketplaces/marketplaces.module';
import { CategoriesModule } from './categories/categories.module';
import { RolesModule } from './roles/roles.module';
import { CloudStorageModule } from './cloud-storage/cloud-storage.module';
import { MailsService } from './mails/mails.service';
import { MatchesModule } from './matches/matches.module';
import { ProjectsModule } from './projects/projects.module';
// import { AlertsModule } from './alerts/alerts.module';
import { NotificationsModule } from './notifications/notifications.module';
import { VerifyTokenMiddleware } from './middleware/verifyToken.middleware';
import { JwtService } from '@nestjs/jwt';
import { APP_GUARD } from '@nestjs/core';
import { RolesGuard } from './middleware/roles.guard';


@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: () => ({
        type: 'postgres',
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT),
        username: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: false,
      }),
      inject: [ConfigService],
    }),
    
    ScheduleModule.forRoot(),
    AuthModule,
    UsersModule,
    ProductModule,
    // MarketplacesModule,
    CategoriesModule,
    RolesModule,
    CloudStorageModule,
    MatchesModule,
    ProjectsModule,
    // AlertsModule,
    NotificationsModule,
  ],
  controllers: [AppController],
  providers: [AppService, MailsService, VerifyTokenMiddleware, JwtService, 
    {
    provide: APP_GUARD,
    useClass: RolesGuard,
  },],
})
export class AppModule {
  // NOTE - Added Token Middleware
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(VerifyTokenMiddleware)
      .exclude(
        { path: 'auth/login', method: RequestMethod.POST },
        { path: 'auth/register', method: RequestMethod.POST },
        { path: 'auth/forgot-password', method: RequestMethod.POST },
        { path: 'auth/reset-password', method: RequestMethod.POST },
        { path: "/api/v1/auth/google", method: RequestMethod.GET },
        { path: "/api/v1/auth/google/callback", method: RequestMethod.GET },
        { path: "/api/v1/auth/register/google", method: RequestMethod.POST },
        { path: "/api/v1/auth/login/google", method: RequestMethod.POST },
        { path: "/api/v1/auth/login/linkedin", method: RequestMethod.POST },
        { path: "/api/v1/auth/register/linkedin", method: RequestMethod.POST }
      )
      .forRoutes('*');
  }
}
