import { Module } from '@nestjs/common';
import { CloudStorageService } from './cloud-storage.service';
import { CloudStorageController } from './cloud-storage.controller';
import { UsersService } from 'src/users/users.service';
import { AuthService } from 'src/auth/auth.service';
import { Role } from 'src/roles/entities/role.entity';
import { User } from 'src/users/entities/user.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { RolesService } from 'src/roles/roles.service';
import { JwtModule } from '@nestjs/jwt';
import { MailsService } from 'src/mails/mails.service';

@Module({
  imports: [
    ConfigModule.forRoot(),
    TypeOrmModule.forFeature([User, Role]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'secret',
      signOptions: {
        expiresIn: '1d',
      },
    }),
  ],
  controllers: [CloudStorageController],
  providers: [
    CloudStorageService,
    UsersService,
    AuthService,
    RolesService,
    MailsService,
  ],
})
export class CloudStorageModule {}
