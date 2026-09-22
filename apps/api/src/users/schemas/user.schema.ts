import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true })
export class User {
  @Prop({ unique: true, sparse: true })
  username?: string;

  @Prop({ unique: true, required: true, lowercase: true })
  email!: string;

  @Prop({ required: true })
  password_hash!: string;

  @Prop({ type: Date, default: undefined })
  email_verified_at?: Date | null;

  @Prop({ default: 1, min: 1 })
  credential_version?: number;

  @Prop({ default: 'active', enum: ['active', 'restricted'] })
  account_status?: 'active' | 'restricted';

  @Prop({ default: 'user', enum: ['user', 'admin'] })
  role!: string;

  @Prop() full_name?: string;
  @Prop() avatar_url?: string;
  @Prop() bio?: string;
  @Prop() career_id?: number;
  @Prop() cohort_year?: number;
}

export const UserSchema = SchemaFactory.createForClass(User);
