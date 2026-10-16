import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StudyProgress, StudyProgressSchema } from './study-progress.schema';
import { StudyProgressExportReader } from './study-progress-export.reader';

/** Read-only provider. Does not register or enable study-progress CRUD. */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: StudyProgress.name, schema: StudyProgressSchema },
    ]),
  ],
  providers: [StudyProgressExportReader],
  exports: [StudyProgressExportReader],
})
export class StudyProgressExportReadModule {}
