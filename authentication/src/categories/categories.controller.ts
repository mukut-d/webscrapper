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
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { FilterCategory } from './dto/filter-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { Roles } from 'src/utils/decorator/roles.decorator';
import { Role } from 'src/utils/enum';
import { RolesGuard } from 'src/middleware/roles.guard';


@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a category' })
  @Roles(Role.ADMIN, Role.SuperAdmin)
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @ApiBody({ type: CreateCategoryDto })
  @ApiOkResponse({
    status: 201,
    description: 'category created successfully',
  })
  create(@Body() createCategoryDto: CreateCategoryDto) {
    return this.categoriesService.create(createCategoryDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all Category' })
  @Roles(Role.ADMIN, Role.USER, Role.SuperAdmin)
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @ApiOkResponse({
    status: 200,
    description: 'Category fetched successfully',
  })
  findAll(@Query() filterCategory: FilterCategory) {
    return this.categoriesService.findAll(filterCategory);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a category' })
  @Roles(Role.ADMIN, Role.USER, Role.SuperAdmin)
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @ApiOkResponse({
    status: 200,
    description: 'category fetched successfully',
  })
  @ApiParam({ name: 'id', type: Number })
  findOne(@Param('id') id: number) {
    return this.categoriesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a category' })
  @Roles(Role.ADMIN, Role.SuperAdmin)
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @ApiBody({ type: UpdateCategoryDto })
  @ApiOkResponse({
    status: 200,
    description: 'category updated successfully',
  })
  @ApiParam({ name: 'id', type: Number })
  update(
    @Param('id') id: number,
    @Body() updateCategoryDto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(id, updateCategoryDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.categoriesService.remove(+id);
  }
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a category' })
  @Roles(Role.ADMIN, Role.SuperAdmin)
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @ApiOkResponse({
    status: 200,
    description: 'Category deleted successfully',
  })
  @ApiParam({ name: 'id', type: Number })
  delete(@Param('id') id: number) {
    return this.categoriesService.remove(id);
  }
}
