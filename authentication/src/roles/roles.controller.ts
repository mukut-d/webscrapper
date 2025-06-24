import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { ApiBearerAuth } from '@nestjs/swagger';
import { Roles } from 'src/utils/decorator/roles.decorator';
import { Role } from 'src/utils/enum';
import { RolesGuard } from 'src/middleware/roles.guard';

@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}
  
  @Post()
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  create(@Body() createRoleDto: CreateRoleDto) {
    return this.rolesService.create(createRoleDto);
  }

  @Get()
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  findAll() {
    return this.rolesService.findAll();
  }

  @Get('default')
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  getDefaultRole() {
    return this.rolesService.getDefaultRole();
  }

  @Get(':id')
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  findOne(@Param('id') id: string) {
    return this.rolesService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  update(@Param('id') id: string, @Body() updateRoleDto: UpdateRoleDto) {
    return this.rolesService.update(id, updateRoleDto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  remove(@Param('id') id: string) {
    return this.rolesService.remove(id);
  }
}
