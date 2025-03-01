import DatabaseActionMock from '../db/mocked/DatabaseAction.mock';
import {
  ConfirmationStatus,
  TransactionType,
} from '@rosen-chains/abstract-chain';
import ChainHandlerMock, {
  chainHandlerInstance,
} from '../handlers/ChainHandler.mock';
import {
  mockErgoPaymentTransaction,
  mockPaymentTransaction,
} from '../agreement/testData';
import TransactionProcessor from '../../src/transaction/TransactionProcessor';
import TestConfigs from '../testUtils/TestConfigs';
import {
  EventStatus,
  OrderStatus,
  TransactionStatus,
} from '../../src/utils/constants';
import Configs from '../../src/configs/Configs';
import * as EventTestData from '../event/testData';
import EventSerializer from '../../src/event/EventSerializer';
import TransactionProcessorMock from './TransactionProcessor.mock';
import NotificationHandlerMock from '../handlers/NotificationHandler.mock';
import { CARDANO_CHAIN } from '@rosen-chains/cardano';

describe('TransactionProcessor', () => {
  const currentTimeStampSeconds = Math.round(
    TestConfigs.currentTimeStamp / 1000
  );

  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(TestConfigs.currentTimeStamp));
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  describe('processApprovedTx', () => {
    beforeEach(async () => {
      await DatabaseActionMock.clearTables();
      ChainHandlerMock.resetMock();
      TransactionProcessorMock.restoreMocks();
    });

    /**
     * @target TransactionProcessor.processApprovedTx should send
     * approved transactions to sign and update database
     * @dependencies
     * - database
     * - ChainHandler
     * @scenario
     * - mock transaction and insert into db as 'approved'
     * - mock ChainHandler `getChain`
     *   - mock `signTransaction`
     * - run test (call `processTransactions`)
     * - check if function got called
     * - check tx in database
     * @expected
     * - `signTransaction` should got called
     * - tx status should be updated to 'in-sign'
     */
    it('should send approved transactions to sign and update database', async () => {
      // mock transaction and insert into db as 'approved'
      const tx = mockPaymentTransaction();
      await DatabaseActionMock.insertTxRecord(tx, TransactionStatus.approved);

      // mock ChainHandler `getChain`
      const chain = tx.network;
      ChainHandlerMock.mockChainName(chain);
      // mock `signTransaction`
      ChainHandlerMock.mockChainFunction(chain, 'signTransaction', null, false);

      // run test
      await TransactionProcessor.processTransactions();

      // `signTransaction` should got called
      expect(
        ChainHandlerMock.getChainMockedFunction(chain, 'signTransaction')
      ).toHaveBeenCalledOnce();

      // tx status should be updated to 'in-sign'
      const dbTxs = (await DatabaseActionMock.allTxRecords()).map((tx) => [
        tx.txId,
        tx.status,
        tx.lastStatusUpdate,
      ]);
      expect(dbTxs).toEqual([
        [tx.txId, TransactionStatus.inSign, currentTimeStampSeconds.toString()],
      ]);
    });

    /**
     * @target TransactionProcessor.processApprovedTx should handle
     * successful sign
     * @dependencies
     * - database
     * - ChainHandler
     * @scenario
     * - mock transaction and insert into db as 'approved'
     * - mock ChainHandler `getChain`
     *   - mock `signTransaction`
     *   - mock `getHeight`
     * - mock TransactionProcessor.handleSuccessfulSign
     * - run test (call `processTransactions`)
     * - check if function got called
     * - check tx in database
     * @expected
     * - `signTransaction` should got called
     * - `handleSuccessfulSign` should got called
     */
    it('should handle successful sign', async () => {
      // mock transaction and insert into db as 'approved'
      const tx = mockPaymentTransaction();
      const signedTx = tx;
      signedTx.txBytes = Buffer.from('signed');
      await DatabaseActionMock.insertTxRecord(tx, TransactionStatus.approved);

      // mock ChainHandler `getChain`
      const chain = tx.network;
      ChainHandlerMock.mockChainName(chain);
      // mock `signTransaction`
      ChainHandlerMock.mockChainFunction(
        chain,
        'signTransaction',
        signedTx,
        true
      );
      // mock `getHeight`
      const mockedCurrentHeight = 102;
      ChainHandlerMock.mockChainFunction(
        chain,
        'getHeight',
        mockedCurrentHeight,
        true
      );

      // mock TransactionProcessor.handleSuccessfulSign
      const mockedHandleSuccessfulSign = TransactionProcessorMock.mockFunction(
        'handleSuccessfulSign'
      );

      // run test
      await TransactionProcessor.processTransactions();

      // `signTransaction` should got called
      expect(
        ChainHandlerMock.getChainMockedFunction(chain, 'signTransaction')
      ).toHaveBeenCalledOnce();

      // `handleSuccessfulSign` should got called
      expect(mockedHandleSuccessfulSign).toHaveBeenCalledWith(signedTx);
    });

    /**
     * @target TransactionProcessor.processApprovedTx should handle
     * failed sign
     * @dependencies
     * - database
     * - ChainHandler
     * @scenario
     * - mock transaction and insert into db as 'approved'
     * - mock ChainHandler `getChain`
     *   - mock `signTransaction`
     *   - mock `getHeight`
     * - mock TransactionProcessor.handleFailedSign
     * - run test (call `processTransactions`)
     * - check if function got called
     * - check tx in database
     * @expected
     * - `signTransaction` should got called
     * - `handleFailedSign` should got called
     */
    it('should handle failed sign', async () => {
      // mock transaction and insert into db as 'approved'
      const tx = mockPaymentTransaction();
      const signedTx = tx;
      signedTx.txBytes = Buffer.from('signed');
      await DatabaseActionMock.insertTxRecord(tx, TransactionStatus.approved);

      // mock ChainHandler `getChain`
      const chain = tx.network;
      ChainHandlerMock.mockChainName(chain);
      // mock `signTransaction`
      ChainHandlerMock.mockChainFunctionToThrow(
        chain,
        'signTransaction',
        new Error(`failure in sign test Error`),
        true
      );
      // mock `getHeight`
      const mockedCurrentHeight = 102;
      ChainHandlerMock.mockChainFunction(
        chain,
        'getHeight',
        mockedCurrentHeight,
        true
      );

      // mock TransactionProcessor.handleFailedSign
      const mockedHandleFailedSign =
        TransactionProcessorMock.mockFunction('handleFailedSign');

      // run test
      await TransactionProcessor.processTransactions();

      // `signTransaction` should got called
      expect(
        ChainHandlerMock.getChainMockedFunction(chain, 'signTransaction')
      ).toHaveBeenCalledOnce();

      // `handleFailedSign` should got called
      expect(mockedHandleFailedSign).toHaveBeenCalledOnce();
    });
  });

  describe('handleSuccessfulSign', () => {
    beforeEach(async () => {
      await DatabaseActionMock.clearTables();
      ChainHandlerMock.resetMock();
      TransactionProcessorMock.restoreMocks();
    });

    /**
     * @target TransactionProcessor.handleSuccessfulSign should update
     * transaction in database to signed tx
     * @dependencies
     * - database
     * - ChainHandler
     * @scenario
     * - mock transaction and insert into db as 'in-sign'
     * - mock ChainHandler `getChain`
     *   - mock `getHeight`
     * - run test
     * - check if function got called
     * - check tx in database
     * @expected
     * - tx status should be updated to 'signed'
     */
    it('should update transaction in database to signed tx', async () => {
      // mock transaction and insert into db as 'in-sign'
      const tx = mockPaymentTransaction();
      const signedTx = tx;
      signedTx.txBytes = Buffer.from('signed');
      await DatabaseActionMock.insertTxRecord(tx, TransactionStatus.inSign);

      // mock ChainHandler `getChain`
      const chain = tx.network;
      ChainHandlerMock.mockChainName(chain);
      // mock `getHeight`
      const mockedCurrentHeight = 102;
      ChainHandlerMock.mockChainFunction(
        chain,
        'getHeight',
        mockedCurrentHeight,
        true
      );

      // run test
      await TransactionProcessor.handleSuccessfulSign(signedTx);

      // tx status should be updated to 'signed'
      const dbTxs = (await DatabaseActionMock.allTxRecords()).map((tx) => [
        tx.txId,
        tx.txJson,
        tx.status,
        tx.lastStatusUpdate,
        tx.lastCheck,
      ]);
      expect(dbTxs).toEqual([
        [
          tx.txId,
          signedTx.toJson(),
          TransactionStatus.signed,
          currentTimeStampSeconds.toString(),
          mockedCurrentHeight,
        ],
      ]);
    });
  });

  describe('handleFailedSign', () => {
    beforeEach(async () => {
      await DatabaseActionMock.clearTables();
      TransactionProcessorMock.restoreMocks();
    });

    /**
     * @target TransactionProcessor.handleFailedSign should update
     * transaction status to sign-failed
     * @dependencies
     * - database
     * - ChainHandler
     * @scenario
     * - mock transaction and insert into db as 'in-sign'
     * - run test
     * - check if function got called
     * - check tx in database
     * @expected
     * - tx status should be updated to 'sign-failed'
     * - tx signFailedCount should be incremented
     * - tx failedInSign should be updated to true
     */
    it('should update transaction status to sign-failed', async () => {
      // mock transaction and insert into db as 'in-sign'
      const tx = mockPaymentTransaction();
      await DatabaseActionMock.insertTxRecord(tx, TransactionStatus.inSign);

      // run test
      await TransactionProcessor.handleFailedSign(
        tx.txId,
        'sign failure error message'
      );

      // tx status should be updated to 'sign-failed'
      const dbTxs = (await DatabaseActionMock.allTxRecords()).map((tx) => [
        tx.txId,
        tx.status,
        tx.lastStatusUpdate,
        tx.failedInSign,
        tx.signFailedCount,
      ]);
      expect(dbTxs).toEqual([
        [
          tx.txId,
          TransactionStatus.signFailed,
          currentTimeStampSeconds.toString(),
          true,
          1,
        ],
      ]);
    });
  });

  describe('processInSignTx', () => {
    beforeEach(async () => {
      await DatabaseActionMock.clearTables();
    });

    /**
     * @target TransactionProcessor.processInSignTx should update status
     * to sign-failed when enough times is passed from sign request
     * @dependencies
     * - database
     * - Date
     * @scenario
     * - mock transaction and insert into db as 'in-sign'
     * - run test (call `processTransactions`)
     * - check tx in database
     * @expected
     * - tx status should be updated to 'sign-failed'
     * - tx signFailedCount should be incremented
     * - tx failedInSign should be updated to true
     */
    it('should update status to sign-failed when enough times is passed from sign request', async () => {
      // mock transaction and insert into db as 'approved'
      const tx = mockPaymentTransaction();
      const lastStatusUpdate =
        currentTimeStampSeconds - Configs.txSignTimeout - 1;
      await DatabaseActionMock.insertTxRecord(
        tx,
        TransactionStatus.inSign,
        0,
        lastStatusUpdate.toString()
      );

      // run test
      await TransactionProcessor.processTransactions();

      // tx status should be updated to 'sign-failed'
      const dbTxs = (await DatabaseActionMock.allTxRecords()).map((tx) => [
        tx.txId,
        tx.status,
        tx.lastStatusUpdate,
        tx.failedInSign,
        tx.signFailedCount,
      ]);
      expect(dbTxs).toEqual([
        [
          tx.txId,
          TransactionStatus.signFailed,
          currentTimeStampSeconds.toString(),
          true,
          1,
        ],
      ]);
    });

    /**
     * @target TransactionProcessor.processInSignTx should do nothing
     * when enough times is not passed from sign request
     * @dependencies
     * - database
     * - Date
     * @scenario
     * - mock transaction and insert into db as 'in-sign'
     * - get database txs
     * - run test (call `processTransactions`)
     * - check tx in database
     * @expected
     * - database txs should remain unchanged
     */
    it('should do nothing when enough times is not passed from sign request', async () => {
      // mock transaction and insert into db as 'in-sign'
      const tx = mockPaymentTransaction();
      const currentTimeStampSeconds = Math.round(
        TestConfigs.currentTimeStamp / 1000
      );
      const lastStatusUpdate = currentTimeStampSeconds - Configs.txSignTimeout;
      await DatabaseActionMock.insertTxRecord(
        tx,
        TransactionStatus.inSign,
        0,
        lastStatusUpdate.toString()
      );

      // get database txs
      const dbTxs = (await DatabaseActionMock.allTxRecords()).map((tx) => [
        tx.txId,
        tx.status,
        tx.lastStatusUpdate,
      ]);

      // run test
      await TransactionProcessor.processTransactions();

      // database txs should remain unchanged
      const newDbTxs = (await DatabaseActionMock.allTxRecords()).map((tx) => [
        tx.txId,
        tx.status,
        tx.lastStatusUpdate,
      ]);
      expect(newDbTxs).toEqual(dbTxs);
    });
  });

  describe('processSignFailedTx', () => {
    const defaultInvalidationDetails = (isValid: boolean) => ({
      isValid: isValid,
      details: isValid
        ? undefined
        : {
            reason: 'test reason',
            unexpected: false,
          },
    });

    beforeEach(async () => {
      await DatabaseActionMock.clearTables();
      ChainHandlerMock.resetMock();
      TransactionProcessorMock.restoreMocks();
    });

    /**
     * @target TransactionProcessor.processSignFailedTx should update status
     * to sent when tx is found in blockchain
     * @dependencies
     * - database
     * - ChainHandler
     * @scenario
     * - mock transaction and insert into db as 'sign-failed'
     * - mock ChainHandler `getChain`
     *   - mock `getTxConfirmationStatus`
     * - run test (call `processTransactions`)
     * - check tx in database
     * @expected
     * - tx status should be updated to 'sent'
     */
    it('should update status to sent when tx is found in blockchain', async () => {
      // mock transaction and insert into db as 'sign-failed'
      const tx = mockPaymentTransaction();
      await DatabaseActionMock.insertTxRecord(tx, TransactionStatus.signFailed);

      // mock ChainHandler `getChain`
      const chain = tx.network;
      ChainHandlerMock.mockChainName(chain);
      // mock `getTxConfirmationStatus`
      ChainHandlerMock.mockChainFunction(
        chain,
        'getTxConfirmationStatus',
        ConfirmationStatus.NotConfirmedEnough,
        true
      );

      // run test
      await TransactionProcessor.processTransactions();

      // tx status should be updated to 'sent'
      const dbTxs = (await DatabaseActionMock.allTxRecords()).map((tx) => [
        tx.txId,
        tx.status,
        tx.lastStatusUpdate,
      ]);
      expect(dbTxs).toEqual([
        [
          tx.txId,
          TransactionStatus.sent,
          Math.round(TestConfigs.currentTimeStamp / 1000).toString(),
        ],
      ]);
    });

    /**
     * @target TransactionProcessor.processSignFailedTx should update status
     * to sent when tx is found in mempool
     * @dependencies
     * - database
     * - ChainHandler
     * @scenario
     * - mock transaction and insert into db as 'sign-failed'
     * - mock ChainHandler `getChain`
     *   - mock `getTxConfirmationStatus`
     *   - mock `isTxInMempool`
     * - run test (call `processTransactions`)
     * - check tx in database
     * @expected
     * - tx status should be updated to 'sent'
     */
    it('should update status to sent when tx is found in mempool', async () => {
      // mock transaction and insert into db as 'sign-failed'
      const tx = mockPaymentTransaction();
      await DatabaseActionMock.insertTxRecord(tx, TransactionStatus.signFailed);

      // mock ChainHandler `getChain`
      const chain = tx.network;
      ChainHandlerMock.mockChainName(chain);
      // mock `getTxConfirmationStatus`
      ChainHandlerMock.mockChainFunction(
        chain,
        'getTxConfirmationStatus',
        ConfirmationStatus.NotFound,
        true
      );
      // mock `isTxInMempool`
      ChainHandlerMock.mockChainFunction(chain, 'isTxInMempool', true, true);

      // run test
      await TransactionProcessor.processTransactions();

      // tx status should be updated to 'sent'
      const dbTxs = (await DatabaseActionMock.allTxRecords()).map((tx) => [
        tx.txId,
        tx.status,
        tx.lastStatusUpdate,
      ]);
      expect(dbTxs).toEqual([
        [
          tx.txId,
          TransactionStatus.sent,
          Math.round(TestConfigs.currentTimeStamp / 1000).toString(),
        ],
      ]);
    });

    /**
     * @target TransactionProcessor.processSignFailedTx should resend
     * tx to sign process if tx is still valid
     * @dependencies
     * - database
     * - ChainHandler
     * @scenario
     * - mock transaction and insert into db as 'sign-failed'
     * - mock ChainHandler `getChain`
     *   - mock `getTxConfirmationStatus`
     *   - mock `isTxInMempool`
     *   - mock `isTxValid`
     *   - mock `signTransaction`
     * - run test (call `processTransactions`)
     * - check if function got called
     * - check tx in database
     * @expected
     * - `signTransaction` should got called
     * - tx status should be updated to 'in-sign'
     */
    it('should resend tx to sign process if tx is still valid', async () => {
      // mock transaction and insert into db as 'sign-failed'
      const tx = mockPaymentTransaction();
      await DatabaseActionMock.insertTxRecord(tx, TransactionStatus.signFailed);

      // mock ChainHandler `getChain`
      const chain = tx.network;
      ChainHandlerMock.mockChainName(chain);
      // mock `getTxConfirmationStatus`
      ChainHandlerMock.mockChainFunction(
        chain,
        'getTxConfirmationStatus',
        ConfirmationStatus.NotFound,
        true
      );
      // mock `isTxInMempool`
      ChainHandlerMock.mockChainFunction(chain, 'isTxInMempool', false, true);
      // mock `isTxValid`
      ChainHandlerMock.mockChainFunction(
        chain,
        'isTxValid',
        defaultInvalidationDetails(true),
        true
      );
      // mock `signTransaction`
      ChainHandlerMock.mockChainFunction(chain, 'signTransaction', null, true);

      // run test
      await TransactionProcessor.processTransactions();

      // `signTransaction` should got called
      expect(
        ChainHandlerMock.getChainMockedFunction(chain, 'signTransaction')
      ).toHaveBeenCalledOnce();

      // tx status should be updated to 'in-sign'
      const dbTxs = (await DatabaseActionMock.allTxRecords()).map((tx) => [
        tx.txId,
        tx.status,
        tx.lastStatusUpdate,
      ]);
      expect(dbTxs).toEqual([
        [tx.txId, TransactionStatus.inSign, currentTimeStampSeconds.toString()],
      ]);
    });

    /**
     * @target TransactionProcessor.processSignFailedTx should update
     * status to invalid when tx is not valid anymore
     * @dependencies
     * - database
     * - ChainHandler
     * @scenario
     * - mock transaction and insert into db as 'sign-failed'
     * - mock ChainHandler `getChain`
     *   - mock `getTxConfirmationStatus`
     *   - mock `isTxInMempool`
     *   - mock `isTxValid`
     * - mock TransactionProcessor.setTransactionAsInvalid
     * - run test (call `processTransactions`)
     * - check if function got called
     * @expected
     * - `setTransactionAsInvalid` should got called
     */
    it('should update status to invalid when tx is not valid anymore', async () => {
      // mock transaction and insert into db as 'sign-failed'
      const tx = mockPaymentTransaction();
      await DatabaseActionMock.insertTxRecord(tx, TransactionStatus.signFailed);

      // mock ChainHandler `getChain`
      const chain = tx.network;
      ChainHandlerMock.mockChainName(chain);
      // mock `getTxConfirmationStatus`
      ChainHandlerMock.mockChainFunction(
        chain,
        'getTxConfirmationStatus',
        ConfirmationStatus.NotFound,
        true
      );
      // mock `isTxInMempool`
      ChainHandlerMock.mockChainFunction(chain, 'isTxInMempool', false, true);
      // mock `isTxValid`
      ChainHandlerMock.mockChainFunction(
        chain,
        'isTxValid',
        defaultInvalidationDetails(false),
        true
      );

      // mock TransactionProcessor.setTransactionAsInvalid
      TransactionProcessorMock.mockFunction('setTransactionAsInvalid');

      // run test
      await TransactionProcessor.processTransactions();

      // `setTransactionAsInvalid` should got called
      expect(
        TransactionProcessorMock.getMockedSpy('setTransactionAsInvalid')
      ).toHaveBeenCalledOnce();
    });
  });

  describe('processSignedTx', () => {
    beforeEach(async () => {
      await DatabaseActionMock.clearTables();
      ChainHandlerMock.resetMock();
    });

    /**
     * @target TransactionProcessor.processSignedTx should submit
     * signed transactions to the network
     * @dependencies
     * - database
     * - ChainHandler
     * @scenario
     * - mock transaction and insert into db as 'signed'
     * - mock ChainHandler `getChain`
     *   - mock `submitTransaction`
     * - run test (call `processTransactions`)
     * - check if function got called
     * - check tx in database
     * @expected
     * - `submitTransaction` should got called
     * - tx status should be updated to 'sent'
     */
    it('should submit signed transactions to the network', async () => {
      // mock transaction and insert into db as 'signed'
      const tx = mockPaymentTransaction();
      await DatabaseActionMock.insertTxRecord(tx, TransactionStatus.signed);

      // mock ChainHandler `getChain`
      const chain = tx.network;
      ChainHandlerMock.mockChainName(chain);
      // mock `submitTransaction`
      ChainHandlerMock.mockChainFunction(
        chain,
        'submitTransaction',
        null,
        true
      );

      // run test
      await TransactionProcessor.processTransactions();

      // `submitTransaction` should got called
      expect(
        ChainHandlerMock.getChainMockedFunction(chain, 'submitTransaction')
      ).toHaveBeenCalledOnce();

      // tx status should be updated to 'sent'
      const dbTxs = (await DatabaseActionMock.allTxRecords()).map((tx) => [
        tx.txId,
        tx.status,
        tx.lastStatusUpdate,
      ]);
      expect(dbTxs).toEqual([
        [tx.txId, TransactionStatus.sent, currentTimeStampSeconds.toString()],
      ]);
    });
  });

  describe('processSentTx', () => {
    const defaultInvalidationDetails = (isValid: boolean) => ({
      isValid: isValid,
      details: isValid
        ? undefined
        : {
            reason: 'test reason',
            unexpected: false,
          },
    });

    beforeEach(async () => {
      await DatabaseActionMock.clearTables();
      ChainHandlerMock.resetMock();
      TransactionProcessorMock.restoreMocks();
    });

    /**
     * @target TransactionProcessor.processSentTx should update tx status
     * to completed and event status to pending-reward when payment tx is confirmed enough
     * @dependencies
     * - database
     * - ChainHandler
     * @scenario
     * - mock event and transaction and insert into db
     * - mock ChainHandler `getChain`
     *   - mock `getTxConfirmationStatus`
     * - run test (call `processTransactions`)
     * - check tx in database
     * @expected
     * - tx status should be updated to 'completed'
     * - event status should be updated to 'pending-reward'
     */
    it('should update tx status to completed and event status to pending-reward when payment tx is confirmed enough', async () => {
      // mock event and transaction and insert into db
      const mockedEvent = EventTestData.mockEventTrigger().event;
      const eventId = EventSerializer.getId(mockedEvent);
      const tx = mockPaymentTransaction(
        TransactionType.payment,
        mockedEvent.toChain,
        eventId
      );
      await DatabaseActionMock.insertEventRecord(
        mockedEvent,
        EventStatus.inPayment
      );
      await DatabaseActionMock.insertTxRecord(tx, TransactionStatus.sent);

      // mock ChainHandler `getChain`
      const chain = tx.network;
      ChainHandlerMock.mockChainName(chain);
      // mock `getTxConfirmationStatus`
      ChainHandlerMock.mockChainFunction(
        chain,
        'getTxConfirmationStatus',
        ConfirmationStatus.ConfirmedEnough,
        true
      );

      // run test
      await TransactionProcessor.processTransactions();

      // tx status should be updated to 'completed'
      const dbTxs = (await DatabaseActionMock.allTxRecords()).map((tx) => [
        tx.txId,
        tx.status,
        tx.lastStatusUpdate,
      ]);
      expect(dbTxs).toEqual([
        [
          tx.txId,
          TransactionStatus.completed,
          currentTimeStampSeconds.toString(),
        ],
      ]);

      // event status should be updated to 'pending-reward'
      const dbEvents = (await DatabaseActionMock.allEventRecords()).map(
        (event) => [event.id, event.status, event.firstTry]
      );
      expect(dbEvents).toEqual([
        [
          eventId,
          EventStatus.pendingReward,
          currentTimeStampSeconds.toString(),
        ],
      ]);
    });

    /**
     * @target TransactionProcessor.processSentTx should update tx status
     * and event status to completed when Ergo payment tx is confirmed enough
     * @dependencies
     * - database
     * - ChainHandler
     * @scenario
     * - mock event and transaction and insert into db
     * - mock ChainHandler `getChain`
     *   - mock `getTxConfirmationStatus`
     * - run test (call `processTransactions`)
     * - check tx in database
     * @expected
     * - tx status should be updated to 'completed'
     * - event status should be updated to 'completed'
     */
    it('should update tx status and event status to completed when Ergo payment tx is confirmed enough', async () => {
      // mock event and transaction and insert into db
      const mockedEvent = EventTestData.mockToErgoEventTrigger().event;
      const eventId = EventSerializer.getId(mockedEvent);
      const tx = mockErgoPaymentTransaction(TransactionType.payment, eventId);
      await DatabaseActionMock.insertEventRecord(
        mockedEvent,
        EventStatus.inPayment
      );
      await DatabaseActionMock.insertTxRecord(tx, TransactionStatus.sent);

      // mock ChainHandler `getChain`
      const chain = tx.network;
      ChainHandlerMock.mockChainName(chain);
      // mock `getTxConfirmationStatus`
      ChainHandlerMock.mockErgoFunctionReturnValue(
        'getTxConfirmationStatus',
        ConfirmationStatus.ConfirmedEnough,
        true
      );

      // run test
      await TransactionProcessor.processTransactions();

      // tx status should be updated to 'completed'
      const dbTxs = (await DatabaseActionMock.allTxRecords()).map((tx) => [
        tx.txId,
        tx.status,
        tx.lastStatusUpdate,
      ]);
      expect(dbTxs).toEqual([
        [
          tx.txId,
          TransactionStatus.completed,
          currentTimeStampSeconds.toString(),
        ],
      ]);

      // event status should be updated to 'completed'
      const dbEvents = (await DatabaseActionMock.allEventRecords()).map(
        (event) => [event.id, event.status]
      );
      expect(dbEvents).toEqual([[eventId, EventStatus.completed]]);
    });

    /**
     * @target TransactionProcessor.processSentTx should update tx status
     * and event status to completed when reward distribution tx is confirmed enough
     * @dependencies
     * - database
     * - ChainHandler
     * @scenario
     * - mock event and transaction and insert into db
     * - mock ChainHandler `getChain`
     *   - mock `getTxConfirmationStatus`
     * - run test (call `processTransactions`)
     * - check tx in database
     * @expected
     * - tx status should be updated to 'completed'
     * - event status should be updated to 'completed'
     */
    it('should update tx status and event status to completed when reward distribution tx is confirmed enough', async () => {
      // mock event and transaction and insert into db
      const mockedEvent = EventTestData.mockEventTrigger().event;
      const eventId = EventSerializer.getId(mockedEvent);
      const tx = mockErgoPaymentTransaction(TransactionType.reward, eventId);
      await DatabaseActionMock.insertEventRecord(
        mockedEvent,
        EventStatus.inReward
      );
      await DatabaseActionMock.insertTxRecord(tx, TransactionStatus.sent);

      // mock ChainHandler `getChain`
      const chain = tx.network;
      ChainHandlerMock.mockChainName(chain);
      // mock `getTxConfirmationStatus`
      ChainHandlerMock.mockErgoFunctionReturnValue(
        'getTxConfirmationStatus',
        ConfirmationStatus.ConfirmedEnough,
        true
      );

      // run test
      await TransactionProcessor.processTransactions();

      // tx status should be updated to 'completed'
      const dbTxs = (await DatabaseActionMock.allTxRecords()).map((tx) => [
        tx.txId,
        tx.status,
        tx.lastStatusUpdate,
      ]);
      expect(dbTxs).toEqual([
        [
          tx.txId,
          TransactionStatus.completed,
          currentTimeStampSeconds.toString(),
        ],
      ]);

      // event status should be updated to 'completed'
      const dbEvents = (await DatabaseActionMock.allEventRecords()).map(
        (event) => [event.id, event.status]
      );
      expect(dbEvents).toEqual([[eventId, EventStatus.completed]]);
    });

    /**
     * @target TransactionProcessor.processSentTx should update tx status
     * and order status to completed when it's tx is confirmed enough
     * @dependencies
     * - database
     * - ChainHandler
     * @scenario
     * - mock order and transaction and insert into db
     * - mock ChainHandler `getChain`
     *   - mock `getTxConfirmationStatus`
     * - run test (call `processTransactions`)
     * - check tx in database
     * @expected
     * - tx status should be updated to 'completed'
     * - order status should be updated to 'completed'
     */
    it("should update tx status and order status to completed when it's tx is confirmed enough", async () => {
      // mock order and transaction and insert into db
      const orderId = 'order-id';
      const chain = CARDANO_CHAIN;
      const tx = mockErgoPaymentTransaction(TransactionType.arbitrary, orderId);
      await DatabaseActionMock.insertOrderRecord(
        orderId,
        chain,
        `orderJson`,
        OrderStatus.pending
      );
      await DatabaseActionMock.insertTxRecord(tx, TransactionStatus.sent);

      // mock ChainHandler `getChain`
      ChainHandlerMock.mockChainName(chain);
      // mock `getTxConfirmationStatus`
      ChainHandlerMock.mockErgoFunctionReturnValue(
        'getTxConfirmationStatus',
        ConfirmationStatus.ConfirmedEnough,
        true
      );

      // run test
      await TransactionProcessor.processTransactions();

      // tx status should be updated to 'completed'
      const dbTxs = (await DatabaseActionMock.allTxRecords()).map((tx) => [
        tx.txId,
        tx.status,
        tx.lastStatusUpdate,
      ]);
      expect(dbTxs).toEqual([
        [
          tx.txId,
          TransactionStatus.completed,
          currentTimeStampSeconds.toString(),
        ],
      ]);

      // order status should be updated to 'completed'
      const dbOrders = (await DatabaseActionMock.allOrderRecords()).map(
        (order) => [order.id, order.status]
      );
      expect(dbOrders).toEqual([[orderId, OrderStatus.completed]]);
    });

    /**
     * @target TransactionProcessor.processSentTx should update tx status
     * to completed when cold storage tx is confirmed enough
     * @dependencies
     * - database
     * - ChainHandler
     * @scenario
     * - mock transaction and insert into db
     * - mock ChainHandler `getChain`
     *   - mock `getTxConfirmationStatus`
     * - run test (call `processTransactions`)
     * - check tx in database
     * @expected
     * - tx status should be updated to 'completed'
     */
    it('should update tx status to completed when cold storage tx is confirmed enough', async () => {
      // mock transaction and insert into db
      const tx = mockPaymentTransaction(
        TransactionType.coldStorage,
        'chain',
        ''
      );
      await DatabaseActionMock.insertTxRecord(tx, TransactionStatus.sent);

      // mock ChainHandler `getChain`
      const chain = tx.network;
      ChainHandlerMock.mockChainName(chain);
      // mock `getTxConfirmationStatus`
      ChainHandlerMock.mockChainFunction(
        chain,
        'getTxConfirmationStatus',
        ConfirmationStatus.ConfirmedEnough,
        true
      );

      // run test
      await TransactionProcessor.processTransactions();

      // tx status should be updated to 'completed'
      const dbTxs = (await DatabaseActionMock.allTxRecords()).map((tx) => [
        tx.txId,
        tx.status,
        tx.lastStatusUpdate,
      ]);
      expect(dbTxs).toEqual([
        [
          tx.txId,
          TransactionStatus.completed,
          currentTimeStampSeconds.toString(),
        ],
      ]);
    });

    /**
     * @target TransactionProcessor.processSentTx should update last check
     * when transaction is not confirmed enough
     * @dependencies
     * - database
     * - ChainHandler
     * @scenario
     * - mock event and transaction and insert into db
     * - mock ChainHandler `getChain`
     *   - mock `getTxConfirmationStatus`
     *   - mock `getHeight`
     * - run test (call `processTransactions`)
     * - check tx in database
     * @expected
     * - tx last check should be updated
     */
    it('should update last check when transaction is not confirmed enough', async () => {
      // mock event and transaction and insert into db
      const mockedEvent = EventTestData.mockEventTrigger().event;
      const eventId = EventSerializer.getId(mockedEvent);
      const tx = mockPaymentTransaction(
        TransactionType.payment,
        mockedEvent.toChain,
        eventId
      );
      await DatabaseActionMock.insertEventRecord(
        mockedEvent,
        EventStatus.inPayment
      );
      await DatabaseActionMock.insertTxRecord(tx, TransactionStatus.sent, 100);

      // mock ChainHandler `getChain`
      const chain = tx.network;
      ChainHandlerMock.mockChainName(chain);
      // mock `getTxConfirmationStatus`
      ChainHandlerMock.mockChainFunction(
        chain,
        'getTxConfirmationStatus',
        ConfirmationStatus.NotConfirmedEnough,
        true
      );
      // mock `getHeight`
      const mockedCurrentHeight = 102;
      ChainHandlerMock.mockChainFunction(
        chain,
        'getHeight',
        mockedCurrentHeight,
        true
      );

      // run test
      await TransactionProcessor.processTransactions();

      // tx last check should be updated
      const dbTxs = (await DatabaseActionMock.allTxRecords()).map((tx) => [
        tx.txId,
        tx.status,
        tx.lastCheck,
      ]);
      expect(dbTxs).toEqual([
        [tx.txId, TransactionStatus.sent, mockedCurrentHeight],
      ]);
    });

    /**
     * @target TransactionProcessor.processSentTx should update last check
     * when transaction is in mempool
     * @dependencies
     * - database
     * - ChainHandler
     * @scenario
     * - mock event and transaction and insert into db
     * - mock ChainHandler `getChain`
     *   - mock `getTxConfirmationStatus`
     *   - mock `getHeight`
     *   - mock `isTxInMempool`
     * - run test (call `processTransactions`)
     * - check tx in database
     * @expected
     * - tx last check should be updated
     */
    it('should update last check when transaction is in mempool', async () => {
      // mock event and transaction and insert into db
      const mockedEvent = EventTestData.mockEventTrigger().event;
      const eventId = EventSerializer.getId(mockedEvent);
      const tx = mockPaymentTransaction(
        TransactionType.payment,
        mockedEvent.toChain,
        eventId
      );
      await DatabaseActionMock.insertEventRecord(
        mockedEvent,
        EventStatus.inPayment
      );
      await DatabaseActionMock.insertTxRecord(tx, TransactionStatus.sent, 100);

      // mock ChainHandler `getChain`
      const chain = tx.network;
      ChainHandlerMock.mockChainName(chain);
      // mock `getTxConfirmationStatus`
      ChainHandlerMock.mockChainFunction(
        chain,
        'getTxConfirmationStatus',
        ConfirmationStatus.NotFound,
        true
      );
      // mock `getHeight`
      const mockedCurrentHeight = 102;
      ChainHandlerMock.mockChainFunction(
        chain,
        'getHeight',
        mockedCurrentHeight,
        true
      );
      // mock `isTxInMempool`
      ChainHandlerMock.mockChainFunction(chain, 'isTxInMempool', true, true);

      // run test
      await TransactionProcessor.processTransactions();

      // tx last check should be updated
      const dbTxs = (await DatabaseActionMock.allTxRecords()).map((tx) => [
        tx.txId,
        tx.status,
        tx.lastCheck,
      ]);
      expect(dbTxs).toEqual([
        [tx.txId, TransactionStatus.sent, mockedCurrentHeight],
      ]);
    });

    /**
     * @target TransactionProcessor.processSentTx should resubmit
     * the transaction when not found but still valid
     * @dependencies
     * - database
     * - ChainHandler
     * @scenario
     * - mock event and transaction and insert into db
     * - mock ChainHandler `getChain`
     *   - mock `getTxConfirmationStatus`
     *   - mock `isTxInMempool`
     *   - mock `isTxValid`
     *   - mock `submitTransaction`
     * - run test (call `processTransactions`)
     * - check if function got called
     * - check tx in database
     * @expected
     * - `signTransaction` should got called
     */
    it('should resubmit the transaction when not found but still valid', async () => {
      // mock event and transaction and insert into db
      const mockedEvent = EventTestData.mockEventTrigger().event;
      const eventId = EventSerializer.getId(mockedEvent);
      const tx = mockPaymentTransaction(
        TransactionType.payment,
        mockedEvent.toChain,
        eventId
      );
      await DatabaseActionMock.insertEventRecord(
        mockedEvent,
        EventStatus.inPayment
      );
      await DatabaseActionMock.insertTxRecord(tx, TransactionStatus.sent, 100);

      // mock ChainHandler `getChain`
      const chain = tx.network;
      ChainHandlerMock.mockChainName(chain);
      // mock `getTxConfirmationStatus`
      ChainHandlerMock.mockChainFunction(
        chain,
        'getTxConfirmationStatus',
        ConfirmationStatus.NotFound,
        true
      );
      // mock `isTxInMempool`
      ChainHandlerMock.mockChainFunction(chain, 'isTxInMempool', false, true);
      // mock `isTxValid`
      const mockedCurrentHeight = 102;
      ChainHandlerMock.mockChainFunction(
        chain,
        'isTxValid',
        defaultInvalidationDetails(true),
        true
      );
      // mock `submitTransaction`
      ChainHandlerMock.mockChainFunction(
        chain,
        'submitTransaction',
        null,
        true
      );

      // run test
      await TransactionProcessor.processTransactions();

      // `submitTransaction` should got called
      expect(
        ChainHandlerMock.getChainMockedFunction(chain, 'submitTransaction')
      ).toHaveBeenCalledOnce();
    });

    /**
     * @target TransactionProcessor.processSentTx should update
     * status to invalid when tx is not valid anymore
     * @dependencies
     * - database
     * - ChainHandler
     * @scenario
     * - mock event and transaction and insert into db
     * - mock ChainHandler `getChain`
     *   - mock `getTxConfirmationStatus`
     *   - mock `isTxInMempool`
     *   - mock `isTxValid`
     * - mock TransactionProcessor.setTransactionAsInvalid
     * - run test (call `processTransactions`)
     * @expected
     * - `setTransactionAsInvalid` should got called
     */
    it('should update status to invalid when tx is not valid anymore', async () => {
      // mock event and transaction and insert into db
      const mockedEvent = EventTestData.mockEventTrigger().event;
      const eventId = EventSerializer.getId(mockedEvent);
      const tx = mockPaymentTransaction(
        TransactionType.payment,
        mockedEvent.toChain,
        eventId
      );
      await DatabaseActionMock.insertEventRecord(
        mockedEvent,
        EventStatus.inPayment
      );
      await DatabaseActionMock.insertTxRecord(tx, TransactionStatus.sent, 100);

      // mock ChainHandler `getChain`
      const chain = tx.network;
      ChainHandlerMock.mockChainName(chain);
      // mock `getTxConfirmationStatus`
      ChainHandlerMock.mockChainFunction(
        chain,
        'getTxConfirmationStatus',
        ConfirmationStatus.NotFound,
        true
      );
      // mock `isTxInMempool`
      ChainHandlerMock.mockChainFunction(chain, 'isTxInMempool', false, true);
      // mock `isTxValid`
      ChainHandlerMock.mockChainFunction(
        chain,
        'isTxValid',
        defaultInvalidationDetails(false),
        true
      );

      // mock TransactionProcessor.setTransactionAsInvalid
      TransactionProcessorMock.mockFunction('setTransactionAsInvalid');

      // run test
      await TransactionProcessor.processTransactions();

      // `setTransactionAsInvalid` should got called
      expect(
        TransactionProcessorMock.getMockedSpy('setTransactionAsInvalid')
      ).toHaveBeenCalledOnce();
    });
  });

  describe('setTransactionAsInvalid', () => {
    const invalidationDetails = (unexpected: boolean) => ({
      reason: 'test reason',
      unexpected: unexpected,
    });

    beforeEach(async () => {
      await DatabaseActionMock.clearTables();
      ChainHandlerMock.resetMock();
      TransactionProcessorMock.restoreMocks();
      NotificationHandlerMock.resetMock();
      NotificationHandlerMock.mock();
    });

    /**
     * @target TransactionProcessor.setTransactionAsInvalid should update
     * tx status to invalid and event status to pending-payment when payment tx is invalid
     * @dependencies
     * - database
     * - ChainHandler
     * @scenario
     * - mock event and transaction and insert into db
     * - mock ChainHandler `getChain`
     *   - mock `getHeight`
     *   - mock `getTxRequiredConfirmation`
     * - run test
     * - check tx in database
     * @expected
     * - tx status should be updated to 'invalid'
     * - event status should be updated to 'pending-payment'
     * - event firstTry should remain unchanged
     * - event unexpectedFails should remain unchanged
     */
    it('should update tx status to invalid and event status to pending-payment when payment tx is invalid', async () => {
      // mock event and transaction and insert into db
      const mockedEvent = EventTestData.mockEventTrigger().event;
      const eventId = EventSerializer.getId(mockedEvent);
      const tx = mockPaymentTransaction(
        TransactionType.payment,
        mockedEvent.toChain,
        eventId
      );
      const firstTry = '1000';
      const unexpectedFails = 1;
      await DatabaseActionMock.insertEventRecord(
        mockedEvent,
        EventStatus.inPayment,
        'box-serialized',
        300,
        firstTry,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        unexpectedFails
      );
      await DatabaseActionMock.insertTxRecord(tx, TransactionStatus.sent, 100);

      // mock ChainHandler `getChain`
      const chain = tx.network;
      ChainHandlerMock.mockChainName(chain);
      // mock `getHeight`
      const mockedCurrentHeight = 111;
      ChainHandlerMock.mockChainFunction(
        chain,
        'getHeight',
        mockedCurrentHeight,
        true
      );
      // mock `getTxRequiredConfirmation`
      ChainHandlerMock.mockChainFunction(
        chain,
        'getTxRequiredConfirmation',
        10
      );

      // run test
      const txEntity = (await DatabaseActionMock.allTxRecords())[0];
      const mockedChain = chainHandlerInstance.getChain(chain);
      await TransactionProcessor.setTransactionAsInvalid(
        txEntity,
        mockedChain,
        invalidationDetails(false)
      );

      // tx status should be updated to 'invalid'
      const dbTxs = (await DatabaseActionMock.allTxRecords()).map((tx) => [
        tx.txId,
        tx.status,
        tx.lastStatusUpdate,
      ]);
      expect(dbTxs).toEqual([
        [
          tx.txId,
          TransactionStatus.invalid,
          currentTimeStampSeconds.toString(),
        ],
      ]);

      // event status should be updated to 'pending-payment'
      const dbEvents = (await DatabaseActionMock.allEventRecords()).map(
        (event) => [
          event.id,
          event.status,
          event.firstTry,
          event.unexpectedFails,
        ]
      );
      expect(dbEvents).toEqual([
        [eventId, EventStatus.pendingPayment, firstTry, unexpectedFails],
      ]);
    });

    /**
     * @target TransactionProcessor.setTransactionAsInvalid should update
     * tx status to invalid and event status to pending-reward when reward distribution tx is invalid
     * @dependencies
     * - database
     * - ChainHandler
     * @scenario
     * - mock event and transaction and insert into db
     * - mock ChainHandler `getChain`
     *   - mock `getHeight`
     *   - mock `getTxRequiredConfirmation`
     * - run test
     * - check tx in database
     * @expected
     * - tx status should be updated to 'invalid'
     * - event status should be updated to 'pending-reward'
     * - event firstTry should remain unchanged
     * - event unexpectedFails should remain unchanged
     */
    it('should update tx status to invalid and event status to pending-reward when reward distribution tx is invalid', async () => {
      // mock event and transaction and insert into db
      const mockedEvent = EventTestData.mockEventTrigger().event;
      const eventId = EventSerializer.getId(mockedEvent);
      const tx = mockPaymentTransaction(
        TransactionType.reward,
        mockedEvent.toChain,
        eventId
      );
      const firstTry = '1000';
      const unexpectedFails = 1;
      await DatabaseActionMock.insertEventRecord(
        mockedEvent,
        EventStatus.inReward,
        'box-serialized',
        300,
        firstTry,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        unexpectedFails
      );
      await DatabaseActionMock.insertTxRecord(tx, TransactionStatus.sent, 100);

      // mock ChainHandler `getChain`
      const chain = tx.network;
      ChainHandlerMock.mockChainName(chain);
      // mock `getHeight`
      const mockedCurrentHeight = 111;
      ChainHandlerMock.mockChainFunction(
        chain,
        'getHeight',
        mockedCurrentHeight,
        true
      );
      // mock `getTxRequiredConfirmation`
      ChainHandlerMock.mockChainFunction(
        chain,
        'getTxRequiredConfirmation',
        10
      );

      // run test
      const txEntity = (await DatabaseActionMock.allTxRecords())[0];
      const mockedChain = chainHandlerInstance.getChain(tx.network);
      await TransactionProcessor.setTransactionAsInvalid(
        txEntity,
        mockedChain,
        invalidationDetails(false)
      );

      // tx status should be updated to 'invalid'
      const dbTxs = (await DatabaseActionMock.allTxRecords()).map((tx) => [
        tx.txId,
        tx.status,
        tx.lastStatusUpdate,
      ]);
      expect(dbTxs).toEqual([
        [
          tx.txId,
          TransactionStatus.invalid,
          currentTimeStampSeconds.toString(),
        ],
      ]);

      // event status should be updated to 'pending-reward'
      const dbEvents = (await DatabaseActionMock.allEventRecords()).map(
        (event) => [
          event.id,
          event.status,
          event.firstTry,
          event.unexpectedFails,
        ]
      );
      expect(dbEvents).toEqual([
        [eventId, EventStatus.pendingReward, firstTry, unexpectedFails],
      ]);
    });

    /**
     * @target TransactionProcessor.setTransactionAsInvalid should update
     * tx status to invalid and order status to pending when it's tx is invalid
     * @dependencies
     * - database
     * - ChainHandler
     * @scenario
     * - mock order and transaction and insert into db
     * - mock ChainHandler `getChain`
     *   - mock `getHeight`
     *   - mock `getTxRequiredConfirmation`
     * - run test
     * - check tx in database
     * @expected
     * - tx status should be updated to 'invalid'
     * - order status should be updated to 'pending'
     * - order firstTry should remain unchanged
     * - order unexpectedFails should remain unchanged
     */
    it("should update tx status to invalid and order status to pending when it's tx is invalid", async () => {
      // mock order and transaction and insert into db
      const orderId = 'order-id';
      const chain = CARDANO_CHAIN;
      const tx = mockPaymentTransaction(
        TransactionType.arbitrary,
        chain,
        orderId
      );
      const firstTry = '1000';
      const unexpectedFails = 1;
      await DatabaseActionMock.insertOrderRecord(
        orderId,
        chain,
        `orderJson`,
        OrderStatus.pending,
        firstTry,
        unexpectedFails
      );
      await DatabaseActionMock.insertTxRecord(tx, TransactionStatus.sent, 100);

      // mock ChainHandler `getChain`
      ChainHandlerMock.mockChainName(chain);
      // mock `getHeight`
      const mockedCurrentHeight = 111;
      ChainHandlerMock.mockChainFunction(
        chain,
        'getHeight',
        mockedCurrentHeight,
        true
      );
      // mock `getTxRequiredConfirmation`
      ChainHandlerMock.mockChainFunction(
        chain,
        'getTxRequiredConfirmation',
        10
      );

      // run test
      const txEntity = (await DatabaseActionMock.allTxRecords())[0];
      const mockedChain = chainHandlerInstance.getChain(chain);
      await TransactionProcessor.setTransactionAsInvalid(
        txEntity,
        mockedChain,
        invalidationDetails(false)
      );

      // tx status should be updated to 'invalid'
      const dbTxs = (await DatabaseActionMock.allTxRecords()).map((tx) => [
        tx.txId,
        tx.status,
        tx.lastStatusUpdate,
      ]);
      expect(dbTxs).toEqual([
        [
          tx.txId,
          TransactionStatus.invalid,
          currentTimeStampSeconds.toString(),
        ],
      ]);

      // order status should be updated to 'pending'
      const dbOrders = (await DatabaseActionMock.allOrderRecords()).map(
        (order) => [
          order.id,
          order.status,
          order.firstTry,
          order.unexpectedFails,
        ]
      );
      expect(dbOrders).toEqual([
        [orderId, OrderStatus.pending, firstTry, unexpectedFails],
      ]);
    });

    /**
     * @target TransactionProcessor.setTransactionAsInvalid should update
     * tx status to invalid when cold storage tx is invalid
     * @dependencies
     * - database
     * - ChainHandler
     * @scenario
     * - mock transaction and insert into db
     * - mock ChainHandler `getChain`
     *   - mock `getHeight`
     *   - mock `getTxRequiredConfirmation`
     * - run test
     * - check tx in database
     * @expected
     * - tx status should be updated to 'invalid'
     */
    it('should update tx status to invalid when cold storage tx is invalid', async () => {
      // mock transaction and insert into db
      const tx = mockPaymentTransaction(
        TransactionType.coldStorage,
        'chain',
        ''
      );
      await DatabaseActionMock.insertTxRecord(tx, TransactionStatus.sent, 100);

      // mock ChainHandler `getChain`
      const chain = tx.network;
      ChainHandlerMock.mockChainName(chain);
      // mock `getHeight`
      const mockedCurrentHeight = 111;
      ChainHandlerMock.mockChainFunction(
        chain,
        'getHeight',
        mockedCurrentHeight,
        true
      );
      // mock `getTxRequiredConfirmation`
      ChainHandlerMock.mockChainFunction(
        chain,
        'getTxRequiredConfirmation',
        10
      );

      // run test
      const txEntity = (await DatabaseActionMock.allTxRecords())[0];
      const mockedChain = chainHandlerInstance.getChain(tx.network);
      await TransactionProcessor.setTransactionAsInvalid(
        txEntity,
        mockedChain,
        invalidationDetails(false)
      );

      // tx status should be updated to 'invalid'
      const dbTxs = (await DatabaseActionMock.allTxRecords()).map((tx) => [
        tx.txId,
        tx.status,
        tx.lastStatusUpdate,
      ]);
      expect(dbTxs).toEqual([
        [
          tx.txId,
          TransactionStatus.invalid,
          currentTimeStampSeconds.toString(),
        ],
      ]);
    });

    /**
     * @target TransactionProcessor.setTransactionAsInvalid should update
     * tx status to invalid when manual tx is invalid
     * @dependencies
     * - database
     * - ChainHandler
     * @scenario
     * - mock transaction and insert into db
     * - mock ChainHandler `getChain`
     *   - mock `getHeight`
     *   - mock `getTxRequiredConfirmation`
     * - run test
     * - check tx in database
     * @expected
     * - tx status should be updated to 'invalid'
     */
    it('should update tx status to invalid when manual tx is invalid', async () => {
      // mock transaction and insert into db
      const tx = mockPaymentTransaction(TransactionType.manual, 'chain', '');
      await DatabaseActionMock.insertTxRecord(tx, TransactionStatus.sent, 100);

      // mock ChainHandler `getChain`
      const chain = tx.network;
      ChainHandlerMock.mockChainName(chain);
      // mock `getHeight`
      const mockedCurrentHeight = 111;
      ChainHandlerMock.mockChainFunction(
        chain,
        'getHeight',
        mockedCurrentHeight,
        true
      );
      // mock `getTxRequiredConfirmation`
      ChainHandlerMock.mockChainFunction(
        chain,
        'getTxRequiredConfirmation',
        10
      );

      // run test
      const txEntity = (await DatabaseActionMock.allTxRecords())[0];
      const mockedChain = chainHandlerInstance.getChain(tx.network);
      await TransactionProcessor.setTransactionAsInvalid(
        txEntity,
        mockedChain,
        invalidationDetails(false)
      );

      // tx status should be updated to 'invalid'
      const dbTxs = (await DatabaseActionMock.allTxRecords()).map((tx) => [
        tx.txId,
        tx.status,
        tx.lastStatusUpdate,
      ]);
      expect(dbTxs).toEqual([
        [
          tx.txId,
          TransactionStatus.invalid,
          currentTimeStampSeconds.toString(),
        ],
      ]);
    });

    /**
     * @target TransactionProcessor.setTransactionAsInvalid should do nothing
     * when there is not enough confirmation for invalid state
     * @dependencies
     * - database
     * - ChainHandler
     * @scenario
     * - mock event and transaction and insert into db
     * - mock ChainHandler `getChain`
     *   - mock `getHeight`
     *   - mock `getTxRequiredConfirmation`
     * - get database txs and events
     * - run test
     * - check tx in database
     * @expected
     * - txs should remain unchanged
     * - events should remain unchanged
     */
    it('should do nothing when there is not enough confirmation for invalid state', async () => {
      // mock event and transaction and insert into db
      const mockedEvent = EventTestData.mockEventTrigger().event;
      const eventId = EventSerializer.getId(mockedEvent);
      const tx = mockPaymentTransaction(
        TransactionType.reward,
        mockedEvent.toChain,
        eventId
      );
      await DatabaseActionMock.insertEventRecord(
        mockedEvent,
        EventStatus.inReward
      );
      await DatabaseActionMock.insertTxRecord(tx, TransactionStatus.sent, 100);

      // mock ChainHandler `getChain`
      const chain = tx.network;
      ChainHandlerMock.mockChainName(chain);
      // mock `getHeight`
      const mockedCurrentHeight = 111;
      ChainHandlerMock.mockChainFunction(
        chain,
        'getHeight',
        mockedCurrentHeight,
        true
      );
      // mock `getTxRequiredConfirmation`
      ChainHandlerMock.mockChainFunction(
        chain,
        'getTxRequiredConfirmation',
        15
      );

      // get database txs and events
      const dbTxs = await DatabaseActionMock.allTxRecords();
      const dbEvents = await DatabaseActionMock.allEventRecords();

      // run test
      const txEntity = (await DatabaseActionMock.allTxRecords())[0];
      const mockedChain = chainHandlerInstance.getChain(tx.network);
      await TransactionProcessor.setTransactionAsInvalid(
        txEntity,
        mockedChain,
        invalidationDetails(false)
      );

      // txs should remain unchanged
      expect(await DatabaseActionMock.allTxRecords()).toEqual(dbTxs);

      // events should remain unchanged
      expect(await DatabaseActionMock.allEventRecords()).toEqual(dbEvents);
    });

    /**
     * @target TransactionProcessor.setTransactionAsInvalid should update
     * tx status to invalid, event status to pending-payment and increment
     * unexpectedFails when payment tx has become invalid unexpectedly
     * @dependencies
     * - database
     * - ChainHandler
     * - NotificationHandler
     * @scenario
     * - mock event and transaction and insert into db
     * - mock ChainHandler `getChain`
     *   - mock `getHeight`
     *   - mock `getTxRequiredConfirmation`
     * - mock NotificationHandler `notify`
     * - run test
     * - check tx in database
     * @expected
     * - tx status should be updated to 'invalid'
     * - event status should be updated to 'pending-payment'
     * - event firstTry should remain unchanged
     * - event unexpectedFails should be incremented
     */
    it('should update tx status to invalid, event status to pending-payment and increment unexpectedFails when payment tx has become invalid unexpectedly', async () => {
      // mock event and transaction and insert into db
      const mockedEvent = EventTestData.mockEventTrigger().event;
      const eventId = EventSerializer.getId(mockedEvent);
      const tx = mockPaymentTransaction(
        TransactionType.payment,
        mockedEvent.toChain,
        eventId
      );
      const firstTry = '1000';
      const unexpectedFails = 1;
      await DatabaseActionMock.insertEventRecord(
        mockedEvent,
        EventStatus.inPayment,
        'box-serialized',
        300,
        firstTry,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        unexpectedFails
      );
      await DatabaseActionMock.insertTxRecord(tx, TransactionStatus.sent, 100);

      // mock ChainHandler `getChain`
      const chain = tx.network;
      ChainHandlerMock.mockChainName(chain);
      // mock `getHeight`
      const mockedCurrentHeight = 111;
      ChainHandlerMock.mockChainFunction(
        chain,
        'getHeight',
        mockedCurrentHeight,
        true
      );
      // mock `getTxRequiredConfirmation`
      ChainHandlerMock.mockChainFunction(
        chain,
        'getTxRequiredConfirmation',
        10
      );

      // mock NotificationHandler `notify`
      NotificationHandlerMock.mockNotify();

      // run test
      const txEntity = (await DatabaseActionMock.allTxRecords())[0];
      const mockedChain = chainHandlerInstance.getChain(chain);
      await TransactionProcessor.setTransactionAsInvalid(
        txEntity,
        mockedChain,
        invalidationDetails(true)
      );

      // tx status should be updated to 'invalid'
      const dbTxs = (await DatabaseActionMock.allTxRecords()).map((tx) => [
        tx.txId,
        tx.status,
        tx.lastStatusUpdate,
      ]);
      expect(dbTxs).toEqual([
        [
          tx.txId,
          TransactionStatus.invalid,
          currentTimeStampSeconds.toString(),
        ],
      ]);

      // event status should be updated to 'pending-payment'
      const dbEvents = (await DatabaseActionMock.allEventRecords()).map(
        (event) => [
          event.id,
          event.status,
          event.firstTry,
          event.unexpectedFails,
        ]
      );
      expect(dbEvents).toEqual([
        [eventId, EventStatus.pendingPayment, firstTry, unexpectedFails + 1],
      ]);
    });

    /**
     * @target TransactionProcessor.setTransactionAsInvalid should update
     * tx status to invalid, event status to pending-reward and increment
     * unexpectedFails when reward distribution tx has become invalid unexpectedly
     * @dependencies
     * - database
     * - ChainHandler
     * - NotificationHandler
     * @scenario
     * - mock event and transaction and insert into db
     * - mock ChainHandler `getChain`
     *   - mock `getHeight`
     *   - mock `getTxRequiredConfirmation`
     * - mock NotificationHandler `notify`
     * - run test
     * - check tx in database
     * @expected
     * - tx status should be updated to 'invalid'
     * - event status should be updated to 'pending-reward'
     * - event firstTry should remain unchanged
     * - event unexpectedFails should be incremented
     */
    it('should update tx status to invalid, event status to pending-reward and increment unexpectedFails when reward distribution tx has become invalid unexpectedly', async () => {
      // mock event and transaction and insert into db
      const mockedEvent = EventTestData.mockEventTrigger().event;
      const eventId = EventSerializer.getId(mockedEvent);
      const tx = mockPaymentTransaction(
        TransactionType.reward,
        mockedEvent.toChain,
        eventId
      );
      const firstTry = '1000';
      const unexpectedFails = 1;
      await DatabaseActionMock.insertEventRecord(
        mockedEvent,
        EventStatus.inReward,
        'box-serialized',
        300,
        firstTry,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        unexpectedFails
      );
      await DatabaseActionMock.insertTxRecord(tx, TransactionStatus.sent, 100);

      // mock ChainHandler `getChain`
      const chain = tx.network;
      ChainHandlerMock.mockChainName(chain);
      // mock `getHeight`
      const mockedCurrentHeight = 111;
      ChainHandlerMock.mockChainFunction(
        chain,
        'getHeight',
        mockedCurrentHeight,
        true
      );
      // mock `getTxRequiredConfirmation`
      ChainHandlerMock.mockChainFunction(
        chain,
        'getTxRequiredConfirmation',
        10
      );

      // mock NotificationHandler `notify`
      NotificationHandlerMock.mockNotify();

      // run test
      const txEntity = (await DatabaseActionMock.allTxRecords())[0];
      const mockedChain = chainHandlerInstance.getChain(tx.network);
      await TransactionProcessor.setTransactionAsInvalid(
        txEntity,
        mockedChain,
        invalidationDetails(true)
      );

      // tx status should be updated to 'invalid'
      const dbTxs = (await DatabaseActionMock.allTxRecords()).map((tx) => [
        tx.txId,
        tx.status,
        tx.lastStatusUpdate,
      ]);
      expect(dbTxs).toEqual([
        [
          tx.txId,
          TransactionStatus.invalid,
          currentTimeStampSeconds.toString(),
        ],
      ]);

      // event status should be updated to 'pending-reward'
      const dbEvents = (await DatabaseActionMock.allEventRecords()).map(
        (event) => [
          event.id,
          event.status,
          event.firstTry,
          event.unexpectedFails,
        ]
      );
      expect(dbEvents).toEqual([
        [eventId, EventStatus.pendingReward, firstTry, unexpectedFails + 1],
      ]);
    });

    /**
     * @target TransactionProcessor.setTransactionAsInvalid should update
     * tx status to invalid and order status to pending and increment unexpectedFails
     * when it's tx has become invalid unexpectedly
     * @dependencies
     * - database
     * - ChainHandler
     * @scenario
     * - mock order and transaction and insert into db
     * - mock ChainHandler `getChain`
     *   - mock `getHeight`
     *   - mock `getTxRequiredConfirmation`
     * - mock NotificationHandler `notify`
     * - run test
     * - check tx in database
     * @expected
     * - tx status should be updated to 'invalid'
     * - order status should be updated to 'pending'
     * - order firstTry should remain unchanged
     * - order unexpectedFails should be incremented
     */
    it("should update tx status to invalid and order status to pending and increment unexpectedFails when it's tx has become invalid unexpectedly", async () => {
      // mock order and transaction and insert into db
      const orderId = 'order-id';
      const chain = CARDANO_CHAIN;
      const tx = mockPaymentTransaction(
        TransactionType.arbitrary,
        chain,
        orderId
      );
      const firstTry = '1000';
      const unexpectedFails = 1;
      await DatabaseActionMock.insertOrderRecord(
        orderId,
        chain,
        `orderJson`,
        OrderStatus.pending,
        firstTry,
        unexpectedFails
      );
      await DatabaseActionMock.insertTxRecord(tx, TransactionStatus.sent, 100);

      // mock ChainHandler `getChain`
      ChainHandlerMock.mockChainName(chain);
      // mock `getHeight`
      const mockedCurrentHeight = 111;
      ChainHandlerMock.mockChainFunction(
        chain,
        'getHeight',
        mockedCurrentHeight,
        true
      );
      // mock `getTxRequiredConfirmation`
      ChainHandlerMock.mockChainFunction(
        chain,
        'getTxRequiredConfirmation',
        10
      );

      // mock NotificationHandler `notify`
      NotificationHandlerMock.mockNotify();

      // run test
      const txEntity = (await DatabaseActionMock.allTxRecords())[0];
      const mockedChain = chainHandlerInstance.getChain(chain);
      await TransactionProcessor.setTransactionAsInvalid(
        txEntity,
        mockedChain,
        invalidationDetails(true)
      );

      // tx status should be updated to 'invalid'
      const dbTxs = (await DatabaseActionMock.allTxRecords()).map((tx) => [
        tx.txId,
        tx.status,
        tx.lastStatusUpdate,
      ]);
      expect(dbTxs).toEqual([
        [
          tx.txId,
          TransactionStatus.invalid,
          currentTimeStampSeconds.toString(),
        ],
      ]);

      // order status should be updated to 'pending-payment'
      const dbOrders = (await DatabaseActionMock.allOrderRecords()).map(
        (order) => [
          order.id,
          order.status,
          order.firstTry,
          order.unexpectedFails,
        ]
      );
      expect(dbOrders).toEqual([
        [orderId, OrderStatus.pending, firstTry, unexpectedFails + 1],
      ]);
    });

    /**
     * @target TransactionProcessor.setTransactionAsInvalid should send
     * notification when tx has become invalid unexpectedly
     * @dependencies
     * - database
     * - ChainHandler
     * - NotificationHandler
     * @scenario
     * - mock event and transaction and insert into db
     * - mock ChainHandler `getChain`
     *   - mock `getHeight`
     *   - mock `getTxRequiredConfirmation`
     * - mock NotificationHandler `notify`
     * - run test
     * - check if function got called
     * @expected
     * - Notification `notify` should got called
     */
    it('should send notification when tx has become invalid unexpectedly', async () => {
      // mock event and transaction and insert into db
      const mockedEvent = EventTestData.mockEventTrigger().event;
      const eventId = EventSerializer.getId(mockedEvent);
      const tx = mockPaymentTransaction(
        TransactionType.payment,
        mockedEvent.toChain,
        eventId
      );
      const firstTry = '1000';
      await DatabaseActionMock.insertEventRecord(
        mockedEvent,
        EventStatus.inPayment,
        'box-serialized',
        300,
        firstTry
      );
      await DatabaseActionMock.insertTxRecord(tx, TransactionStatus.sent, 100);

      // mock ChainHandler `getChain`
      const chain = tx.network;
      ChainHandlerMock.mockChainName(chain);
      // mock `getHeight`
      const mockedCurrentHeight = 111;
      ChainHandlerMock.mockChainFunction(
        chain,
        'getHeight',
        mockedCurrentHeight,
        true
      );
      // mock `getTxRequiredConfirmation`
      ChainHandlerMock.mockChainFunction(
        chain,
        'getTxRequiredConfirmation',
        10
      );

      // mock NotificationHandler `notify`
      NotificationHandlerMock.mockNotify();

      // run test
      const txEntity = (await DatabaseActionMock.allTxRecords())[0];
      const mockedChain = chainHandlerInstance.getChain(chain);
      await TransactionProcessor.setTransactionAsInvalid(
        txEntity,
        mockedChain,
        invalidationDetails(true)
      );

      // Notification `notify` should got called
      expect(
        NotificationHandlerMock.getNotificationHandlerMockedFunction('notify')
      ).toHaveBeenCalledOnce();
    });
  });
});
