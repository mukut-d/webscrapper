import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MatchesService } from './matches.service';
import { CreateMatchDto } from './dto/create-match.dto';
import { UpdateMatchDto } from './dto/update-match.dto';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { GetAllMatchDto } from './dto/getAll-match.dto';
import { Roles } from 'src/utils/decorator/roles.decorator';
import { Role } from 'src/utils/enum';
import { RolesGuard } from 'src/middleware/roles.guard';


@ApiTags('Matches APIs')
@Controller('matches')
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a match' })
  @Roles(Role.ADMIN, Role.USER)
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @ApiBody({ type: CreateMatchDto })
  @ApiOkResponse({
    status: 201,
    description: 'Match created successfully',
  })
  create(@Body() createMatchDto: CreateMatchDto) {
    return this.matchesService.create(createMatchDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all Matches' })
  @Roles(Role.ADMIN, Role.USER)
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @ApiOkResponse({
    status: 200,
    description: 'Matches fetched successfully',
  })
  findAll(@Query() getAllMatchDto: GetAllMatchDto) {
    return this.matchesService.findAll(getAllMatchDto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a Match' })
  @Roles(Role.ADMIN, Role.USER)
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @ApiOkResponse({
    status: 200,
    description: 'Match fetched successfully',
  })
  @ApiParam({ name: 'id', type: String })
  findOne(@Param('id') id: string) {
    return this.matchesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a match' })
  @Roles(Role.ADMIN, Role.USER)
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @ApiBody({ type: UpdateMatchDto })
  @ApiOkResponse({
    status: 200,
    description: 'Match updated successfully',
  })
  @ApiParam({ name: 'id', type: String })
  update(@Param('id') id: string, @Body() updateMatchDto: UpdateMatchDto) {
    return this.matchesService.update(id, updateMatchDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a Match' })
  @Roles(Role.ADMIN, Role.USER)
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @ApiOkResponse({
    status: 200,
    description: 'Match deleted successfully',
  })
  @ApiParam({ name: 'id', type: String })
  remove(@Param('id') id: string) {
    return this.matchesService.remove(id);
  }

  @Post('/bulkCreate')
  @ApiOperation({ summary: 'create Bulk MarketPlace-Products' })
  @Roles(Role.ADMIN, Role.USER)
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @ApiOkResponse({
    status: 201,
    description: 'MarketPlace-Products created successfully',
  })
  createBulk(createArray: CreateMatchDto[]) {
    return this.matchesService.createBulk(createArray);
  }

  @Get('addMatches/test/:id')
  @ApiOperation({ summary: 'Add a Matches' })
  @Roles(Role.ADMIN, Role.USER)
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @ApiOkResponse({
    status: 200,
    description: 'Match Added successfully',
  })
  @ApiParam({ name: 'id', type: String })
  getByCrawlerAndAddMatches(@Param('id') id: string) {
    return this.matchesService.getByCrawlerAndAddMatches(id);
  }
}
