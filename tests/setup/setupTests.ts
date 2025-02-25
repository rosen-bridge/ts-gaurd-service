import '../../src/bootstrap';
import DatabaseActionMock from '../db/mocked/DatabaseAction.mock';
import TestConfigs from '../testUtils/TestConfigs';
import * as TestTransactionSerializer from '../../tests/transaction/TestTransactionSerializer';
import PublicStatusHandler from '../../src/handlers/PublicStatusHandler';

// mock database
await DatabaseActionMock.initDatabase();

// init PublicStatusHandler
await PublicStatusHandler.init(DatabaseActionMock.testDataSource);

// mock GuardPkHandler
vi.doMock('../../src/handlers/GuardPkHandler', () => ({
  default: {
    getInstance: () => ({
      publicKeys: TestConfigs.guardPublicKeys,
      requiredSign: TestConfigs.requiredSigns,
      guardsLen: TestConfigs.guardPublicKeys.length,
      guardId: TestConfigs.guardIndex,
    }),
  },
}));

// mock TransactionSerializer.fromJson
vi.doMock('../../src/transaction/TransactionSerializer', () => ({
  fromJson: TestTransactionSerializer.fromJson,
}));
