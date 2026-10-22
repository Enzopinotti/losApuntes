import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ collection: 'study_collections', timestamps: true })
export class StudyCollection {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true, index: true })
  ownerUserId!: string;

  @Prop({ required: true })
  operationKey!: string;

  @Prop({ required: true })
  title!: string;

  @Prop({ type: String, default: null })
  description!: string | null;

  @Prop({ type: [String], default: [] })
  resourceIds!: string[];

  @Prop({ type: Number, required: true, default: 1, min: 1 })
  revision!: number;

  createdAt!: Date;
  updatedAt!: Date;
}

export const StudyCollectionSchema =
  SchemaFactory.createForClass(StudyCollection);

StudyCollectionSchema.index(
  { ownerUserId: 1, operationKey: 1 },
  { unique: true },
);
StudyCollectionSchema.index({ ownerUserId: 1, createdAt: -1, id: -1 });
StudyCollectionSchema.index({ ownerUserId: 1, id: 1 });
