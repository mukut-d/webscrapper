import { Test, TestingModule } from '@nestjs/testing';
import { MarketplacesController } from './marketplaces.controller';
import { MarketplacesService } from './marketplaces.service';

describe('MarketplacesController', () => {
  let controller: MarketplacesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MarketplacesController],
      providers: [MarketplacesService],
    }).compile();

    controller = module.get<MarketplacesController>(MarketplacesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
