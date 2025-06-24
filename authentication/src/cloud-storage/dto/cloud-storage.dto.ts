import { ApiProperty } from '@nestjs/swagger';

export class SingleFileUploadDto {
  @ApiProperty({
    type: 'file',
    properties: {
      file: {
        type: 'string',
        format: 'binary',
      },
    },
    description: 'Attachment',
  })
  file: string;
}

export class MultipleFileUploadDto {
  @ApiProperty({
    type: 'object',
    properties: {
      filename: {
        type: 'array',
        items: {
          type: 'string',
          format: 'binary',
        },
      },
    },
    description: 'Attachment',
  })
  files: string[];
}
