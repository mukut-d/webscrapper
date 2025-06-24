import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { CreateMarketplaceDto } from './dto/create-marketplace.dto';
import { GetAllMarketPlaceDto } from './dto/getAll-marketplace.dto';
import { UpdateMarketplaceDto } from './dto/update-marketplace.dto';

@Injectable()
export class MarketplacesService {
  constructor(@Inject('METAS_SERVICE') private readonly client: ClientProxy) {}

  create(createMarketplaceDto: CreateMarketplaceDto) {
    return this.client.send('createMarketplace', createMarketplaceDto);
  }

  findAll(getAllMarketplaceDto: GetAllMarketPlaceDto) {
    return this.client.send('findAllMarketplaces', getAllMarketplaceDto);
  }

  findOne(id: string) {
    return this.client.send('findOneMarketplace', id);
  }

  update(id: string, updateMarketplaceDto: UpdateMarketplaceDto) {
    return this.client.send('updateMarketplace', {
      ...updateMarketplaceDto,
      id,
    });
  }

  activate(id: string) {
    return this.client.send('activateMarketplace', id);
  }

  deactivate(id: string) {
    return this.client.send('deactivateMarketplace', id);
  }
}
