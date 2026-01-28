import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServicesCatalogController } from './services-catalog.controller';
import { ServicesCatalogService } from './services-catalog.service';
import { ServiceCategoryEntity, ServiceEntity } from './services-catalog.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([ServiceCategoryEntity, ServiceEntity])
    ],
    controllers: [ServicesCatalogController],
    providers: [ServicesCatalogService],
    exports: [ServicesCatalogService]
})
export class ServicesCatalogModule { }
