import {
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { CloudStorageService } from './cloud-storage.service';
import { SingleFileUploadDto } from './dto/cloud-storage.dto';
import { Roles } from 'src/utils/decorator/roles.decorator';
import { Role } from 'src/utils/enum';
import { RolesGuard } from 'src/middleware/roles.guard';

@ApiTags('Cloud Storage APIs')
@Controller('cloud-storage')
export class CloudStorageController {
  constructor(private readonly cloudStorageService: CloudStorageService) {}

  @Roles(Role.ADMIN, Role.USER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Upload Image' })
  @ApiBearerAuth()
  @ApiBody({ type: SingleFileUploadDto })
  @ApiOkResponse({ status: 200, description: 'Image uploaded successfully' })
  @Post('/image')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(@UploadedFile() file: any) {
    try {
      const response = await this.cloudStorageService.uploadImage(file);
      return response;
    } catch (error) {
      return error;
    }
  }

  @Roles(Role.ADMIN, Role.USER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Post('/file')
  @ApiBody({ type: SingleFileUploadDto })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(@UploadedFile() file: any) {
    try {
      const response = await this.cloudStorageService.uploadFile(file);
      return response;
    } catch (error) {
      return error;
    }
  }
}
