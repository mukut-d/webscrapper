import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { CreateCategoryDto } from './dto/create-category.dto';
import { FilterCategory } from './dto/filter-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(@Inject('METAS_SERVICE') private readonly client: ClientProxy) {}

  create(createCategoryDto: CreateCategoryDto) {
    return this.client.send('createCategory', createCategoryDto);
  }

  findAll(filterCategory: FilterCategory) {
    return this.client.send('findAllCategories', filterCategory);
  }

  findOne(id: number) {
    return this.client.send('findOneCategory', id);
  }

  update(id: number, updateCategoryDto: UpdateCategoryDto) {
    return this.client.send('updateCategory', {
      ...updateCategoryDto,
      categoryid: id,
    });
  }

  remove(id: number) {
    return this.client.send('removeCategory', id);
  }
}
