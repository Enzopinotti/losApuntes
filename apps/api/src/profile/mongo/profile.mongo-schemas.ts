import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import {
  PROFILE_ACCENT_PRESETS,
  PROFILE_ACTIVITY_TYPES,
  PROFILE_COVER_PRESETS,
  PROFILE_SECTIONS,
  PROFILE_VISIBILITIES,
  type ProfileAccentPreset,
  type ProfileActivityType,
  type ProfileCoverPreset,
  type ProfilePresentation,
  type ProfileProfessionalSettings,
  type ProfileRecommendationSignals,
  type ProfileSection,
  type ProfileVisibilityPolicy,
} from '../domain/profile.types';

@Schema({ collection: 'profiles', timestamps: true })
export class Profile {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true, unique: true, index: true })
  userId!: string;

  @Prop({ required: true })
  displayName!: string;

  @Prop({ type: String, default: null })
  bio!: string | null;

  @Prop({ type: String, default: null })
  avatarUrl!: string | null;

  @Prop({ type: [String], default: [] })
  languages!: string[];

  @Prop({ type: [String], default: [] })
  skills!: string[];

  @Prop({ type: [String], default: [] })
  interests!: string[];

  @Prop({ type: [String], default: [] })
  helpTopics!: string[];

  @Prop({ type: [String], default: [] })
  learningTopics!: string[];

  @Prop({
    required: true,
    type: {
      headline: { type: String, default: null },
      careerDiscoveryOptIn: { type: Boolean, required: true, default: false },
    },
  })
  professional!: ProfileProfessionalSettings;

  @Prop({
    required: true,
    type: {
      accentPreset: {
        type: String,
        enum: PROFILE_ACCENT_PRESETS,
        required: true,
      },
      coverPreset: {
        type: String,
        enum: PROFILE_COVER_PRESETS,
        required: true,
      },
      sectionOrder: {
        type: [String],
        enum: PROFILE_SECTIONS,
        required: true,
      },
    },
  })
  presentation!: ProfilePresentation;

  @Prop({
    required: true,
    type: {
      about: { type: String, enum: PROFILE_VISIBILITIES, required: true },
      academic: { type: String, enum: PROFILE_VISIBILITIES, required: true },
      learning: { type: String, enum: PROFILE_VISIBILITIES, required: true },
      activities: { type: String, enum: PROFILE_VISIBILITIES, required: true },
      skills: { type: String, enum: PROFILE_VISIBILITIES, required: true },
      professional: {
        type: String,
        enum: PROFILE_VISIBILITIES,
        required: true,
      },
      contributions: {
        type: String,
        enum: PROFILE_VISIBILITIES,
        required: true,
      },
    },
  })
  visibility!: ProfileVisibilityPolicy;

  @Prop({
    required: true,
    type: {
      academicContext: { type: Boolean, required: true },
      learning: { type: Boolean, required: true },
      skillsInterests: { type: Boolean, required: true },
    },
  })
  recommendationSignals!: ProfileRecommendationSignals;

  @Prop({ required: true, min: 1, default: 1 })
  revision!: number;

  createdAt!: Date;
  updatedAt!: Date;
}

export const ProfileSchema = SchemaFactory.createForClass(Profile);

@Schema({ collection: 'profile_activities', timestamps: true })
export class ProfileActivity {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true, index: true })
  userId!: string;

  @Prop({ required: true, type: String, enum: PROFILE_ACTIVITY_TYPES })
  type!: ProfileActivityType;

  @Prop({ required: true })
  title!: string;

  @Prop({ type: String, default: null })
  description!: string | null;

  @Prop({ type: String, default: null })
  url!: string | null;

  @Prop({ type: String, default: null })
  startedOn!: string | null;

  @Prop({ type: String, default: null })
  endedOn!: string | null;

  @Prop({ required: true, min: 1, default: 1 })
  revision!: number;

  createdAt!: Date;
  updatedAt!: Date;
}

export const ProfileActivitySchema =
  SchemaFactory.createForClass(ProfileActivity);

ProfileActivitySchema.index({ userId: 1, updatedAt: -1, id: 1 });

// Compile-time witnesses keep raw nested schema enums aligned with domain types.
const _accent: ProfileAccentPreset | undefined = undefined;
const _cover: ProfileCoverPreset | undefined = undefined;
const _section: ProfileSection | undefined = undefined;
void _accent;
void _cover;
void _section;
