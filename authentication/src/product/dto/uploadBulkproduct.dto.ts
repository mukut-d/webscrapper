import { ApiProperty } from '@nestjs/swagger';

export class BulkProduct {
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
