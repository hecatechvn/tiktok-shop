import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({
  collection: 'shop_cipher',
  timestamps: true,
})
export class ShopCipher {
  @Prop({ required: true })
  cipher: string;

  @Prop({ required: true })
  code: string;

  @Prop({ required: true })
  id: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  region: string;

  @Prop({ required: true })
  seller_type: string;
}

@Schema()
export class Task {
  @Prop({ required: true, default: '0 6 * * *' })
  cronExpression: string;

  @Prop({ default: Date.now })
  lastRun: Date;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: '' })
  description?: string;
}

export type TaskDocument = Task & Document;

export const TaskSchema = SchemaFactory.createForClass(Task);

@Schema({
  collection: 'accounts',
  timestamps: true,
})
export class Account {
  @Prop({ required: true })
  authCode: string;

  @Prop({ required: true })
  appKey: string;

  @Prop({ required: true })
  appSecret: string;

  @Prop()
  serviceId: string;

  @Prop()
  accessToken: string;

  @Prop()
  refreshToken: string;

  @Prop()
  accessTokenExpireIn: number;

  @Prop()
  refreshTokenExpireIn: number;

  @Prop({ type: [ShopCipher] })
  shopCipher: ShopCipher[];

  @Prop({ default: true })
  status: boolean;

  @Prop({
    type: TaskSchema,
    default: {
      cronExpression: '0 6 * * *',
      lastRun: new Date(),
      isActive: true,
    },
  })
  task: Task;

  @Prop({ default: '' })
  sheetId: string;

  @Prop({ default: [] })
  sheetEmails: string[];

  @Prop({ default: '' })
  shopName: string;

  @Prop({ default: '' })
  shopId: string;
}

export type AccountDocument = Account & Document;

export const AccountSchema = SchemaFactory.createForClass(Account);
