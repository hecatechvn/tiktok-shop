import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Role } from 'src/enum';

@Schema({
  collection: 'users',
  timestamps: true,
})
export class User {
  @Prop()
  name: string;

  @Prop()
  userName: string;

  @Prop({
    default: 'Abc@12345678',
    select: false,
  })
  password: string;

  @Prop({
    default: Role.USER,
  })
  role: Role;
}

export const UserSchema = SchemaFactory.createForClass(User);
