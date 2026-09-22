import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type GoogleExternalIdentityDocument =
  HydratedDocument<GoogleExternalIdentity>;

@Schema({
  collection: 'auth_external_identities',
  versionKey: false,
})
export class GoogleExternalIdentity {
  @Prop({ required: true, enum: ['google'] })
  provider!: 'google';

  @Prop({ required: true })
  providerSubject!: string;

  @Prop({ required: true })
  userId!: string;

  @Prop({ required: true })
  emailAtLink!: string;

  @Prop({ required: true })
  linkedAt!: Date;
}

export const GoogleExternalIdentitySchema =
  SchemaFactory.createForClass(GoogleExternalIdentity);

GoogleExternalIdentitySchema.index(
  { provider: 1, providerSubject: 1 },
  { unique: true },
);
GoogleExternalIdentitySchema.index(
  { provider: 1, userId: 1 },
  { unique: true },
);
