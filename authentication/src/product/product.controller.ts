import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Query,
  Res,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';

import { ProductService } from './product.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CronJob } from 'cron';
import { GetAllProductDto, GetAllSearchDto } from './dto/getAll-product.dto';
import { StatusDto } from './dto/status.dto';
import { lastValueFrom } from 'rxjs';
import { ExportProductDto } from './dto/export.dto';
import { MoveDto } from './dto/move.dto';
import { NotificationsGateway } from 'src/notifications/notifications.gateway';
import { JwtService } from '@nestjs/jwt';
import { ProjectsService } from 'src/projects/projects.service';
import { BulkCreate } from './dto/bulk-create.dto';
import { Roles } from 'src/utils/decorator/roles.decorator';
import { Role } from 'src/utils/enum';
import { RolesGuard } from 'src/middleware/roles.guard';

@ApiTags('Product APIs')
@Controller('product')
export class ProductController {
  constructor(
    private readonly productService: ProductService,
    private notificationsGateway: NotificationsGateway,
    private readonly projectService: ProjectsService,
    private readonly jwtService: JwtService,
    private projectsService: ProjectsService,
    private schedulerRegistry: SchedulerRegistry,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a product' })
  @Roles(Role.ADMIN, Role.USER)
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @ApiBody({ type: CreateProductDto })
  @ApiOkResponse({
    status: 201,
    description: 'Product created successfully',
  })
  async create(@Body() createProductDto: CreateProductDto) {
    const data = await lastValueFrom(
      this.productService.create(createProductDto),
    );
    if (data) {
      console.log('project status recieved by crawler');
    }
    const id = data['project_id'];
    const status = data['status'];
    const userId = await lastValueFrom(
      await this.projectsService.getUserIdByProjectId(id),
    );
    // if (status === 'started') {
    //   this.addCronJobs(id, '*/2 * * * *');
    //   this.notificationsGateway.server
    //     .to(userId)
    //     .emit('project-status', { id, status: 'started' });
    // } else if (status === 'completed') {
    //   this.stopCronJob(id);
    //   await this.projectsService.getProductsFromCrawler(id); // check if there's any remaining data to be fetched from the crawler api
    //   this.notificationsGateway.server
    //     .to(userId)
    //     .emit('project-status', { id, status: 'completed' });
    // }

    await lastValueFrom(
      this.projectsService.updateStatus(id, { status: status }),
    );
    console.log('project status changed successfully');
    return data;
  }

  @Post('getAll')
  @ApiOperation({ summary: 'Get all Products' })
  @Roles(Role.ADMIN, Role.USER)
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @ApiOkResponse({
    status: 200,
    description: 'Products fetched successfully',
  })
  findAll(
    @Query() getAllProductDto: GetAllProductDto,
    @Body() getAllSearchDto: GetAllSearchDto,
  ) {
    return this.productService.findAll(getAllProductDto, getAllSearchDto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a Product' })
  @Roles(Role.ADMIN, Role.USER)
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @ApiOkResponse({
    status: 200,
    description: 'Product fetched successfully',
  })
  @ApiParam({ name: 'id', type: String })
  findOne(@Param('id') id: string, @Query('projectId') projectId: string) {
    return this.productService.findOne(id, projectId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a product' })
  @Roles(Role.ADMIN, Role.USER)
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @ApiBody({ type: UpdateProductDto })
  @ApiOkResponse({
    status: 200,
    description: 'Product updated successfully',
  })
  @ApiParam({ name: 'id', type: String })
  update(@Param('id') id: string, @Body() updateProductDto: UpdateProductDto) {
    return this.productService.update(id, updateProductDto);
  }

  @Post('/delete')
  @ApiOperation({ summary: 'Delete a Product' })
  @Roles(Role.ADMIN, Role.USER)
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @ApiOkResponse({
    status: 200,
    description: 'Product deleted successfully',
  })
  remove(@Body() ids: string[]) {
    return this.productService.remove(ids);
  }

  @Post('/owned')
  @ApiOperation({ summary: 'own Producta' })
  @Roles(Role.ADMIN, Role.USER)
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @ApiOkResponse({
    status: 200,
    description: 'Product owned successfully',
  })
  ownedProducts(@Body() ids: string[]) {
    return this.productService.ownedProducts(ids);
  }

  @Get('/getByCrawler/:id')
  @ApiOperation({ summary: 'GET And ADD a Product From Crawler' })
  @Roles(Role.ADMIN, Role.USER)
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @ApiOkResponse({
    status: 200,
    description: 'Product fetch by crawler successfully',
  })
  @ApiParam({ name: 'id', type: String })
  getByCrawler(@Param('id') id: string) {
    return this.productService.getByCrawler(id);
  }

  @Post('/bulkCreate')
  @ApiOperation({ summary: 'create Bulk Products' })
  @Roles(Role.ADMIN, Role.USER)
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @ApiBody({ type: BulkCreate })
  @ApiOkResponse({
    status: 201,
    description: 'Products created successfully',
  })
  async createBulk(@Body() bulCreate: BulkCreate) {
    return this.productService.createBulk(bulCreate);
  }

  @Post('/moveOrCopyProduct')
  @ApiOperation({ summary: 'move or copy product' })
  @Roles(Role.ADMIN, Role.USER)
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @ApiOkResponse({
    status: 201,
    description: 'operation successful',
  })
  moveOrCopyProduct(@Body() moveDto: MoveDto) {
    return this.productService.moveOrCopyProduct(moveDto);
  }

  @Post('/status/:id')
  @ApiOperation({ summary: 'status change' })
  @Roles(Role.ADMIN, Role.USER)
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @ApiBody({ type: StatusDto })
  @ApiOkResponse({
    status: 201,
    description: 'status updated successfully',
  })
  @ApiParam({ name: 'id', type: String })
  updateStatus(@Param('id') id: string, @Body() statusDto: StatusDto) {
    return this.productService.updateStatus(id, statusDto);
  }

  @Post('/export')
  @ApiOperation({ summary: 'Export Products' })
  @Roles(Role.ADMIN, Role.USER)
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @ApiOkResponse({ status: 200, description: 'Products exported successfully' })
  @ApiBody({ type: ExportProductDto })
  async exportProducts(
    @Body() exportProductDto: ExportProductDto,
    @Res() res,
    @Req() req: any,
  ) {
    try {
      const userId = await lastValueFrom(
        this.projectService.getUserIdByProjectId(exportProductDto.projectId),
      );
      const count = await lastValueFrom(
        this.productService.countProducts(exportProductDto.projectId),
      );

      const batchSize = 10;
      const totalBatches = Math.ceil(count / batchSize);
      // console.log(totalBatches)

      const percent = 100 / totalBatches;
      const productArray = [];
      for (let i = 0; i < totalBatches; i++) {
        const products = await lastValueFrom(
          await this.productService.exportProducts({
            ...exportProductDto,
            limit: batchSize,
            offset: i * batchSize,
          }),
        );
        productArray.push(...products);
        this.notificationsGateway.server
          .to(userId)
          .emit('progress', { percent: percent * (i + 1) });
      }

      const newProductArray = await this.keyCapitalise(productArray);
      let fileBuffer = await this.productService.convertJsonToExcel(
        newProductArray,
      );

      switch (exportProductDto.type) {
        case 'csv':
          fileBuffer = await this.productService.convertExcelToCsv(fileBuffer);
          res.setHeader('Content-Type', 'text/csv');
          res.setHeader(
            'Content-Disposition',
            'attachment; filename=' + 'products.csv',
          );
          res.setHeader('Content-Length', fileBuffer.length);
          res.send(fileBuffer);
          break;
        case 'xlsx':
          res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          );
          res.setHeader(
            'Content-Disposition',
            'attachment; filename=' + 'products.xlsx',
          );
          res.setHeader('Content-Length', fileBuffer.length);
          res.send(fileBuffer);
          break;
        case 'pdf':
          fileBuffer = await this.productService.convertExcelToHtml(fileBuffer);
          fileBuffer = await this.productService.convertHtmlToPdf(fileBuffer);

          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader(
            'Content-Disposition',
            'attachment; filename=' + 'products.pdf',
          );
          res.setHeader('Content-Length', fileBuffer.length);
          res.send(fileBuffer);
          break;

        default:
          break;
      }
    } catch (error) {
      console.log(error);
    }
  }

  async keyCapitalise(productArray: object[]) {
    const newProductArray = [];
    for await (const product of productArray) {
      const entries = Object.entries(product);
      const capsEntries = entries.map((entry) => [
        entry[0][0].toUpperCase() + entry[0].slice(1),
        entry[1],
      ]);
      const capsPopulations = Object.fromEntries(capsEntries);
      newProductArray.push(capsPopulations);
    }
    return newProductArray;
  }

  async addCronJobs(name: string, time: string) {
    const job = new CronJob(time, async () => {
      // fetch products from crwaler api and save in db

      await lastValueFrom(this.projectsService.getProductsFromCrawler(name));
    });

    await this.schedulerRegistry.addCronJob(name, job);
    job.start();

    console.log('cron job for project id: ' + name + ' started');
  }

  stopCronJob(name: string) {
    const job = this.schedulerRegistry.getCronJob(name);
    job.stop();

    console.log('cron job for project id: ' + name + ' stopped');
  }
}
