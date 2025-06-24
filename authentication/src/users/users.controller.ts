import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserPasswordDto } from './dto/update-user.dto';
import { MailsService } from 'src/mails/mails.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { Request } from 'express';
import { Role } from 'src/utils/enum';
import { Roles } from 'src/utils/decorator/roles.decorator';
import { RolesGuard } from 'src/middleware/roles.guard';


@ApiTags('User Service APIs')
@Controller('users')
@UseGuards(RolesGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly mailsService: MailsService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new user' })
  @ApiBody({ type: CreateUserDto })
  @ApiOkResponse({ status: 201, description: 'User created successfully' })
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all users' })
  @Roles(Role.SuperAdmin)
  @UseGuards(RolesGuard)
  @ApiOkResponse({ status: 200, description: 'Users fetched successfully' })
  async findAll(@Req() req: Request) {
    const user = req.user as { id: string; role: string };  
    await this.mailsService.sendMail(
      'pranav.shukla1282@gmail.com',
      'Test',
      1,
      'Test',
    ); 

    return this.usersService.findAll(user.id, user.role);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a user by id' })
  // @Roles(Role.ADMIN , Role.SuperAdmin, Role.USER)
  // @UseGuards(RolesGuard)
  @ApiParam({ name: 'id', description: 'User id' })
  @ApiOkResponse({ status: 200, description: 'User fetched successfully' })
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a user by id' })
  // @Roles(Role.ADMIN, Role.USER, Role.SuperAdmin)
  // @UseGuards(RolesGuard)
  @ApiParam({ name: 'id', description: 'User id' })
  @ApiOkResponse({ status: 200, description: 'User updated successfully' })
  update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserPasswordDto,
  ) {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a user by id' })
  @Roles(Role.ADMIN, Role.USER, Role.SuperAdmin)
  @UseGuards(RolesGuard)
  @ApiParam({ name: 'id', description: 'User id' })
  @ApiOkResponse({ status: 200, description: 'User deleted successfully' })
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }

  @Post('createAdmin')
  @ApiOperation({ summary: 'Create a new admin user' })
  @ApiBody({ type: CreateUserDto })
  @ApiOkResponse({
    status: 201,
    description: 'Admin user created successfully',
  })
  createAdmin(@Body() createUserDto: CreateUserDto) {
    return this.usersService.createAdmin(createUserDto);
  }

  @Get('verify/:token')
  @ApiOperation({ summary: 'verify email of user' })
  @ApiOkResponse({
    status: 200,
    description: 'jwt created for email',
  })
  emailVerification(@Param('token') token: string) {
    return this.usersService.verifyEmailToken(token);
  }
}
