import { forwardRef, Module } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { AccountsController } from './accounts.controller';
import { TiktokModule } from 'src/tiktok/tiktok.module';
import { MongooseModule } from '@nestjs/mongoose';
import { Account, AccountSchema } from './entities/account.entity';
import { TasksModule } from 'src/tasks/tasks.module';
import { GoogleSheetsModule } from 'src/google-sheets/google-sheets.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    TiktokModule,
    MongooseModule.forFeature([{ name: Account.name, schema: AccountSchema }]),
    forwardRef(() => TasksModule),
    GoogleSheetsModule,
    ConfigModule,
  ],
  controllers: [AccountsController],
  providers: [AccountsService],
  exports: [AccountsService],
})
export class AccountsModule {}
