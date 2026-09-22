import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({ unique: true, required: true })
  username: string;

  @Prop({ unique: true, required: true, lowercase: true })
  email: string;

  @Prop({ required: true })
  password_hash: string;

  @Prop({ default: 'user', enum: ['user', 'admin'] })
  role: string;

  // Extras opcionales
  @Prop() full_name?: string;
  @Prop() avatar_url?: string;
  @Prop() bio?: string;
  @Prop() career_id?: number;
  @Prop() cohort_year?: number;
}

export const UserSchema = SchemaFactory.createForClass(User);
