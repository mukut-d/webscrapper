import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ProductService } from 'src/product/product.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { GetAllProjectDto } from './dto/getAll-project.dto';
import { StatusDto } from './dto/status.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

@Injectable()
export class ProjectsService {
  constructor(
    @Inject('PRODUCT_SERVICE')
    private readonly client: ClientProxy,
    @Inject(ProductService)
    private readonly productService: ProductService,
  ) {}

  create(createProjectDto: CreateProjectDto) {
    return this.client.send('createProject', createProjectDto);
  }

  findAll(getAllProjectDto: GetAllProjectDto, userId) {
    return this.client.send('findAllProjects', {
      ...getAllProjectDto,
      userId: userId,
    });
  }

  findOne(id: string) {
    return this.client.send('findOneProject', id);
  }

  update(id: string, updateProjectDto: UpdateProjectDto) {
    return this.client.send('updateProject', { ...updateProjectDto, id });
  }

  remove(id: string) {
    return this.client.send('removeProject', id);
  }

  updateStatus(id: string, statusDto: StatusDto) {
    return this.client.send('projectStatusUpdate', { ...statusDto, id: id });
  }

  getUserIdByProjectId(id: string) {
    return this.client.send('getUserIdByProjectId', id);
  }

  getProductsFromCrawler(id: string) {
    return this.productService.getByCrawler(id);
  }
  getproductsByProjectId(id: string) {
    return this.client.send('getproductsByProjectId', id);
  }
}
