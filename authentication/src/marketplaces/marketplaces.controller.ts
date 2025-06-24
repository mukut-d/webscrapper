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
import { MarketplacesService } from './marketplaces.service';
import { CreateMarketplaceDto } from './dto/create-marketplace.dto';
import { UpdateMarketplaceDto } from './dto/update-marketplace.dto';
import { GetAllMarketPlaceDto } from './dto/getAll-marketplace.dto';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { Roles } from 'src/utils/decorator/roles.decorator';
import { Role } from 'src/utils/enum';
import { RolesGuard } from 'src/middleware/roles.guard';

@ApiTags('Marketplace APIs')
@Controller('marketplaces')
export class MarketplacesController {
  constructor(private readonly marketplacesService: MarketplacesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a marketplace' })
  @ApiBody({ type: CreateMarketplaceDto })
  @ApiOkResponse({
    status: 201,
    description: 'Marketplace created successfully',
  })
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  create(@Body() createMarketplaceDto: CreateMarketplaceDto) {
    return this.marketplacesService.create(createMarketplaceDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all marketplaces' })
  @Roles(Role.ADMIN, Role.USER)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOkResponse({
    status: 200,
    description: 'Marketplaces fetched successfully',
  })
  findAll(@Query() getAllMarketPlaceDto: GetAllMarketPlaceDto) {
    return this.marketplacesService.findAll(getAllMarketPlaceDto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a marketplace' })
  @Roles(Role.ADMIN, Role.USER)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOkResponse({
    status: 200,
    description: 'Marketplace fetched successfully',
  })
  @ApiParam({ name: 'id', type: String })
  findOne(@Param('id') id: string) {
    return this.marketplacesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a marketplace' })
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBody({ type: UpdateMarketplaceDto })
  @ApiOkResponse({
    status: 200,
    description: 'Marketplace updated successfully',
  })
  @ApiParam({ name: 'id', type: String })
  update(
    @Param('id') id: string,
    @Body() updateMarketplaceDto: UpdateMarketplaceDto,
  ) {
    return this.marketplacesService.update(id, updateMarketplaceDto);
  }

  @Delete(':id/deactivate')
  @ApiOperation({ summary: 'Deactivate a marketplace' })
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOkResponse({
    status: 200,
    description: 'Marketplace deactivated successfully',
  })
  @ApiParam({ name: 'id', type: String })
  deactivate(@Param('id') id: string) {
    return this.marketplacesService.deactivate(id);
  }

  @Post(':id/activate')
  @ApiOperation({ summary: 'Activate a marketplace' })
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOkResponse({
    status: 200,
    description: 'Marketplace activated successfully',
  })
  @ApiParam({ name: 'id', type: String })
  activate(@Param('id') id: string) {
    return this.marketplacesService.activate(id);
  }
}
