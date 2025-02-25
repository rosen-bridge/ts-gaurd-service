import { describe, it, expect, vi, beforeEach, MockInstance } from 'vitest';

import PublicStatusHandler from '../../../src/handlers/PublicStatusHandler';
import DatabaseActionMock from '../mocked/DatabaseAction.mock';
import { TransactionSubscriber } from '../../../src/db/subscribers/TransactionSubscriber';

describe('TransactionSubscriber', () => {
  const repo = DatabaseActionMock.testDatabase.TransactionRepository;
  let updatePublicTxStatusSpy: MockInstance<() => Promise<void>>;

  beforeEach(async () => {
    await DatabaseActionMock.clearTables();
    // Reset spy on PublicStatusHandler.updatePublicTxStatus before each test
    updatePublicTxStatusSpy = vi
      .spyOn(PublicStatusHandler.getInstance(), 'updatePublicTxStatus')
      .mockImplementation(async (): Promise<void> => {
        //
      });
  });

  describe('listenTo', () => {
    /**
     * @target TransactionSubscriber.listenTo should return TransactionEntity
     * @dependencies
     * @scenario
     * - create new TransactionSubscriber
     * - call listenTo
     * @expected
     * - returning class name should have been TransactionEntity
     */
    it('should return TransactionEntity', () => {
      // arrange
      const subscriber = new TransactionSubscriber();

      // act
      const result = subscriber.listenTo();

      // assert
      expect(result.name).toBe('TransactionEntity');
    });
  });

  /**
   * @target TransactionSubscriber.afterInsert should call PublicStatusHandler.updatePublicTxStatus with the correct id and status
   * @dependencies
   * @scenario
   * - call insert with a valid record
   * @expected
   * - updatePublicTxStatus should have been called with the correct txId and txStatus
   */
  describe('afterInsert', () => {
    it('should call PublicStatusHandler.updatePublicTxStatus with the correct id and status', async () => {
      // act
      await repo.insert({
        txId: 'txId',
        txJson: 'txJson',
        type: 'type',
        chain: 'chain',
        status: 'pending',
        lastCheck: 0,
        event: undefined,
        order: undefined,
        lastStatusUpdate: undefined,
        failedInSign: false,
        signFailedCount: 0,
        requiredSign: 6,
      });

      // assert
      expect(updatePublicTxStatusSpy).toHaveBeenCalledWith('txId', 'pending');
    });
  });

  describe('afterUpdate', () => {
    /**
     * @target TransactionSubscriber.afterUpdate should not call PublicStatusHandler.updatePublicTxStatus when updateEvent does not include a status change
     * @dependencies
     * @scenario
     * - call insert with a valid record
     * - call update with the same txId to change a field thats not status
     * @expected
     * - updatePublicTxStatus should not have been called
     * - database record should have been updated correctly
     */
    it('should not call PublicStatusHandler.updatePublicTxStatus when updateEvent does not include a status change', async () => {
      // arrange
      await repo.insert({
        txId: 'txId',
        txJson: 'txJson',
        type: 'type',
        chain: 'chain',
        status: 'pending',
        lastCheck: 0,
        event: undefined,
        order: undefined,
        lastStatusUpdate: undefined,
        failedInSign: false,
        signFailedCount: 0,
        requiredSign: 6,
      });

      // act
      updatePublicTxStatusSpy.mockReset();
      await repo.save({
        txId: 'txId',
        signFailedCount: 1,
      });

      // assert
      expect(updatePublicTxStatusSpy).not.toHaveBeenCalled();

      const record = await repo.findOneBy({
        txId: 'txId',
      });
      expect(record).toMatchObject({
        txId: 'txId',
        txJson: 'txJson',
        type: 'type',
        chain: 'chain',
        status: 'pending',
        lastCheck: 0,
        event: undefined,
        order: undefined,
        lastStatusUpdate: null,
        failedInSign: false,
        signFailedCount: 1,
        requiredSign: 6,
      });
    });

    /**
     * @target TransactionSubscriber.afterUpdate should call PublicStatusHandler.updatePublicTxStatus with the correct id and new status when a status change occurs
     * @dependencies
     * @scenario
     * - call insert with a valid record
     * - call update with the same txId to change status
     * @expected
     * - updatePublicTxStatus should have been called with the correct txId and txStatus
     * - database record should have been updated correctly
     */
    it('should call PublicStatusHandler.updatePublicTxStatus with the correct id and new status when a status change occurs', async () => {
      // arrange
      await repo.insert({
        txId: 'txId',
        txJson: 'txJson',
        type: 'type',
        chain: 'chain',
        status: 'pending',
        lastCheck: 0,
        event: undefined,
        order: undefined,
        lastStatusUpdate: undefined,
        failedInSign: false,
        signFailedCount: 0,
        requiredSign: 6,
      });

      // act
      updatePublicTxStatusSpy.mockReset();
      await repo.save({
        txId: 'txId',
        status: 'completed',
      });

      // assert
      expect(updatePublicTxStatusSpy).toHaveBeenCalledWith('txId', 'completed');

      const record = await repo.findOneBy({
        txId: 'txId',
      });
      expect(record).toMatchObject({
        txId: 'txId',
        txJson: 'txJson',
        type: 'type',
        chain: 'chain',
        status: 'completed',
        lastCheck: 0,
        event: undefined,
        order: undefined,
        lastStatusUpdate: null,
        failedInSign: false,
        signFailedCount: 0,
        requiredSign: 6,
      });
    });
  });
});
