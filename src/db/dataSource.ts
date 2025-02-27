import { DataSource } from '@rosen-bridge/extended-typeorm';
import Configs from '../configs/Configs';

import {
  BlockEntity,
  ExtractorStatusEntity,
  migrations as scannerMigrations,
} from '@rosen-bridge/scanner';
import {
  CommitmentEntity,
  EventTriggerEntity,
  migrations as watcherDataExtractorMigrations,
} from '@rosen-bridge/watcher-data-extractor';

import { ConfirmedEventEntity } from './entities/ConfirmedEventEntity';
import { TransactionEntity } from './entities/TransactionEntity';
import { RevenueEntity } from './entities/revenueEntity';
import { RevenueChartView } from './entities/revenueChartView';
import { RevenueView } from './entities/revenueView';

import migrations from './migrations';
import { EventView } from './entities/EventView';
import {
  AddressTxsEntity,
  migrations as addressTxExtractorMigrations,
} from '@rosen-bridge/evm-address-tx-extractor';
import { ArbitraryEntity } from './entities/ArbitraryEntity';
import { ReprocessEntity } from './entities/ReprocessEntity';

const dbType = Configs.dbType as keyof typeof migrations;
const dbConfigs = {
  entities: [
    BlockEntity,
    ExtractorStatusEntity,
    CommitmentEntity,
    EventTriggerEntity,
    ConfirmedEventEntity,
    TransactionEntity,
    RevenueEntity,
    RevenueView,
    RevenueChartView,
    EventView,
    AddressTxsEntity,
    ArbitraryEntity,
    ReprocessEntity,
  ],
  migrations: [
    ...scannerMigrations[dbType],
    ...watcherDataExtractorMigrations[dbType],
    ...addressTxExtractorMigrations[dbType],
    ...migrations[dbType],
  ],
  synchronize: false,
  logging: false,
};
let dataSource: DataSource;
if (Configs.dbType === 'sqlite') {
  dataSource = new DataSource({
    type: 'sqlite',
    database: Configs.dbPath,
    ...dbConfigs,
  });
} else {
  dataSource = new DataSource({
    type: 'postgres',
    host: Configs.dbHost,
    port: Configs.dbPort,
    username: Configs.dbUser,
    password: Configs.dbPassword,
    database: Configs.dbName,
    ...dbConfigs,
  });
}

export { dataSource };
