import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { CreateMatchDto } from './dto/create-match.dto';
import { GetAllMatchDto } from './dto/getAll-match.dto';
import { UpdateMatchDto } from './dto/update-match.dto';

@Injectable()
export class MatchesService {
  constructor(
    @Inject('PRODUCT_SERVICE') private readonly client: ClientProxy,
  ) {}

  create(createProductDto: CreateMatchDto) {
    return this.client.send('createMatch', createProductDto);
  }

  findAll(getAllMatchDto: GetAllMatchDto) {
    return this.client.send('findAllMatches', getAllMatchDto);
  }

  findOne(id: string) {
    return this.client.send('findOneMatch', id);
  }

  update(id: string, updateProductDto: UpdateMatchDto) {
    return this.client.send('updateMatch', { ...updateProductDto, id });
  }

  remove(id: string) {
    return this.client.send('removeMatch', id);
  }

  createBulk(createArray: CreateMatchDto[]) {
    return this.client.send('createBulkMatch', createArray);
  }

  getByCrawlerAndAddMatches(id: string) {
    return this.client.send('getByCrawlerAndAddMatches', id);
  }
}
