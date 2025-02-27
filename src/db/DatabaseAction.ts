import {
  And,
  DataSource,
  In,
  IsNull,
  LessThan,
  MoreThan,
  MoreThanOrEqual,
  Not,
  Repository,
} from 'typeorm';
import { ConfirmedEventEntity } from './entities/ConfirmedEventEntity';
import { TransactionEntity } from './entities/TransactionEntity';
import {
  EventStatus,
  OrderStatus,
  RevenuePeriod,
  TransactionStatus,
} from '../utils/constants';
import {
  CommitmentEntity,
  EventTriggerEntity,
} from '@rosen-bridge/watcher-data-extractor';
import Utils from '../utils/Utils';
import { Semaphore } from 'await-semaphore';
import { Page, SortRequest } from '../types/api';
import { RevenueEntity } from './entities/revenueEntity';
import { RevenueView } from './entities/revenueView';
import { RevenueChartView } from './entities/revenueChartView';
import {
  ImpossibleBehavior,
  NotFoundError,
  PaymentTransaction,
  TransactionType,
} from '@rosen-chains/abstract-chain';
import { DefaultLoggerFactory } from '@rosen-bridge/abstract-logger';
import { EventView } from './entities/EventView';
import { BlockEntity, PROCEED } from '@rosen-bridge/scanner';
import { ArbitraryEntity } from './entities/ArbitraryEntity';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { ReprocessEntity } from './entities/ReprocessEntity';
import { ReprocessStatus } from '../reprocess/Interfaces';
import PublicStatusHandler from '../handlers/PublicStatusHandler';

const logger = DefaultLoggerFactory.getInstance().getLogger(import.meta.url);

class DatabaseAction {
  private static instance: DatabaseAction;
  dataSource: DataSource;
  BlockRepository: Repository<BlockEntity>;
  CommitmentRepository: Repository<CommitmentEntity>;
  EventRepository: Repository<EventTriggerEntity>;
  ConfirmedEventRepository: Repository<ConfirmedEventEntity>;
  TransactionRepository: Repository<TransactionEntity>;
  RevenueRepository: Repository<RevenueEntity>;
  RevenueView: Repository<RevenueView>;
  RevenueChartView: Repository<RevenueChartView>;
  EventView: Repository<EventView>;
  ArbitraryRepository: Repository<ArbitraryEntity>;
  ReprocessRepository: Repository<ReprocessEntity>;

  txSignSemaphore = new Semaphore(1);

  protected constructor(dataSource: DataSource) {
    this.dataSource = dataSource;
    this.BlockRepository = this.dataSource.getRepository(BlockEntity);
    this.CommitmentRepository = this.dataSource.getRepository(CommitmentEntity);
    this.EventRepository = this.dataSource.getRepository(EventTriggerEntity);
    this.ConfirmedEventRepository =
      this.dataSource.getRepository(ConfirmedEventEntity);
    this.TransactionRepository =
      this.dataSource.getRepository(TransactionEntity);
    this.RevenueRepository = this.dataSource.getRepository(RevenueEntity);
    this.RevenueView = this.dataSource.getRepository(RevenueView);
    this.RevenueChartView = this.dataSource.getRepository(RevenueChartView);
    this.EventView = this.dataSource.getRepository(EventView);
    this.ArbitraryRepository = this.dataSource.getRepository(ArbitraryEntity);
    this.ReprocessRepository = this.dataSource.getRepository(ReprocessEntity);
  }

  /**
   * initiates data source
   * @param dataSource
   */
  static init = (dataSource: DataSource): DatabaseAction => {
    logger.debug("DatabaseAction instance didn't exist. Creating a new one");
    DatabaseAction.instance = new DatabaseAction(dataSource);
    return DatabaseAction.instance;
  };

  /**
   * gets instance of DatabaseAction (throws error if it doesn't exist)
   * @returns DatabaseAction instance
   */
  static getInstance = (): DatabaseAction => {
    if (!DatabaseAction.instance)
      throw Error(`Database is not instantiated yet`);
    return DatabaseAction.instance;
  };

  /**
   * updates the status of an event by id
   *  NOTE: this method does NOT update firstTry column
   * @param eventId the event trigger id
   * @param status the event trigger status
   * @param incrementUnexpectedFails if true, unexpectedFails column will be incremented
   */
  setEventStatus = async (
    eventId: string,
    status: string,
    incrementUnexpectedFails = false
  ): Promise<void> => {
    if (incrementUnexpectedFails)
      await this.ConfirmedEventRepository.update(
        { id: eventId },
        {
          status: status,
          unexpectedFails: () => '"unexpectedFails" + 1',
        }
      );
    else
      await this.ConfirmedEventRepository.update(
        { id: eventId },
        { status: status }
      );

    this.updatePublicEventStatus(eventId, status);
  };

  /**
   * @param eventId the event trigger id
   * @return the event trigger
   */
  getEventById = async (
    eventId: string
  ): Promise<ConfirmedEventEntity | null> => {
    return await this.ConfirmedEventRepository.findOne({
      relations: ['eventData'],
      where: {
        id: eventId,
      },
    });
  };

  /**
   * @param statuses list of statuses
   * @return the event triggers with status
   */
  getEventsByStatuses = async (
    statuses: string[]
  ): Promise<ConfirmedEventEntity[]> => {
    return await this.ConfirmedEventRepository.find({
      relations: ['eventData'],
      where: statuses.map((eventStatus) => ({
        status: eventStatus,
      })),
    });
  };

  /**
   * @return the event triggers with waiting status
   */
  getWaitingEvents = async (): Promise<ConfirmedEventEntity[]> => {
    return await this.ConfirmedEventRepository.find({
      relations: ['eventData'],
      where: [
        {
          status: EventStatus.paymentWaiting,
        },
        {
          status: EventStatus.rewardWaiting,
        },
      ],
    });
  };

  /**
   * @return incomplete the transaction
   */
  getActiveTransactions = async (): Promise<TransactionEntity[]> => {
    return await this.TransactionRepository.find({
      relations: ['event', 'order'],
      where: {
        status: In([
          TransactionStatus.sent,
          TransactionStatus.signed,
          TransactionStatus.approved,
          TransactionStatus.signFailed,
          TransactionStatus.inSign,
        ]),
      },
    });
  };

  /**
   * updates the status of a tx with its id
   * @param txId the transaction id
   * @param status tx status
   */
  setTxStatus = async (txId: string, status: string): Promise<void> => {
    await this.TransactionRepository.update(
      { txId: txId },
      {
        status: status,
        lastStatusUpdate: String(Math.round(Date.now() / 1000)),
      }
    );
    this.updatePublicTxStatus(txId, status);
  };

  /**
   * updates tx info when failed in sign process
   * @param txId the transaction id
   */
  setTxAsSignFailed = async (txId: string): Promise<void> => {
    await this.TransactionRepository.update(
      {
        txId: txId,
        status: TransactionStatus.inSign,
      },
      {
        status: TransactionStatus.signFailed,
        lastStatusUpdate: String(Math.round(Date.now() / 1000)),
        signFailedCount: () => '"signFailedCount" + 1',
        failedInSign: true,
      }
    );
    this.updatePublicTxStatus(txId, TransactionStatus.signFailed);
  };

  /**
   * updates the status of a tx with its id
   * @param txId the transaction id
   * @param currentHeight current height of the blockchain
   */
  updateTxLastCheck = async (
    txId: string,
    currentHeight: number
  ): Promise<void> => {
    await this.TransactionRepository.update(
      { txId: txId },
      { lastCheck: currentHeight }
    );
  };

  /**
   * updates the status of an event and sets firstTry columns with current timestamp
   * @param eventId the event trigger id
   * @param status status of the process
   */
  setEventStatusToPending = async (
    eventId: string,
    status: string
  ): Promise<void> => {
    await this.ConfirmedEventRepository.update(
      { id: eventId },
      { status: status, firstTry: String(Math.round(Date.now() / 1000)) }
    );
    this.updatePublicEventStatus(eventId, status);
  };

  /**
   * @param txId the transaction id
   * @return the transaction
   */
  getTxById = async (txId: string): Promise<TransactionEntity | null> => {
    return await this.TransactionRepository.findOne({
      relations: ['event', 'order'],
      where: {
        txId: txId,
      },
    });
  };

  /**
   * updates the tx and set status as signed
   * @param txId the transaction id
   * @param txJson tx json
   * @param currentHeight current height of the blockchain
   */
  updateWithSignedTx = async (
    txId: string,
    txJson: string,
    currentHeight: number
  ): Promise<void> => {
    await this.TransactionRepository.update(
      { txId: txId },
      {
        txJson: txJson,
        status: TransactionStatus.signed,
        lastStatusUpdate: String(Math.round(Date.now() / 1000)),
        lastCheck: currentHeight,
      }
    );
    this.updatePublicTxStatus(txId, TransactionStatus.signed);
  };

  /**
   * returns all valid transaction for corresponding event
   * @param eventId the event trigger id
   * @param type the transaction type
   */
  getEventValidTxsByType = async (
    eventId: string,
    type: string
  ): Promise<TransactionEntity[]> => {
    const event = await this.getEventById(eventId);
    if (event === null) throw Error(`Event [${eventId}] not found`);
    return await this.TransactionRepository.find({
      relations: ['event', 'order'],
      where: {
        event: { id: event.id },
        type: type,
        status: Not(TransactionStatus.invalid),
      },
    });
  };

  /**
   * replaces a transaction with a new one
   * @param previousTxId the previous transaction id
   * @param tx the new transaction
   */
  replaceTx = async (
    previousTxId: string,
    tx: PaymentTransaction
  ): Promise<void> => {
    await this.TransactionRepository.update(
      { txId: previousTxId },
      {
        txId: tx.txId,
        txJson: tx.toJson(),
        type: tx.txType,
        chain: tx.network,
        status: TransactionStatus.approved,
        lastStatusUpdate: String(Math.round(Date.now() / 1000)),
        lastCheck: 0,
        failedInSign: false,
      }
    );
    this.updatePublicTxStatus(tx.txId, TransactionStatus.approved);
  };

  /**
   * updates failedInSign field of a transaction to false
   * @param txId
   */
  resetFailedInSign = async (txId: string): Promise<void> => {
    await this.TransactionRepository.update(
      { txId: txId },
      {
        failedInSign: false,
      }
    );
  };

  /**
   * updates requiredSign field of a transaction
   * @param txId
   * @param requiredSign
   */
  updateRequiredSign = async (
    txId: string,
    requiredSign: number
  ): Promise<void> => {
    await this.TransactionRepository.update(
      { txId: txId },
      {
        requiredSign: requiredSign,
      }
    );
  };

  /**
   * inserts a tx record into transactions table
   */
  insertNewTx = async (
    paymentTx: PaymentTransaction,
    event: ConfirmedEventEntity | null,
    requiredSign: number,
    order: ArbitraryEntity | null
  ): Promise<void> => {
    await this.TransactionRepository.insert({
      txId: paymentTx.txId,
      txJson: paymentTx.toJson(),
      type: paymentTx.txType,
      chain: paymentTx.network,
      status: TransactionStatus.approved,
      lastStatusUpdate: String(Math.round(Date.now() / 1000)),
      lastCheck: 0,
      event: event !== null ? event : undefined,
      order: order !== null ? order : undefined,
      failedInSign: false,
      signFailedCount: 0,
      requiredSign: requiredSign,
    });
    this.updatePublicTxStatus(paymentTx.txId, TransactionStatus.approved);
  };

  /**
   * inserts a tx record into transactions table
   */
  insertCompletedTx = async (
    paymentTx: PaymentTransaction,
    event: ConfirmedEventEntity | null,
    requiredSign: number,
    order: ArbitraryEntity | null
  ): Promise<void> => {
    await this.TransactionRepository.insert({
      txId: paymentTx.txId,
      txJson: paymentTx.toJson(),
      type: paymentTx.txType,
      chain: paymentTx.network,
      status: TransactionStatus.completed,
      lastStatusUpdate: String(Math.round(Date.now() / 1000)),
      lastCheck: 0,
      event: event !== null ? event : undefined,
      order: order !== null ? order : undefined,
      failedInSign: false,
      signFailedCount: 0,
      requiredSign: requiredSign,
    });
    this.updatePublicTxStatus(paymentTx.txId, TransactionStatus.completed);
  };

  /**
   * @param eventId the event trigger id
   * @param eventBoxHeight the event trigger box mined height
   * @return commitments that created before event trigger and didn't spent yet
   */
  getValidCommitments = async (
    eventId: string,
    eventBoxHeight: number
  ): Promise<CommitmentEntity[]> => {
    return await this.CommitmentRepository.find({
      where: {
        eventId: eventId,
        height: LessThan(eventBoxHeight),
        spendBlock: IsNull(),
      },
    });
  };

  /**
   * @return all event triggers with no spent height
   */
  getUnconfirmedEvents = async (): Promise<EventTriggerEntity[]> => {
    return await this.EventRepository.createQueryBuilder('event')
      .leftJoin('confirmed_event_entity', 'cee', 'event.id = cee.eventDataId')
      .where('cee.eventDataId IS NULL')
      .getMany();
  };

  /**
   * inserts a confirmed event into table
   * @param eventData
   */
  insertConfirmedEvent = async (
    eventData: EventTriggerEntity
  ): Promise<void> => {
    const eventId = Utils.txIdToEventId(eventData.sourceTxId);
    const status = EventStatus.pendingPayment;

    await this.ConfirmedEventRepository.insert({
      id: eventId,
      eventData: eventData,
      status,
      firstTry: String(Math.round(Date.now() / 1000)),
    });

    this.updatePublicEventStatus(eventId, status);
  };

  /**
   * returns all transaction for cold storage
   * @param chain the chain of the tx
   */
  getActiveColdStorageTxsInChain = async (
    chain: string
  ): Promise<TransactionEntity[]> => {
    return await this.TransactionRepository.find({
      relations: ['event', 'order'],
      where: {
        type: TransactionType.coldStorage,
        status: Not(
          In([TransactionStatus.invalid, TransactionStatus.completed])
        ),
        chain: chain,
      },
    });
  };

  /**
   * returns all unsigned transactions for a chain (with status approved, in-sign or sign-failed)
   * @param chain the chain of the tx
   */
  getUnsignedActiveTxsInChain = async (
    chain: string
  ): Promise<TransactionEntity[]> => {
    return await this.TransactionRepository.find({
      relations: ['event', 'order'],
      where: [
        {
          status: TransactionStatus.approved,
          chain: chain,
        },
        {
          status: TransactionStatus.inSign,
          chain: chain,
        },
        {
          status: TransactionStatus.signFailed,
          chain: chain,
        },
      ],
    });
  };

  /**
   * returns all signed transactions for a chain (with status signed or sent)
   * @param chain the chain of the tx
   */
  getSignedActiveTxsInChain = async (
    chain: string
  ): Promise<TransactionEntity[]> => {
    return await this.TransactionRepository.find({
      relations: ['event', 'order'],
      where: [
        {
          status: TransactionStatus.signed,
          chain: chain,
        },
        {
          status: TransactionStatus.sent,
          chain: chain,
        },
      ],
    });
  };

  /**
   * returns the payment transaction for an event
   * @param eventId
   */
  getEventPaymentTransaction = async (
    eventId: string
  ): Promise<TransactionEntity> => {
    const event = await this.getEventById(eventId);
    if (event === null) throw new Error(`Event [${eventId}] not found`);
    const txs = await this.TransactionRepository.find({
      relations: ['event', 'order'],
      where: [
        {
          event: { id: event.id },
          status: TransactionStatus.completed,
          type: TransactionType.payment,
        },
      ],
    });
    if (txs.length === 0)
      throw new Error(`No payment tx found for event [${eventId}]`);
    else if (txs.length > 1)
      throw new ImpossibleBehavior(
        `Found more than one completed payment transaction for event [${eventId}]`
      );
    else return txs[0];
  };

  /**
   * returns all unsigned transactions which failed in sign process
   */
  getUnsignedFailedSignTxs = async (): Promise<TransactionEntity[]> => {
    return await this.TransactionRepository.find({
      relations: ['event', 'order'],
      where: [
        {
          status: TransactionStatus.signFailed,
          failedInSign: true,
        },
        {
          status: TransactionStatus.inSign,
          failedInSign: true,
        },
      ],
    });
  };

  /**
   * selects events with the specified condition
   * @param history if true, returns history events, otherwise returns ongoing events
   * @param sort
   * @param fromChain
   * @param toChain
   * @param minAmount
   * @param maxAmount
   * @param offset
   * @param limit
   * @returns returns events with the specified condition
   */
  getEvents = async (
    history = true,
    sort: SortRequest | undefined,
    fromChain: string | undefined,
    toChain: string | undefined,
    minAmount: string | undefined,
    maxAmount: string | undefined,
    offset = 0,
    limit = 20
  ): Promise<Page<EventView>> => {
    const clauses = [];
    const amountCondition = [];
    if (fromChain) clauses.push({ fromChain: fromChain });
    if (toChain) clauses.push({ toChain: toChain });
    if (minAmount) amountCondition.push(MoreThanOrEqual(minAmount));
    if (maxAmount) amountCondition.push(LessThan(maxAmount));
    if (amountCondition.length > 0)
      clauses.push({ amount: And(...amountCondition) });
    const filterCondition = clauses.reduce(
      (partialCondition, clause) => ({
        ...partialCondition,
        ...clause,
      }),
      {}
    );
    const historyCondition = [
      {
        ...filterCondition,
        spendTxId: Not(IsNull()),
      },
      {
        ...filterCondition,
        status: In([
          EventStatus.rejected,
          EventStatus.timeout,
          EventStatus.reachedLimit,
        ]),
      },
    ];
    const ongoingCondition = [
      {
        ...filterCondition,
        spendTxId: IsNull(),
        status: Not(
          In([
            EventStatus.rejected,
            EventStatus.timeout,
            EventStatus.reachedLimit,
          ])
        ),
      },
      {
        ...filterCondition,
        spendTxId: IsNull(),
        status: IsNull(),
      },
    ];
    const result = await this.EventView.findAndCount({
      where: history ? historyCondition : ongoingCondition,
      order: {
        height: sort ? sort : 'DESC',
      },
      skip: offset,
      take: limit,
    });
    return {
      items: result[0],
      total: result[1],
    };
  };

  /**
   * Returns unsaved revenue events that
   * their spending tx is confirmed enough
   * @param currentHeight
   * @param requiredConfirmation
   */
  getConfirmedUnsavedRevenueEvents = async (
    currentHeight: number,
    requiredConfirmation: number
  ): Promise<Array<EventTriggerEntity>> => {
    return await this.EventRepository.createQueryBuilder('event')
      .leftJoin('revenue_entity', 're', 'event."id" = re."eventDataId"')
      .where('event."spendTxId" IS NOT NULL')
      .andWhere('re."eventDataId" IS NULL')
      .andWhere(`event."spendHeight" < ${currentHeight - requiredConfirmation}`)
      .getMany();
  };

  /**
   * Returns transactions with specified txIds
   * @param txIds
   */
  getTxsById = async (txIds: string[]): Promise<TransactionEntity[]> => {
    return this.TransactionRepository.findBy({
      txId: In(txIds),
    });
  };

  /**
   * Inserts new revenue
   * @param tokenId
   * @param amount
   * @param txId
   * @param revenueType
   * @param eventData
   */
  insertRevenue = async (
    tokenId: string,
    amount: bigint,
    txId: string,
    revenueType: string,
    eventData: EventTriggerEntity
  ) => {
    return await this.RevenueRepository.insert({
      tokenId,
      amount,
      txId,
      revenueType,
      eventData,
    });
  };

  /**
   * Returns all revenue with respect to the filters
   * @param sort
   * @param fromChain
   * @param toChain
   * @param minHeight
   * @param maxHeight
   * @param fromBlockTime
   * @param toBlockTime
   * @param offset
   * @param limit
   */
  getRevenuesWithFilters = async (
    sort?: SortRequest,
    fromChain?: string,
    toChain?: string,
    minHeight?: number,
    maxHeight?: number,
    fromBlockTime?: number,
    toBlockTime?: number,
    offset = 0,
    limit = 20
  ): Promise<Page<RevenueView>> => {
    const clauses = [],
      heightCondition = [],
      timeCondition = [];
    if (fromChain) clauses.push({ fromChain: fromChain });
    if (toChain) clauses.push({ toChain: toChain });
    if (minHeight) heightCondition.push(MoreThanOrEqual(minHeight));
    if (maxHeight) heightCondition.push(LessThan(maxHeight));
    if (heightCondition.length > 0)
      clauses.push({ height: And(...heightCondition) });
    if (fromBlockTime) timeCondition.push(MoreThanOrEqual(fromBlockTime));
    if (toBlockTime) timeCondition.push(LessThan(toBlockTime));
    if (timeCondition.length > 0)
      clauses.push({ timestamp: And(...timeCondition) });
    const result = await this.RevenueView.findAndCount({
      where:
        clauses.length > 0
          ? clauses.reduce(
              (partialCondition, clause) => ({
                ...partialCondition,
                ...clause,
              }),
              {}
            )
          : undefined,
      order: {
        timestamp: sort ? sort : 'DESC',
      },
      skip: offset,
      take: limit,
    });
    return {
      items: result[0],
      total: result[1],
    };
  };

  /**
   * get list of all revenues for selected list of events
   * @param ids event row id
   */
  getEventsRevenues = async (
    ids: Array<number>
  ): Promise<Array<RevenueEntity>> => {
    return this.RevenueRepository.find({
      where: {
        eventData: In(ids),
      },
      relations: ['eventData'],
    });
  };

  /**
   * Returns chart data with the specified period
   * @param period
   * @param offset
   * @param limit
   */
  getRevenueChartData = async (period: RevenuePeriod) => {
    const query = this.RevenueChartView.createQueryBuilder();
    query
      .select('"tokenId"')
      .addSelect('SUM(amount)', 'amount')
      .addSelect('MIN(timestamp)', 'label')
      .groupBy('"tokenId"')
      .orderBy('label', 'DESC');
    if (period === RevenuePeriod.year) {
      query.addGroupBy('year');
    } else if (period === RevenuePeriod.month) {
      query.addGroupBy('year').addGroupBy('month');
    } else if (period === RevenuePeriod.week) {
      query.addGroupBy('week_number');
    }
    return query.getRawMany();
  };

  /**
   * @returns the transactions with valid status
   */
  getValidTxsForEvents = (eventIds: string[]): Promise<TransactionEntity[]> => {
    return this.TransactionRepository.find({
      relations: ['event', 'order'],
      where: {
        event: In(eventIds),
        status: Not(TransactionStatus.invalid),
      },
    });
  };

  /**
   * @param eventId
   * @return commitments that are merged into event trigger
   */
  getEventCommitments = (eventId: string): Promise<CommitmentEntity[]> => {
    return this.CommitmentRepository.createQueryBuilder('commitment')
      .leftJoin(
        'confirmed_event_entity',
        'cee',
        'commitment."eventId" = cee."id"'
      )
      .leftJoin('event_trigger_entity', 'ete', 'ete."id" = cee."eventDataId"')
      .where(`commitment."eventId"='${eventId}'`)
      .andWhere(`commitment."spendTxId"=ete."txId"`)
      .orderBy('commitment."spendIndex"', 'ASC')
      .getMany();
  };

  /**
   * @param scannerName
   * @return the last block height of the given scanner
   */
  getLastSavedBlockForScanner = async (
    scannerName: string
  ): Promise<number> => {
    const lastBlock = await this.BlockRepository.find({
      where: { status: PROCEED, scanner: scannerName },
      order: { height: 'DESC' },
      take: 1,
    });
    if (lastBlock.length !== 0) return lastBlock[0].height;
    throw new NotFoundError(`No block found in database`);
  };

  /**
   * @param status order status
   * @return the arbitrary orders with status
   */
  getOrdersByStatus = async (
    orderStatus: string
  ): Promise<ArbitraryEntity[]> => {
    return await this.ArbitraryRepository.find({
      where: {
        status: orderStatus,
      },
    });
  };

  /**
   * updates the status of an arbitrary order by id
   * @param id order id
   * @param status order status
   * @param updateFirstTry if true, firstTry column will be updated to the current timestamp
   * @param incrementUnexpectedFails if true, unexpectedFails column will be incremented
   */
  setOrderStatus = async (
    id: string,
    status: string,
    updateFirstTry = false,
    incrementUnexpectedFails = false
  ): Promise<void> => {
    const updatedRecord: QueryDeepPartialEntity<ArbitraryEntity> = {
      status: status,
    };
    if (updateFirstTry)
      updatedRecord.firstTry = String(Math.round(Date.now() / 1000));
    if (incrementUnexpectedFails)
      updatedRecord.unexpectedFails = () => '"unexpectedFails" + 1';

    await this.ArbitraryRepository.update({ id: id }, updatedRecord);
  };

  /**
   * @param id order id
   */
  getOrderById = async (id: string): Promise<ArbitraryEntity | null> => {
    return await this.ArbitraryRepository.findOne({
      where: {
        id: id,
      },
    });
  };

  /**
   * inserts an arbitrary order record into database
   */
  insertNewOrder = async (
    id: string,
    chain: string,
    orderJson: string
  ): Promise<void> => {
    await this.ArbitraryRepository.insert({
      id: id,
      chain: chain,
      orderJson: orderJson,
      status: OrderStatus.pending,
      firstTry: String(Math.round(Date.now() / 1000)),
    });
  };

  /**
   * returns all valid transaction for corresponding order
   * @param id order id
   */
  getOrderValidTxs = async (id: string): Promise<TransactionEntity[]> => {
    return await this.TransactionRepository.find({
      relations: ['event', 'order'],
      where: {
        order: { id: id },
        status: Not(TransactionStatus.invalid),
      },
    });
  };

  /**
   * inserts reprocess request into db
   * @param senderId
   * @param requestId
   * @param eventId
   * @param timestamp
   * @param peerIds
   */
  insertReprocessRequests = async (
    senderId: string,
    requestId: string,
    eventId: string,
    timestamp: number,
    peerIds: string[]
  ) => {
    await this.ReprocessRepository.insert(
      peerIds.map((peerId) => ({
        requestId: requestId,
        eventId: eventId,
        sender: senderId,
        receiver: peerId,
        status: ReprocessStatus.noResponse,
        timestamp: timestamp,
      }))
    );
  };

  /**
   * gets all requests sent by the given peerId after the given timestamp
   * @param senderId
   * @param timestamp
   */
  getRecentReprocessRequestsByGuard = async (
    senderId: string,
    timestamp: number
  ) => {
    return await this.ReprocessRepository.find({
      where: {
        sender: senderId,
        timestamp: MoreThan(timestamp),
      },
    });
  };

  /**
   * updates the status of a reprocess request
   * @param requestId
   * @param senderId
   * @param receiverId
   * @param status
   */
  updateReprocessRequest = async (
    requestId: string,
    senderId: string,
    receiverId: string,
    status: ReprocessStatus
  ) => {
    return await this.ReprocessRepository.update(
      {
        requestId: requestId,
        sender: senderId,
        receiver: receiverId,
      },
      {
        status: status,
      }
    );
  };

  /**
   * updates the public status of an event
   * @param eventId
   * @param status
   */
  updatePublicEventStatus = async (eventId: string, status: EventStatus) => {
    try {
      await PublicStatusHandler.getInstance().updatePublicEventStatus(
        eventId,
        status
      );
    } catch (error) {
      // TODO: log?
    }
  };

  /**
   * updates the public status of a tx
   * @param txId
   * @param txStatus
   */
  updatePublicTxStatus = async (txId: string, txStatus: TransactionStatus) => {
    try {
      await PublicStatusHandler.getInstance().updatePublicTxStatus(
        txId,
        txStatus
      );
    } catch (error) {
      // TODO: log?
    }
  };
}

export { DatabaseAction };
