import { AlertsService } from './alerts.service';

import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SchedulerRegistry } from '@nestjs/schedule';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';

import { UserToken } from 'src/token';
import { CreateAlertDto } from './dto/create-alert.dto';
import { GetAllAlertDto } from './dto/getAll-alert.dto';
import { UpdateAlertDto } from './dto/update-alert.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { Role } from 'src/utils/enum';
import { Roles } from 'src/utils/decorator/roles.decorator';
import { RolesGuard } from 'src/middleware/roles.guard';

@ApiTags('alerts')
@Controller('alerts')
@ApiBearerAuth()
export class AlertsController {
  constructor(
    private readonly alertsService: AlertsService,
    private schedulerRegistry: SchedulerRegistry,
    private readonly jwtService: JwtService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a project' })
  @Roles(Role.ADMIN, Role.USER, Role.SuperAdmin)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBody({ type: CreateAlertDto })
  @ApiOkResponse({
    status: 201,
    description: 'alert created successfully',
  })
  async create(@Body() createAlertDto: CreateAlertDto, @Req() req: any) {
    const userToken = new UserToken(this.jwtService);
    const userId = await userToken.getUserId(req);
    return this.alertsService.create(createAlertDto, userId);
  }

  @Get()
  @ApiOperation({ summary: 'Get all alerts' })
  @Roles(Role.ADMIN, Role.USER, Role.SuperAdmin)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOkResponse({
    status: 200,
    description: 'alerts fetched successfully',
  })
  async findAll(@Query() getAllAlertDto: GetAllAlertDto, @Req() req: any) {
    const userToken = new UserToken(this.jwtService);
    const userId = await userToken.getUserId(req);
    return this.alertsService.findAll(getAllAlertDto, userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a alert' })
  @Roles(Role.ADMIN, Role.USER, Role.SuperAdmin)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOkResponse({
    status: 200,
    description: 'alert fetched successfully',
  })
  @ApiParam({ name: 'id', type: String })
  findOne(@Param('id') id: string) {
    return this.alertsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a alert' })
  @Roles(Role.ADMIN, Role.USER, Role.SuperAdmin)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBody({ type: UpdateAlertDto })
  @ApiOkResponse({
    status: 200,
    description: 'Project updated successfully',
  })
  @ApiParam({ name: 'id', type: String })
  async update(
    @Param('id') id: string,
    @Body() updateAlertDto: UpdateAlertDto,
    @Req() req: any,
  ) {
    const userToken = new UserToken(this.jwtService);
    const userId = await userToken.getUserId(req);
    return this.alertsService.update(id, updateAlertDto, userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a alert' })
  @Roles(Role.ADMIN, Role.USER, Role.SuperAdmin)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOkResponse({
    status: 200,
    description: 'Product deleted successfully',
  })
  @ApiParam({ name: 'id', type: String })
  remove(@Param('id') id: string) {
    return this.alertsService.remove(id);
  }

  @Get('test/:id')
  @Roles(Role.ADMIN, Role.USER, Role.SuperAdmin)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiParam({ name: 'id', type: String })
  test(@Param('id') id: string) {
    return this.alertsService.test(id);
  }
}
