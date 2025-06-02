import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { TiktokModule } from './tiktok/tiktok.module';
import { ServiceController } from './service/service.controller';
import { ScheduleModule } from '@nestjs/schedule';
import { TasksModule } from './tasks/tasks.module';
import { AccountsModule } from './accounts/accounts.module';
import { GoogleSheetsService } from './google-sheets/google-sheets.service';
import { GoogleSheetsModule } from './google-sheets/google-sheets.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    MongooseModule.forRoot(
      process.env.MONGO_URI || 'mongodb://localhost:27017/tiktok-data',
    ),
    ScheduleModule.forRoot(),
    AuthModule,
    UserModule,
    TiktokModule,
    AccountsModule,
    TasksModule,
    GoogleSheetsModule,
  ],
  controllers: [AppController, ServiceController],
  providers: [AppService, GoogleSheetsService],
})
export class AppModule {}
