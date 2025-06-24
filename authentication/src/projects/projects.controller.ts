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
  ParseUUIDPipe,
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
import { CronJob } from 'cron';
import { lastValueFrom } from 'rxjs';
import { NotificationsGateway } from 'src/notifications/notifications.gateway';
import { CreateProjectDto } from './dto/create-project.dto';
import { GetAllProjectDto } from './dto/getAll-project.dto';
import { StatusDto } from './dto/status.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectsService } from './projects.service';
import { UserToken } from 'src/token';
import { MatchesService } from 'src/matches/matches.service';
import { Roles } from 'src/utils/decorator/roles.decorator';
import { Role } from 'src/utils/enum';
import { RolesGuard } from 'src/middleware/roles.guard';

@ApiTags('projects APIs')
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private schedulerRegistry: SchedulerRegistry,
    private readonly notificationsGateway: NotificationsGateway,
    private readonly jwtService: JwtService,
    private readonly matchesService: MatchesService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a project' })
  @Roles(Role.ADMIN, Role.USER, Role.SuperAdmin)
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @ApiBody({ type: CreateProjectDto })
  @ApiOkResponse({
    status: 201,
    description: 'Product created successfully',
  })
  create(@Body() createProductDto: CreateProjectDto) {
    return this.projectsService.create(createProductDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all Projects' })
  @Roles(Role.ADMIN, Role.USER , Role.SuperAdmin)
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @ApiOkResponse({
    status: 200,
    description: 'Products fetched successfully',
  })
  async findAll(@Query() getAllProjectDto: GetAllProjectDto, @Req() req: any) {
    const userToken = new UserToken(this.jwtService);
    const userId = await userToken.getUserId(req);
    return this.projectsService.findAll(getAllProjectDto, userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a Project' })
  @Roles(Role.ADMIN, Role.USER , Role.SuperAdmin)
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @ApiOkResponse({
    status: 200,
    description: 'Product fetched successfully',
  })
  @ApiParam({ name: 'id', type: String })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.projectsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a project' })
  @Roles(Role.ADMIN, Role.USER , Role.SuperAdmin)
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @ApiBody({ type: UpdateProjectDto })
  @ApiOkResponse({
    status: 200,
    description: 'Project updated successfully',
  })
  @ApiParam({ name: 'id', type: String })
  update(@Param('id') id: string, @Body() updateProjectDto: UpdateProjectDto) {
    return this.projectsService.update(id, updateProjectDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a project' })
  @Roles(Role.ADMIN, Role.USER, Role.SuperAdmin)
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @ApiOkResponse({
    status: 200,
    description: 'Product deleted successfully',
  })
  @ApiParam({ name: 'id', type: String })
  remove(@Param('id') id: string) {
    return this.projectsService.remove(id);
  }

  @Post('/status/:id')
  @ApiOperation({ summary: 'status change' })
  @ApiBody({ type: StatusDto })
  @ApiOkResponse({
    status: 201,
    description: 'status updated successfully',
  })
  @ApiParam({ name: 'id', type: String })
  async updateStatus(@Param('id') id: string, @Body() statusDto: StatusDto) {
    const project = await lastValueFrom(await this.projectsService.findOne(id));
    // console.log(statusDto.status);
    if (statusDto.status === 'started') {
      const userId = await lastValueFrom(
        await this.projectsService.getUserIdByProjectId(id),
      );
      this.addCronJobs(id, '*/2 * * * *');
      this.notificationsGateway.server
        .to(userId)
        .emit('project-status', { id, status: 'started' });
    } else if (statusDto.status === 'completed') {
      if (project.success == true) {
        const userId = await lastValueFrom(
          await this.projectsService.getUserIdByProjectId(id),
        );
        this.notificationsGateway.server
          .to(userId)
          .emit('project-status', { id, status: 'completed' });

        this.stopCronJob(id);
        await lastValueFrom(this.projectsService.getProductsFromCrawler(id));
        const data = await this.projectsService.updateStatus(id, statusDto);
        await this.productsCronJob(id);
        return data;
      } else {
        this.stopCronJob(id);
        await lastValueFrom(this.matchesService.getByCrawlerAndAddMatches(id));
        return { message: 'cron job stopped for productId ' + id };
      }
    }
  }

  async addCronJobs(name: string, time: string) {
    const job = new CronJob(time, async () => {
      // fetch products from crwaler api and save in db

      const products = await lastValueFrom(
        this.projectsService.getProductsFromCrawler(name),
      );
      console.log('products fetched from crawler api: ' + products.length);
    });

    await this.schedulerRegistry.addCronJob(name, job);
    job.start();

    console.log('cron job for project id: ' + name + ' started');
  }

  stopCronJob(name: string) {
    try {
      const job = this.schedulerRegistry.getCronJob(name);
      job.stop();
    } catch (error) {
      console.log(error.message);
    }
    console.log('cron job for  product or project id: ' + name + ' stopped');
  }

  async addCronJobsForProduct(name: string, time: string) {
    const job = new CronJob(time, async () => {
      // fetch products from crwaler api and save in db

      const matches = await lastValueFrom(
        this.matchesService.getByCrawlerAndAddMatches(name),
      );
      if (matches) {
        // console.log(matches);
        if (matches.matchComplete == true) {
          this.stopCronJob(name);
        }
      }
    });

    await this.schedulerRegistry.addCronJob(name, job);
    job.start();

    console.log('cron job for product: ' + name + ' started');
  }

  async productsCronJob(projectId: string) {
    const projectproducts = await lastValueFrom(
      this.projectsService.getproductsByProjectId(projectId),
    );
    const products = projectproducts.products;
    const productIds = products.map(function (x) {
      return x.id;
    });
    for await (const pId of productIds) {
      await this.addCronJobsForProduct(pId, '*/2 * * * *');
    }
    console.log(
      `cron job started for ${productIds.length} products of project ${projectId}`,
    );
  }
}
