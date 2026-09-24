import { Module, DynamicModule, Global } from '@nestjs/common';
import { StorageService, STORAGE_OPTIONS } from './storage.service';
import { StorageModuleOptions } from './storage.interface';

@Global()
@Module({})
export class StorageModule {
  static forRoot(options: StorageModuleOptions = { driver: 'local' }): DynamicModule {
    return {
      module: StorageModule,
      providers: [
        {
          provide: STORAGE_OPTIONS,
          useValue: options,
        },
        StorageService,
      ],
      exports: [StorageService],
    };
  }
}
