import { DataSource } from 'typeorm';
import {
  BlockEntity,
  PROCEED,
  migrations as scannerMigrations,
} from '@rosen-bridge/scanner';
import {
  CommitmentEntity,
  EventTriggerEntity,
  migrations as watcherDataExtractorMigrations,
} from '@rosen-bridge/watcher-data-extractor';
import { ConfirmedEventEntity } from '../../../src/db/entities/ConfirmedEventEntity';
import { TransactionEntity } from '../../../src/db/entities/TransactionEntity';
import migrations from '../../../src/db/migrations';
import Utils from '../../../src/utils/Utils';
import TestUtils from '../../testUtils/TestUtils';
import {
  EventTrigger,
  PaymentTransaction,
  TransactionType,
} from '@rosen-chains/abstract-chain';
import { DatabaseAction } from '../../../src/db/DatabaseAction';
import { RevenueEntity } from '../../../src/db/entities/revenueEntity';
import { RevenueChartView } from '../../../src/db/entities/revenueChartView';
import { RevenueView } from '../../../src/db/entities/revenueView';
import { DefaultLoggerFactory } from '@rosen-bridge/abstract-logger';
import { EventView } from '../../../src/db/entities/EventView';
import { OrderStatus } from '../../../src/utils/constants';
import {
  AddressTxsEntity,
  migrations as addressTxExtractorMigrations,
} from '@rosen-bridge/evm-address-tx-extractor';
import { ArbitraryEntity } from '../../../src/db/entities/ArbitraryEntity';
import { ReprocessEntity } from '../../../src/db/entities/ReprocessEntity';
import { ReprocessStatus } from '../../../src/reprocess/Interfaces';

const logger = DefaultLoggerFactory.getInstance().getLogger(import.meta.url);

class DatabaseActionMock {
  static testDataSource = new DataSource({
    type: 'sqlite',
    database: ':memory:',
    entities: [
      BlockEntity,
      CommitmentEntity,
      ConfirmedEventEntity,
      EventTriggerEntity,
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
      ...scannerMigrations.sqlite,
      ...watcherDataExtractorMigrations.sqlite,
      ...addressTxExtractorMigrations.sqlite,
      ...migrations.sqlite,
    ],
    synchronize: false,
    logging: false,
  });
  static testDatabase: DatabaseAction;

  /**
   * initializes test database
   */
  static initDatabase = async () => {
    try {
      await this.testDataSource.initialize();
      await this.testDataSource.runMigrations();
      logger.info('Test Data Source has been initialized!');
    } catch (err) {
      logger.error(`An error occurred while initializing test datasource`);
      logger.error(err.stack);
    }
    DatabaseAction.init(this.testDataSource);
    this.testDatabase = DatabaseAction.getInstance();
  };

  /**
   * deletes every record in Event and Transaction table in database
   */
  static clearTables = async () => {
    await this.testDatabase.RevenueRepository.clear();
    await this.testDatabase.CommitmentRepository.clear();
    await this.testDatabase.TransactionRepository.clear();
    await this.testDatabase.ConfirmedEventRepository.clear();
    await this.testDatabase.EventRepository.clear();
    await this.testDatabase.ArbitraryRepository.clear();
    await this.testDatabase.ReprocessRepository.clear();
    await this.testDataSource.getRepository(BlockEntity).clear();
  };

  /**
   * inserts a record to Event and ConfirmedEvent tables in db
   * @param event
   * @param status
   * @param boxSerialized
   * @param sourceChainHeight
   * @param firstTry
   * @param eventHeight
   * @param spendHeight
   * @param spendBlockId
   * @param spendTxId
   * @param result
   * @param paymentTxId
   */
  static insertEventRecord = async (
    event: EventTrigger,
    status: string,
    boxSerialized = 'boxSerialized',
    sourceChainHeight = 300,
    firstTry?: string,
    eventHeight = 200,
    spendHeight?: number,
    spendBlockId = 'blockId',
    spendTxId?: string,
    result?: string,
    paymentTxId?: string,
    unexpectedFails?: number
  ) => {
    await this.testDatabase.EventRepository.createQueryBuilder()
      .insert()
      .values({
        extractor: 'extractor',
        boxId: TestUtils.generateRandomId(),
        boxSerialized: boxSerialized,
        block: 'blockId',
        height: eventHeight,
        fromChain: event.fromChain,
        toChain: event.toChain,
        fromAddress: event.fromAddress,
        toAddress: event.toAddress,
        amount: event.amount,
        bridgeFee: event.bridgeFee,
        networkFee: event.networkFee,
        sourceChainTokenId: event.sourceChainTokenId,
        targetChainTokenId: event.targetChainTokenId,
        sourceTxId: event.sourceTxId,
        sourceBlockId: event.sourceBlockId,
        WIDsHash: event.WIDsHash,
        WIDsCount: event.WIDsCount,
        sourceChainHeight: sourceChainHeight,
        spendHeight: spendHeight,
        spendBlock: spendBlockId,
        spendTxId: spendTxId,
        result: result,
        paymentTxId: paymentTxId,
        txId: 'event-creation-tx-id',
        eventId: Utils.txIdToEventId(event.sourceTxId),
      })
      .execute();
    const eventData =
      await this.testDatabase.EventRepository.createQueryBuilder()
        .select()
        .where('sourceTxId = :id', { id: event.sourceTxId })
        .getOne();
    await this.testDatabase.ConfirmedEventRepository.createQueryBuilder()
      .insert()
      .values({
        id: Utils.txIdToEventId(event.sourceTxId),
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        eventData: eventData!,
        status: status,
        firstTry: firstTry,
        unexpectedFails: unexpectedFails,
      })
      .execute();
  };

  /**
   * inserts a record only to Event table in db
   * @param event
   * @param boxSerialized
   * @param spendHeight
   * @param spendTxId
   * @param spendBlock
   * @param result
   * @param paymentTxId
   */
  static insertOnlyEventDataRecord = async (
    event: EventTrigger,
    boxSerialized = 'boxSerialized',
    spendHeight?: number,
    spendTxId?: string,
    spendBlock?: string,
    result?: string,
    paymentTxId?: string
  ) => {
    const height = 300;
    await this.testDatabase.EventRepository.createQueryBuilder()
      .insert()
      .values({
        extractor: 'extractor',
        boxId: TestUtils.generateRandomId(),
        boxSerialized: boxSerialized,
        block: 'blockId',
        height: height,
        fromChain: event.fromChain,
        toChain: event.toChain,
        fromAddress: event.fromAddress,
        toAddress: event.toAddress,
        amount: event.amount,
        bridgeFee: event.bridgeFee,
        networkFee: event.networkFee,
        sourceChainTokenId: event.sourceChainTokenId,
        targetChainTokenId: event.targetChainTokenId,
        sourceTxId: event.sourceTxId,
        sourceBlockId: event.sourceBlockId,
        sourceChainHeight: event.sourceChainHeight,
        spendHeight: spendHeight,
        spendTxId: spendTxId,
        result: result,
        paymentTxId: paymentTxId,
        spendBlock: spendBlock,
        WIDsHash: event.WIDsHash,
        WIDsCount: event.WIDsCount,
        txId: 'event-creation-tx-id',
      })
      .execute();
  };

  /**
   * inserts a record to Event table in database
   * @param paymentTx
   * @param status
   * @param lastCheck
   * @param lastStatusUpdate
   * @param failedInSign
   * @param signFailedCount
   * @param requiredSign
   */
  static insertTxRecord = async (
    paymentTx: PaymentTransaction,
    status: string,
    lastCheck = 0,
    lastStatusUpdate?: string,
    failedInSign = false,
    signFailedCount = 0,
    requiredSign = 6
  ) => {
    let order: ArbitraryEntity | null | undefined;
    let event: ConfirmedEventEntity | null | undefined;
    if (paymentTx.txType === TransactionType.arbitrary) {
      order = await this.testDatabase.ArbitraryRepository.findOneBy({
        id: paymentTx.eventId,
      });
    } else {
      event = await this.testDatabase.ConfirmedEventRepository.findOneBy({
        id: paymentTx.eventId,
      });
    }
    await this.testDatabase.TransactionRepository.insert({
      txId: paymentTx.txId,
      txJson: paymentTx.toJson(),
      type: paymentTx.txType,
      chain: paymentTx.network,
      status: status,
      lastCheck: lastCheck,
      event: event !== null ? event : undefined,
      order: order !== null ? order : undefined,
      lastStatusUpdate: lastStatusUpdate,
      failedInSign: failedInSign,
      signFailedCount: signFailedCount,
      requiredSign: requiredSign,
    });
  };

  /**
   * inserts a record to Event table in database
   * @param event
   * @param eventId
   * @param boxSerialized
   * @param wid
   * @param height
   * @param rwtCount
   * @param spendTxId
   * @param spendIndex
   */
  static insertCommitmentBoxRecord = async (
    event: EventTrigger,
    eventId: string,
    boxSerialized: string,
    wid: string,
    height: number,
    rwtCount: string,
    spendTxId?: string,
    spendIndex?: number
  ) => {
    const commitment = Utils.commitmentFromEvent(event, wid);
    await this.testDatabase.CommitmentRepository.createQueryBuilder()
      .insert()
      .values({
        extractor: 'extractor',
        eventId: eventId,
        commitment: commitment,
        WID: wid,
        boxId: TestUtils.generateRandomId(),
        block: 'blockId',
        boxSerialized: boxSerialized,
        height: height,
        rwtCount: rwtCount,
        txId: 'txId',
        spendBlock: spendTxId ? TestUtils.generateRandomId() : undefined,
        spendTxId: spendTxId,
        spendIndex: spendIndex,
      })
      .execute();
  };

  /**
   * Inserts a block record
   * @param timestamp
   * @param hash
   * @param height
   */
  static insertBlockRecord = async (
    timestamp = 1680000000,
    hash = TestUtils.generateRandomId(),
    height = 1000
  ) => {
    const date = new Date(timestamp);
    await this.testDataSource
      .getRepository(BlockEntity)
      .createQueryBuilder()
      .insert()
      .values({
        height: height,
        hash: hash,
        parentHash: TestUtils.generateRandomId(),
        status: PROCEED,
        scanner: 'scanner',
        timestamp: timestamp,
        year: date.getFullYear(),
        month: date.getMonth(),
        day: date.getDay(),
      })
      .execute();
  };

  /**
   * inserts a record to ArbitraryOrder table in database
   * @param id
   * @param chain
   * @param orderJson
   * @param status
   * @param firstTry
   * @param unexpectedFails
   */
  static insertOrderRecord = async (
    id: string,
    chain: string,
    orderJson: string,
    status: OrderStatus,
    firstTry?: string,
    unexpectedFails?: number
  ) => {
    await this.testDatabase.ArbitraryRepository.createQueryBuilder()
      .insert()
      .values({
        id: id,
        chain: chain,
        orderJson: orderJson,
        status: status,
        firstTry: firstTry,
        unexpectedFails: unexpectedFails,
      })
      .execute();
  };

  /**
   * inserts a record to Reprocess table in
   * @param requestId
   * @param eventId
   * @param senderId
   * @param receiverId
   * @param status
   * @param timestamp
   */
  static insertReprocessRecord = async (
    requestId: string,
    eventId: string,
    senderId: string,
    receiverId: string,
    status: ReprocessStatus,
    timestamp: number
  ) => {
    await this.testDatabase.ReprocessRepository.createQueryBuilder()
      .insert()
      .values({
        requestId: requestId,
        eventId: eventId,
        sender: senderId,
        receiver: receiverId,
        status: status,
        timestamp: timestamp,
      })
      .execute();
  };

  /**
   * returns all records in Event table in database
   */
  static allRawEventRecords = async () => {
    return await this.testDatabase.EventRepository.createQueryBuilder()
      .select()
      .getMany();
  };

  /**
   * returns all records in Event table in database
   */
  static allEventRecords = async () => {
    return await this.testDatabase.ConfirmedEventRepository.createQueryBuilder()
      .select()
      .getMany();
  };

  /**
   * returns all records in Transaction table in database
   */
  static allTxRecords = async () => {
    return await this.testDatabase.TransactionRepository.find({
      relations: ['event', 'order'],
    });
  };

  /**
   * returns all records in Revenue table
   */
  static allRevenueRecords = async () => {
    return await this.testDatabase.RevenueRepository.find({
      relations: ['eventData'],
    });
  };

  /**
   * returns all records from Event view in database
   */
  static eventViewRecords = async () => {
    return await this.testDatabase.EventView.createQueryBuilder()
      .select()
      .getMany();
  };

  /**
   * returns all records in Order table in database
   */
  static allOrderRecords = async () => {
    return await this.testDatabase.ArbitraryRepository.createQueryBuilder()
      .select()
      .getMany();
  };

  /**
   * returns all records in Reprocess table in database
   */
  static allReprocessRecords = async () => {
    return await this.testDatabase.ReprocessRepository.createQueryBuilder()
      .select()
      .getMany();
  };
}

export default DatabaseActionMock;
